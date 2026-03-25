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
	includeOriginalPose: boolean;
	random?: Random;
}

export function createRandomizedIKSolver3D(options: RandomizedSolverOptions): IKSolver3D {
	const resolved = {
		random: Random.mulberry32(0),
		...options,
	}
	return (chain: IKChain3D, target: IKTarget3D) => solveRandomizedIK3D(chain, target, resolved);
}

function solveRandomizedIK3D(chain: IKChain3D, target: IKTarget3D, options: Required<RandomizedSolverOptions>) {
	const baselinePose = capturePose(chain);

	let bestPose = baselinePose;

	let bestError = {
		position: Number.POSITIVE_INFINITY,
		orientation: Number.POSITIVE_INFINITY,
	}
	
	let tolerance = options.tolerance ?? 0.001;

	for (let attempt = 0; attempt < options.attempts; attempt++) {
		if (attempt === 0 && options.includeOriginalPose) {
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
		jointRotations: chain.joints.map(joint => joint.rotation.clone()),
		jointPositions: chain.joints.map(joint => joint.position.clone()),
	};
}

function applyPose(chain: IKChain3D, pose: IKChainPose3D) {
	for (const [index, joint] of chain.joints.entries()) {
		joint.rotation.copy(pose.jointRotations[index]!);
		joint.position.copy(pose.jointPositions[index]!);
	}
}

function applyRandomPose(chain: IKChain3D, random: Random) {
	for (let index = 0; index < chain.links.length; index++) {
		const link = chain.links[index]!;
		const parent = chain.joints[index]!;
		const child = chain.joints[index + 1]!;

		//const maxDelta = .3;
		//const rotationDelta = parent.rotation.clone().multiply(Quaternion.fromEuler(
		//	random.nextFloat(-maxDelta, maxDelta),
		//	random.nextFloat(-maxDelta, maxDelta),
		//	random.nextFloat(-maxDelta, maxDelta),
		//)).normalize() ?? Quaternion.identity();

		//const rotation = rotationDelta.multiply(child.rotation).normalize() ?? child.rotation.clone();

		const rotation = Quaternion.fromEuler(
			random.nextFloat(-Math.PI, Math.PI),
			random.nextFloat(-Math.PI, Math.PI),
			random.nextFloat(-Math.PI, Math.PI),
		).multiply(parent.rotation).normalize() ?? parent.rotation.clone();

		child.rotation.copy(rotation);
		const direction = rotation.rotateVector(IKChain3D.FORWARD);

		child.position.copy(parent.position).add(direction.multiply(link.length));
	}
}

function getError(chain: IKChain3D, target: IKTarget3D) {
	const position = getPositionError(chain, target.position);
	const orientation = getOrientationError(chain, target.orientation);
	return { position, orientation };
}

function getPositionError(chain: IKChain3D, target: Vector3) {
	const endEffector = chain.joints[chain.joints.length - 1]!.position;
	return endEffector.distanceTo(target);
}

function getOrientationError(chain: IKChain3D, targetOrientation?: Quaternion) {
	if (!targetOrientation) {
		return Number.NEGATIVE_INFINITY;
	}

	const endEffectorRotation = chain.joints[chain.joints.length - 1]!.rotation;
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
	jointRotations: Quaternion[];
	jointPositions: Vector3[];
}

interface SolverError {
	position: number;
	orientation: number;
}