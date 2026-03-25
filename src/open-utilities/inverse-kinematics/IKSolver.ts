import { Quaternion } from "@open-utilities/maths/Quaternion";
import { Vector3 } from "@open-utilities/maths/Vector3";
import { IKChain3D } from "./IKChain3D";


export class IKTarget3D {
	constructor(
		public position: Vector3,
		public orientation?: Quaternion,
	) {}

	lerp(other: IKTarget3D, amount: number) {
		this.position.lerp(other.position, amount);

		if (this.orientation && other.orientation) {
			this.orientation.slerp(other.orientation, amount);
		} else if (other.orientation) {
			this.orientation = other.orientation.clone();
		}

		return this;
	}
}

export type IKSolver3D = (chain: IKChain3D, target: IKTarget3D) => void;