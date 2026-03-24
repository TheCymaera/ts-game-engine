import { coerceBetween } from "./coerceBetween.js";
import { Vector3 } from "./Vector3.js";

const EPSILON = 0.000001;

export class Quaternion {
	x: number;
	y: number;
	z: number;
	w: number;

	private constructor(x: number, y: number, z: number, w: number) {
		this.x = x;
		this.y = y;
		this.z = z;
		this.w = w;
	}

	clone() {
		return Quaternion.new(this.x, this.y, this.z, this.w);
	}

	set(x: number, y: number, z: number, w: number) {
		this.x = x;
		this.y = y;
		this.z = z;
		this.w = w;
		return this;
	}

	copy(other: Quaternion) {
		return this.set(other.x, other.y, other.z, other.w);
	}

	lengthSquared() {
		return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
	}

	length() {
		return Math.sqrt(this.lengthSquared());
	}

	normalize() {
		const length = this.length();
		if (length <= EPSILON) return undefined;
		this.x /= length;
		this.y /= length;
		this.z /= length;
		this.w /= length;
		return this;
	}

	conjugate() {
		this.x = -this.x;
		this.y = -this.y;
		this.z = -this.z;
		return this;
	}

	invert() {
		const lengthSquared = this.lengthSquared();
		if (lengthSquared <= EPSILON) return undefined;
		this.conjugate();
		this.x /= lengthSquared;
		this.y /= lengthSquared;
		this.z /= lengthSquared;
		this.w /= lengthSquared;
		return this;
	}

	multiply(other: Quaternion) {
		const ax = this.x, ay = this.y, az = this.z, aw = this.w;
		const bx = other.x, by = other.y, bz = other.z, bw = other.w;

		return this.set(
			aw * bx + ax * bw + ay * bz - az * by,
			aw * by - ax * bz + ay * bw + az * bx,
			aw * bz + ax * by - ay * bx + az * bw,
			aw * bw - ax * bx - ay * by - az * bz,
		);
	}

	rotateVector(vector: Vector3) {
		return vector.clone().rotate(this);
	}

	slerp(to: Quaternion, t: number) {
		const amount = coerceBetween(t, 0, 1);
		if (amount <= 0) {
			return this;
		}

		const from = this.clone().normalize() ?? Quaternion.identity();
		const target = to.clone().normalize() ?? Quaternion.identity();

		let cosine =
			from.x * target.x +
			from.y * target.y +
			from.z * target.z +
			from.w * target.w;

		if (cosine < 0) {
			cosine = -cosine;
			target.x = -target.x;
			target.y = -target.y;
			target.z = -target.z;
			target.w = -target.w;
		}

		if (cosine >= 1 - EPSILON) {
			return this.set(
				from.x + (target.x - from.x) * amount,
				from.y + (target.y - from.y) * amount,
				from.z + (target.z - from.z) * amount,
				from.w + (target.w - from.w) * amount,
			).normalize() ?? this.copy(target);
		}

		const radians = Math.acos(coerceBetween(cosine, -1, 1));
		const sine = Math.sin(radians);
		const fromWeight = Math.sin((1 - amount) * radians) / sine;
		const toWeight = Math.sin(amount * radians) / sine;

		return this.set(
			from.x * fromWeight + target.x * toWeight,
			from.y * fromWeight + target.y * toWeight,
			from.z * fromWeight + target.z * toWeight,
			from.w * fromWeight + target.w * toWeight,
		).normalize() ?? this.copy(target);
	}

	static identity() {
		return Quaternion.new(0, 0, 0, 1);
	}

	static new(x: number, y: number, z: number, w: number) {
		return new Quaternion(x, y, z, w);
	}

