import { assertUnreachable } from "@open-utilities/types/assertNever.js";
import { Quaternion } from "../maths/Quaternion.js";
import { sumArray } from "../maths/sumArray.js";
import { Vector3 } from "../maths/Vector3.js";
import { coerceBetween } from "@open-utilities/maths/coerceBetween.js";

export class SwingTwistJointOptions3D {
	maxSwing: number;
	minTwist: number;
	maxTwist: number;
	twistBase: Vector3;

	constructor(options: { maxSwing: number; minTwist: number; maxTwist: number; twistOrigin: Vector3 }) {
		if (options.minTwist > options.maxTwist) {
			throw new Error("IKChain3D constraint.minTwist cannot be greater than constraint.maxTwist.");
		}

		this.maxSwing = coerceBetween(options.maxSwing, 0, Math.PI);
		this.minTwist = options.minTwist;
		this.maxTwist = options.maxTwist;
		this.twistBase = options.twistOrigin.clone().normalize() ?? assertUnreachable("IKChain3D constraint.twistOrigin must be non-zero.");
	}
}

export class HingeJointOptions3D {
	minAngle: number;
	maxAngle: number;
	axis: Vector3;
	origin: Vector3;

	constructor(options: { minAngle: number; maxAngle: number; axis: Vector3; origin: Vector3 }) {
		if (options.minAngle > options.maxAngle) {
			throw new Error("IKChain3D constraint.minAngle cannot be greater than constraint.maxAngle.");
		}

		this.minAngle = options.minAngle;
		this.maxAngle = options.maxAngle;
		this.axis = options.axis.clone().normalize() ?? assertUnreachable("IKChain3D constraint.axis must be non-zero.");
		this.origin = options.origin.clone().normalize() ?? assertUnreachable("IKChain3D constraint.origin must be non-zero.");
	}
}

export type Joint3D = SwingTwistJointOptions3D | HingeJointOptions3D;

export interface IKChain3DOptions {
	rootPosition: Vector3;
	rootDirection?: Vector3;
	rootUp?: Vector3;
	links: readonly {
		length: number;
		joint: Joint3D;
	}[];
}

export interface IKChainLink3D {
	length: number;
	joint: Joint3D;
}

export interface IKChainJoint3D {
	position: Vector3;
	rotation: Quaternion;
}

export class IKChain3D {
	static get FORWARD() { return Vector3.new(0, 1, 0); }

	constructor(
		readonly links: IKChainLink3D[],
		readonly joints: IKChainJoint3D[],
	) {}

	static new(options: IKChain3DOptions) {
		if (options.links.length === 0) {
			throw new Error("IKChain3D requires at least one segment.");
		}

		if (options.links.some(link => link.length <= 0)) {
			throw new Error("IKChain3D segment lengths must be positive.");
		}

		const rootPosition = options.rootPosition.clone();
		
		const rootDirection = options.rootDirection?.clone().normalize() ?? Vector3.new(0, 1, 0);
		const rootUp = options.rootUp?.clone().normalize() ?? rootDirection.clone().orthogonal();
		const rootRotation = Quaternion.fromForwardUp(rootDirection, rootUp);

		const links = options.links.map(link => ({
			length: link.length,
			joint: link.joint,
		}));

		const joints = [{
			position: rootPosition.clone(),
			rotation: rootRotation.clone()
		}];

		let cursor = rootPosition.clone();
		for (const link of links) {
			cursor.add(rootDirection.clone().multiply(link.length));
			joints.push({
				position: cursor.clone(),
				rotation: rootRotation.clone(),
			});
		}

		return new IKChain3D(links, joints);
	}

	get totalLength() {
		return sumArray(this.links.map(link => link.length));
	}

	clone() {
		const joints = this.joints.map(joint => ({
			position: joint.position.clone(),
			rotation: joint.rotation.clone(),
		}));
		const links = this.links.map(link => ({
			length: link.length,
			joint: link.joint,
		}));

		return new IKChain3D(links, joints);
	}

	lerpPose(other: IKChain3D, amount: number) {
		if (this.links.length !== other.links.length || this.joints.length !== other.joints.length) {
			throw new Error("IKChain3D.lerpPose requires chains with matching topology.");
		}

		const t = coerceBetween(amount, 0, 1);
		const currentRotations = this.joints.map(joint => joint.rotation.clone());

		this.joints[0]!.rotation.slerp(other.joints[0]!.rotation, t);

		for (let index = 1; index < this.joints.length; index++) {
			const joint = this.joints[index]!;
			const otherJoint = other.joints[index]!;
			const constraint = this.links[index - 1]!.joint;

			if (constraint instanceof HingeJointOptions3D) {
				const currentAngle = extractHingeAngle(currentRotations[index]!, currentRotations[index - 1]!, constraint);
				const targetAngle = extractHingeAngle(otherJoint.rotation, other.joints[index - 1]!.rotation, constraint);
				const angle = currentAngle + shortestAngleDelta(currentAngle, targetAngle) * t;
				const localRotation = Quaternion.fromAxisAngle(constraint.axis, angle);
				joint.rotation.copy(this.joints[index - 1]!.rotation.clone().multiply(localRotation).normalize() ?? otherJoint.rotation);
			} else {
				joint.rotation.copy(currentRotations[index]!).slerp(otherJoint.rotation, t);
			}
		}

		this.updatePositions();
		return this;
	}

	updatePositions() {
		let cursor = this.joints[0]!.position.clone();
		for (let index = 0; index < this.links.length; index++) {
			const link = this.links[index]!;
			const joint = this.joints[index + 1]!;

			const direction = joint.rotation.rotateVector(IKChain3D.FORWARD);
			cursor.add(direction.multiply(link.length));
			joint.position.copy(cursor);
		}
	}
}

function extractHingeAngle(rotation: Quaternion, parentRotation: Quaternion, constraint: HingeJointOptions3D) {
	const direction = rotation.rotateVector(constraint.origin);
	const localDirection = direction.rotate(parentRotation.clone().invert()!).normalize() ?? constraint.origin.clone();
	return signedAngleAroundAxis(constraint.origin, localDirection, constraint.axis);
}

function signedAngleAroundAxis(from: Vector3, to: Vector3, axis: Vector3) {
	const sine = axis.dot(from.clone().cross(to));
	const cosine = coerceBetween(from.dot(to), -1, 1);
	return Math.atan2(sine, cosine);
}

function shortestAngleDelta(from: number, to: number) {
	let delta = to - from;
	while (delta > Math.PI) delta -= Math.PI * 2;
	while (delta < -Math.PI) delta += Math.PI * 2;
	return delta;
}