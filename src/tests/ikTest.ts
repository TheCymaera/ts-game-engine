import { Duration } from "@open-utilities/core/Duration";
import { IKChain3D, IKChainSegment3D, IKSwingTwistJoint3D, IKHingeJoint3D } from "@open-utilities/inverse-kinematics/IKChain3D";
import { IKTarget3D } from "@open-utilities/inverse-kinematics/IKSolver";
import { createDampedLeastSquaresIKSolver3D } from "@open-utilities/inverse-kinematics/createDampedLeastSquaresIKSolver3D";
import { Matrix4 } from "@open-utilities/maths/Matrix4";
import { Quaternion } from "@open-utilities/maths/Quaternion";
import { Random } from "@open-utilities/maths/Random";
import { Vector3 } from "@open-utilities/maths/Vector3";
import { AnimationFrameScheduler } from "@open-utilities/rendering/AnimationFrameScheduler";
import { Color } from "@open-utilities/rendering/Color";
import { BufferBuilder, Geometry, GeometryUsage, Material, Mesh, RenderPrimitiveType, ShaderUniformFloat, ShaderUniformInt, ShaderModule, VertexAttributeKind, VertexAttributeLayout, VertexAttributeType, WebGLRenderer, ShaderBuffer } from "@open-utilities/rendering/WebGLRenderer";
import { dedent } from "@open-utilities/string/dedent";
import { assertNever } from "@open-utilities/types/assertNever";

const canvas = document.querySelector("canvas")!;

const debugText = document.querySelector("#debug-text") as HTMLElement;
debugText.style.color = "#f7f1da";

const renderer = WebGLRenderer.fromCanvas(canvas);
renderer.gl.clearColor(0.03, 0.04, 0.07, 1);

const rootPosition = Vector3.new(0, 1.2, 0);
const chain = IKChain3D.new({
	rootPosition,
	rotation: Quaternion.fromTo(IKChain3D.IDENTITY_VECTOR, Vector3.new(0, 1, 0)),
	segments: [
		{ length: 0.80, joint: IKSwingTwistJoint3D.new({ twistOrigin: Vector3.new(0, 0, 1), maxSwing: 0.2 * Math.PI, minTwist: -1 * Math.PI, maxTwist: 1 * Math.PI }) },
		{ length: 1.05, joint: IKHingeJoint3D.new({ axis: Vector3.new(1, 0, 0), origin: Vector3.new(0, 1, 0), minAngle: -0.3 * Math.PI, maxAngle: 0.3 * Math.PI }) },
		{ length: 0.95, joint: IKHingeJoint3D.new({ axis: Vector3.new(1, 0, 0), origin: Vector3.new(0, 1, 0), minAngle: -0.3 * Math.PI, maxAngle: 0.3 * Math.PI }) },
		{ length: 0.80, joint: IKSwingTwistJoint3D.new({ twistOrigin: Vector3.new(0, 0, 1), maxSwing: 0.22 * Math.PI, minTwist: -0.4 * Math.PI, maxTwist: 0.4 * Math.PI }) },
		{ length: 0.65, joint: IKSwingTwistJoint3D.new({ twistOrigin: Vector3.new(0, 0, 1), maxSwing: 0.25 * Math.PI, minTwist: -0.4 * Math.PI, maxTwist: 0.4 * Math.PI }) },
	],
});

Object.assign(globalThis, { chain });

const totalReach = chain.totalLength;
const targetRadius = totalReach * 0.88;
const random = Random.default;

const primitiveShader = new ShaderModule({
	vertexShader: `#version 300 es
		uniform mat4 uModelViewProjection;
		uniform float uPointSize;

		layout(location = 0) in vec3 aPosition;
		layout(location = 1) in vec4 aColor;

		out vec4 vColor;

		void main() {
			gl_Position = uModelViewProjection * vec4(aPosition, 1.0);
			gl_PointSize = uPointSize;
			vColor = aColor;
		}
	`,
	fragmentShader: `#version 300 es
		precision mediump float;

		uniform int uRoundPoints;

		in vec4 vColor;
		out vec4 outColor;

		void main() {
			if (uRoundPoints == 1) {
				vec2 centered = gl_PointCoord - vec2(0.5);
				if (dot(centered, centered) > 0.25) {
					discard;
				}
			}

			outColor = vColor;
		}
	`,
});