	static fromAxisAngle(axis: Vector3, radians: number) {
		const normalizedAxis = axis.clone().normalize();
		if (!normalizedAxis) return Quaternion.identity();

		const halfAngle = radians * 0.5;
		const sine = Math.sin(halfAngle);
		const cosine = Math.cos(halfAngle);
		return Quaternion.new(
			normalizedAxis.x * sine,
			normalizedAxis.y * sine,
			normalizedAxis.z * sine,
			cosine,
		);
	}

	static fromTo(from: Vector3, to: Vector3, fallbackAxis?: Vector3) {
		const start = from.clone().normalize();
		const end = to.clone().normalize();
		if (!start || !end) return Quaternion.identity();

		const cosine = coerceBetween(start.dot(end), -1, 1);
		if (cosine >= 1 - EPSILON) {
			return Quaternion.identity();
		}

		if (cosine <= -1 + EPSILON) {
			const axis = fallbackAxis?.clone().normalize() ?? orthogonal(start);
			return Quaternion.fromAxisAngle(axis, Math.PI);
		}

		const axis = start.clone().cross(end);
		return Quaternion.new(axis.x, axis.y, axis.z, 1 + cosine).normalize() ?? Quaternion.identity();
	}

	static fromBasis(xAxis: Vector3, yAxis: Vector3, zAxis: Vector3) {
		const m00 = xAxis.x, m01 = yAxis.x, m02 = zAxis.x;
		const m10 = xAxis.y, m11 = yAxis.y, m12 = zAxis.y;
		const m20 = xAxis.z, m21 = yAxis.z, m22 = zAxis.z;

		const trace = m00 + m11 + m22;
		if (trace > 0) {
			const scalar = Math.sqrt(trace + 1) * 2;
			return Quaternion.new(
				(m21 - m12) / scalar,
				(m02 - m20) / scalar,
				(m10 - m01) / scalar,
				0.25 * scalar,
			).normalize() ?? Quaternion.identity();
		}

		if (m00 > m11 && m00 > m22) {
			const scalar = Math.sqrt(1 + m00 - m11 - m22) * 2;
			return Quaternion.new(
				0.25 * scalar,
				(m01 + m10) / scalar,
				(m02 + m20) / scalar,
				(m21 - m12) / scalar,
			).normalize() ?? Quaternion.identity();
		}

		if (m11 > m22) {
			const scalar = Math.sqrt(1 + m11 - m00 - m22) * 2;
			return Quaternion.new(
				(m01 + m10) / scalar,
				0.25 * scalar,
				(m12 + m21) / scalar,
				(m02 - m20) / scalar,
			).normalize() ?? Quaternion.identity();
		}

		const scalar = Math.sqrt(1 + m22 - m00 - m11) * 2;
		return Quaternion.new(
			(m02 + m20) / scalar,
			(m12 + m21) / scalar,
			0.25 * scalar,
			(m10 - m01) / scalar,
		).normalize() ?? Quaternion.identity();
	}

	static fromForwardUp(forward: Vector3, upHint: Vector3) {
		const forwardAxis = forward.clone().normalize() ?? Vector3.new(0, 1, 0);
		let upAxis = rejectFromAxis(upHint, forwardAxis).normalize();
		if (!upAxis) {
			upAxis = orthogonal(forwardAxis);
		}

		const rightAxis = forwardAxis.clone().cross(upAxis).normalize() ?? orthogonal(forwardAxis);
		const correctedUp = rightAxis.clone().cross(forwardAxis).normalize() ?? orthogonal(forwardAxis);
		return Quaternion.fromBasis(rightAxis, forwardAxis, correctedUp);
	}
}

function rejectFromAxis(vector: Vector3, axis: Vector3) {
	return vector.clone().subtract(axis.clone().multiply(vector.dot(axis)));
}

function orthogonal(direction: Vector3) {
	const axis = Math.abs(direction.x) < 0.5 ? Vector3.new(1, 0, 0) : Vector3.new(0, 1, 0);
	return direction.clone().cross(axis).normalize() ?? Vector3.new(0, 0, 1);
}