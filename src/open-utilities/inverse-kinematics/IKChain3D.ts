import { throwError } from "@open-utilities/core/throwError.js";
import { Quaternion } from "../maths/Quaternion.js";
import { sumArray } from "../maths/sumArray.js";
import { Vector3 } from "../maths/Vector3.js";
import { coerceBetween } from "@open-utilities/maths/coerceBetween.js";
import { wrapRadians } from "@open-utilities/maths/wrapRadians.js";

export class IKSwingTwistJoint3D {
	private constructor(
		readonly maxSwing: number,
		readonly minTwist: number,
		readonly maxTwist: number,
		readonly twistBase: Vector3,

		public azimuth: number,
		public swing: number,
		public twist: number,
	) {}

	static new(options: { maxSwing: number; minTwist: number; maxTwist: number; twistOrigin: Vector3 }) {
		if (options.minTwist > options.maxTwist) {
			throw new Error("IKChain3D constraint.minTwist cannot be greater than constraint.maxTwist.");
		}

		return new IKSwingTwistJoint3D(
			options.maxSwing,
			options.minTwist,
			options.maxTwist,
			options.twistOrigin.clone().normalize() ?? throwError("IKChain3D constraint.twistOrigin must be non-zero."),

			0, 0, 0,
		);
	}

	clone() {
		return new IKSwingTwistJoint3D(
			this.maxSwing,
			this.minTwist,
			this.maxTwist,
			this.twistBase.clone(),

			this.azimuth, this.swing, this.twist,
		);
	}

	copy(other: IKSwingTwistJoint3D) {
		this.azimuth = other.azimuth;
		this.swing = other.swing;
		this.twist = other.twist;
		return this;
	}

	lerpState(other: IKSwingTwistJoint3D, t: number) {
		this.azimuth = wrapRadians(this.azimuth + shortestAngleDelta(this.azimuth, other.azimuth) * t);
		this.swing = coerceBetween(this.swing + (other.swing - this.swing) * t, 0, this.maxSwing);
		this.twist = coerceBetween(this.twist + shortestAngleDelta(this.twist, other.twist) * t, this.minTwist, this.maxTwist);
		return this;
	}
}

export class IKHingeJoint3D {
	private constructor(
		readonly minAngle: number,
		readonly maxAngle: number,
		readonly axis: Vector3,
		readonly origin: Vector3,

		public angle: number,
	) { }

	static new(options: { minAngle: number; maxAngle: number; axis: Vector3; origin: Vector3 }) {
		if (options.minAngle > options.maxAngle) {
			throw new Error("IKChain3D constraint.minAngle cannot be greater than constraint.maxAngle.");
		}

		return new IKHingeJoint3D(
			options.minAngle,
			options.maxAngle,
			options.axis.clone().normalize() ?? throwError("IKChain3D constraint.axis must be non-zero."),
			options.origin.clone().normalize() ?? throwError("IKChain3D constraint.origin must be non-zero."),

			0,
		);
	}

	clone() {
		return new IKHingeJoint3D(
			this.minAngle,
			this.maxAngle,
			this.axis.clone(),
			this.origin.clone(),

			this.angle,
		);
	}

	copy(other: IKHingeJoint3D) {
		this.angle = other.angle;
		return this;
	}

	lerpState(other: IKHingeJoint3D, t: number) {
		this.angle = coerceBetween(this.angle + shortestAngleDelta(this.angle, other.angle) * t, this.minAngle, this.maxAngle);
		return this;
	}
}

export type IKJoint3D = IKSwingTwistJoint3D | IKHingeJoint3D;

export interface IKChainSegment3D {
	length: number;
	joint: IKJoint3D;
}

export interface IKChain3DOptions {
	rootPosition: Vector3;
	//rootDirection: Vector3;
	rotation: Quaternion;
	//rootUp: Vector3;
	segments: readonly IKChainSegment3D[];
}

export interface IKChainWorldJoint3D {
	position: Vector3;
	rotation: Quaternion;
}

export class IKChain3D {
	static get FORWARD() { return Vector3.new(0, 1, 0); }

	private constructor(
		readonly rootPosition: Vector3,
		readonly rootRotation: Quaternion,
		readonly segments: IKChainSegment3D[],
	) {}

	static new(options: IKChain3DOptions) {
		if (options.segments.length === 0) {
			throw new Error("IKChain3D requires at least one segment.");
		}

		if (options.segments.some(segment => segment.length <= 0)) {
			throw new Error("IKChain3D segment lengths must be positive.");
		}

		const rootPosition = options.rootPosition.clone();
		const rootRotation = options.rotation.clone();

		const segments = options.segments.map(segment => ({
			length: segment.length,
			joint: segment.joint,
		}));

		return new IKChain3D(rootPosition, rootRotation, segments);
	}

