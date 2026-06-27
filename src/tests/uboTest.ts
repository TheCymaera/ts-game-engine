import { Matrix4 } from "@open-utilities/maths/Matrix4";
import { Rect } from "@open-utilities/maths/Rect";
import { Vector2 } from "@open-utilities/maths/Vector2";
import {
	BufferBuilder,
	BufferUsage,
	Geometry,
	Material,
	Mesh,
	RenderPrimitiveType,
	ShaderBuffer,
	ShaderModule,
	VertexAttributeLayout,
	VertexAttributeType,
	WebGLRenderer,
} from "@open-utilities/rendering/WebGLRenderer";
import { createStd140Buffer } from "@open-utilities/rendering/std140";
import { Float32, struct } from "@open-utilities/rendering/Struct";
import { Random } from "@open-utilities/maths/Random";

const canvas = document.querySelector("canvas")!;
canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;
const renderer = WebGLRenderer.fromCanvas(canvas);

// A single triangle. Color comes from the UBO, not from vertex attributes.
const geometry = new Geometry({
	attributeLayout: new VertexAttributeLayout().append(
		"aPosition",
		2,
		VertexAttributeType.Float32,
	),
	vertices: new ShaderBuffer(
		new BufferBuilder()
			.appendFloat32(0.0, 0.6)
			.appendFloat32(-0.6, -0.4)
			.appendFloat32(0.6, -0.4)
			.build(),
		BufferUsage.Static,
	),
	indices: new ShaderBuffer(
		new Uint16Array([0, 1, 2]),
		BufferUsage.Static,
	),
	primitiveType: RenderPrimitiveType.Triangles,
});

const shader = new ShaderModule({
	vertexShader: /*glsl*/`#version 300 es
		layout(location = 0) in vec2 aPosition;

		uniform mat4 uModelViewProjection;

		void main() {
			gl_Position = uModelViewProjection * vec4(aPosition, 0.0, 1.0);
		}
	`,
	fragmentShader: /*glsl*/`#version 300 es
		precision mediump float;

		struct ColorBlock {
			float r;
			float g;
			float b;
		};

		layout(std140) uniform UniformBlock {
			ColorBlock color;
			float uAlpha;
		};

		out vec4 outColor;

		void main() {
			outColor = vec4(color.r, color.g, color.b, uAlpha);
		}
	`,
});

const colorUniforms = struct({
	color: struct({
		r: new Float32(0.6),
		g: new Float32(0.2),
		b: new Float32(0.3),
	}),
	uAlpha: new Float32(0.8),
});

const colorBuffer = new ShaderBuffer(
	createStd140Buffer(colorUniforms),
	BufferUsage.Dynamic,
);

const material = new Material({
	shader,
	uniforms: {
		uModelViewProjection: Matrix4.ortho(
			Rect.fromPoints(Vector2.new(-1, -1), Vector2.new(1, 1)),
		),
	},
	uniformGroups: {
		0: colorBuffer,
	},
});

const mesh = new Mesh({ geometry, material });

void (async ()=>{
	while (true) {
		renderer.beginPass({
			uProjection: Matrix4.ortho(
				Rect.fromPoints(Vector2.new(-1, -1), Vector2.new(1, 1)),
			),
			uView: Matrix4.identity(),
			uModel: Matrix4.identity(),
		});

		colorUniforms.color.r.value = Random.default.nextFloat();
		colorUniforms.color.g.value = Random.default.nextFloat();
		colorUniforms.color.b.value = Random.default.nextFloat();
		colorUniforms.uAlpha.value = Random.default.nextFloat(.7, 1.0);
		colorBuffer.set(createStd140Buffer(colorUniforms));

		renderer.clear();
		renderer.drawMesh(mesh);

		await new Promise(resolve => setTimeout(resolve, 1000));
	}
})();