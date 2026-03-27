import { coerceBetween } from "@open-utilities/maths/coerceBetween";
import { DampedLeastSquaresOptions, LeastSquaresProblem, solveDampedLeastSquares } from "@open-utilities/inverse-kinematics/solveDampedLeastSquares.js";
import { IKHingeJoint3D, IKChain3D, IKSwingTwistJoint3D, IKChainPose3D, IKHingeJointState3D, IKJointPose3D, IKSwingTwistJointState3D } from "./IKChain3D.js";
import { IKSolver3D, IKTarget3D } from "./IKSolver.js";
import { wrapRadians } from "@open-utilities/maths/wrapRadians.js";
import { createIKEvaluator3D, IKEvaluation3D, IKEvaluator3D } from "./ikEvaluator3D.js";

export interface DampedLeastSquaresIKSolverOptions extends DampedLeastSquaresOptions {
	evaluator?: IKEvaluator3D;
}

export function createDampedLeastSquaresIKSolver3D(options: Partial<DampedLeastSquaresIKSolverOptions>): IKSolver3D {
	const resolvedOptions = {
		iterations: options.iterations ?? 24,
		damping: options.damping ?? 0.2,
		minDamping: options.minDamping ?? 0.02,
		maxDamping: options.maxDamping ?? 8,
		dampingScale: options.dampingScale ?? 2.5,
		finiteDifference: options.finiteDifference ?? 0.3,
		maxStep: options.maxStep ?? 0.35,
		minStepScale: options.minStepScale ?? 1 / 64,
		evaluator: options.evaluator ?? createIKEvaluator3D(),
	} satisfies DampedLeastSquaresIKSolverOptions;

	return (chain: IKChain3D, pose: IKChainPose3D, target: IKTarget3D) => solve(chain, pose, target, resolvedOptions);
}

interface JointParameterDescriptor {
	jointIndex: number;
	parameter: "angle" | "azimuth" | "swing" | "twist";
}

function solve(chain: IKChain3D, pose: IKChainPose3D, target: IKTarget3D, options: Required<DampedLeastSquaresIKSolverOptions>) {
	const problem: LeastSquaresProblem<IKChainPose3D, JointParameterDescriptor, IKEvaluation3D> = {
		cloneState: pose => pose.clone(),
		copyState: (targetPose, sourcePose) => targetPose.copy(sourcePose),
		evaluateState: state => options.evaluator(chain, state, target),
		listParameters: state => createParameterDescriptors(state.segments),
		perturbParameter: (state, parameter, delta) => perturbParameter(chain, state, parameter, delta),
		applyStep: (state, parameters, step, scale) => applyStep(chain, state, parameters, step, scale),
	};

	solveDampedLeastSquares(pose, problem, options);
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
	const joint = chain.segments[descriptor.jointIndex]!.joint;
	const jointPose = pose.segments[descriptor.jointIndex]!;

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
		const joint = chain.segments[descriptor.jointIndex]!.joint;
		const jointPose = pose.segments[descriptor.jointIndex]!;
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

