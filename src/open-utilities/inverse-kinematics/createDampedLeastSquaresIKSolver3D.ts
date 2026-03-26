import { coerceBetween } from "@open-utilities/maths/coerceBetween";
import { Quaternion } from "@open-utilities/maths/Quaternion";
import { DampedLeastSquaresOptions, DampedLeastSquaresMetrics, LeastSquaresProblem, solveDampedLeastSquares } from "@open-utilities/inverse-kinematics/solveDampedLeastSquares.js";
import { Vector3 } from "@open-utilities/maths/Vector3";
import { IKHingeJoint3D, IKChain3D, IKSwingTwistJoint3D, IKChainPose3D, IKHingeJointState3D, IKJointPose3D, IKSwingTwistJointState3D } from "./IKChain3D.js";
import { IKSolver3D, IKTarget3D } from "./IKSolver.js";
import { wrapRadians } from "@open-utilities/maths/wrapRadians.js";
import { sumArray } from "@open-utilities/maths/sumArray.js";

const EPSILON = 0.000001;

export type DampedLeastSquaresSolverOptions = DampedLeastSquaresOptions;

interface SolverMetrics extends DampedLeastSquaresMetrics {
	errorVector: number[];
	positionError: number;
	orientationError: number;
	score: number;
}

interface JointParameterDescriptor {
	jointIndex: number;
	parameter: "angle" | "azimuth" | "swing" | "twist";
}

export function createDampedLeastSquaresIKSolver3D(options: Partial<DampedLeastSquaresSolverOptions> = {}): IKSolver3D {
	const resolvedOptions = {
		iterations: options.iterations ?? 24,
		tolerance: options.tolerance ?? 0.001,
		orientationTolerance: options.orientationTolerance ?? options.tolerance ?? 0.001,
		damping: options.damping ?? 0.2,
		minDamping: options.minDamping ?? 0.02,
		maxDamping: options.maxDamping ?? 8,
		dampingScale: options.dampingScale ?? 2.5,
		finiteDifference: options.finiteDifference ?? 0.2,
		maxStep: options.maxStep ?? 0.35,
		positionWeight: options.positionWeight ?? 1,
		orientationWeight: options.orientationWeight ?? 0.35,
		minStepScale: options.minStepScale ?? 1 / 64,
	} satisfies DampedLeastSquaresSolverOptions;

	return (chain: IKChain3D, pose: IKChainPose3D, target: IKTarget3D) => solve(chain, pose, target, resolvedOptions);
}

function solve(chain: IKChain3D, pose: IKChainPose3D, target: IKTarget3D, options: DampedLeastSquaresSolverOptions) {
	const problem: LeastSquaresProblem<IKChainPose3D, JointParameterDescriptor, SolverMetrics> = {
		cloneState: pose => pose.clone(),
		copyState: (targetPose, sourcePose) => targetPose.copy(sourcePose),
		evaluateState: state => evaluateState(chain, state, target, options),
		isSolved: metrics => isSolved(metrics, options, target),
		listParameters: state => createParameterDescriptors(state.jointPoses),
		perturbParameter: (state, parameter, delta) => perturbParameter(chain, state, parameter, delta),
		applyStep: (state, parameters, step, scale) => applyStep(chain, state, parameters, step, scale),
	};

	solveDampedLeastSquares(pose, problem, options);
}

function isSolved(metrics: SolverMetrics, options: DampedLeastSquaresSolverOptions, target: IKTarget3D) {
	if (metrics.positionError > options.tolerance) {
		return false;
	}

	if (target.orientation && metrics.orientationError > options.orientationTolerance) {
		return false;
	}

	return true;
}

function evaluateState(chain: IKChain3D, pose: IKChainPose3D, target: IKTarget3D, options: DampedLeastSquaresOptions): SolverMetrics {
	const worldJoints = chain.getWorldJoints(pose);
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

	const score = sumArray(errorVector.map(value => value * value));
	return { errorVector, positionError, orientationError, score };
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

function createParameterDescriptors(jointStates: IKJointPose3D[]) {
	const descriptors: JointParameterDescriptor[] = [];

	for (let index = 0; index < jointStates.length; index++) {
		const jointState = jointStates[index]!;
		if (jointState instanceof IKHingeJointState3D) {
			descriptors.push({ jointIndex: index, parameter: "angle" });
		} else {
			descriptors.push(
				{ jointIndex: index, parameter: "azimuth" },
				{ jointIndex: index, parameter: "swing" },
				{ jointIndex: index, parameter: "twist" },
			);
		}
	}

	return descriptors;
}

function perturbParameter(chain: IKChain3D, pose: IKChainPose3D, descriptor: JointParameterDescriptor, delta: number) {
	const joint = chain.segments[descriptor.jointIndex]!.parentJoint;
	const jointPose = pose.jointPoses[descriptor.jointIndex]!;

	if (jointPose instanceof IKHingeJointState3D && joint instanceof IKHingeJoint3D) {
		const constraint = joint as IKHingeJoint3D;
		const nextAngle = coerceBetween(jointPose.angle + delta, constraint.minAngle, constraint.maxAngle);
		const appliedDelta = nextAngle - jointPose.angle;
		jointPose.angle = nextAngle;
		return appliedDelta;
	}

	if (jointPose instanceof IKSwingTwistJointState3D && joint instanceof IKSwingTwistJoint3D) {
		if (descriptor.parameter === "azimuth") {
			jointPose.azimuth = wrapRadians(jointPose.azimuth + delta);
			return delta;
		}

		if (descriptor.parameter === "swing") {
			const nextSwing = coerceBetween(jointPose.swing + delta, 0, joint.maxSwing);
			const appliedDelta = nextSwing - jointPose.swing;
			jointPose.swing = nextSwing;
			return appliedDelta;
		}

		if (descriptor.parameter === "twist") {
			const nextTwist = coerceBetween(jointPose.twist + delta, joint.minTwist, joint.maxTwist);
			const appliedDelta = nextTwist - jointPose.twist;
			jointPose.twist = nextTwist;
			return appliedDelta;
		}
	}

	throw new Error("IKSolver requires matching topology.");
}

function applyStep(chain: IKChain3D, pose: IKChainPose3D, descriptors: JointParameterDescriptor[], step: number[], scale: number) {
	for (let index = 0; index < descriptors.length; index++) {
		const descriptor = descriptors[index]!;
		const joint = chain.segments[descriptor.jointIndex]!.parentJoint;
		const jointPose = pose.jointPoses[descriptor.jointIndex]!;
		const delta = step[index]! * scale;

		if (joint instanceof IKHingeJoint3D && jointPose instanceof IKHingeJointState3D) {
			const constraint = joint as IKHingeJoint3D;
			jointPose.angle = coerceBetween(jointPose.angle + delta, constraint.minAngle, constraint.maxAngle);
			continue;
		}

		if (joint instanceof IKSwingTwistJoint3D && jointPose instanceof IKSwingTwistJointState3D) {
			if (descriptor.parameter === "azimuth") {
				jointPose.azimuth = wrapRadians(jointPose.azimuth + delta);
				continue;
			}

			if (descriptor.parameter === "swing") {
				jointPose.swing = coerceBetween(jointPose.swing + delta, 0, joint.maxSwing);
				continue;
			}

			if (descriptor.parameter === "twist") {
				jointPose.twist = coerceBetween(jointPose.twist + delta, joint.minTwist, joint.maxTwist);
				continue;
			}
		}
	}
}

