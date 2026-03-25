import { Rect } from "./Rect.js";
import { Vector3 } from "./Vector3.js";


export class Matrix4 {
	/**
	 * M[Column][Row]
	 * Compatible with DOMMatrix:
	 * https://developer.mozilla.org/en-US/docs/Web/API/DOMMatrix
	 */
	get m11() { return this.elements[cr(0, 0)]!; }
	get m21() { return this.elements[cr(1, 0)]!; }
	get m31() { return this.elements[cr(2, 0)]!; }
	get m41() { return this.elements[cr(3, 0)]!; }
	get m12() { return this.elements[cr(0, 1)]!; }
	get m22() { return this.elements[cr(1, 1)]!; }
	get m32() { return this.elements[cr(2, 1)]!; }
	get m42() { return this.elements[cr(3, 1)]!; }
	get m13() { return this.elements[cr(0, 2)]!; }
	get m23() { return this.elements[cr(1, 2)]!; }
	get m33() { return this.elements[cr(2, 2)]!; }
	get m43() { return this.elements[cr(3, 2)]!; }
	get m14() { return this.elements[cr(0, 3)]!; }
	get m24() { return this.elements[cr(1, 3)]!; }
	get m34() { return this.elements[cr(2, 3)]!; }
	get m44() { return this.elements[cr(3, 3)]!; }

	private constructor(readonly elements: number[]) {}

	toFloat32Array() {
		return new Float32Array(this.elements);
	}

	clone() {
		return new Matrix4([...this.elements]);
	}

	copy(other: Matrix4) {
		for (let index = 0; index < this.elements.length; index++) {
			this.elements[index] = other.elements[index]!;
		}
		return this;
	}

	set(
		c0r0: number, c1r0: number, c2r0: number, c3r0: number,
		c0r1: number, c1r1: number, c2r1: number, c3r1: number,
		c0r2: number, c1r2: number, c2r2: number, c3r2: number,
		c0r3: number, c1r3: number, c2r3: number, c3r3: number,
	) {
		const m = this.elements;
		m[cr(0, 0)] = c0r0; m[cr(1, 0)] = c1r0; m[cr(2, 0)] = c2r0; m[cr(3, 0)] = c3r0;
		m[cr(0, 1)] = c0r1; m[cr(1, 1)] = c1r1; m[cr(2, 1)] = c2r1; m[cr(3, 1)] = c3r1;
		m[cr(0, 2)] = c0r2; m[cr(1, 2)] = c1r2; m[cr(2, 2)] = c2r2; m[cr(3, 2)] = c3r2;
		m[cr(0, 3)] = c0r3; m[cr(1, 3)] = c1r3; m[cr(2, 3)] = c2r3; m[cr(3, 3)] = c3r3;
		return this;
	}

	isEqual(other: Matrix4) {
		for (let index = 0; index < this.elements.length; index++) {
			if (this.elements[index]! !== other.elements[index]!) return false;
		}

		return true;
	}

	isApproximatelyEqual(other: Matrix4, epsilon: number = 0.0001) {
		for (let index = 0; index < this.elements.length; index++) {
			if (Math.abs(this.elements[index]! - other.elements[index]!) >= epsilon) return false;
		}

		return true;
	}

	invert() {
		const m = this.elements;
		const a00 = m[cr(0, 0)]!, a01 = m[cr(0, 1)]!, a02 = m[cr(0, 2)]!, a03 = m[cr(0, 3)]!;
		const a10 = m[cr(1, 0)]!, a11 = m[cr(1, 1)]!, a12 = m[cr(1, 2)]!, a13 = m[cr(1, 3)]!;
		const a20 = m[cr(2, 0)]!, a21 = m[cr(2, 1)]!, a22 = m[cr(2, 2)]!, a23 = m[cr(2, 3)]!;
		const a30 = m[cr(3, 0)]!, a31 = m[cr(3, 1)]!, a32 = m[cr(3, 2)]!, a33 = m[cr(3, 3)]!;

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
		const m = this.elements;
		m[cr(3, 0)]! += m[cr(0, 0)]! * translation.x + m[cr(1, 0)]! * translation.y + m[cr(2, 0)]! * translation.z;
		m[cr(3, 1)]! += m[cr(0, 1)]! * translation.x + m[cr(1, 1)]! * translation.y + m[cr(2, 1)]! * translation.z;
		m[cr(3, 2)]! += m[cr(0, 2)]! * translation.x + m[cr(1, 2)]! * translation.y + m[cr(2, 2)]! * translation.z;
		m[cr(3, 3)]! += m[cr(0, 3)]! * translation.x + m[cr(1, 3)]! * translation.y + m[cr(2, 3)]! * translation.z;
		return this;
	}

	scale(scale: Vector3) {
		const m = this.elements;
		for (let row = 0; row < 4; row++) {
			m[cr(0, row)]! *= scale.x;
			m[cr(1, row)]! *= scale.y;
			m[cr(2, row)]! *= scale.z;
		}
		return this;
	}

