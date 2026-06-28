import type { Matrix4 } from "@open-utilities/maths/Matrix4";
import type { Quaternion } from "@open-utilities/maths/Quaternion";
import type { Vector2 } from "@open-utilities/maths/Vector2";
import type { Vector3 } from "@open-utilities/maths/Vector3";
import type { Color } from "../rendering/Color";

export class Int8 {
	readonly value: number;

	constructor(value: number) {
		this.value = (value << 24) >> 24;
	}
}

export class Uint8 {
	readonly value: number;

	constructor(value: number) {
		this.value = value & 0xFF;
	}
}

export class Int16 {
	readonly value: number;

	constructor(value: number) {
		this.value = (value << 16) >> 16;
	}
}

export class Uint16 {
	readonly value: number;

	constructor(value: number) {
		this.value = value & 0xFFFF;
	}
}

export class Int32 {
	readonly value: number;

	constructor(value: number) {
		this.value = value | 0;
	}
}

export class Uint32 {
	readonly value: number;

	constructor(value: number) {
		this.value = value >>> 0;
	}
}

export class Float32 {
	readonly value: number;

	constructor(value: number) {
		this.value = value;
	}
}

export const int8 = (value: number) => new Int8(value);
export const uint8 = (value: number) => new Uint8(value);
export const int16 = (value: number) => new Int16(value);
export const uint16 = (value: number) => new Uint16(value);
export const int32 = (value: number) => new Int32(value);
export const uint32 = (value: number) => new Uint32(value);
export const float32 = (value: number) => new Float32(value);

export class Struct {
	[key: string]: StructField;
}

export type StructPrimitives =
	| Int8
	| Uint8
	| Int16
	| Uint16
	| Int32
	| Uint32
	| Float32
	| Vector2
	| Vector3
	| Quaternion
	| Color
	| Matrix4;

export type StructField =
	| StructPrimitives
	| StructArray
	| Struct;

export class StructArray extends Array<StructField> {}

export function struct<T extends Record<string, StructField>>(record: T): Struct & T {
	const s = new Struct();
	for (const [key, value] of Object.entries(record)) {
		s[key] = value;
	}
	return s as Struct & T;
}

export function structArrayOf(...elements: StructField[]): StructArray {
	if (elements.length === 0) {
		throw new Error("Cannot create a struct array with zero elements.");
	}
	const first = elements[0]!;
	for (let i = 1; i < elements.length; i++) {
		const e = elements[i]!;
		if (e.constructor !== first.constructor) {
			throw new Error(
				`Struct array elements must all be the same type. ` +
				`Element 0 is ${first.constructor.name}, element ${i} is ${e.constructor.name}.`
			);
		}
	}
	return new StructArray(...elements);
}