	get totalLength() {
		return sumArray(this.segments.map(segment => segment.length));
	}

	clone() {
		return new IKChain3D(
			this.rootPosition.clone(),
			this.rootRotation.clone(),
			this.segments.map(segment => ({
				length: segment.length,
				joint: segment.joint.clone(),
			})),
		);
	}

	copyPose(other: IKChain3D) {
		if (this.segments.length !== other.segments.length) {
			throw new Error("IKChain3D.copyPose requires chains with matching segments.");
		}

		this.rootPosition.copy(other.rootPosition);
		this.rootRotation.copy(other.rootRotation);

		for (let index = 0; index < this.segments.length; index++) {
			const target = this.segments[index]!.joint;
			const source = other.segments[index]!.joint;

			if (target instanceof IKHingeJoint3D && source instanceof IKHingeJoint3D) {
				target.copy(source);
				continue;
			}

			if (target instanceof IKSwingTwistJoint3D && source instanceof IKSwingTwistJoint3D) {
				target.copy(source);
				continue;
			}

			throw new Error("IKChain3D.copyPose requires matching joint types.");
		}

		return this;
	}

	lerpPose(other: IKChain3D, amount: number) {
		if (this.segments.length !== other.segments.length) {
			throw new Error("IKChain3D.lerpPose requires chains with matching segments.");
		}

		const t = coerceBetween(amount, 0, 1);
		this.rootPosition.lerp(other.rootPosition, t);
		this.rootRotation.slerp(other.rootRotation, t);

		for (let index = 0; index < this.segments.length; index++) {
			const thisJoint = this.segments[index]!.joint;
			const otherJoint = other.segments[index]!.joint;

			if (thisJoint instanceof IKHingeJoint3D && otherJoint instanceof IKHingeJoint3D) {
				thisJoint.lerpState(otherJoint, t);
				continue;
			}

			if (thisJoint instanceof IKSwingTwistJoint3D && otherJoint instanceof IKSwingTwistJoint3D) {
				thisJoint.lerpState(otherJoint, t);
				continue;
			}

			throw new Error("IKChain3D.lerpPose requires matching joint types.");
		}

		return this;
	}

	get joints() {
		const joints: IKChainWorldJoint3D[] = [{
			position: this.rootPosition.clone(),
			rotation: this.rootRotation.clone(),
		}];

		let cursor = this.rootPosition.clone();
		let parentRotation = this.rootRotation.clone();

		for (let index = 0; index < this.segments.length; index++) {
			const segment = this.segments[index]!;
			const rotation = resolveJointWorldRotation(parentRotation, segment.joint);

			const direction = rotation.rotateVector(IKChain3D.FORWARD);
			cursor.add(direction.multiply(segment.length));
			joints.push({
				position: cursor.clone(),
				rotation,
			});
			parentRotation = rotation;
		}

		return joints;
	}
}

function resolveJointWorldRotation(parentRotation: Quaternion, jointState: IKJoint3D) {
	if (jointState instanceof IKHingeJoint3D) {
		return parentRotation.clone().multiply(Quaternion.fromAxisAngle(jointState.axis, jointState.angle)).normalize() ?? parentRotation.clone();
	}

	if (jointState instanceof IKSwingTwistJoint3D) {
		const direction = directionFromSpherical(jointState.azimuth, jointState.swing);
		const swingRotation = Quaternion.fromTo(IKChain3D.FORWARD, direction, jointState.twistBase);
		const twistRotation = Quaternion.fromAxisAngle(IKChain3D.FORWARD, jointState.twist);
		const localRotation = swingRotation.multiply(twistRotation).normalize() ?? Quaternion.identity();
		return parentRotation.clone().multiply(localRotation).normalize() ?? parentRotation.clone();
	}

	throw new Error("IKChain3D received mismatched joint state and constraint types.");
}

function directionFromSpherical(azimuth: number, swing: number) {
	const sinSwing = Math.sin(swing);
	return Vector3.new(
		Math.cos(azimuth) * sinSwing,
		Math.cos(swing),
		Math.sin(azimuth) * sinSwing,
	).normalize() ?? IKChain3D.FORWARD;
}

function shortestAngleDelta(from: number, to: number) {
	let delta = to - from;
	while (delta > Math.PI) delta -= Math.PI * 2;
	while (delta < -Math.PI) delta += Math.PI * 2;
	return delta;
}