	private rotateFromAxisIndex(radians: number, axisIndex1: number, axisIndex2: number) {
		const sin = Math.sin(radians);
		const cos = Math.cos(radians);
		const m = this.elements;

		for (let row = 0; row < 4; row++) {
			const value1 = m[cr(axisIndex1, row)]!;
			const value2 = m[cr(axisIndex2, row)]!;
			m[cr(axisIndex1, row)] = value1 * cos + value2 * sin;
			m[cr(axisIndex2, row)] = value2 * cos - value1 * sin;
		}

		return this;
	}

	rotateX(radians: number) {
		return this.rotateFromAxisIndex(radians, Vector3.Y_INDEX, Vector3.Z_INDEX);
	}

	rotateY(radians: number) {
		return this.rotateFromAxisIndex(radians, Vector3.X_INDEX, Vector3.Z_INDEX);
	}

	rotateZ(radians: number) {
		return this.rotateFromAxisIndex(radians, Vector3.X_INDEX, Vector3.Y_INDEX);
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

	static fromValues(
		c0r0: number, c1r0: number, c2r0: number, c3r0: number,
		c0r1: number, c1r1: number, c2r1: number, c3r1: number,
		c0r2: number, c1r2: number, c2r2: number, c3r2: number,
		c0r3: number, c1r3: number, c2r3: number, c3r3: number,
	) {
		return new Matrix4(new Array(16)).set(
			c0r0, c1r0, c2r0, c3r0,
			c0r1, c1r1, c2r1, c3r1,
			c0r2, c1r2, c2r2, c3r2,
			c0r3, c1r3, c2r3, c3r3,
		);
	}

	static identity() {
		return Matrix4.fromValues(
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

		return Matrix4.fromValues(
			-2 * lr, 0, 0, (left + right) * lr,
			0, -2 * bt, 0, (top + bottom) * bt,
			0, 0, 2 * nf, (far + near) * nf,
			0, 0, 0, 1
		);
	}

	static perspective({ fovy, aspectRatio, near, far }: { fovy: number, aspectRatio: number, near: number, far: number }) {
		const f = 1 / Math.tan(fovy / 2);
		const nf = 1 / (near - far);

		return Matrix4.fromValues(
			f / aspectRatio, 0, 0, 0,
			0, f, 0, 0,
			0, 0, (far + near) * nf, (2 * far * near) * nf,
			0, 0, -1, 0,
		);
	}

	static lookAt({ eye, target, up }: { eye: Vector3, target: Vector3, up: Vector3 }) {
		const forward = target.clone().subtract(eye).normalize();
		if (!forward) throw new Error("Cannot create lookAt matrix when eye and target are identical.");

		const side = forward.clone().cross(up).normalize();
		if (!side) throw new Error("Cannot create lookAt matrix with a degenerate up vector.");

		const cameraUp = side.clone().cross(forward);

		return Matrix4.fromValues(
			side.x, side.y, side.z, -side.dot(eye),
			cameraUp.x, cameraUp.y, cameraUp.z, -cameraUp.dot(eye),
			-forward.x, -forward.y, -forward.z, forward.dot(eye),
			0, 0, 0, 1,
		);
	}

	static translation({x,y,z}: Vector3) {
		return Matrix4.fromValues(
			1, 0, 0, x,
			0, 1, 0, y,
			0, 0, 1, z,
			0, 0, 0, 1
		);
	}

	static scale({x,y,z}: Vector3) {
		return Matrix4.fromValues(
			x, 0, 0, 0,
			0, y, 0, 0,
			0, 0, z, 0,
			0, 0, 0, 1
		);
	}

	static rotationFromAxisIndex(radians: number, axisIndex1: number, axisIndex2: number) {
		const matrix = Matrix4.identity();
		const cos = Math.cos(radians);
		const sin = Math.sin(radians);

		matrix.elements[cr(axisIndex1, axisIndex1)] = cos;
		matrix.elements[cr(axisIndex2, axisIndex1)] = -sin;
		matrix.elements[cr(axisIndex1, axisIndex2)] = sin;
		matrix.elements[cr(axisIndex2, axisIndex2)] = cos;

		return matrix;
	}


	static rotationX(radians: number) {
		return Matrix4.rotationFromAxisIndex(radians, Vector3.Y_INDEX, Vector3.Z_INDEX);
	}

	static rotationY(radians: number) {
		return Matrix4.rotationFromAxisIndex(radians, Vector3.X_INDEX, Vector3.Z_INDEX);
	}

	static rotationZ(radians: number) {
		return Matrix4.rotationFromAxisIndex(radians, Vector3.X_INDEX, Vector3.Y_INDEX);
	}
}

function cr(col: number, row: number) {
	return (col * 4) + row;
}
