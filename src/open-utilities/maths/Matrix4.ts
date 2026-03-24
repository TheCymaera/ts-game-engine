import { Rect } from "./Rect.js";
import { Vector3 } from "./Vector3.js";


export class Matrix4 {
	/**
	 * M[Column][Row]
	 * Compatible with DOMMatrix:
	 * https://developer.mozilla.org/en-US/docs/Web/API/DOMMatrix
	 */
	private constructor(
		public m11: number, public m21: number, public m31: number, public m41: number,
		public m12: number, public m22: number, public m32: number, public m42: number,
		public m13: number, public m23: number, public m33: number, public m43: number,
		public m14: number, public m24: number, public m34: number, public m44: number,
	) { }

	toFloat32Array() {
		return new Float32Array([
			this.m11, this.m12, this.m13, this.m14,
			this.m21, this.m22, this.m23, this.m24,
			this.m31, this.m32, this.m33, this.m34,
			this.m41, this.m42, this.m43, this.m44,
		]);
	}

	clone() {
		return new Matrix4(
			this.m11, this.m21, this.m31, this.m41,
			this.m12, this.m22, this.m32, this.m42,
			this.m13, this.m23, this.m33, this.m43,
			this.m14, this.m24, this.m34, this.m44,
		);
	}

	copy(other: Matrix4) {
		return this.set(
			other.m11, other.m21, other.m31, other.m41,
			other.m12, other.m22, other.m32, other.m42,
			other.m13, other.m23, other.m33, other.m43,
			other.m14, other.m24, other.m34, other.m44,
		);
	}

	set(
		m11: number, m21: number, m31: number, m41: number,
		m12: number, m22: number, m32: number, m42: number,
		m13: number, m23: number, m33: number, m43: number,
		m14: number, m24: number, m34: number, m44: number,
	) {
		this.m11 = m11; this.m21 = m21; this.m31 = m31; this.m41 = m41;
		this.m12 = m12; this.m22 = m22; this.m32 = m32; this.m42 = m42;
		this.m13 = m13; this.m23 = m23; this.m33 = m33; this.m43 = m43;
		this.m14 = m14; this.m24 = m24; this.m34 = m34; this.m44 = m44;
		return this;
	}

	isEqual(other: Matrix4) {
		return (
			this.m11 === other.m11 && this.m21 === other.m21 && this.m31 === other.m31 && this.m41 === other.m41 &&
			this.m12 === other.m12 && this.m22 === other.m22 && this.m32 === other.m32 && this.m42 === other.m42 &&
			this.m13 === other.m13 && this.m23 === other.m23 && this.m33 === other.m33 && this.m43 === other.m43 &&
			this.m14 === other.m14 && this.m24 === other.m24 && this.m34 === other.m34 && this.m44 === other.m44
		);
	}

	isApproximatelyEqual(other: Matrix4, epsilon: number = 0.0001) {
		return (
			Math.abs(this.m11 - other.m11) < epsilon && Math.abs(this.m21 - other.m21) < epsilon &&
			Math.abs(this.m31 - other.m31) < epsilon && Math.abs(this.m41 - other.m41) < epsilon &&
			Math.abs(this.m12 - other.m12) < epsilon && Math.abs(this.m22 - other.m22) < epsilon &&
			Math.abs(this.m32 - other.m32) < epsilon && Math.abs(this.m42 - other.m42) < epsilon &&
			Math.abs(this.m13 - other.m13) < epsilon && Math.abs(this.m23 - other.m23) < epsilon &&
			Math.abs(this.m33 - other.m33) < epsilon && Math.abs(this.m43 - other.m43) < epsilon &&
			Math.abs(this.m14 - other.m14) < epsilon && Math.abs(this.m24 - other.m24) < epsilon &&
			Math.abs(this.m34 - other.m34) < epsilon && Math.abs(this.m44 - other.m44) < epsilon
		);
	}

