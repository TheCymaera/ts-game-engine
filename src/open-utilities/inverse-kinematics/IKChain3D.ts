import { assertUnreachable } from "@open-utilities/types/assertNever.js";
import { Quaternion } from "../maths/Quaternion.js";
import { sumArray } from "../maths/sumArray.js";
import { Vector3 } from "../maths/Vector3.js";
import { coerceBetween } from "@open-utilities/maths/coerceBetween.js";

export class IKSwingTwistConstraint3D {
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

export class IKHingeConstraint3D {
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

export type IKConstraint3D = IKSwingTwistConstraint3D | IKHingeConstraint3D;

export interface IKChain3DOptions {
	rootPosition: Vector3;
	rootDirection?: Vector3;
	rootUp?: Vector3;
	segments: readonly {
		length: number;
		constraint: IKConstraint3D;
	}[];
}

export interface IKChainSegment3D {
	length: number;
	constraint: IKConstraint3D;
	direction: Vector3;
	rotation: Quaternion;
}

export class IKChain3D {

	static get FORWARD() { return Vector3.new(0, 1, 0); }

	constructor(
		readonly rootPosition: Vector3,
		readonly rootRotation: Quaternion,
		readonly segments: IKChainSegment3D[],
		readonly jointPositions: Vector3[],
	) {}

	static new(options: IKChain3DOptions) {
		if (options.segments.length === 0) {
			throw new Error("IKChain3D requires at least one segment.");
		}

		if (options.segments.some(segment => segment.length <= 0)) {
			throw new Error("IKChain3D segment lengths must be positive.");
		}

		const rootPosition = options.rootPosition.clone();
		
		const rootDirection = options.rootDirection?.clone().normalize() ?? Vector3.new(0, 1, 0);
		const rootUp = options.rootUp?.clone().normalize() ?? rootDirection.clone().orthogonal();
		const rootRotation = Quaternion.fromForwardUp(rootDirection, rootUp);

		const segments = options.segments.map(segment => ({
			length: segment.length,
			constraint: segment.constraint,
			direction: rootDirection.clone(),
			rotation: rootRotation.clone(),
		}));

		const jointPositions = [rootPosition.clone()];
		let cursor = rootPosition.clone();
		for (const segment of segments) {
			cursor.add(segment.direction.clone().multiply(segment.length));
			jointPositions.push(cursor.clone());
		}

		return new IKChain3D(rootPosition, rootRotation, segments, jointPositions);
	}

	get totalLength() {
		return sumArray(this.segments.map(segment => segment.length));
	}

	clone() {
		const jointPositions = this.jointPositions.map(position => position.clone());
		const segments = this.segments.map(segment => ({
			length: segment.length,
			constraint: segment.constraint,
			direction: segment.direction.clone(),
			rotation: segment.rotation.clone(),
		}));

		return new IKChain3D(this.rootPosition.clone(), this.rootRotation.clone(), segments, jointPositions);
	}

	lerp(other: IKChain3D, amount: number) {
		if (this.segments.length !== other.segments.length) {
			throw new Error("IKChain3D.lerp requires chains with the same number of segments.");
		}

		const t = coerceBetween(amount, 0, 1);
		this.jointPositions[0]!.copy(this.rootPosition);

		for (let index = 0; index < this.segments.length; index++) {
			const segment = this.segments[index]!;
			const otherSegment = other.segments[index]!;

			if (Math.abs(segment.length - otherSegment.length) > 0.000001) {
				throw new Error("IKChain3D.lerp requires chains with matching segment lengths.");
			}

			segment.rotation.slerp(otherSegment.rotation, t);
			const direction = segment.rotation.rotateVector(Vector3.new(0, 1, 0)).normalize() ?? otherSegment.direction.clone();
			segment.direction.copy(direction);

			const joint = this.jointPositions[index]!;
			this.jointPositions[index + 1]!.copy(
				joint.clone().add(direction.clone().multiply(segment.length)),
			);
		}

		return this;
	}
}