import { assertNever } from "@open-utilities/types/assertNever.js";
import { coerceBetween } from "../maths/coerceBetween.js";
import { Quaternion } from "../maths/Quaternion.js";
import { Vector3 } from "../maths/Vector3.js";
import { IKChain3D, IKHingeConstraint3D, IKSwingTwistConstraint3D, type IKConstraint3D } from "./IKChain3D.js";

const EPSILON = 0.000001;

export interface FABRIKSolverOptions {
	target: Vector3;
	targetOrientation?: Quaternion;
	iterations?: number;
	tolerance?: number;
}


export function solveFabrik3D(chain: IKChain3D, options: FABRIKSolverOptions) {
	chain.jointPositions[0]!.copy(chain.rootPosition);

	if (chain.rootPosition.distanceTo(options.target) >= chain.totalLength - EPSILON) {
		solveUnreachable(chain, options);
		return;
	}

	const endEffector = chain.jointPositions[chain.jointPositions.length - 1]!;

	const iterations = options.iterations ?? 16;
	const tolerance = options.tolerance ?? 0.001;

	for (let iteration = 0; iteration < iterations; iteration++) {
		// move end-effector to target
		endEffector.copy(options.target);

		// move parent tip to child
		for (let index = chain.jointPositions.length - 2; index >= 0; index--) {
			const joint = chain.jointPositions[index]!;
			const segment = chain.segments[index]!;
			const child = chain.jointPositions[index + 1]!;

			const toParent = child.clone().subtract(joint);
			toParent.normalize();
			toParent.multiply(segment.length);

			joint.copy(child).subtract(toParent);
		}

		// move root back to original position
		chain.jointPositions[0]!.copy(chain.rootPosition);

		// move child to parent tip
		for (let index = 0; index < chain.segments.length; index++) {
			const segment = chain.segments[index]!;
			const joint = chain.jointPositions[index]!;
			const child = chain.jointPositions[index + 1]!;
			const parentRotation = index === 0 ? chain.rootRotation : chain.segments[index - 1]!.rotation;

			const targetDirection = child.clone().subtract(joint).normalize() ?? segment.direction;
			const result = constrainDirection(
				segment.constraint,
				targetDirection,
				parentRotation,
				segment.rotation,
				options?.targetOrientation,
			);

			segment.direction.copy(result.direction);
			segment.rotation.copy(result.rotation);

			const tip = joint.clone().add(result.direction.clone().multiply(segment.length));
			child.copy(tip);
		}

		if (endEffector.distanceTo(options.target) <= tolerance) {
			break;
		}
	}
}

function solveUnreachable(chain: IKChain3D, options: FABRIKSolverOptions) {
	chain.jointPositions[0]!.copy(chain.rootPosition);

	for (let index = 0; index < chain.segments.length; index++) {
		const segment = chain.segments[index]!;

		const joint = chain.jointPositions[index]!;
		const parentRotation = index === 0 ? chain.rootRotation : chain.segments[index - 1]!.rotation;
		const desiredDirection = options.target.clone().subtract(joint).normalize() ?? segment.direction;

		const result = constrainDirection(
			segment.constraint,
			desiredDirection,
			parentRotation,
			segment.rotation,
			options?.targetOrientation,
		);
		segment.direction.copy(result.direction);
		segment.rotation.copy(result.rotation);

		const tip = joint.clone().add(result.direction.clone().multiply(segment.length));
		chain.jointPositions[index + 1]!.copy(tip);
	}
}

function constrainDirection(
	constraint: IKConstraint3D,
	targetDirection: Vector3,
	parentRotation: Quaternion,
	currentRotation: Quaternion,
	desiredRotation?: Quaternion,
) {
	if (constraint instanceof IKSwingTwistConstraint3D) {
		return constrainSwingTwist(targetDirection, parentRotation, constraint, currentRotation, desiredRotation);
	}

	if (constraint instanceof IKHingeConstraint3D) {
		return constrainHinge(targetDirection, parentRotation, constraint);
	}

	assertNever(constraint);
}

