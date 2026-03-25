import { Matrix4 } from "@open-utilities/maths/Matrix4";
import { Vector3 } from "@open-utilities/maths/Vector3";
import { AnimationFrameScheduler } from "@open-utilities/rendering/AnimationFrameScheduler";
import { Color } from "@open-utilities/rendering/Color";
import {
	VertexAttributeLayout,
	Geometry,
	Material,
	Mesh,
	RenderPrimitiveType,
	ShaderModule,
	ShaderUniformFloat,
	VertexAttributeKind,
	VertexAttributeType,
	WebGLRenderer,
} from "@open-utilities/rendering/WebGLRenderer";

const canvas = document.querySelector("canvas")!;
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;

const renderer = WebGLRenderer.fromCanvas(canvas);

renderer.setProjectionTransform(Matrix4.perspective({
	fovy: Math.PI / 3, 
	aspectRatio: canvas.width / canvas.height,
	near: 0.1,
	far: 100,
}));

renderer.setViewTransform(Matrix4.lookAt({
	eye: Vector3.new(0, 0, 2.5),
	target: Vector3.new(0, 0, 0),
	up: Vector3.new(0, 1, 0),
}));


const cyan = Color.fromRGBHex(0x00ffff)
const vertices: { position: Vector3, color: Color, normal: Vector3 }[] = [
	//{ position: Vector3.new(-.5, 0, -.5), color: cyan, normal: Vector3.new(0,1,0) },
	//{ position: Vector3.new( .5, 0, -.5), color: cyan, normal: Vector3.new(0,1,0) },
	//{ position: Vector3.new( .5, 0,  .5), color: cyan, normal: Vector3.new(0,1,0) },
	//{ position: Vector3.new(-.5, 0,  .5), color: cyan, normal: Vector3.new(0,1,0) },
]

const indices: number[] = []

const min = Vector3.new(-0.5, 0, -0.5);
const max = Vector3.new(0.5, 0, 0.5);
const steps = Vector3.new(10, 1, 10);
for (let x = 0; x < steps.x; x++) {
	for (let z = 0; z < steps.z; z++) {
		const position = Vector3.new(
			min.x + (x / (steps.x - 1)) * (max.x - min.x),
			0,
			min.z + (z / (steps.z - 1)) * (max.z - min.z),
		);
		vertices.push({ position, color: cyan, normal: Vector3.new(0, 1, 0) });
	}
}

for (let x = 0; x < steps.x - 1; x++) {
	for (let z = 0; z < steps.z - 1; z++) {
		const i = x * steps.z + z;
		indices.push(i, i + 1, i + steps.z);
		indices.push(i + 1, i + steps.z + 1, i + steps.z);
	}
}

const layout = new VertexAttributeLayout()
	.append("aPosition", 3, VertexAttributeType.Float32)
	.append("aColor", 4, VertexAttributeType.Uint8, { normalized: true, kind: VertexAttributeKind.Float })
	.append("aNormal", 3, VertexAttributeType.Float32);

const vertexBuffer = new ArrayBuffer(layout.stride * vertices.length);

const geometry = new Geometry({
	attributeLayout: layout,
	primitiveType: RenderPrimitiveType.Triangles,
	vertexData: vertexBuffer,
	indexData: new Uint16Array(indices),
});

const shader = new ShaderModule({
	vertexShader: `#version 300 es
		layout(location = 0) in vec3 aPosition;
		layout(location = 1) in vec4 aColor;
		layout(location = 2) in vec3 aNormal;

		uniform mat4 uModelViewProjection;

		out vec4 vColor;

		void main() {
			gl_Position = uModelViewProjection * vec4(aPosition, 1.0);
			
			float light = dot(normalize(aNormal), normalize(vec3(1, 1, 1)));
			light = clamp(light, 0.1, 1.0);
			vColor = vec4(aColor.rgb * light, aColor.a);
		}
	`,
	fragmentShader: `#version 300 es
		precision mediump float;

		uniform float uAlpha;

		in vec4 vColor;
		out vec4 outColor;

		void main() {
			outColor = vec4(vColor.rgb, vColor.a * uAlpha);
		}
	`,
});

const material = new Material({
	shader,
	uniforms: {
		uAlpha: new ShaderUniformFloat(1),
	},
});

const mesh = new Mesh({ geometry, material });

AnimationFrameScheduler.periodic(() => {
	const time = performance.now() * 0.001;

	for (const [index, vertex] of vertices.entries()) {
		vertex.position.y = Math.sin(vertex.position.x * 2 + time) * Math.cos(vertex.position.z * 2 + time) * 0.5;

		setVertex(index, vertex.position, vertex.color);

		const normalX = Math.cos(vertex.position.x * 2 + time) * Math.cos(vertex.position.z * 2 + time) * 0.5;
		const normalY = 1;
		const normalZ = Math.cos(vertex.position.x * 2 + time) * Math.cos(vertex.position.z * 2 + time) * 0.5;
		const normal = Vector3.new(normalX, normalY, normalZ).normalize()!;
		setNormal(index, normal);
	}

	geometry.needsVertexUpdate = true;

	renderer.clear();
	renderer.drawMesh(mesh);
});

function setVertex(index: number, position: Vector3, color: Color) {
	setPosition(index, position);
	setColor(index, color);
}

function setPosition(index: number, position: Vector3) {
	const floatOffset = (index * layout.stride) / Float32Array.BYTES_PER_ELEMENT;
	const vertexFloats = new Float32Array(vertexBuffer);
	vertexFloats[floatOffset] = position.x;
	vertexFloats[floatOffset + 1] = position.y;
	vertexFloats[floatOffset + 2] = position.z;
}

function setColor(index: number, color: Color) {
	const byteOffset = index * layout.stride + 12;
	const vertexBytes = new Uint8Array(vertexBuffer);
	vertexBytes[byteOffset] = color.r;
	vertexBytes[byteOffset + 1] = color.g;
	vertexBytes[byteOffset + 2] = color.b;
	vertexBytes[byteOffset + 3] = color.a;
}

function setNormal(index: number, normal: Vector3) {
	const floatOffset = (index * layout.stride + 16) / Float32Array.BYTES_PER_ELEMENT;
	const vertexFloats = new Float32Array(vertexBuffer);
	vertexFloats[floatOffset] = normal.x;
	vertexFloats[floatOffset + 1] = normal.y;
	vertexFloats[floatOffset + 2] = normal.z;
}