	invert() {
		const a00 = this.m11, a01 = this.m12, a02 = this.m13, a03 = this.m14;
		const a10 = this.m21, a11 = this.m22, a12 = this.m23, a13 = this.m24;
		const a20 = this.m31, a21 = this.m32, a22 = this.m33, a23 = this.m34;
		const a30 = this.m41, a31 = this.m42, a32 = this.m43, a33 = this.m44;

		const b00 = a00 * a11 - a01 * a10;
		const b01 = a00 * a12 - a02 * a10;
		const b02 = a00 * a13 - a03 * a10;
		const b03 = a01 * a12 - a02 * a11;
		const b04 = a01 * a13 - a03 * a11;
		const b05 = a02 * a13 - a03 * a12;
		const b06 = a20 * a31 - a21 * a30;
		const b07 = a20 * a32 - a22 * a30;
		const b08 = a20 * a33 - a23 * a30;
		const b09 = a21 * a32 - a22 * a31;
		const b10 = a21 * a33 - a23 * a31;
		const b11 = a22 * a33 - a23 * a32;

		let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
		if (!det) return undefined;
		det = 1.0 / det;

		return this.set(
			(a11 * b11 - a12 * b10 + a13 * b09) * det,
			(a12 * b08 - a10 * b11 - a13 * b07) * det,
			(a10 * b10 - a11 * b08 + a13 * b06) * det,
			(a11 * b07 - a10 * b09 - a12 * b06) * det,

			(a02 * b10 - a01 * b11 - a03 * b09) * det,
			(a00 * b11 - a02 * b08 + a03 * b07) * det,
			(a01 * b08 - a00 * b10 - a03 * b06) * det,
			(a00 * b09 - a01 * b07 + a02 * b06) * det,

			(a31 * b05 - a32 * b04 + a33 * b03) * det,
			(a32 * b02 - a30 * b05 - a33 * b01) * det,
			(a30 * b04 - a31 * b02 + a33 * b00) * det,
			(a31 * b01 - a30 * b03 - a32 * b00) * det,

			(a22 * b04 - a21 * b05 - a23 * b03) * det,
			(a20 * b05 - a22 * b02 + a23 * b01) * det,
			(a21 * b02 - a20 * b04 - a23 * b00) * det,
			(a20 * b03 - a21 * b01 + a22 * b00) * det
		);
	}

	multiply(other: Matrix4) {
		return this.multiplyFrom(this, other);
	}

	multiplyFrom(a: Matrix4, b: Matrix4) {
		return this.set(
			(a.m11 * b.m11) + (a.m21 * b.m12) + (a.m31 * b.m13) + (a.m41 * b.m14),
			(a.m11 * b.m21) + (a.m21 * b.m22) + (a.m31 * b.m23) + (a.m41 * b.m24),
			(a.m11 * b.m31) + (a.m21 * b.m32) + (a.m31 * b.m33) + (a.m41 * b.m34),
			(a.m11 * b.m41) + (a.m21 * b.m42) + (a.m31 * b.m43) + (a.m41 * b.m44),

			(a.m12 * b.m11) + (a.m22 * b.m12) + (a.m32 * b.m13) + (a.m42 * b.m14),
			(a.m12 * b.m21) + (a.m22 * b.m22) + (a.m32 * b.m23) + (a.m42 * b.m24),
			(a.m12 * b.m31) + (a.m22 * b.m32) + (a.m32 * b.m33) + (a.m42 * b.m34),
			(a.m12 * b.m41) + (a.m22 * b.m42) + (a.m32 * b.m43) + (a.m42 * b.m44),

			(a.m13 * b.m11) + (a.m23 * b.m12) + (a.m33 * b.m13) + (a.m43 * b.m14),
			(a.m13 * b.m21) + (a.m23 * b.m22) + (a.m33 * b.m23) + (a.m43 * b.m24),
			(a.m13 * b.m31) + (a.m23 * b.m32) + (a.m33 * b.m33) + (a.m43 * b.m34),
			(a.m13 * b.m41) + (a.m23 * b.m42) + (a.m33 * b.m43) + (a.m43 * b.m44),

			(a.m14 * b.m11) + (a.m24 * b.m12) + (a.m34 * b.m13) + (a.m44 * b.m14),
			(a.m14 * b.m21) + (a.m24 * b.m22) + (a.m34 * b.m23) + (a.m44 * b.m24),
			(a.m14 * b.m31) + (a.m24 * b.m32) + (a.m34 * b.m33) + (a.m44 * b.m34),
			(a.m14 * b.m41) + (a.m24 * b.m42) + (a.m34 * b.m43) + (a.m44 * b.m44),
		);
	}

