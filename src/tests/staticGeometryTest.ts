import { Matrix4 } from "@open-utilities/maths/Matrix4";
import { normalize } from "@open-utilities/maths/normalize";
import { denormalize } from "@open-utilities/maths/denormalize";
import { Rect } from "@open-utilities/maths/Rect";
import { Vector2 } from "@open-utilities/maths/Vector2";
import { AnimationFrameScheduler } from "@open-utilities/rendering/AnimationFrameScheduler";
import { Color } from "@open-utilities/rendering/Color";
import { createPackedBuffer } from "@open-utilities/structs/packedBuffer";
import { struct, structArrayOf } from "@open-utilities/structs/Struct";
import { VertexAttributeLayout, VertexAttributeType, VertexAttributeKind, Geometry, Material, Mesh, RenderPrimitiveType, ShaderModule, WebGLRenderer, BufferUsage, ShaderBuffer, float32 } from "@open-utilities/rendering/WebGLRenderer";


const canvas = document.querySelector("canvas")!;
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;
const renderer = WebGLRenderer.fromCanvas(canvas);

const geometry = new Geometry({
	attributeLayout: new VertexAttributeLayout()
		.append("aPosition", 2, VertexAttributeType.Float32)
		.append("aColor", 4, VertexAttributeType.Uint8, { normalized: true, kind: VertexAttributeKind.Float }),
	vertices: new ShaderBuffer(createPackedBuffer(structArrayOf(
		struct({ position: Vector2.new(-0.5, -0.5), color: Color.fromRGBA(255, 0, 0, 255).toRGBA8() }),
		struct({ position: Vector2.new( 0.5, -0.5), color: Color.fromRGBA(0, 255, 0, 255).toRGBA8() }),
		struct({ position: Vector2.new( 0.5,  0.5), color: Color.fromRGBA(0, 0, 255, 255).toRGBA8() }),
		struct({ position: Vector2.new(-0.5,  0.5), color: Color.fromRGBA(255, 255, 0, 255).toRGBA8() }),
	)), BufferUsage.Static),
	indices: new ShaderBuffer(new Uint16Array([
		0, 1, 2,
		2, 3, 0,
	]), BufferUsage.Static),
	primitiveType: RenderPrimitiveType.Triangles,
});

const shader = new ShaderModule({
	vertexShader: /*glsl*/`#version 300 es
		layout(location = 0) in vec2 aPosition;
		layout(location = 1) in vec4 aColor;

		uniform mat4 uModelViewProjection;

		out vec4 vColor;

		void main() {
			gl_Position = uModelViewProjection * vec4(aPosition, 0.0, 1.0);
			vColor = aColor;

		}
	`,
	fragmentShader: /*glsl*/`#version 300 es
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
		uAlpha: float32(1),
	}
});

const mesh = new Mesh({ geometry, material });

const modelTransform = Matrix4.identity();
AnimationFrameScheduler.periodic((context) => {
	modelTransform.rotateZ(context.elapsedTime.seconds);

	material.uniforms.uAlpha = float32(denormalize(
		normalize(Math.sin(performance.now() * 0.005), -1, 1),
		0.5, 1
	));

	material.needsUniformUpdate = true;
	
	renderer.beginPass({
		uProjection: Matrix4.ortho(
			Rect.fromPoints(Vector2.new(-1, -1), Vector2.new(1, 1)),
		),
		uView: Matrix4.identity(),
	});
	renderer.clear();
	renderer.drawMesh(mesh, {
		uModel: modelTransform,
	});
})