import { IKChain3D } from "./IKChain3D.js";
import { IKSolver3D, IKTarget3D } from "./IKSolver.js";
import { constrainDirection } from "./constrainDirection.js";

const EPSILON = 0.000001;

export interface FABRIKSolverOptions {
	iterations: number;
	tolerance: number;
}

export function createFabrikSolver3D(options: FABRIKSolverOptions): IKSolver3D {
	return (chain: IKChain3D, target: IKTarget3D) => solveFabrik3D(chain, target, options);
}

function solveFabrik3D(chain: IKChain3D, target: IKTarget3D, options: FABRIKSolverOptions) {
	const originalRootPosition = chain.joints[0]!.position.clone();

	const endEffector = chain.joints[chain.joints.length - 1]!.position;

	const iterations = options.iterations ?? 16;
	const tolerance = options.tolerance ?? 0.001;

	for (let iteration = 0; iteration < iterations; iteration++) {
		// move end-effector to target
		endEffector.copy(target.position);

		// move parent tip to child
		for (let index = chain.joints.length - 2; index >= 0; index--) {
			const parent = chain.joints[index]!;
			const child = chain.joints[index + 1]!;
			const link = chain.links[index]!;

			const toParent = child.position.clone().subtract(parent.position);
			toParent.normalize();
			toParent.multiply(link.length);

			parent.position.copy(child.position).subtract(toParent);
		}

		// move root back to original position
		chain.joints[0]!.position.copy(originalRootPosition);

		// move child to parent tip
		for (let index = 0; index < chain.links.length; index++) {
			const link = chain.links[index]!;
			const parent = chain.joints[index]!;
			const child = chain.joints[index + 1]!;

			const targetDirection = child.position.clone().subtract(parent.position).normalize() ?? child.rotation.rotateVector(IKChain3D.FORWARD);
			const result = constrainDirection(
				link.joint,
				targetDirection,
				parent.rotation,
				child.rotation,
				index === chain.links.length - 1 ? target.orientation : undefined,
			);

			child.rotation.copy(result.rotation);

			const tip = parent.position.clone().add(result.direction.multiply(link.length));
			child.position.copy(tip);
		}

		if (endEffector.distanceTo(target.position) <= tolerance) {
			break;
		}
	}
}