	translate(translation: Vector3) {
		this.m41 += this.m11 * translation.x + this.m21 * translation.y + this.m31 * translation.z;
		this.m42 += this.m12 * translation.x + this.m22 * translation.y + this.m32 * translation.z;
		this.m43 += this.m13 * translation.x + this.m23 * translation.y + this.m33 * translation.z;
		this.m44 += this.m14 * translation.x + this.m24 * translation.y + this.m34 * translation.z;
		return this;
	}

	scale(scale: Vector3) {
		this.m11 *= scale.x;
		this.m21 *= scale.y;
		this.m31 *= scale.z;
		this.m12 *= scale.x;
		this.m22 *= scale.y;
		this.m32 *= scale.z;
		this.m13 *= scale.x;
		this.m23 *= scale.y;
		this.m33 *= scale.z;
		this.m14 *= scale.x;
		this.m24 *= scale.y;
		this.m34 *= scale.z;
		return this;
	}

	rotateX(radians: number) {
		const s = Math.sin(radians);
		const c = Math.cos(radians);
		const a10 = this.m21;
		const a11 = this.m22;
		const a12 = this.m23;
		const a13 = this.m24;
		const a20 = this.m31;
		const a21 = this.m32;
		const a22 = this.m33;
		const a23 = this.m34;

		// Perform axis-specific matrix multiplication
		this.m21 = a10 * c + a20 * s;
		this.m22 = a11 * c + a21 * s;
		this.m23 = a12 * c + a22 * s;
		this.m24 = a13 * c + a23 * s;
		this.m31 = a20 * c - a10 * s;
		this.m32 = a21 * c - a11 * s;
		this.m33 = a22 * c - a12 * s;
		this.m34 = a23 * c - a13 * s;
		return this;
	}

	rotateY(radians: number) {
		const s = Math.sin(radians);
		const c = Math.cos(radians);
		const a00 = this.m11;
		const a01 = this.m12;
		const a02 = this.m13;
		const a03 = this.m14;
		const a20 = this.m31;
		const a21 = this.m32;
		const a22 = this.m33;
		const a23 = this.m34;

		// Perform axis-specific matrix multiplication
		this.m11 = a00 * c - a20 * s;
		this.m12 = a01 * c - a21 * s;
		this.m13 = a02 * c - a22 * s;
		this.m14 = a03 * c - a23 * s;
		this.m31 = a00 * s + a20 * c;
		this.m32 = a01 * s + a21 * c;
		this.m33 = a02 * s + a22 * c;
		this.m34 = a03 * s + a23 * c;
		return this;
	}

	rotateZ(radians: number) {
		const s = Math.sin(radians);
		const c = Math.cos(radians);
		const a00 = this.m11;
		const a01 = this.m12;
		const a02 = this.m13;
		const a03 = this.m14;
		const a10 = this.m21;
		const a11 = this.m22;
		const a12 = this.m23;
		const a13 = this.m24;

		// Perform axis-specific matrix multiplication
		this.m11 = a00 * c + a10 * s;
		this.m12 = a01 * c + a11 * s;
		this.m13 = a02 * c + a12 * s;
		this.m14 = a03 * c + a13 * s;
		this.m21 = a10 * c - a00 * s;
		this.m22 = a11 * c - a01 * s;
		this.m23 = a12 * c - a02 * s;
		this.m24 = a13 * c - a03 * s;
		return this;
	}

	getTranslation(): Vector3 {
		return Vector3.new(this.m41, this.m42, this.m43);
	}

