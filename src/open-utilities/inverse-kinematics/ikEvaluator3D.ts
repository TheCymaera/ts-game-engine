import { coerceBetween } from "@open-utilities/maths/coerceBetween";
import { Quaternion } from "@open-utilities/maths/Quaternion";
import { sumArray } from "@open-utilities/maths/sumArray";
import { Vector3 } from "@open-utilities/maths/Vector3";
import { IKChain3D, IKChainPose3D, IKHingeJoint3D, IKHingeJointState3D, IKSwingTwistJoint3D, IKSwingTwistJointState3D, boxToSwingAngles } from "./IKChain3D";
import { IKTarget3D } from "./IKSolver";
import { assertNever } from "@open-utilities/types/assertNever";

const EPSILON = 0.000001;

export interface IKEvaluationOptions {
	tolerance: number;
	orientationTolerance: number;
	positionWeight: number;
	orientationWeight: number;
	poseBias: number;
}

export interface IKEvaluation3D {
	positionError: number;
	orientationError: number;
	score: number;
	isSolved: boolean;
	errorVector: number[];
}

export type IKEvaluator3D = (chain: IKChain3D, pose: IKChainPose3D, target: IKTarget3D) => IKEvaluation3D;

export function createIKEvaluator3D(options?: Partial<IKEvaluationOptions>): IKEvaluator3D {
	const resolvedOptions = {
		tolerance: options?.tolerance ?? 0.001,
		orientationTolerance: options?.orientationTolerance ?? options?.tolerance ?? 0.001,
		positionWeight: options?.positionWeight ?? 1,
		orientationWeight: options?.orientationWeight ?? 0.35,
		poseBias: options?.poseBias ?? 0,
	} satisfies Required<IKEvaluationOptions>;

	return (chain: IKChain3D, pose: IKChainPose3D, target: IKTarget3D) => evaluateIK(chain, pose, target, resolvedOptions);
}




function evaluateIK(chain: IKChain3D, pose: IKChainPose3D, target: IKTarget3D, options: IKEvaluationOptions): IKEvaluation3D {
	const worldJoints = chain.getWorldNodes(pose);
	const endEffector = worldJoints[worldJoints.length - 1]!;
	const positionErrorVector = target.position.clone().subtract(endEffector.position);
	const positionError = positionErrorVector.length();

	const errorVector = [
		positionErrorVector.x * options.positionWeight,
		positionErrorVector.y * options.positionWeight,
		positionErrorVector.z * options.positionWeight,
	];

	let orientationError = 0;
	if (target.orientation) {
		const orientationErrorVector = rotationErrorVector(endEffector.worldRotation, target.orientation);
		orientationError = orientationErrorVector.length();
		errorVector.push(
			orientationErrorVector.x * options.orientationWeight,
			orientationErrorVector.y * options.orientationWeight,
			orientationErrorVector.z * options.orientationWeight,
		);
	}

	if (options.poseBias > 0) {
		for (let index = 0; index < chain.segments.length; index++) {
			const joint = chain.segments[index]!.joint;
			const jointPose = pose.segments[index]!;

			if (joint instanceof IKHingeJoint3D) {
				if (joint.restAngle === null || !(jointPose instanceof IKHingeJointState3D)) continue;
				errorVector.push((jointPose.angle - joint.restAngle) * options.poseBias);
				continue;
			}

			if (joint instanceof IKSwingTwistJoint3D) {
				if (!(jointPose instanceof IKSwingTwistJointState3D)) continue;

				if (joint.restSwing) {
					const [swingX, swingY] = boxToSwingAngles(jointPose.swingX, jointPose.swingY, joint.maxSwing);
					errorVector.push((swingX - joint.restSwing.x) * options.poseBias);
					errorVector.push((swingY - joint.restSwing.y) * options.poseBias);
				}

				if (joint.restTwist !== null) {
					errorVector.push((jointPose.twist - joint.restTwist) * options.poseBias);
				}
				continue;
			}

			assertNever(joint);
		}
	}

	const isSolved = 
		positionError <= options.tolerance && 
		(!target.orientation || orientationError <= options.orientationTolerance);

	const score = sumArray(errorVector.map(value => value * value));

	return { errorVector, positionError, orientationError, score, isSolved };
}

function rotationErrorVector(currentRotation: Quaternion, targetRotation: Quaternion) {
	const inverseCurrent = currentRotation.clone().invert() ?? Quaternion.identity();
	const delta = targetRotation.clone().multiply(inverseCurrent).normalize() ?? Quaternion.identity();

	if (delta.w < 0) {
		delta.x = -delta.x;
		delta.y = -delta.y;
		delta.z = -delta.z;
		delta.w = -delta.w;
	}

	const angle = 2 * Math.acos(coerceBetween(delta.w, -1, 1));
	const sine = Math.sqrt(Math.max(1 - delta.w * delta.w, 0));
	if (sine <= EPSILON || angle <= EPSILON) {
		return Vector3.new(delta.x, delta.y, delta.z).multiply(2);
	}

	return Vector3.new(delta.x / sine, delta.y / sine, delta.z / sine).multiply(angle);
}