import { coerceBetween } from "@open-utilities/maths/coerceBetween";
import { DampedLeastSquaresOptions, LeastSquaresProblem, solveDampedLeastSquares } from "@open-utilities/inverse-kinematics/solveDampedLeastSquares.js";
import { IKHingeJoint3D, IKChain3D, IKSwingTwistJoint3D, IKChainPose3D, IKHingeJointState3D, IKJointPose3D, IKSwingTwistJointState3D } from "./IKChain3D.js";
import { IKSolver3D, IKTarget3D } from "./IKSolver.js";
import { createIKEvaluator3D, IKEvaluation3D, IKEvaluator3D } from "./ikEvaluator3D.js";

export interface DampedLeastSquaresIKSolverOptions extends DampedLeastSquaresOptions {
	evaluator?: IKEvaluator3D;
}

export function createDampedLeastSquaresIKSolver3D(options: Partial<DampedLeastSquaresIKSolverOptions>): IKSolver3D {
	const resolvedOptions = {
		iterations: options.iterations ?? 24,
		damping: options.damping ?? 0.1,
		minDamping: options.minDamping ?? 0.02,
		maxDamping: options.maxDamping ?? 8,
		dampingScale: options.dampingScale ?? 2.5,
		finiteDifference: options.finiteDifference ?? 0.3,
		maxStep: options.maxStep ?? 1,
		minStepScale: options.minStepScale ?? 1 / 64,
		evaluator: options.evaluator ?? createIKEvaluator3D(),
	} satisfies DampedLeastSquaresIKSolverOptions;

	return (chain: IKChain3D, pose: IKChainPose3D, target: IKTarget3D) => {
		solve(chain, pose, target, resolvedOptions);
	};
}

interface JointParameterDescriptor {
	jointIndex: number;
	parameter: "angle" | "swingX" | "swingY" | "twist";
}

function solve(chain: IKChain3D, pose: IKChainPose3D, target: IKTarget3D, options: Required<DampedLeastSquaresIKSolverOptions>) {
	const problem: LeastSquaresProblem<IKChainPose3D, JointParameterDescriptor, IKEvaluation3D> = {
		cloneState: pose => pose.clone(),
		copyState: (targetPose, sourcePose) => targetPose.copy(sourcePose),
		evaluateState: state => options.evaluator(chain, state, target),
		listParameters: state => createParameterDescriptors(state.segments),
		perturbParameter: (state, parameter, delta) => perturbParameter(chain, state, parameter, delta),
		clampDelta: (state, parameter, delta) => clampDelta(chain, state, parameter, delta),
		applyStep: (state, parameters, step, scale) => {
			applyStep(chain, state, parameters, step, scale);
		}
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
				{ jointIndex: index, parameter: "swingX" },
				{ jointIndex: index, parameter: "swingY" },
				{ jointIndex: index, parameter: "twist" },
			);
		}
	}

	return descriptors;
}

function perturbParameter(chain: IKChain3D, pose: IKChainPose3D, descriptor: JointParameterDescriptor, delta: number) {
	const appliedDelta = clampDelta(chain, pose, descriptor, delta);
	applyDelta(chain, pose, descriptor, appliedDelta);
	return appliedDelta;
}

function clampDelta(chain: IKChain3D, pose: IKChainPose3D, descriptor: JointParameterDescriptor, delta: number) {
	const joint = chain.segments[descriptor.jointIndex]!.joint;
	const jointPose = pose.segments[descriptor.jointIndex]!;

	if (joint instanceof IKHingeJoint3D && jointPose instanceof IKHingeJointState3D) {
		return coerceBetween(jointPose.angle + delta, joint.minAngle, joint.maxAngle) - jointPose.angle;
	}

	if (joint instanceof IKSwingTwistJoint3D && jointPose instanceof IKSwingTwistJointState3D) {
		if (descriptor.parameter === "swingX") {
			return coerceBetween(jointPose.swingX + delta, -1, 1) - jointPose.swingX;
		}

		if (descriptor.parameter === "swingY") {
			return coerceBetween(jointPose.swingY + delta, -1, 1) - jointPose.swingY;
		}

		if (descriptor.parameter === "twist") {
			return coerceBetween(jointPose.twist + delta, joint.minTwist, joint.maxTwist) - jointPose.twist;
		}
	}

	throw new Error("IKSolver requires matching topology.");
}

function applyDelta(chain: IKChain3D, pose: IKChainPose3D, descriptor: JointParameterDescriptor, delta: number) {
	const joint = chain.segments[descriptor.jointIndex]!.joint;
	const jointPose = pose.segments[descriptor.jointIndex]!;

	if (joint instanceof IKHingeJoint3D && jointPose instanceof IKHingeJointState3D) {
		jointPose.angle += delta;
		return;
	}

	if (joint instanceof IKSwingTwistJoint3D && jointPose instanceof IKSwingTwistJointState3D) {
		if (descriptor.parameter === "swingX") {
			jointPose.swingX += delta;
			return;
		}

		if (descriptor.parameter === "swingY") {
			jointPose.swingY += delta;
			return;
		}

		if (descriptor.parameter === "twist") {
			jointPose.twist += delta;
			return;
		}
	}

	throw new Error("IKSolver requires matching topology.");
}

function applyStep(chain: IKChain3D, pose: IKChainPose3D, descriptors: JointParameterDescriptor[], step: number[], scale: number) {
	for (let index = 0; index < descriptors.length; index++) {
		const descriptor = descriptors[index]!;
		applyDelta(chain, pose, descriptor, clampDelta(chain, pose, descriptor, step[index]! * scale));
	}
}