	getScale(): Vector3 {
		return Vector3.new(
			Math.hypot(this.m11, this.m12, this.m13),
			Math.hypot(this.m21, this.m22, this.m23),
			Math.hypot(this.m31, this.m32, this.m33)
		);
	}

	getOrthoRect(): Rect {
		const scale = this.getScale();
		const translation = this.getTranslation();

		return Rect.fromCorners(
			-(1 + translation.x) / scale.x,
			-(1 + translation.y) / scale.y,
			(1 - translation.x) / scale.x,
			(1 - translation.y) / scale.y,
		);
	}

	static identity() {
		return new Matrix4(
			1, 0, 0, 0,
			0, 1, 0, 0,
			0, 0, 1, 0,
			0, 0, 0, 1,
		);
	}

	static ortho(rect: Rect, near: number = -1, far: number = 1) {
		const left = rect.minX;
		const right = rect.maxX;
		const bottom = rect.minY;
		const top = rect.maxY;
		
		const lr = 1 / (left - right);
		const bt = 1 / (bottom - top);
		const nf = 1 / (near - far);

		return new Matrix4(
			-2 * lr, 0, 0, (left + right) * lr,
			0, -2 * bt, 0, (top + bottom) * bt,
			0, 0, 2 * nf, (far + near) * nf,
			0, 0, 0, 1
		);
	}

	static perspective({ fovy, aspectRatio, near, far }: { fovy: number, aspectRatio: number, near: number, far: number }) {
		const f = 1 / Math.tan(fovy / 2);
		const nf = 1 / (near - far);

		return new Matrix4(
			f / aspectRatio, 0, 0, 0,
			0, f, 0, 0,
			0, 0, (far + near) * nf, (2 * far * near) * nf,
			0, 0, -1, 0,
		);
	}

	static lookAt({ eye, target, up }: { eye: Vector3, target: Vector3, up: Vector3 }) {
		const forward = target.clone().subtract(eye).normalize();
		if (!forward) throw new Error("Cannot create lookAt matrix when eye and target are identical.");

		const side = cross(forward, up).normalize();
		if (!side) throw new Error("Cannot create lookAt matrix with a degenerate up vector.");

		const cameraUp = cross(side, forward);

		return new Matrix4(
			side.x, side.y, side.z, -dot(side, eye),
			cameraUp.x, cameraUp.y, cameraUp.z, -dot(cameraUp, eye),
			-forward.x, -forward.y, -forward.z, dot(forward, eye),
			0, 0, 0, 1,
		);
	}

	static translation({x,y,z}: Vector3) {
		return new Matrix4(
			1, 0, 0, x,
			0, 1, 0, y,
			0, 0, 1, z,
			0, 0, 0, 1
		);
	}

	static scale({x,y,z}: Vector3) {
		return new Matrix4(
			x, 0, 0, 0,
			0, y, 0, 0,
			0, 0, z, 0,
			0, 0, 0, 1
		);
	}

	static rotationX(radians: number) {
		const c = Math.cos(radians), s = Math.sin(radians);

		return new Matrix4(
			1, 0, 0, 0,
			0, c, -s, 0,
			0, s, c, 0,
			0, 0, 0, 1
		);
	}

	static rotationY(radians: number) {
		const c = Math.cos(radians), s = Math.sin(radians);

		return new Matrix4(
			c, 0, s, 0,
			0, 1, 0, 0,
			-s, 0, c, 0,
			0, 0, 0, 1
		);
	}

	static rotationZ(radians: number) {
		const c = Math.cos(radians), s = Math.sin(radians);

		return new Matrix4(
			c, -s, 0, 0,
			s, c, 0, 0,
			0, 0, 1, 0,
			0, 0, 0, 1
		);
	}
}

function dot(a: Vector3, b: Vector3) {
	return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vector3, b: Vector3) {
	return Vector3.new(
		a.y * b.z - a.z * b.y,
		a.z * b.x - a.x * b.z,
		a.x * b.y - a.y * b.x,
	);
}

