import { Random } from "../maths/Random.js";
import { Quaternion } from "../maths/Quaternion.js";
import { Vector3 } from "../maths/Vector3.js";
import { IKChain3D, IKHingeConstraint3D, IKSwingTwistConstraint3D, type IKConstraint3D } from "./IKChain3D.js";

const EPSILON = 0.000001;

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
	const random = options.random ?? Random.default;

	let bestPose = baselinePose;

	let bestError = {
		position: Number.POSITIVE_INFINITY,
		orientation: Number.POSITIVE_INFINITY,
	}
	
	let tolerance = options.tolerance ?? 0.001;

	for (let attempt = 0; attempt < totalAttempts; attempt++) {
		if (attempt === 0) {
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