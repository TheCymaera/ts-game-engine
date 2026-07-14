import { Duration } from "@open-utilities/core/Duration";
import { Matrix4 } from "@open-utilities/maths/Matrix4";
import { Rect } from "@open-utilities/maths/Rect";
import { Vector2 } from "@open-utilities/maths/Vector2";
import { Vector3 } from "@open-utilities/maths/Vector3";
import { AnimationFrameScheduler } from "@open-utilities/rendering/AnimationFrameScheduler";
import { Color } from "@open-utilities/rendering/Color";
import {
	BufferUsage,
	CompareFunc,
	Geometry,
	Material,
	Mesh,
	PipelineState,
	RenderPrimitiveType,
	ShaderBuffer,
	ShaderModule,
	StencilOp,
	VertexAttributeLayout,
	VertexAttributeType,
	WebGLRenderer,
} from "@open-utilities/rendering/WebGLRenderer";
import { createPackedBuffer } from "@open-utilities/structs/packedBuffer";
import { struct, structArrayOf, type Struct } from "@open-utilities/structs/Struct";

const canvas = document.querySelector("canvas")!;
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;
const renderer = WebGLRenderer.fromCanvas(canvas);
renderer.setClearColor(Color.fromRGBHex(0x1a1a2e)); // blue

// shader
const colorShaderLayout = new VertexAttributeLayout()
	.append("aPosition", 2, VertexAttributeType.Float32);

const colorShader = new ShaderModule({
	vertexShader: /*glsl*/ `#version 300 es
		layout(location = 0) in vec2 aPosition;
		uniform mat4 uModelViewProjection;
		void main() {
			gl_Position = uModelViewProjection * vec4(aPosition, 0.0, 1.0);
		}
	`,
	fragmentShader: /*glsl*/ `#version 300 es
		precision mediump float;
		uniform vec4 uColor;
		out vec4 outColor;
		void main() {
			outColor = uColor;
		}
	`,
});

// quad
const quadVertices = createPackedBuffer(structArrayOf(
	struct({ aPosition: Vector2.new(-1, -1) }),
	struct({ aPosition: Vector2.new(1, -1) }),
	struct({ aPosition: Vector2.new(1, 1) }),
	struct({ aPosition: Vector2.new(-1, 1) }),
));

const quadIndices = new Uint16Array([0, 1, 2, 0, 2, 3]);

const quadGeometry = new Geometry({
	attributeLayout: colorShaderLayout,
	vertices: new ShaderBuffer(quadVertices, BufferUsage.Static),
	indices: new ShaderBuffer(quadIndices, BufferUsage.Static),
	primitiveType: RenderPrimitiveType.Triangles,
});


// circle
const circleSegments = 64;
const circleVerticesArr: Struct<{ aPosition: Vector2 }>[] = [];
const circleIndicesArr: number[] = [];

circleVerticesArr.push(struct({ aPosition: Vector2.new(0, 0) }));
for (let i = 0; i <= circleSegments; i++) {
	const angle = (i / circleSegments) * Math.PI * 2;
	circleVerticesArr.push(struct({
		aPosition: Vector2.new(Math.cos(angle), Math.sin(angle)),
	}));
}
for (let i = 0; i < circleSegments; i++) {
	circleIndicesArr.push(0, i + 1, i + 2);
}

const circleGeometry = new Geometry({
	attributeLayout: colorShaderLayout,
	vertices: new ShaderBuffer(
		createPackedBuffer(structArrayOf(...circleVerticesArr)),
		BufferUsage.Static,
	),
	indices: new ShaderBuffer(
		new Uint16Array(circleIndicesArr),
		BufferUsage.Static,
	),
	primitiveType: RenderPrimitiveType.Triangles,
});

// stencil-write material: draws to stencil buffer only (no color output)
const stencilWriteMaterial = new Material({
	shader: colorShader,
	pipelineState: new PipelineState({
		depthTest: false,
		depthWrite: false,
		colorWriteMask: 0, // don't write color
		stencilTest: true,
		stencilFunc: CompareFunc.Always,
		stencilRef: 1,
		stencilWriteMask: 0xff,
		stencilFailOp: StencilOp.Keep,
		stencilDepthFailOp: StencilOp.Keep,
		stencilDepthPassOp: StencilOp.Replace, // write ref value where the circle is
	}),
	uniforms: {
		uColor: Color.fromRGBA(0, 0, 0, 0), // doesn't matter, color write is masked
	},
});

