import { Random } from "../maths/Random.js";
import { Quaternion } from "../maths/Quaternion.js";
import { Vector3 } from "../maths/Vector3.js";
import { IKChain3D } from "./IKChain3D.js";
import { IKSolver3D, IKTarget3D } from "./IKSolver.js";

const EPSILON = 0.000001;

export interface RandomizedSolverOptions {
	solver: IKSolver3D;
	tolerance: number;
	attempts: number;
	random: Random;
}

export function createRandomizedIKSolver3D(options: RandomizedSolverOptions): IKSolver3D {
	return (chain: IKChain3D, target: IKTarget3D) => solveRandomizedIK3D(chain, target, options);
}

function solveRandomizedIK3D(chain: IKChain3D, target: IKTarget3D, options: RandomizedSolverOptions) {
	const baselinePose = capturePose(chain);

	let bestPose = baselinePose;

	let bestError = {
		position: Number.POSITIVE_INFINITY,
		orientation: Number.POSITIVE_INFINITY,
	}
	
	let tolerance = options.tolerance ?? 0.001;

	for (let attempt = 0; attempt < options.attempts; attempt++) {
		if (attempt === 0) {
			applyPose(chain, baselinePose);
		} else {
			applyRandomPose(chain, options.random);
		}

		options.solver(chain, target);

		const error = getError(chain, target);

		if (error.position <= tolerance && error.orientation <= tolerance) {
			return
		}

		if (isBetterResult(error, bestError)) {
			bestPose = capturePose(chain);
			bestError = error;
		}
	}

	applyPose(chain, bestPose);
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

		//const maxDelta = .3;
		//const rotationDelta = parentRotation.clone().multiply(Quaternion.fromEuler(
		//	random.nextFloat(-maxDelta, maxDelta),
		//	random.nextFloat(-maxDelta, maxDelta),
		//	random.nextFloat(-maxDelta, maxDelta),
		//)).normalize() ?? Quaternion.identity();

		//const rotation = rotationDelta.multiply(segment.rotation).normalize() ?? segment.rotation.clone();

		const rotation = Quaternion.fromEuler(
			random.nextFloat(-Math.PI, Math.PI),
			random.nextFloat(-Math.PI, Math.PI),
			random.nextFloat(-Math.PI, Math.PI),
		).multiply(parentRotation).normalize() ?? parentRotation.clone();

		const direction = rotation.rotateVector(IKChain3D.FORWARD);

		chain.jointPositions[index + 1]!.copy(joint.clone().add(direction.clone().multiply(segment.length)));
	}
}

function getError(chain: IKChain3D, target: IKTarget3D) {
	const position = getPositionError(chain, target.position);
	const orientation = getOrientationError(chain, target.orientation);
	return { position, orientation };
}

function getPositionError(chain: IKChain3D, target: Vector3) {
	const endEffector = chain.jointPositions[chain.jointPositions.length - 1]!;
	return endEffector.distanceTo(target);
}

function getOrientationError(chain: IKChain3D, targetOrientation?: Quaternion) {
	if (!targetOrientation) {
		return Number.NEGATIVE_INFINITY;
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

	return error.orientation < bestError.orientation - EPSILON;
}

interface IKChainPose3D {
	segmentDirections: Vector3[];
	segmentRotations: Quaternion[];
	jointPositions: Vector3[];
}

interface SolverError {
	position: number;
	orientation: number;
}