const layout = new VertexAttributeLayout()
	.append("aPosition", 3, VertexAttributeType.Float32)
	.append("aColor", 4, VertexAttributeType.Uint8, { normalized: true, kind: VertexAttributeKind.Float });

const lineMaterial = new Material({
	shader: primitiveShader,
	uniforms: {
		uPointSize: new ShaderUniformFloat(1),
		uRoundPoints: new ShaderUniformInt(0),
	},
});

const jointMaterial = new Material({
	shader: primitiveShader,
	uniforms: {
		uPointSize: new ShaderUniformFloat(12),
		uRoundPoints: new ShaderUniformInt(1),
	},
});

const targetMaterial = new Material({
	shader: primitiveShader,
	uniforms: {
		uPointSize: new ShaderUniformFloat(18),
		uRoundPoints: new ShaderUniformInt(1),
	},
});


function createEmptyMesh(options: {
	primitiveType: RenderPrimitiveType;
	material: Material;
}) {
	const geometry = new Geometry({
		attributeLayout: layout,
		vertices: new ShaderBuffer(new ArrayBuffer(0), GeometryUsage.Dynamic),
		indices: new ShaderBuffer(new Uint16Array(0), GeometryUsage.Dynamic),
		primitiveType: options.primitiveType,
	});

	return new Mesh({ geometry, material: options.material });
}

class VertexBuilder {
	readonly builder = new BufferBuilder();

	append(position: Vector3, color: Color) {
		this.builder.appendFloat32(position.x, position.y, position.z);
		this.builder.appendUint8(color.r, color.g, color.b, color.a);
		return this;
	}

	appendBuffer(buffer: ArrayBufferView) {
		this.builder.appendBuffer(buffer);
		return this;
	}

	build() {
		return this.builder.build();
	}
}

const gridMesh = createGridMesh(lineMaterial, 0, 6, 0.5);
const lineMesh = createEmptyMesh({
	primitiveType: RenderPrimitiveType.Lines,
	material: lineMaterial,
});
const jointMesh = createEmptyMesh({
	primitiveType: RenderPrimitiveType.Points,
	material: jointMaterial,
});
const targetMesh = createEmptyMesh({
	primitiveType: RenderPrimitiveType.Points,
	material: targetMaterial,
});

const RETARGET_INTERVAL = () => Duration.seconds(random.nextFloat(2.2, 4.2));
let retargetTimer = RETARGET_INTERVAL();
let orbitAngle = 0;

function randomTarget(): IKTarget3D {
	return new IKTarget3D(
		rootPosition.clone().add(randomVectorInRadius(targetRadius)),
		undefined, //Quaternion.fromAxisAngle(Vector3.new(0, 1, 0), random.nextFloat(0, Math.PI * 2)),
	);
}

let desiredTarget = randomTarget();
let currentTarget = desiredTarget;


const tolerance = 0.01;
const solver = createDampedLeastSquaresIKSolver3D({
	tolerance: tolerance,
});


AnimationFrameScheduler.periodic(({ elapsedTime }) => {
	updateCanvasDimensions();

	retargetTimer = retargetTimer.subtract(elapsedTime);
	if (retargetTimer.milliseconds <= 0) {
		desiredTarget = randomTarget();
		retargetTimer = RETARGET_INTERVAL();
	}

	//const targetLerp = Infinity;
	//const chainLerp = 2.5;

	const targetLerp = 1.5;
	const chainLerp = Infinity;

	currentTarget.lerp(desiredTarget, 1 - Math.exp(-elapsedTime.seconds * targetLerp));
	
	const solvedChain = chain.clone();
	solver(solvedChain, currentTarget);
	
	chain.lerpPose(solvedChain, 1 - Math.exp(-elapsedTime.seconds * chainLerp));

	const effector = chain.joints[chain.joints.length - 1]!.position;
	const error = effector.distanceTo(currentTarget.position);
	
	updateMeshes(chain, currentTarget, error <= tolerance);
	orbitAngle += elapsedTime.seconds * 0.22;

	renderer.setViewTransform(Matrix4.lookAt({
		eye: Vector3.new(7.4, 7.0, 0).rotateY(orbitAngle),
		target: rootPosition.clone().add(Vector3.new(0, 1.3, 0)),
		up: Vector3.new(0, 1, 0),
	}));

	renderer.clear();
	renderer.drawMesh(gridMesh);
	renderer.drawMesh(lineMesh);
	renderer.drawMesh(jointMesh);
	renderer.drawMesh(targetMesh);

	debugText.textContent = dedent`
		target: ${currentTarget.position.toString()}
		effector: ${effector.toString()}
		error: ${error.toFixed(4)}
		retarget in: ${Math.max(retargetTimer.seconds, 0).toFixed(2)}s
	`;
});

