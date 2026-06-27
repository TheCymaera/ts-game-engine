import { assertNever } from "@open-utilities/types/assertNever.js";
import { Matrix4 } from "../maths/Matrix4.js";
import { Quaternion } from "../maths/Quaternion.js";
import { Vector2 } from "../maths/Vector2.js";
import { Vector3 } from "../maths/Vector3.js";
import { Float32, Int32, Struct, StructArray, type StructField } from "./Struct.js";
import { Color } from "./Color.js";

export function createStd140Buffer(field: StructField): ArrayBuffer {
	const layout = layoutOf(field);
	const buffer = new ArrayBuffer(layout.size);
	const view = new DataView(buffer);
	layout.write(view, 0);
	return buffer;
}

const LITTLE_ENDIAN = true;

const roundUp = (n: number, alignment: number) =>
	Math.ceil(n / alignment) * alignment;

type Layout = {
	alignment: number;
	size: number;
	write: (view: DataView, offset: number) => void;
};

function layoutOf(field: StructField): Layout {
	if (field instanceof Float32) return {
		alignment: 4,
		size: 4,
		write: (view, offset) => view.setFloat32(offset, field.value, LITTLE_ENDIAN),
	};
	if (field instanceof Int32) return {
		alignment: 4,
		size: 4,
		write: (view, offset) => view.setInt32(offset, field.value, LITTLE_ENDIAN),
	};
	if (field instanceof Vector2) return {
		alignment: 8,
		size: 8,
		write: (view, offset) => {
			view.setFloat32(offset, field.x, LITTLE_ENDIAN);
			view.setFloat32(offset + 4, field.y, LITTLE_ENDIAN);
		},
	};
	if (field instanceof Vector3) return {
		alignment: 16,
		size: 12,
		write: (view, offset) => {
			view.setFloat32(offset, field.x, LITTLE_ENDIAN);
			view.setFloat32(offset + 4, field.y, LITTLE_ENDIAN);
			view.setFloat32(offset + 8, field.z, LITTLE_ENDIAN);
		},
	};
	if (field instanceof Quaternion) return {
		alignment: 16,
		size: 16,
		write: (view, offset) => {
			view.setFloat32(offset, field.x, LITTLE_ENDIAN);
			view.setFloat32(offset + 4, field.y, LITTLE_ENDIAN);
			view.setFloat32(offset + 8, field.z, LITTLE_ENDIAN);
			view.setFloat32(offset + 12, field.w, LITTLE_ENDIAN);
		},
	};
	if (field instanceof Color) return {
		alignment: 16,
		size: 16,
		write: (view, offset) => {
			view.setFloat32(offset, field.r / 255, LITTLE_ENDIAN);
			view.setFloat32(offset + 4, field.g / 255, LITTLE_ENDIAN);
			view.setFloat32(offset + 8, field.b / 255, LITTLE_ENDIAN);
			view.setFloat32(offset + 12, field.a / 255, LITTLE_ENDIAN);
		},
	};
	if (field instanceof Matrix4) return {
		alignment: 16,
		size: 64,
		write: (view, offset) => {
			for (let i = 0; i < 16; i++) {
				view.setFloat32(offset + i * 4, field.elements[i]!, LITTLE_ENDIAN);
			}
		},
	};
	if (field instanceof StructArray) {
		if (field.length === 0) {
			throw new Error("Cannot create a std140 buffer from an empty array.");
		}
		const elementLayout = layoutOf(field[0]!);
		// std140: every array element is rounded up to a vec4 (16-byte) stride.
		const stride = roundUp(elementLayout.size, 16);
		return {
			alignment: 16,
			size: stride * field.length,
			write: (view, offset) => {
				for (let i = 0; i < field.length; i++) {
					elementLayout.write(view, offset + i * stride);
				}
			},
		};
	}
	if (field instanceof Struct) {
		const members = Object.values(field);
		let maxAlign = 1;
		let cursor = 0;
		const writers: Array<{ offset: number; write: Layout["write"] }> = [];
		for (const member of members) {
			const memberLayout = layoutOf(member);
			if (memberLayout.alignment > maxAlign) maxAlign = memberLayout.alignment;
			cursor = roundUp(cursor, memberLayout.alignment);
			writers.push({ offset: cursor, write: memberLayout.write });
			cursor += memberLayout.size;
		}
		// std140: struct base alignment is rounded up to a multiple of 16,
		// and the struct size is padded to a multiple of that alignment.
		const alignment = roundUp(maxAlign, 16);
		const size = roundUp(cursor, alignment);
		return {
			alignment,
			size,
			write: (view, base) => {
				for (const w of writers) w.write(view, base + w.offset);
			},
		};
	}
	assertNever(field);
}