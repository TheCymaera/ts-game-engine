import { Random } from "@open-utilities/maths/Random.js";
import { throwError } from "../core/throwError.js";
import { Quaternion } from "../maths/Quaternion.js";
import { sumArray } from "../maths/sumArray.js";
import { Vector3 } from "../maths/Vector3.js";
import { coerceBetween } from "@open-utilities/maths/coerceBetween.js";
import { assertNever } from "@open-utilities/types/assertNever.js";

const SWING_EPSILON = 1e-9;

export class IKSwingTwistJoint3D {
	private constructor(
		readonly maxSwing: number,
		readonly minTwist: number,
		readonly maxTwist: number,
		readonly referenceAxis: Vector3,
	) {}

	static new(options: { maxSwing: number; minTwist: number; maxTwist: number; referenceAxis: Vector3 }) {
		if (options.minTwist > options.maxTwist) {
			throw new Error("IKChain3D constraint.minTwist cannot be greater than constraint.maxTwist.");
		}

		return new IKSwingTwistJoint3D(
			options.maxSwing,
			options.minTwist,
			options.maxTwist,
			options.referenceAxis.clone().normalize() ?? throwError("IKChain3D constraint.referenceAxis must be non-zero."),
		);
	}

	rotation(state: IKSwingTwistJointState3D): Quaternion {
		const swing = swingRotation(state.swingX, state.swingY, this.maxSwing);
		const twistRotation = Quaternion.fromAxisAngle(IKChain3D.IDENTITY_VECTOR, state.twist);
		return swing.multiply(twistRotation).normalize() ?? Quaternion.identity();
	}
}

export class IKHingeJoint3D {
	private constructor(
		readonly minAngle: number,
		readonly maxAngle: number,
		readonly axis: Vector3,
		readonly reference: Vector3,
	) { }

	static new(options: { minAngle: number; maxAngle: number; axis: Vector3; reference: Vector3 }) {
		if (options.minAngle > options.maxAngle) {
			throw new Error("IKChain3D constraint.minAngle cannot be greater than constraint.maxAngle.");
		}

		return new IKHingeJoint3D(
			options.minAngle,
			options.maxAngle,
			options.axis.clone().normalize() ?? throwError("IKChain3D constraint.axis must be non-zero."),
			options.reference.clone().normalize() ?? throwError("IKChain3D constraint.reference must be non-zero."),
		);
	}

	rotation(state: IKHingeJointState3D) {
		return Quaternion.fromAxisAngle(this.axis, state.angle);
	}
}

export class IKSwingTwistJointState3D {
	constructor(
		public swingX: number = 0,
		public swingY: number = 0,
		public twist: number = 0,
	) {}

	clone() {
		return new IKSwingTwistJointState3D(this.swingX, this.swingY, this.twist);
	}

	copy(other: IKSwingTwistJointState3D) {
		this.swingX = other.swingX;
		this.swingY = other.swingY;
		this.twist = other.twist;
		return this;
	}

	lerpState(other: IKSwingTwistJointState3D, t: number) {
		this.swingX += (other.swingX - this.swingX) * t;
		this.swingY += (other.swingY - this.swingY) * t;
		this.twist += (other.twist - this.twist) * t;
		return this;
	}
}

export class IKHingeJointState3D {
	constructor(
		public angle: number = 0,
	) {}

	clone() {
		return new IKHingeJointState3D(this.angle);
	}

	copy(other: IKHingeJointState3D) {
		this.angle = other.angle;
		return this;
	}

	lerpState(other: IKHingeJointState3D, t: number) {
		this.angle += shortestAngleDelta(this.angle, other.angle) * t;
		return this;
	}

	//rotateTowards(state: IKHingeJointState3D, maxDelta: number) {
	//	this.angle = wrapRadians(this.angle + coerceBetween(shortestAngleDelta(this.angle, state.angle), -maxDelta, maxDelta));
	//	return this;
	//}
}

export type IKJoint3D = IKSwingTwistJoint3D | IKHingeJoint3D;
export type IKJointPose3D = IKSwingTwistJointState3D | IKHingeJointState3D;

export interface IKChainSegment3D {
	length: number;
	joint: IKJoint3D;
}

export interface IKChain3DOptions {
	segments: readonly IKChainSegment3D[];
}

export interface IKChainWorldNode3D {
	position: Vector3;
	worldRotation: Quaternion;
	localRotation: Quaternion;
}

export class IKChain3D {
	static get IDENTITY_VECTOR() { return Vector3.new(0, 1, 0); }

	private constructor(
		readonly segments: IKChainSegment3D[],
	) {}

	static new(options: IKChain3DOptions) {
		return new IKChain3D(
			[...options.segments]
		);
	}

	get totalLength() {
		return sumArray(this.segments.map(segment => segment.length));
	}

	createPose(options: {
		position: Vector3;
		rotation: Quaternion;
	}) {
		return new IKChainPose3D(
			options.position.clone(),
			options.rotation.clone(),
			this.segments.map(segment => {
				if (segment.joint instanceof IKHingeJoint3D) {
					return new IKHingeJointState3D();
				}

				if (segment.joint instanceof IKSwingTwistJoint3D) {
					return new IKSwingTwistJointState3D();
				}

				assertNever(segment.joint);
			}),
		);
	}