function updateCanvasDimensions() {
	const devicePixelRatio = window.devicePixelRatio || 1;
	const width = Math.max(1, Math.floor(canvas.clientWidth * devicePixelRatio));
	const height = Math.max(1, Math.floor(canvas.clientHeight * devicePixelRatio));

	if (canvas.width === width && canvas.height === height) return;

	canvas.width = width;
	canvas.height = height;
	renderer.gl.viewport(0, 0, width, height);
	renderer.setProjectionTransform(Matrix4.perspective({
		fovy: Math.PI / 3,
		aspectRatio: width / height,
		near: 0.1,
		far: 100,
	}));
}

const LINE_COLOR = (index: number, total: number) => {
	const progress = index / Math.max(total - 1, 1);
	return Color.fromRGBHex(0x67d8ef).lerp(Color.fromRGBHex(0xffb34d), progress);
};

const JOINT_COLOR = (index: number, total: number) => {
	const progress = index / Math.max(total - 1, 1);
	if (index === 0) return Color.white;
	if (index === total - 1) return Color.fromRGBHex(0xffdc73);
	return Color.fromRGBHex(0x96f2d7).lerp(Color.fromRGBHex(0xffb86c), progress);
};

function buildAxes(position: Vector3, rotation: Quaternion, length: number) {
	const X_COLOR = Color.red.scaleAlpha(0.5);
	const Y_COLOR = Color.green.scaleAlpha(0.5);
	const Z_COLOR = Color.blue.scaleAlpha(0.5);

	return new VertexBuilder()
		.append(position, X_COLOR)
		.append(position.clone().add(rotation.rotateVector(Vector3.new(length, 0, 0))), X_COLOR)
		.append(position, Y_COLOR)
		.append(position.clone().add(rotation.rotateVector(Vector3.new(0, length, 0))), Y_COLOR)
		.append(position, Z_COLOR)
		.append(position.clone().add(rotation.rotateVector(Vector3.new(0, 0, length))), Z_COLOR);
}

function buildSegments(chain: IKChain3D) {
	const builder = new VertexBuilder();
	const jointPositions = chain.joints.map(joint => joint.position);

	for (let index = 0; index < jointPositions.length - 1; index++) {
		const start = jointPositions[index]!;
		const end = jointPositions[index + 1]!;

		const color = LINE_COLOR(index, jointPositions.length - 1);
		builder.append(start, color);
		builder.append(end, color);
	}

	return builder;
}

function updateMeshes(chain: IKChain3D, target: IKTarget3D, targetReached: boolean) {
	const jointBuilder = new VertexBuilder();

	const jointPositions = chain.joints.map(joint => joint.position);
	
	for (const [index, position] of jointPositions.entries()) {
		jointBuilder.append(position, JOINT_COLOR(index, jointPositions.length));
	}

	const allLines = new VertexBuilder()

	// segments
	allLines.appendBuffer(buildSegments(chain).build())
	
	// guides
	allLines.appendBuffer(buildConstraintGuides(chain).build());

	// joint axes
	for (let index = 0; index < jointPositions.length; index++) {
		const position = jointPositions[index]!;
		const rotation = jointRotationAt(index);
		allLines.appendBuffer(buildAxes(position, rotation, 0.3).build());
	}

	// target axes
	if (target.orientation) {
		allLines.appendBuffer(buildAxes(target.position, target.orientation, 0.5).build());
	}

	lineMesh.geometry.vertices.set(allLines.build());
	lineMesh.geometry.indices.set(incrementingIndices(allLines.builder.length / layout.stride));
	
	jointMesh.geometry.vertices.set(jointBuilder.build());
	jointMesh.geometry.indices.set(incrementingIndices(jointBuilder.builder.length / layout.stride));

	const TARGET_COLOR = targetReached ? Color.green : Color.red;

	const ball = new VertexBuilder().append(target.position, TARGET_COLOR);
	targetMesh.geometry.vertices.set(ball.build());
	targetMesh.geometry.indices.set(incrementingIndices(ball.builder.length / layout.stride));
}

