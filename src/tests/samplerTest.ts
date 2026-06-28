import { AnimationFrameScheduler } from "@open-utilities/rendering/AnimationFrameScheduler";
import { Color } from "@open-utilities/rendering/Color";
import { Geometry, BufferUsage, Material, Mesh, PipelineState, RenderPrimitiveType, Sampler, ShaderBuffer, ShaderModule, Texture2D, VertexAttributeLayout, VertexAttributeType, WebGLRenderer, float32 } from "@open-utilities/rendering/WebGLRenderer";
import { Matrix4 } from "@open-utilities/maths/Matrix4";
import { Vector2 } from "@open-utilities/maths/Vector2";
import { Vector3 } from "@open-utilities/maths/Vector3";
import { createPackedBuffer } from "@open-utilities/structs/packedBuffer";
import { struct, structArrayOf } from "@open-utilities/structs/Struct";
import birdImageUrl from "./bird-yellow-and-black.jpg";

const canvas = document.querySelector("canvas")!;
const renderer = WebGLRenderer.fromCanvas(canvas);
renderer.setClearColor(Color.fromRGBHex(0x1a1a2e));

const birdImage = new Image();
birdImage.src = birdImageUrl;
await birdImage.decode();

const nearestTexture = Texture2D.fromImage({
	image: birdImage,
	sampler: Sampler.nearest,
});

const linearTexture = Texture2D.fromImage({
	image: birdImage,
	sampler: Sampler.linear,
});

const mipmappedTexture = Texture2D.fromImage({
	image: birdImage,
	mipmaps: true,
	sampler: Sampler.linearMipmap,
});

const texturedShader = new ShaderModule({
	vertexShader: /*glsl*/`#version 300 es
		uniform mat4 uModelViewProjection;
		layout(location = 0) in vec3 aPosition;
		layout(location = 1) in vec2 aTexCoord;
		out vec2 vTexCoord;
		void main() {
			gl_Position = uModelViewProjection * vec4(aPosition, 1.0);
			vTexCoord = aTexCoord;
		}
	`,
	fragmentShader: /*glsl*/`#version 300 es
		precision mediump float;
		uniform sampler2D uTexture;
		uniform float uTint;
		in vec2 vTexCoord;
		out vec4 outColor;
		void main() {
			vec4 tex = texture(uTexture, vTexCoord);
			// apply a slight tint so the three quads are visually distinguishable
			outColor = vec4(tex.rgb * uTint, tex.a);
		}
	`,
});

const quadLayout = new VertexAttributeLayout()
	.append("aPosition", 3, VertexAttributeType.Float32)
	.append("aTexCoord", 2, VertexAttributeType.Float32);

function createQuadMesh(texture: Texture2D, tint: number): Mesh {
	const vertices = createPackedBuffer(structArrayOf(
		struct({ position: Vector3.new(-0.5, -0.5, 0), texCoord: Vector2.new(0, 0) }),
		struct({ position: Vector3.new( 0.5, -0.5, 0), texCoord: Vector2.new(1, 0) }),
		struct({ position: Vector3.new( 0.5,  0.5, 0), texCoord: Vector2.new(1, 1) }),
		struct({ position: Vector3.new(-0.5,  0.5, 0), texCoord: Vector2.new(0, 1) }),
	));

	const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

	return new Mesh({
		geometry: new Geometry({
			attributeLayout: quadLayout,
			vertices: new ShaderBuffer(vertices, BufferUsage.Static),
			indices: new ShaderBuffer(indices, BufferUsage.Static),
			primitiveType: RenderPrimitiveType.Triangles,
		}),
		material: new Material({
			shader: texturedShader,
			pipelineState: PipelineState.opaque,
			uniforms: {
				uTexture: texture,
				uTint: float32(tint),
			},
		}),
	});
}

// three quads side by side: nearest (red tint), linear (green tint), mipmapped (blue tint)
const nearestMesh = createQuadMesh(nearestTexture, 1.0);
const linearMesh = createQuadMesh(linearTexture, 0.85);
const mipmappedMesh = createQuadMesh(mipmappedTexture, 0.7);

// --- camera state ---
let distance = 3.5;
let orbitAngle = 0;

const debugText = document.querySelector("#debug-text") as HTMLElement;
debugText.style.color = "#f7f1da";
debugText.style.fontFamily = "monospace";
debugText.style.padding = "0.5rem";

function updateCanvasDimensions() {
	const dpr = window.devicePixelRatio || 1;
	const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
	const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
	if (canvas.width === width && canvas.height === height) return;
	canvas.width = width;
	canvas.height = height;
	renderer.gl.viewport(0, 0, width, height);
}

window.addEventListener("wheel", (e) => {
	distance = Math.max(0.5, Math.min(20, distance + e.deltaY * 0.01));
});

AnimationFrameScheduler.periodic(({ elapsedTime }) => {
	updateCanvasDimensions();
	orbitAngle += elapsedTime.seconds * 0.3;

	const aspect = canvas.width / canvas.height;
	const projection = Matrix4.perspective({
		fovy: Math.PI / 3,
		aspectRatio: aspect,
		near: 0.1,
		far: 100,
	});
	const view = Matrix4.lookAt({
		eye: Vector3.new(
			Math.cos(orbitAngle) * distance,
			1.5,
			Math.sin(orbitAngle) * distance,
		),
		target: Vector3.new(0, 0, 0),
		up: Vector3.new(0, 1, 0),
	});

	renderer.beginPass({
		uProjection: projection,
		uView: view,
	});
	renderer.clear();

	// draw the three quads at different x positions
	const spacing = 1.4;
	renderer.drawMesh(nearestMesh, { uModel: Matrix4.translation(Vector3.new(-spacing, 0, 0)) });
	renderer.drawMesh(linearMesh, { uModel: Matrix4.translation(Vector3.new(0, 0, 0)) });
	renderer.drawMesh(mipmappedMesh, { uModel: Matrix4.translation(Vector3.new(spacing, 0, 0)) });

	debugText.textContent = [
		`distance: ${distance.toFixed(2)}  (scroll to zoom)`,
		`left:  nearest   center: linear   right: mipmapped`,
		`image: ${birdImage.naturalWidth}x${birdImage.naturalHeight}`,
	].join("\n");
});
