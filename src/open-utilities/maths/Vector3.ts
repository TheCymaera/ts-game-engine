import { lerp } from "./lerp.js";
import { Matrix4 } from "./Matrix4.js";
import { Quaternion } from "./Quaternion.js";
import { Vector2 } from "./Vector2.js";

export class Vector3 {
	x: number;
	y: number;
	z: number;
	private constructor(x: number, y: number, z: number) {
		this.x = x;
		this.y = y;
		this.z = z;
	}

	clone() {
		return Vector3.new(this.x, this.y, this.z);
	}

	lengthSquared() {
		return this.x * this.x + this.y * this.y + this.z * this.z;
	}

	length() {
		return Math.sqrt(this.lengthSquared());
	}

	set(x: number, y: number, z: number) {
		this.x = x;
		this.y = y;
		this.z = z;
		return this;
	}

	copy(other: Vector3) {
		this.x = other.x;
		this.y = other.y;
		this.z = other.z;
		return this;
	}

	rotate(quaternion: Quaternion) {
		const q = Vector3.new(quaternion.x, quaternion.y, quaternion.z);
		const uv = q.clone().cross(this);
		const uuv = q.clone().cross(uv);
		uv.multiply(2 * quaternion.w);
		uuv.multiply(2);
		return this.add(uv).add(uuv);
	}

	transformMatrix4(transform: Matrix4) {
		const m = transform;
		const x = this.x, y = this.y, z = this.z;
		const w = m.m14 * x + m.m24 * y + m.m34 * z + m.m44;
		return this.set(
			(m.m11 * x + m.m21 * y + m.m31 * z + m.m41) / w,
			(m.m12 * x + m.m22 * y + m.m32 * z + m.m42) / w,
			(m.m13 * x + m.m23 * y + m.m33 * z + m.m43) / w
		);
	}


	add(other: Vector3) {
		this.x += other.x;
		this.y += other.y;
		this.z += other.z;
		return this;
	}

	subtract(other: Vector3) {
		this.x -= other.x;
		this.y -= other.y;
		this.z -= other.z;
		return this;
	}

	multiply(scale: number) {
		this.x *= scale;
		this.y *= scale;
		this.z *= scale;
		return this;
	}

	divide(scale: number) {
		this.x /= scale;
		this.y /= scale;
		this.z /= scale;
		return this;
	}

	rotateX(angle: number) {
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		const y = this.y;
		const z = this.z;
		this.y = y * cos - z * sin;
		this.z = y * sin + z * cos;
		return this;
	}

	rotateY(angle: number) {
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		const x = this.x;
		const z = this.z;
		this.x = z * sin + x * cos;
		this.z = z * cos - x * sin;
		return this;
	}

	rotateZ(angle: number) {
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		const x = this.x;
		const y = this.y;
		this.x = x * cos - y * sin;
		this.y = x * sin + y * cos;
		return this;
	}

	lerp(target: Vector3, fraction: number) {
		this.x = lerp(this.x, target.x, fraction);
		this.y = lerp(this.y, target.y, fraction);
		this.z = lerp(this.z, target.z, fraction);
		return this;
	}

	cross(other: Vector3) {
		return this.set(
			this.y * other.z - this.z * other.y,
			this.z * other.x - this.x * other.z,
			this.x * other.y - this.y * other.x,
		);
	}

	distanceTo(other: Vector3) {
		return Math.sqrt(
			(this.x - other.x) * (this.x - other.x) +
			(this.y - other.y) * (this.y - other.y) +
			(this.z - other.z) * (this.z - other.z)
		);
	}

	rotateAround(axis: Vector3, radians: number) {
		const normalizedAxis = axis.clone().normalize() ?? Vector3.new(0, 1, 0);
		const cosine = Math.cos(radians);
		const sine = Math.sin(radians);
		const aligned = normalizedAxis.dot(this);
		const crossTerm = normalizedAxis.clone().cross(this);

		return this.set(
			this.x * cosine + crossTerm.x * sine + normalizedAxis.x * aligned * (1 - cosine),
			this.y * cosine + crossTerm.y * sine + normalizedAxis.y * aligned * (1 - cosine),
			this.z * cosine + crossTerm.z * sine + normalizedAxis.z * aligned * (1 - cosine),
		);
	}

	normalize() {
		const length = this.length();
		if (length === 0) return undefined;
		this.divide(length);
		return this;
	}

	truncate() {
		return Vector2.new(this.x, this.y);
	}

	dot(other: Vector3) {
		return this.x * other.x + this.y * other.y + this.z * other.z;
	}

	orthogonal() {
		const absX = Math.abs(this.x);
		const absY = Math.abs(this.y);
		const absZ = Math.abs(this.z);

		if (absX < absY && absX < absZ) {
			return this.set(0, -this.z, this.y);
		} else if (absY < absZ) {
			return this.set(-this.z, 0, this.x);
		} else {
			return this.set(-this.y, this.x, 0);
		}
	}

	toString() {
		return `Vec3(${this.x.toFixed(3)}, ${this.y.toFixed(3)}, ${this.z.toFixed(3)})`;
	}

	static new(x: number, y: number, z: number) {
		return new Vector3(x, y, z);
	}

	static splat(value: number) {
		return new Vector3(value, value, value);
	}

	static readonly X_INDEX = 0;
	static readonly Y_INDEX = 1;
	static readonly Z_INDEX = 2;
}