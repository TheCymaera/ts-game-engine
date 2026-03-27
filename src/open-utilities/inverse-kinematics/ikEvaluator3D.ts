import { coerceBetween } from "@open-utilities/maths/coerceBetween";
import { Quaternion } from "@open-utilities/maths/Quaternion";
import { sumArray } from "@open-utilities/maths/sumArray";
import { Vector3 } from "@open-utilities/maths/Vector3";
import { IKChain3D, IKChainPose3D } from "./IKChain3D";
import { IKTarget3D } from "./IKSolver";

const EPSILON = 0.000001;

export interface IKEvaluationOptions {
	tolerance: number;
	orientationTolerance: number;
	positionWeight: number;
	orientationWeight: number;
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
		const orientationErrorVector = rotationErrorVector(endEffector.rotation, target.orientation);
		orientationError = orientationErrorVector.length();
		errorVector.push(
			orientationErrorVector.x * options.orientationWeight,
			orientationErrorVector.y * options.orientationWeight,
			orientationErrorVector.z * options.orientationWeight,
		);
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