// stencil-test material: only draws where stencil == 1
const stencilTestMaterial = new Material({
	shader: colorShader,
	pipelineState: new PipelineState({
		depthTest: false,
		depthWrite: false,
		stencilTest: true,
		stencilFunc: CompareFunc.Equal,
		stencilRef: 1,
		stencilReadMask: 0xff,
		stencilWriteMask: 0x00, // don't modify stencil during this pass
		stencilFailOp: StencilOp.Keep,
		stencilDepthFailOp: StencilOp.Keep,
		stencilDepthPassOp: StencilOp.Keep,
	}),
	uniforms: {
		uColor: Color.fromRGBA(255, 100, 50, 255),
	},
});

// normal material (no stencil)
const normalMaterial = new Material({
	shader: colorShader,
	pipelineState: new PipelineState({
		depthTest: false,
		depthWrite: false,
	}),
	uniforms: {
		uColor: Color.fromRGBA(50, 200, 100, 255),
	},
});

// meshes
const stencilWriteMesh = new Mesh({
	geometry: circleGeometry,
	material: stencilWriteMaterial,
});

const stencilTestMesh = new Mesh({
	geometry: quadGeometry,
	material: stencilTestMaterial,
});

const normalMesh = new Mesh({
	geometry: quadGeometry,
	material: normalMaterial,
});

// --- NDC ortho projection ---
const ndcProjection = Matrix4.ortho(
	Rect.fromPoints(Vector2.new(-1, -1), Vector2.new(1, 1)),
);

const identityModel = Matrix4.identity();

// --- Animation ---
let time = Duration.milliseconds(0);
AnimationFrameScheduler.periodic((context) => {
	time = time.add(context.elapsedTime);

	// === LEFT HALF: Scissor Test ===
	// Draw three colored rectangles using scissor to clip them
	renderer.setViewport(
		Rect.fromDimensions(0, 0, canvas.width / 2, canvas.height),
	);

	renderer.beginPass({
		uProjection: ndcProjection,
		uView: Matrix4.identity(),
	});
	renderer.clear();

	// Scissor region 1: top-left quadrant of left half
	const scissorW = canvas.width / 4;
	const scissorH = canvas.height / 2;
	const regions = [
		{
			rect: Rect.fromDimensions(0, 0, scissorW, scissorH),
			color: Color.fromRGBA(255, 80, 80, 255),
		},
		{
			rect: Rect.fromDimensions(scissorW, 0, scissorW, scissorH),
			color: Color.fromRGBA(80, 255, 80, 255),
		},
		{
			rect: Rect.fromDimensions(0, scissorH, scissorW, scissorH),
			color: Color.fromRGBA(80, 80, 255, 255),
		},
		{
			rect: Rect.fromDimensions(scissorW, scissorH, scissorW, scissorH),
			color: Color.fromRGBA(255, 255, 80, 255),
		},
	];

	renderer.setScissorTest(true);
	for (const region of regions) {
		renderer.setScissor(region.rect);
		normalMaterial.uniforms.uColor = region.color;
		normalMaterial.needsUniformUpdate = true;
		renderer.drawMesh(normalMesh, { uModel: identityModel });
	}
	renderer.setScissorTest(false);

	// === RIGHT HALF: Stencil Test ===
	renderer.setViewport(
		Rect.fromDimensions(canvas.width / 2, 0, canvas.width / 2, canvas.height),
	);

	renderer.beginPass({
		uProjection: ndcProjection,
		uView: Matrix4.identity(),
	});
	// Clear color AND stencil
	renderer.setClearStencil(0);
	renderer.clear({ stencil: true });

	// Step 1: Draw a pulsing circle into the stencil buffer
	const pulseScale = 0.3 + 0.15 * Math.sin(time.seconds * 2.0);
	const circleModel = Matrix4.identity()
		.translate(Vector3.new(0, 0.15, 0))
		.scale(Vector3.new(pulseScale, pulseScale, 1));

	renderer.drawMesh(stencilWriteMesh, { uModel: circleModel });

	// Step 2: Draw a full-screen quad that only renders where stencil == 1
	renderer.drawMesh(stencilTestMesh, { uModel: identityModel });

	// Step 3: Draw a smaller circle outline by writing a different stencil value
	// (just for visual interest — draw a normal circle on top)
	const smallCircleModel = Matrix4.identity()
		.translate(Vector3.new(0, 0.15, 0))
		.scale(Vector3.new(pulseScale * 0.5, pulseScale * 0.5, 1));

	normalMaterial.uniforms.uColor = Color.fromRGBA(30, 30, 60, 255);
	normalMaterial.needsUniformUpdate = true;
	renderer.drawMesh(
		new Mesh({ geometry: circleGeometry, material: normalMaterial }),
		{ uModel: smallCircleModel },
	);
});