function buildConstraintGuides(chain: IKChain3D) {
	const builder = new VertexBuilder();
	const joints = chain.joints;

	for (let index = 0; index < chain.segments.length; index++) {
		const segment = chain.segments[index]!;
		const parent = joints[index]!;
		const child = joints[index + 1]!;

		if (segment.joint instanceof IKSwingTwistJoint3D) {
			builder.appendBuffer(
				buildSwingTwistGuide(
					parent.position,
					segment,
					parent.rotation,
					child.rotation,
				).build()
			);
			continue;
		}

		if (segment.joint instanceof IKHingeJoint3D) {
			builder.appendBuffer(
				buildHingeGuide(
					parent.position,
					segment,
					parent.rotation,
				).build()
			);
			continue;
		}

		assertNever(segment.joint);
	}

	return builder;
}

function buildSwingTwistGuide(
	jointPosition: Vector3,
	segment: IKChainSegment3D,
	parentRotation: Quaternion,
	jointRotation: Quaternion,
) {
	const constraint = segment.joint as IKSwingTwistJoint3D;

	const builder = buildCone(jointPosition, segment.length * .3, constraint.maxSwing, parentRotation);

	const axisWorld = jointRotation.rotateVector(Vector3.new(0, 1, 0)).normalize() ?? Vector3.new(0, 1, 0);
	const swingDirection = parentRotation.clone().invert()?.rotateVector(axisWorld) ?? Vector3.new(0, 1, 0);
	const swingRotation = Quaternion.fromTo(Vector3.new(0, 1, 0), swingDirection, Vector3.new(1, 0, 0));
	const twistBase = parentRotation.clone().multiply(swingRotation).rotateVector(constraint.twistBase);
	const ringCenter = jointPosition.clone().add(axisWorld.clone().multiply(segment.length * .8));
	const radius = .1;
	const liveLength = radius * 1.5;
	
	const twistIndicatorColor = Color.fromRGBA(255, 99, 218, 255);
	const twistGuideColor = twistIndicatorColor.scaleAlpha(.5);

	builder.appendBuffer(buildCircleSegment({
		center: ringCenter,
		axis: axisWorld,
		forward: twistBase,
		radius,
		minAngle: constraint.minTwist,
		maxAngle: constraint.maxTwist,
		steps: 10,
		arcColor: twistGuideColor,
		spokeColor: twistGuideColor.scaleAlpha(0.85),
	}).build());

	const joint = segment.joint as IKSwingTwistJoint3D;
	const twist = joint ? joint.twist : 0;

	const livePoint = ringCenter.clone().add(twistBase.clone().rotateAround(axisWorld, twist).multiply(liveLength));
	builder.append(ringCenter, twistIndicatorColor);
	builder.append(livePoint, twistIndicatorColor);

	return builder;
}

function buildCircleSegment(options: {
	center: Vector3;
	axis: Vector3;
	forward: Vector3;
	radius: number;
	minAngle: number;
	maxAngle: number;
	steps: number;
	arcColor: Color;
	spokeColor?: Color;
}) {
	const spokeColor = options.spokeColor ?? options.arcColor;
	
	const builder = new VertexBuilder();

	for (let step = 0; step < options.steps; step++) {
		const angleA = options.minAngle + ((options.maxAngle - options.minAngle) * step) / options.steps;
		const angleB = options.minAngle + ((options.maxAngle - options.minAngle) * (step + 1)) / options.steps;
		const pointA = options.center.clone().add(options.forward.clone().rotateAround(options.axis, angleA).multiply(options.radius));
		const pointB = options.center.clone().add(options.forward.clone().rotateAround(options.axis, angleB).multiply(options.radius));
		builder.append(pointA, options.arcColor);
		builder.append(pointB, options.arcColor);
	}

	for (const angle of [options.minAngle, options.maxAngle]) {
		const spokePoint = options.center.clone().add(options.forward.clone().rotateAround(options.axis, angle).multiply(options.radius));
		builder.append(options.center, spokeColor);
		builder.append(spokePoint, spokeColor);
	}

	return builder;
}

