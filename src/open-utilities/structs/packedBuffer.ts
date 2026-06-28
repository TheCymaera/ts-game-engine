import { assertNever } from "@open-utilities/types/assertNever.js";
import { Matrix4 } from "../maths/Matrix4.js";
import { Quaternion } from "../maths/Quaternion.js";
import { Vector2 } from "../maths/Vector2.js";
import { Vector3 } from "../maths/Vector3.js";
import { Float32, Int8, Int16, Int32, Struct, StructArray, type StructField, Uint8, Uint16, Uint32 } from "./Struct.js";
import { Color } from "../rendering/Color.js";

const LITTLE_ENDIAN = true;

type Layout = {
	size: number;
	write: (view: DataView, offset: number) => void;
};

export function createPackedBuffer(field: StructField): ArrayBuffer {
	const layout = layoutOf(field);
	const buffer = new ArrayBuffer(layout.size);
	const view = new DataView(buffer);
	layout.write(view, 0);
	return buffer;
}

function layoutOf(field: StructField): Layout {
	if (field instanceof Int8) return {
		size: 1,
		write: (view, offset) => view.setInt8(offset, field.value),
	};
	if (field instanceof Uint8) return {
		size: 1,
		write: (view, offset) => view.setUint8(offset, field.value),
	};
	if (field instanceof Int16) return {
		size: 2,
		write: (view, offset) => view.setInt16(offset, field.value, LITTLE_ENDIAN),
	};
	if (field instanceof Uint16) return {
		size: 2,
		write: (view, offset) => view.setUint16(offset, field.value, LITTLE_ENDIAN),
	};
	if (field instanceof Int32) return {
		size: 4,
		write: (view, offset) => view.setInt32(offset, field.value, LITTLE_ENDIAN),
	};
	if (field instanceof Uint32) return {
		size: 4,
		write: (view, offset) => view.setUint32(offset, field.value, LITTLE_ENDIAN),
	};
	if (field instanceof Float32) return {
		size: 4,
		write: (view, offset) => view.setFloat32(offset, field.value, LITTLE_ENDIAN),
	};
	if (field instanceof Vector2) return {
		size: 8,
		write: (view, offset) => {
			view.setFloat32(offset, field.x, LITTLE_ENDIAN);
			view.setFloat32(offset + 4, field.y, LITTLE_ENDIAN);
		},
	};
	if (field instanceof Vector3) return {
		size: 12,
		write: (view, offset) => {
			view.setFloat32(offset, field.x, LITTLE_ENDIAN);
			view.setFloat32(offset + 4, field.y, LITTLE_ENDIAN);
			view.setFloat32(offset + 8, field.z, LITTLE_ENDIAN);
		},
	};
	if (field instanceof Quaternion) return {
		size: 16,
		write: (view, offset) => {
			view.setFloat32(offset, field.x, LITTLE_ENDIAN);
			view.setFloat32(offset + 4, field.y, LITTLE_ENDIAN);
			view.setFloat32(offset + 8, field.z, LITTLE_ENDIAN);
			view.setFloat32(offset + 12, field.w, LITTLE_ENDIAN);
		},
	};
	if (field instanceof Color) return {
		size: 16,
		write: (view, offset) => {
			view.setFloat32(offset, field.r / 255, LITTLE_ENDIAN);
			view.setFloat32(offset + 4, field.g / 255, LITTLE_ENDIAN);
			view.setFloat32(offset + 8, field.b / 255, LITTLE_ENDIAN);
			view.setFloat32(offset + 12, field.a / 255, LITTLE_ENDIAN);
		},
	};
	if (field instanceof Matrix4) return {
		size: 64,
		write: (view, offset) => {
			for (let i = 0; i < 16; i++) {
				view.setFloat32(offset + i * 4, field.elements[i]!, LITTLE_ENDIAN);
			}
		},
	};
	if (field instanceof StructArray) {
		if (field.length === 0) {
			throw new Error("Cannot create a packed buffer from an empty array.");
		}
		const elementLayout = layoutOf(field[0]!);
		const stride = elementLayout.size;
		return {
			size: stride * field.length,
			write: (view, offset) => {
				for (let i = 0; i < field.length; i++) {
					layoutOf(field[i]!).write(view, offset + i * stride);
				}
			},
		};
	}
	if (field instanceof Struct) {
		const members = Object.values(field);
		let cursor = 0;
		const writers: Array<{ offset: number; write: Layout["write"] }> = [];
		for (const member of members) {
			const memberLayout = layoutOf(member);
			writers.push({ offset: cursor, write: memberLayout.write });
			cursor += memberLayout.size;
		}
		return {
			size: cursor,
			write: (view, base) => {
				for (const w of writers) w.write(view, base + w.offset);
			},
		};
	}
	console.error(field);
	assertNever(field);
}