function constrainSwingTwist(
	targetDirection: Vector3,
	parentRotation: Quaternion,
	constraint: IKSwingTwistConstraint3D,
	currentRotation: Quaternion,
	desiredRotation?: Quaternion,
) {
	// clamp to cone
	const coneDirection = parentRotation.rotateVector(IKChain3D.FORWARD);
	const direction = clampDirectionToCone(targetDirection, coneDirection, constraint.maxSwing);
	const localRotation = Quaternion.fromTo(IKChain3D.FORWARD, parentRotation.clone().invert()!.rotateVector(direction));

	// derive twist from the desired end-effector orientation when one is provided.
	let twist = desiredRotation
		? extractDrivenTwistRadians(desiredRotation, parentRotation, localRotation, constraint.twistOrigin, IKChain3D.FORWARD)
		: extractTwistRadians(currentRotation, parentRotation, localRotation, constraint.twistOrigin, IKChain3D.FORWARD);
	twist = coerceBetween(twist, constraint.minTwist, constraint.maxTwist);

	// apply twist
	const twistRotation = Quaternion.fromAxisAngle(IKChain3D.FORWARD, twist);
	localRotation.multiply(twistRotation).normalize()!;

	// get final rotation
	const rotation = parentRotation.clone().multiply(localRotation).normalize()!;
	return { direction, rotation, twist };
}

function constrainHinge(
	targetDirection: Vector3,
	parentRotation: Quaternion,
	constraint: IKHingeConstraint3D,
) {
	// get local
	let targetLocal = targetDirection.clone().rotate(parentRotation.clone().invert()!).normalize()!;

	// constrain to hinge plane
	targetLocal = projectOntoPlane(targetLocal, constraint.axis).normalize() ?? constraint.origin;

	// constrain angle
	let angle = signedAngleAroundAxis(constraint.origin, targetLocal, constraint.axis);
	angle = coerceBetween(angle, constraint.minAngle, constraint.maxAngle);

	// get final rotation
	const localRotation = Quaternion.fromAxisAngle(constraint.axis, angle);
	const rotation = parentRotation.clone().multiply(localRotation).normalize() ?? parentRotation.clone();
	const direction = rotation.rotateVector(constraint.origin.clone());
	return { direction, rotation };
}

export function extractTwistRadians(
	currentRotation: Quaternion,
	parentRotation: Quaternion,
	swingLocal: Quaternion,
	twistOrigin: Vector3,
	twistAxis: Vector3,
) {
	const inverseParent = parentRotation.clone().invert()!;
	const inverseSwing = swingLocal.clone().invert()!;

	// remove parent and swing rotation
	const twistOnly = inverseSwing
		.multiply(inverseParent)
		.multiply(currentRotation.clone())
		.normalize()!;

	const twisted = projectOntoPlane(twistOrigin.clone().rotate(twistOnly), twistAxis).normalize()!;
	return signedAngleAroundAxis(twistOrigin, twisted, twistAxis);
}

function extractDrivenTwistRadians(
	desiredRotation: Quaternion,
	parentRotation: Quaternion,
	swingLocal: Quaternion,
	twistOrigin: Vector3,
	twistAxis: Vector3,
) {
	const desiredReference = desiredRotation.rotateVector(twistOrigin.clone());
	const desiredInParent = parentRotation.clone().invert()!.rotateVector(desiredReference);
	const desiredAfterSwing = swingLocal.clone().invert()!.rotateVector(desiredInParent);
	const flattened = projectOntoPlane(desiredAfterSwing, twistAxis).normalize();

	if (!flattened) {
		return 0;
	}

	return signedAngleAroundAxis(twistOrigin, flattened, twistAxis);
}

function clampDirectionToCone(targetDirection: Vector3, referenceDirection: Vector3, maxBend: number) {
	if (maxBend >= Math.PI - EPSILON) {
		return targetDirection;
	}

	const cosine = coerceBetween(referenceDirection.dot(targetDirection), -1, 1);
	const angle = Math.acos(cosine);

	if (angle <= maxBend) {
		return targetDirection;
	}

	let axis = referenceDirection.clone().cross(targetDirection);
	if (axis.length() <= EPSILON) {
		axis = referenceDirection.clone().orthogonal();
	}

	axis = axis.normalize() ?? referenceDirection.clone().orthogonal();
	return referenceDirection.rotateAround(axis, maxBend);
}

function signedAngleAroundAxis(from: Vector3, to: Vector3, axis: Vector3) {
	const sine = axis.dot(from.clone().cross(to));
	const cosine = coerceBetween(from.dot(to), -1, 1);
	return Math.atan2(sine, cosine);
}

function projectOntoPlane(vector: Vector3, normal: Vector3) {
	return vector.clone().subtract(normal.clone().multiply(vector.dot(normal)));
}