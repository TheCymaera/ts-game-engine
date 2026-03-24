import { Random } from "../maths/Random.js";
import { Quaternion } from "../maths/Quaternion.js";
import { Vector3 } from "../maths/Vector3.js";
import { IKHingeConstraint3D, IKSwingTwistConstraint3D, type IKChain3D, type IKConstraint3D } from "./IKChain3D.js";

const EPSILON = 0.000001;
const LOCAL_FORWARD = Vector3.new(0, 1, 0);

interface IKChainPose3D {
	segmentDirections: Vector3[];
	segmentRotations: Quaternion[];
	jointPositions: Vector3[];
}

export interface RandomizedSolverOptions {
	target: Vector3;
	targetOrientation?: Quaternion;
	solver: (chain: IKChain3D) => void;

	tolerance?: number;
	attempts?: number;
	includeCurrentPose?: boolean;
	random?: Random;
}

export interface SolverError {
	position: number;
	orientation: number;
}

export interface RandomizedSolverResult {
	attempts: number;
	error: SolverError;
}

export function solveRandomizedIK3D(chain: IKChain3D, options: RandomizedSolverOptions): RandomizedSolverResult {
	const baselinePose = capturePose(chain);
	const totalAttempts = Math.max(1, Math.floor(options.attempts ?? 8));
	const includeCurrentPose = options.includeCurrentPose ?? true;
	const random = options.random ?? Random.default;

	let bestPose = baselinePose;

	let bestError = {
		position: Number.POSITIVE_INFINITY,
		orientation: Number.POSITIVE_INFINITY,
	}
	
	let tolerance = options.tolerance ?? 0.001;

	for (let attempt = 0; attempt < totalAttempts; attempt++) {
		if (includeCurrentPose && attempt === 0) {
			applyPose(chain, baselinePose);
		} else {
			applyRandomPose(chain, random);
		}

		options.solver(chain);

		const error = getError(chain, options);

		if (error.position <= tolerance && error.orientation <= tolerance) {
			return {
				attempts: attempt + 1,
				error,
			};
		}

		if (isBetterResult(error, bestError)) {
			bestPose = capturePose(chain);
			bestError = error;
		}
	}

	applyPose(chain, bestPose);

	return {
		attempts: totalAttempts,
		error: bestError,
	};
}

function capturePose(chain: IKChain3D): IKChainPose3D {
	return {
		segmentDirections: chain.segments.map(segment => segment.direction.clone()),
		segmentRotations: chain.segments.map(segment => segment.rotation.clone()),
		jointPositions: chain.jointPositions.map(position => position.clone()),
	};
}

function applyPose(chain: IKChain3D, pose: IKChainPose3D) {
	for (const [index, segment] of chain.segments.entries()) {
		segment.direction.copy(pose.segmentDirections[index]!);
		segment.rotation.copy(pose.segmentRotations[index]!);
	}

	for (const [index, jointPosition] of chain.jointPositions.entries()) {
		jointPosition.copy(pose.jointPositions[index]!);
	}
}

function applyRandomPose(chain: IKChain3D, random: Random) {
	chain.jointPositions[0]!.copy(chain.rootPosition);

	for (let index = 0; index < chain.segments.length; index++) {
		const segment = chain.segments[index]!;
		const joint = chain.jointPositions[index]!;
		const parentRotation = index === 0 ? chain.rootRotation : chain.segments[index - 1]!.rotation;
		const sample = sampleConstraintPose(segment.constraint, parentRotation, random);

		segment.direction.copy(sample.direction);
		segment.rotation.copy(sample.rotation);
		chain.jointPositions[index + 1]!.copy(joint.clone().add(sample.direction.clone().multiply(segment.length)));
	}
}

function sampleConstraintPose(constraint: IKConstraint3D, parentRotation: Quaternion, random: Random) {
	if (constraint instanceof IKSwingTwistConstraint3D) {
		return sampleSwingTwistPose(constraint, parentRotation, random);
	}

	if (constraint instanceof IKHingeConstraint3D) {
		return sampleHingePose(constraint, parentRotation, random);
	}

	throw new Error("Unknown IK constraint.");
}

function sampleSwingTwistPose(constraint: IKSwingTwistConstraint3D, parentRotation: Quaternion, random: Random) {
	const twist = random.nextFloat(constraint.minTwist, constraint.maxTwist);
	const localDirection = sampleConeDirection(constraint.maxSwing, random);
	const swingRotation = Quaternion.fromTo(LOCAL_FORWARD, localDirection, constraint.twistOrigin);
	const twistRotation = Quaternion.fromAxisAngle(LOCAL_FORWARD, twist);
	const localRotation = swingRotation.multiply(twistRotation).normalize() ?? swingRotation;
	const rotation = parentRotation.clone().multiply(localRotation).normalize() ?? parentRotation.clone();
	const direction = rotation.rotateVector(LOCAL_FORWARD);
	return { direction, rotation };
}

function sampleHingePose(constraint: IKHingeConstraint3D, parentRotation: Quaternion, random: Random) {
	const angle = random.nextFloat(constraint.minAngle, constraint.maxAngle);
	const localRotation = Quaternion.fromAxisAngle(constraint.axis, angle);
	const rotation = parentRotation.clone().multiply(localRotation).normalize() ?? parentRotation.clone();
	const direction = rotation.rotateVector(constraint.origin.clone());
	return { direction, rotation };
}

function sampleConeDirection(maxSwing: number, random: Random) {
	if (maxSwing <= EPSILON) {
		return LOCAL_FORWARD.clone();
	}

	const azimuth = random.nextFloat(0, Math.PI * 2);
	const cosine = random.nextFloat(Math.cos(maxSwing), 1);
	const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));

	return Vector3.new(
		sine * Math.cos(azimuth),
		cosine,
		sine * Math.sin(azimuth),
	);
}

function getError(chain: IKChain3D, options: { target: Vector3; targetOrientation?: Quaternion }) {
	const position = getPositionError(chain, options.target);
	const orientation = getOrientationError(chain, options.targetOrientation);
	return { position, orientation };
}

function getPositionError(chain: IKChain3D, target: Vector3) {
	const endEffector = chain.jointPositions[chain.jointPositions.length - 1]!;
	return endEffector.distanceTo(target);
}

function getOrientationError(chain: IKChain3D, targetOrientation?: Quaternion) {
	if (!targetOrientation) {
		return Number.POSITIVE_INFINITY;
	}

	const endEffectorRotation = chain.segments[chain.segments.length - 1]!.rotation;
	const dot = Math.abs(
		endEffectorRotation.x * targetOrientation.x +
		endEffectorRotation.y * targetOrientation.y +
		endEffectorRotation.z * targetOrientation.z +
		endEffectorRotation.w * targetOrientation.w,
	);

	return 2 * Math.acos(Math.min(1, dot));
}

function isBetterResult(error: SolverError, bestError: SolverError) {
	if (error.position < bestError.position - EPSILON) {
		return true;
	}

	if (error.position > bestError.position + EPSILON) {
		return false;
	}

	if (!Number.isFinite(error.orientation)) {
		return false;
	}

	return error.orientation < bestError.orientation - EPSILON;
}