	getWorldNodes(pose: IKChainPose3D) {
		const nodes: IKChainWorldNode3D[] = [{
			position: pose.position.clone(),
			worldRotation: Quaternion.identity(),
			localRotation: pose.orientation.clone(),
		}];

		const cursor = pose.position.clone();
		const cursorRotation = pose.orientation.clone();

		for (let index = 0; index < this.segments.length; index++) {
			const segment = this.segments[index]!;
			const jointState = pose.segments[index]!;

			let localRotation: Quaternion;
			if (segment.joint instanceof IKHingeJoint3D && jointState instanceof IKHingeJointState3D) {
				localRotation = segment.joint.rotation(jointState).normalize()!;
			} else if (segment.joint instanceof IKSwingTwistJoint3D && jointState instanceof IKSwingTwistJointState3D) {
				localRotation = segment.joint.rotation(jointState).normalize()!;
			} else {
				throw new Error("IKChain3D.getWorld requires matching topology.");
			}

			cursorRotation.multiply(localRotation);

			cursor.add(IKChain3D.IDENTITY_VECTOR.rotate(cursorRotation).multiply(segment.length));

			nodes.push({
				position: cursor.clone(),
				worldRotation: cursorRotation.clone(),
				localRotation,
			});
		}

		return nodes;
	}
}

export class IKChainPose3D {
	constructor(
		readonly position: Vector3,
		readonly orientation: Quaternion,
		readonly segments: IKJointPose3D[],
	) {}

	clone() {
		return new IKChainPose3D(
			this.position.clone(),
			this.orientation.clone(),
			this.segments.map(state => state.clone()),
		);
	}

	randomize(chain: IKChain3D, random: Random) {
		for (let index = 0; index < this.segments.length; index++) {
			const jointState = this.segments[index]!;
			const joint = chain.segments[index]!.joint;
			if (jointState instanceof IKHingeJointState3D && joint instanceof IKHingeJoint3D) {
				jointState.angle = random.nextFloat(joint.minAngle, joint.maxAngle);
			} else if (jointState instanceof IKSwingTwistJointState3D && joint instanceof IKSwingTwistJoint3D) {
				jointState.swingX = random.nextFloat(-1, 1);
				jointState.swingY = random.nextFloat(-1, 1);
				jointState.twist = random.nextFloat(joint.minTwist, joint.maxTwist);
			}
		}

		return this;
	}

	copy(other: IKChainPose3D) {
		this.position.copy(other.position);
		this.orientation.copy(other.orientation);

		for (let index = 0; index < this.segments.length; index++) {
			const thisJoint = this.segments[index]!;
			const otherJoint = other.segments[index]!;

			if (thisJoint instanceof IKHingeJointState3D && otherJoint instanceof IKHingeJointState3D) {
				thisJoint.copy(otherJoint);
				continue;
			}

			if (thisJoint instanceof IKSwingTwistJointState3D && otherJoint instanceof IKSwingTwistJointState3D) {
				thisJoint.copy(otherJoint);
				continue;
			}

			throw new Error("IKChainPose3D.copy requires matching topology.");
		}

		return this;
	}

	lerp(other: IKChainPose3D, amount: number) {
		const t = coerceBetween(amount, 0, 1);
		this.position.lerp(other.position, t);
		this.orientation.slerp(other.orientation, t);

		for (let index = 0; index < this.segments.length; index++) {
			const thisSegment = this.segments[index]!;
			const otherSegment = other.segments[index]!;

			if (thisSegment instanceof IKHingeJointState3D && otherSegment instanceof IKHingeJointState3D) {
				thisSegment.lerpState(otherSegment, t);
				continue;
			}

			if (thisSegment instanceof IKSwingTwistJointState3D && otherSegment instanceof IKSwingTwistJointState3D) {
				thisSegment.lerpState(otherSegment, t);
				continue;
			}

			throw new Error("IKChainPose3D.lerp requires matching topology.");
		}

		return this;
	}

	//rotateTowards(other: IKChainPose3D, maxDelta: number) {
	//	for (let index = 0; index < this.segments.length; index++) {
	//		const thisSegment = this.segments[index]!;
	//		const otherSegment = other.segments[index]!;

	//		if (thisSegment instanceof IKHingeJointState3D && otherSegment instanceof IKHingeJointState3D) {
	//			thisSegment.rotateTowards(otherSegment, maxDelta);
	//			continue;
	//		}

	//		if (thisSegment instanceof IKSwingTwistJointState3D && otherSegment instanceof IKSwingTwistJointState3D) {
	//			thisSegment.rotateTowards(otherSegment, maxDelta);
	//			continue;
	//		}

	//		throw new Error("IKChainPose3D.rotateTowards requires matching topology.");
	//	}

	//	return this;
	//}
}

export function boxToSwing(x: number, y: number) {
	return [
		x * Math.sqrt(Math.max(1 - y * y / 2, 0)),
		y * Math.sqrt(Math.max(1 - x * x / 2, 0)),
	] as const;
}

export function swingRotation(swingX: number, swingY: number, maxSwing: number) {
	const [x, y] = boxToSwing(swingX, swingY);
	const angle = Math.hypot(x, y);
	if (angle <= SWING_EPSILON) return Quaternion.identity();

	const axis = Vector3.new(y / angle, 0, -x / angle);
	return Quaternion.fromAxisAngle(axis, angle * maxSwing);
}

function shortestAngleDelta(from: number, to: number) {
	let delta = to - from;
	while (delta > Math.PI) delta -= Math.PI * 2;
	while (delta < -Math.PI) delta += Math.PI * 2;
	return delta;
}