function buildCone(position: Vector3, length: number, radians: number, rotation: Quaternion) {
	const color = Color.fromRGBA(84, 232, 201, 95);

	const forward = IKChain3D.IDENTITY_VECTOR.rotate(rotation);
	const up = forward.clone().orthogonal().normalize()!;
	const right = forward.clone().cross(up).normalize()!;

	const rimRadius = Math.sin(radians) * length;
	const rimCenter = position.clone().add(forward.clone().multiply(Math.cos(radians) * length));

	const builder = new VertexBuilder();

	for (let step = 0; step < 12; step++) {
		const angleA = (step / 12) * Math.PI * 2;
		const angleB = ((step + 1) / 12) * Math.PI * 2;
		const pointA = rimCenter.clone()
			.add(right.clone().multiply(Math.cos(angleA) * rimRadius))
			.add(up.clone().multiply(Math.sin(angleA) * rimRadius));
		const pointB = rimCenter.clone()
			.add(right.clone().multiply(Math.cos(angleB) * rimRadius))
			.add(up.clone().multiply(Math.sin(angleB) * rimRadius));
		builder.append(pointA, color);
		builder.append(pointB, color);
	}

	for (const azimuth of [0, Math.PI * 0.5, Math.PI, Math.PI * 1.5]) {
		const rimPoint = rimCenter.clone()
			.add(right.clone().multiply(Math.cos(azimuth) * rimRadius))
			.add(up.clone().multiply(Math.sin(azimuth) * rimRadius));
		builder.append(position, color);
		builder.append(rimPoint, color);
	}

	return builder;
}

function buildHingeGuide(
	joint: Vector3,
	segment: IKChainSegment3D,
	parentRotation: Quaternion,
) {
	const color = Color.fromRGBA(121, 184, 255, 130);

	const constraint = segment.joint as IKHingeJoint3D;
	
	const axisWorld = constraint.axis.clone().rotate(parentRotation);
	const referenceWorld = constraint.origin.clone().rotate(parentRotation);
	const radius = segment.length * 0.3;

	return buildCircleSegment({
		center: joint,
		axis: axisWorld,
		forward: referenceWorld,
		radius,
		minAngle: constraint.minAngle,
		maxAngle: constraint.maxAngle,
		steps: 18,
		arcColor: color,
	});
}

function jointRotationAt(index: number) {
	if (index < chain.joints.length) return chain.joints[index]!.rotation;
	return chain.joints[chain.joints.length - 1]!.rotation;
}

function randomVectorInRadius(radius: number) {
	const theta = random.nextFloat(0, Math.PI * 2);
	const vertical = random.nextFloat(-1, 1);
	const horizontal = Math.sqrt(1 - vertical * vertical);
	const length = Math.cbrt(random.nextFloat()) * radius;

	return Vector3.new(
		horizontal * Math.cos(theta),
		vertical,
		horizontal * Math.sin(theta),
	).multiply(length);
}

function createGridMesh(material: Material, y: number, extent: number, step: number) {
	const builder = new VertexBuilder();
	for (let position = -extent; position <= extent + 0.0001; position += step) {
		const color = Math.abs(position) < 0.0001 ? Color.fromRGBHex(0x6c8cff) : Color.fromRGBA(80, 96, 124, 100);
		builder.append(Vector3.new(-extent, y, position), color);
		builder.append(Vector3.new(extent, y, position), color);
		builder.append(Vector3.new(position, y, -extent), color);
		builder.append(Vector3.new(position, y, extent), color);
	}

	const vertexCount = builder.builder.length / layout.stride;

	const mesh = new Mesh({
		material,
		geometry: new Geometry({
			attributeLayout: layout,
			vertices: new ShaderBuffer(builder.build(), GeometryUsage.Static),
			indices: new ShaderBuffer(incrementingIndices(vertexCount), GeometryUsage.Static),
			primitiveType: RenderPrimitiveType.Lines,
		}),
	});

	mesh.geometry.vertices.set(builder.build());
	
	return mesh;
}

function incrementingIndices(pointCount: number) {
	const indices = new Uint16Array(pointCount);
	for (let index = 0; index < pointCount; index++) {
		indices[index] = index;
	}
	return indices;
}