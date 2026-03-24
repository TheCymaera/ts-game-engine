import { almostEqual } from "./almostEqual.js";
import { lerp } from "./lerp.js";
import { Matrix4 } from "./Matrix4.js";
import { Vector3 } from "./Vector3.js";

export class Vector2 {
	x: number;
	y: number;
	private constructor(x: number, y: number) {
		this.x = x;
		this.y = y;
	}

	set(x: number, y: number) {
		this.x = x;
		this.y = y;
		return this;
	}

	equals(other: Vector2) {
		return this.x === other.x && this.y === other.y;
	}

	nearlyEquals(other: Vector2, epsilon = 1e-6) {
		return almostEqual(this.x, other.x, epsilon) && almostEqual(this.y, other.y, epsilon);
	}

	clone() {
		return Vector2.new(this.x, this.y);
	}

	cross(other: Vector2) {
		return this.x * other.y - this.y * other.x;
	}

	length() {
		return Math.sqrt(this.x * this.x + this.y * this.y);
	}

	lengthSquared() {
		return this.x * this.x + this.y * this.y;
	}

	isZero() {
		return this.x === 0 && this.y === 0;
	}

	isNearlyZero(epsilon = 1e-6) {
		return almostEqual(this.x, 0, epsilon) && almostEqual(this.y, 0, epsilon);
	}

	transformMatrix4(transform: Matrix4) {
		const vec3 = Vector3.new(this.x, this.y, 0).transformMatrix4(transform);
		this.x = vec3.x;
		this.y = vec3.y;
		return this;
	}

	distance(other: Vector2) {
		const dx = this.x - other.x;
		const dy = this.y - other.y;
		return Math.sqrt(dx * dx + dy * dy);
	}

	distanceSquared(other: Vector2) {
		const dx = this.x - other.x;
		const dy = this.y - other.y;
		return dx * dx + dy * dy;
	}

	angleTo(other: Vector2) {
		const dx = other.x - this.x;
		const dy = other.y - this.y;
		return Math.atan2(dy, dx);
	}

	dot(other: Vector2) {
		return this.x * other.x + this.y * other.y;
	}

	normalize() {
		const length = this.length();
		if (length == 0) return undefined;
		this.x /= length;
		this.y /= length;
		return this;
	}

	copy(other: Vector2) {
		this.x = other.x;
		this.y = other.y;
		return this;
	}

	add(other: Vector2) {
		this.x += other.x;
		this.y += other.y;
		return this;
	}

	subtract(other: Vector2) {
		this.x -= other.x;
		this.y -= other.y;
		return this;
	}

	multiply(scale: number) {
		this.x *= scale;
		this.y *= scale;
		return this;
	}

	multiplyVector(other: Vector2) {
		this.x *= other.x;
		this.y *= other.y;
		return this;
	}

	divide(scale: number) {
		this.x /= scale;
		this.y /= scale;
		return this;
	}

	abs() {
		this.x = Math.abs(this.x);
		this.y = Math.abs(this.y);
		return this;
	}

	rotate(angle: number) {
		const cosAngle = Math.cos(angle);
		const sinAngle = Math.sin(angle);
		const x = this.x;
		const y = this.y;
		this.x = x * cosAngle - y * sinAngle;
		this.y = x * sinAngle + y * cosAngle;
		return this;
	}

	lerp(target: Vector2, fraction: number) {
		this.x = lerp(this.x, target.x, fraction);
		this.y = lerp(this.y, target.y, fraction);
		return this;
	}

	moveTowards(target: Vector2, maxDistanceDelta: number) {
		const x = target.x - this.x;
		const y = target.y - this.y;
		const distance = (x * x + y * y) ** .5;
		if (distance <= maxDistanceDelta) {
			this.x = target.x;
			this.y = target.y;
			return this;
		}
		this.x += x / distance * maxDistanceDelta;
		this.y += y / distance * maxDistanceDelta;
		return this;
	}

	perpendicular() {
		const x = this.x;
		this.x = -this.y;
		this.y = x;
		return this;
	}

	to3d(z: number) {
		return Vector3.new(this.x, this.y, z);
	}

	toString() {
		return `Vector2.new(${this.x.toFixed(3)}, ${this.y.toFixed(3)})`;
	}

	static fromRotation(angle: number, length = 1) {
		return Vector2.new(Math.cos(angle) * length, Math.sin(angle) * length);
	}

	static new(x: number, y: number) {
		return new Vector2(x, y);
	}

	static zero() {
		return Vector2.new(0, 0);
	}
}