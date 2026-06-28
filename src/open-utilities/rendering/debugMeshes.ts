import { dedent } from "@open-utilities/strings/dedent.js";
import { Vector3 } from "../maths/Vector3.js";
import { Color } from "./Color.js";
import { buildCuboidBetween, GeometryData } from "./geometryBuilders.js";
import { Geometry, BufferUsage, Material, Mesh, RenderPrimitiveType, ShaderModule, VertexAttributeKind, VertexAttributeLayout, VertexAttributeType, ShaderBuffer } from "./WebGLRenderer.js";
import { createPackedBuffer } from "../structs/packedBuffer.js";
import { struct, structArrayOf, type Struct } from "../structs/Struct.js";

const unshadedShader = new ShaderModule({
	vertexShader: dedent/*glsl*/`#version 300 es
		uniform mat4 uModelViewProjection;

		layout(location = 0) in vec3 aPosition;
		layout(location = 1) in vec4 aColor;

		out vec4 vColor;

		void main() {
			gl_Position = uModelViewProjection * vec4(aPosition, 1.0);
			vColor = aColor;
		}
	`,
	fragmentShader: dedent/*glsl*/`#version 300 es
		precision mediump float;

		in vec4 vColor;
		out vec4 outColor;

		void main() {
			outColor = vColor;
		}
	`,
});

const coloredLayout = new VertexAttributeLayout()
	.append("aPosition", 3, VertexAttributeType.Float32)
	.append("aColor", 4, VertexAttributeType.Uint8, { normalized: true, kind: VertexAttributeKind.Float });

const defaultUnshadedMaterial = new Material({
	shader: unshadedShader,
	uniforms: {},
});

export function buildAxesMesh(options: {
	length: number;
	thickness: number;
	xColor?: Color;
	yColor?: Color;
	zColor?: Color;
	material?: Material;
	usage?: BufferUsage;
}): Mesh {
	const xColor = options.xColor ?? Color.red
	const yColor = options.yColor ?? Color.green
	const zColor = options.zColor ?? Color.blue
	
	const builder = new ColoredMeshBuilder();

	builder.append(buildCuboidBetween({
		start: Vector3.new(0, 0, 0),
		end: Vector3.new(options.length, 0, 0),
		thickness: options.thickness,
		upHint: Vector3.new(0, 1, 0),
	}), xColor);

	builder.append(buildCuboidBetween({
		start: Vector3.new(0, 0, 0),
		end: Vector3.new(0, options.length, 0),
		thickness: options.thickness,
		upHint: Vector3.new(0, 0, 1),
	}), yColor);

	builder.append(buildCuboidBetween({
		start: Vector3.new(0, 0, 0),
		end: Vector3.new(0, 0, options.length),
		thickness: options.thickness,
		upHint: Vector3.new(0, 1, 0),
	}), zColor);

	return builder.buildMesh({ material: options.material, usage: options.usage });
}

export function buildGridMesh(options: {
	y: number;
	extent: number;
	step: number;
	thickness: number;
	originColor?: Color;
	lineColor?: Color;
	material?: Material;
	usage?: BufferUsage;
}): Mesh {
	const builder = new ColoredMeshBuilder();

	for (let position = -options.extent; position <= options.extent + 0.0001; position += options.step) {
		const color = Math.abs(position) < 0.0001
			? options.originColor ?? Color.fromRGBHex(0x6c8cff)
			: options.lineColor ?? Color.fromRGBA(80, 96, 124, 100);

		builder.append(buildCuboidBetween({
			start: Vector3.new(-options.extent, options.y, position),
			end: Vector3.new(options.extent, options.y, position),
			thickness: options.thickness,
			upHint: Vector3.new(0, 1, 0),
		}), color);

		builder.append(buildCuboidBetween({
			start: Vector3.new(position, options.y, -options.extent),
			end: Vector3.new(position, options.y, options.extent),
			thickness: options.thickness,
			upHint: Vector3.new(0, 1, 0),
		}), color);
	}

	return builder.buildMesh({ material: options.material, usage: options.usage ?? BufferUsage.Static });
}

class ColoredMeshBuilder {
	private readonly vertexStructs: Struct[] = [];
	private readonly indices: number[] = [];
	private vertices = 0;

	append(geometryData: GeometryData, color: Color) {
		const indexOffset = this.vertices;
		const rgba = color.toRGBA8();
		for (const vertex of geometryData.vertices) {			
			this.vertexStructs.push(struct({
				position: vertex.position,
				color: rgba,
			}));
			this.vertices++;
		}

		for (const index of geometryData.indices) {
			this.indices.push(index + indexOffset);
		}

		return this;
	}

	buildMesh(options?: {
		material?: Material;
		usage?: BufferUsage;
	}) {
		const usage = options?.usage ?? BufferUsage.Static;
		
		const indices = this.vertices > 0xffff
			? new Uint32Array(this.indices)
			: new Uint16Array(this.indices);

		return new Mesh({
			material: options?.material ?? defaultUnshadedMaterial,
			geometry: new Geometry({
				attributeLayout: coloredLayout,
				vertices: new ShaderBuffer(createPackedBuffer(structArrayOf(...this.vertexStructs)), usage),
				indices: new ShaderBuffer(indices, usage),
				primitiveType: RenderPrimitiveType.Triangles,
			}),
		});
	}
}