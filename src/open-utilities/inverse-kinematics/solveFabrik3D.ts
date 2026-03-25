import { IKChain3D } from "./IKChain3D.js";
import { IKSolver3D, IKTarget3D } from "./IKSolver.js";
import { constrainDirection, solveUnreachable } from "./solveUnreachable.js";

const EPSILON = 0.000001;

export interface FABRIKSolverOptions {
	iterations: number;
	tolerance: number;
}

export function createFabrikSolver3D(options: FABRIKSolverOptions): IKSolver3D {
	return (chain: IKChain3D, target: IKTarget3D) => solveFabrik3D(chain, target, options);
}

function solveFabrik3D(chain: IKChain3D, target: IKTarget3D, options: FABRIKSolverOptions) {
	chain.jointPositions[0]!.copy(chain.rootPosition);

	if (chain.rootPosition.distanceTo(target.position) >= chain.totalLength - EPSILON) {
		solveUnreachable(chain, target);
		return;
	}

	const endEffector = chain.jointPositions[chain.jointPositions.length - 1]!;

	const iterations = options.iterations ?? 16;
	const tolerance = options.tolerance ?? 0.001;

	for (let iteration = 0; iteration < iterations; iteration++) {
		// move end-effector to target
		endEffector.copy(target.position);

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
				target?.orientation,
			);

			segment.direction.copy(result.direction);
			segment.rotation.copy(result.rotation);

			const tip = joint.clone().add(result.direction.clone().multiply(segment.length));
			child.copy(tip);
		}

		if (endEffector.distanceTo(target.position) <= tolerance) {
			break;
		}
	}
}