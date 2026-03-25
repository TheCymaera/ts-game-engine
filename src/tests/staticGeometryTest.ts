import { Matrix4 } from "@open-utilities/maths/Matrix4";
import { normalize } from "@open-utilities/maths/normalize";
import { denormalize } from "@open-utilities/maths/denormalize";
import { Rect } from "@open-utilities/maths/Rect";
import { Vector2 } from "@open-utilities/maths/Vector2";
import { AnimationFrameScheduler } from "@open-utilities/rendering/AnimationFrameScheduler";
import { VertexAttributeLayout, VertexAttributeType, VertexAttributeKind, BufferBuilder, Geometry, Material, Mesh, RenderPrimitiveType, ShaderModule, ShaderUniformFloat, ShaderUniformInt, WebGLRenderer, ShaderUniform as ShaderUniform, GeometryUsage, ShaderBuffer } from "@open-utilities/rendering/WebGLRenderer";


const canvas = document.querySelector("canvas")!;
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;
const renderer = WebGLRenderer.fromCanvas(canvas);


renderer.setProjectionTransform(Matrix4.ortho(
	Rect.fromPoints(Vector2.new(-1, -1), Vector2.new(1, 1)),
));

renderer.setViewTransform(Matrix4.identity());


const geometry = new Geometry({
	attributeLayout: new VertexAttributeLayout()
		.append("aPosition", 2, VertexAttributeType.Float32)
		.append("aColor", 4, VertexAttributeType.Uint8, { normalized: true, kind: VertexAttributeKind.Float }),
	vertices: new ShaderBuffer(new BufferBuilder()
		.appendFloat32(-0.5, -0.5).appendUint8(255, 0, 0, 255)
		.appendFloat32(0.5, -0.5).appendUint8(0, 255, 0, 255)
		.appendFloat32(0.5,  0.5).appendUint8(0, 0, 255, 255)
		.appendFloat32(-0.5,  0.5).appendUint8(255, 255, 0, 255)
		.build(), GeometryUsage.Static),
	indices: new ShaderBuffer(new Uint16Array([
		0, 1, 2,
		2, 3, 0,
	]), GeometryUsage.Static),
	primitiveType: RenderPrimitiveType.Triangles,
});

const shader = new ShaderModule({
	vertexShader: `#version 300 es
		layout(location = 0) in vec2 aPosition;
		layout(location = 1) in vec4 aColor;

		uniform mat4 uModelViewProjection;

		out vec4 vColor;

		void main() {
			gl_Position = uModelViewProjection * vec4(aPosition, 0.0, 1.0);
			vColor = aColor;

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
	}
});

const mesh = new Mesh({ geometry, material });

const modelTransform = Matrix4.identity();
AnimationFrameScheduler.periodic((context) => {
	modelTransform.rotateZ(context.elapsedTime.seconds);


	material.uniforms.uAlpha.value = denormalize(
		normalize(Math.sin(performance.now() * 0.005), -1, 1),
		0.5, 1
	);

	material.needsUniformUpdate = true;
	
	renderer.clear();
	renderer.drawMesh(mesh, modelTransform);
})