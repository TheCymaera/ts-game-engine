import { Duration } from "@open-utilities/core/Duration";
import { IKChain3D, IKChainSegment3D, IKHingeConstraint3D, IKSwingTwistConstraint3D } from "@open-utilities/inverse-kinematics/IKChain3D";
import { Matrix4 } from "@open-utilities/maths/Matrix4";
import { Quaternion } from "@open-utilities/maths/Quaternion";
import { Random } from "@open-utilities/maths/Random";
import { Vector3 } from "@open-utilities/maths/Vector3";
import { AnimationFrameScheduler } from "@open-utilities/rendering/AnimationFrameScheduler";
import { Color } from "@open-utilities/rendering/Color";
import { BufferBuilder, Geometry, GeometryUsage, Material, Mesh, RenderPrimitiveType, RenderUniformFloat, RenderUniformInt, ShaderModule, VertexAttributeKind, VertexAttributeLayout, VertexAttributeType, WebGLRenderer } from "@open-utilities/rendering/WebGLRenderer";
import { solveRandomizedIK3D as solveRandomized3D } from "@open-utilities/inverse-kinematics/solveRandomizedIK3D";
import { extractTwistRadians, solveFabrik3D } from "@open-utilities/inverse-kinematics/solveFabrik3D";
import { dedent } from "@open-utilities/string/dedent";

const canvasElement = document.querySelector("canvas")!;
const canvas = canvasElement;

const debugText = document.querySelector("#debug-text") as HTMLElement;
debugText.style.color = "#f7f1da";

const renderer = WebGLRenderer.fromCanvas(canvas);
renderer.gl.clearColor(0.03, 0.04, 0.07, 1);

const rootPosition = Vector3.new(0, -1.2, 0);
const chain = IKChain3D.new({
	rootPosition,
	rootDirection: Vector3.new(0, 1, 0),
	rootUp: Vector3.new(0, 0, 1),
	segments: [
		{ length: 1.15, constraint: new IKSwingTwistConstraint3D({ twistOrigin: Vector3.new(0, 0, 1), maxSwing: 0.2 * Math.PI, minTwist: -1 * Math.PI, maxTwist: 1 * Math.PI }) },
		{ length: 1.05, constraint: new IKHingeConstraint3D({ axis: Vector3.new(1, 0, 0), origin: Vector3.new(0, 1, 0), minAngle: -0.3 * Math.PI, maxAngle: 0.3 * Math.PI }) },
		{ length: 0.95, constraint: new IKHingeConstraint3D({ axis: Vector3.new(1, 0, 0), origin: Vector3.new(0, 1, 0), minAngle: -0.3 * Math.PI, maxAngle: 0.3 * Math.PI }) },
		{ length: 0.80, constraint: new IKSwingTwistConstraint3D({ twistOrigin: Vector3.new(0, 0, 1), maxSwing: 0.22 * Math.PI, minTwist: -0.4 * Math.PI, maxTwist: 0.4 * Math.PI }) },
		{ length: 0.65, constraint: new IKSwingTwistConstraint3D({ twistOrigin: Vector3.new(0, 0, 1), maxSwing: 0.25 * Math.PI, minTwist: -0.4 * Math.PI, maxTwist: 0.4 * Math.PI }) },
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
		uPointSize: new RenderUniformFloat(1),
		uRoundPoints: new RenderUniformInt(0),
	},
});

const jointMaterial = new Material({
	shader: primitiveShader,
	uniforms: {
		uPointSize: new RenderUniformFloat(12),
		uRoundPoints: new RenderUniformInt(1),
	},
});

const targetMaterial = new Material({
	shader: primitiveShader,
	uniforms: {
		uPointSize: new RenderUniformFloat(18),
		uRoundPoints: new RenderUniformInt(1),
	},
});


function createMesh(options: {
	primitiveType: RenderPrimitiveType;
	vertexCount: number;
	indices: Uint16Array;
	material: Material;
}) {
	const geometry = new Geometry({
		attributeLayout: layout,
		vertexData: new ArrayBuffer(options.vertexCount * layout.stride),
		indexData: options.indices,
		primitiveType: options.primitiveType,
		vertexUsage: GeometryUsage.Dynamic,
		indexUsage: GeometryUsage.Static,
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

const gridMesh = createGridMesh(lineMaterial, rootPosition.y - 1.7, 6, 0.5);
const chainLineMesh = createMesh({
	primitiveType: RenderPrimitiveType.Lines,
	vertexCount: 0,
	indices: incrementingIndices(0),
	material: lineMaterial,
});
const jointMesh = createMesh({
	primitiveType: RenderPrimitiveType.Points,
	vertexCount: 0,
	indices: incrementingIndices(0),
	material: jointMaterial,
});
const targetAxesMesh = createMesh({
	primitiveType: RenderPrimitiveType.Lines,
	vertexCount: 0,
	indices: incrementingIndices(0),
	material: lineMaterial,
});
const targetPointMesh = createMesh({
	primitiveType: RenderPrimitiveType.Points,
	vertexCount: 0,
	indices: incrementingIndices(0),
	material: targetMaterial,
});
const jointAxesMesh = createMesh({
	primitiveType: RenderPrimitiveType.Lines,
	vertexCount: 0,
	indices: incrementingIndices(0),
	material: lineMaterial,
});
const constraintGuideMesh = createMesh({
	primitiveType: RenderPrimitiveType.Lines,
	vertexCount: 0,
	indices: incrementingIndices(0),
	material: lineMaterial,
});

const RETARGET_INTERVAL = () => Duration.seconds(random.nextFloat(2.2, 4.2));
let currentTargetOffset = Vector3.new(0, 0, 0);
let desiredTargetOffset = Vector3.new(0, 0, 0);
let targetOrientation: Quaternion | undefined = undefined;
let retargetTimer = RETARGET_INTERVAL();
let orbitAngle = 0;

function retarget() {
	desiredTargetOffset = randomVectorInRadius(targetRadius);
	//targetOrientation = Quaternion.fromAxisAngle(Vector3.new(0, 1, 0), random.nextFloat(0, Math.PI * 2));
	targetOrientation = undefined;
}
retarget();

AnimationFrameScheduler.periodic(({ elapsedTime }) => {
	updateCanvasDimensions();

	retargetTimer = retargetTimer.subtract(elapsedTime);
	if (retargetTimer.milliseconds <= 0) {
		retarget();
		retargetTimer = RETARGET_INTERVAL();
	}

	const smoothing = 1 - Math.exp(-elapsedTime.seconds * 1.5);
	currentTargetOffset = currentTargetOffset.lerp(desiredTargetOffset, smoothing);
	const target = rootPosition.clone().add(currentTargetOffset);
	
	const tolerance = 0.01;
	const solvedChain = chain.clone();
	solveRandomized3D(solvedChain, {
		target,
		targetOrientation,
		attempts: 6,
		tolerance,
		solver: (chain) => solveFabrik3D(chain, { target, targetOrientation }),
	});
	
	const lerp = 1; //1 - Math.exp(-elapsedTime.seconds * 3);
	chain.lerp(solvedChain, lerp);


	const effector = chain.jointPositions[chain.jointPositions.length - 1]!;
	const error = effector.distanceTo(target);
	
	updateChainMeshes(chain);
	updateTargetMesh(target, targetOrientation, error <= tolerance);
	orbitAngle += elapsedTime.seconds * 0.22;

	renderer.setViewTransform(Matrix4.lookAt({
		eye: Vector3.new(7.4, 4.2, 0).rotateY(orbitAngle),
		target: rootPosition.clone().add(Vector3.new(0, 1.3, 0)),
		up: Vector3.new(0, 1, 0),
	}));

	renderer.clear();
	renderer.drawMesh(gridMesh);
	renderer.drawMesh(constraintGuideMesh);
	renderer.drawMesh(jointAxesMesh);
	renderer.drawMesh(targetAxesMesh);
	renderer.drawMesh(chainLineMesh);
	renderer.drawMesh(jointMesh);
	renderer.drawMesh(targetPointMesh);

	debugText.textContent = dedent`
		target: ${target.toString()}
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

function updateChainMeshes(chain: IKChain3D) {
	const chainBuilder = new VertexBuilder();
	const jointBuilder = new VertexBuilder();

	const jointPositions = chain.jointPositions;

	for (let index = 0; index < jointPositions.length - 1; index++) {
		const start = jointPositions[index]!;
		const end = jointPositions[index + 1]!;

		chainBuilder.append(start, LINE_COLOR(index, jointPositions.length - 1));
		chainBuilder.append(end, LINE_COLOR(index, jointPositions.length - 1));
	}
	
	for (const [index, position] of jointPositions.entries()) {
		jointBuilder.append(position, JOINT_COLOR(index, jointPositions.length));
	}

	const joinAxes = buildJointAxes(jointPositions);
	const constraintGuides = buildConstraintGuides(jointPositions);

	chainLineMesh.geometry.setVertexData(chainBuilder.build());
	chainLineMesh.geometry.setIndexData(incrementingIndices(chainBuilder.builder.length / layout.stride));
	
	jointMesh.geometry.setVertexData(jointBuilder.build());
	jointMesh.geometry.setIndexData(incrementingIndices(jointBuilder.builder.length / layout.stride));
	
	jointAxesMesh.geometry.setVertexData(joinAxes.build());
	jointAxesMesh.geometry.setIndexData(incrementingIndices(joinAxes.builder.length / layout.stride));

	constraintGuideMesh.geometry.setVertexData(constraintGuides.build());
	constraintGuideMesh.geometry.setIndexData(incrementingIndices(constraintGuides.builder.length / layout.stride));
}

function updateTargetMesh(target: Vector3, targetOrientation: Quaternion | undefined, reached: boolean) {
	const TARGET_COLOR = reached ? Color.green : Color.red;
	const X_COLOR = Color.red.scaleAlpha(0.5);
	const Y_COLOR = Color.green.scaleAlpha(0.5);
	const Z_COLOR = Color.blue.scaleAlpha(0.5);
	const markerLength = 1;

	const cross = new VertexBuilder();

	if (targetOrientation) 
		cross
		.append(target.clone().add(Vector3.new(0, 0, 0)), X_COLOR)
		.append(target.clone().add(Vector3.new(markerLength, 0, 0).rotate(targetOrientation)), X_COLOR)
		.append(target.clone().add(Vector3.new(0, 0, 0)), Y_COLOR)
		.append(target.clone().add(Vector3.new(0, markerLength, 0).rotate(targetOrientation)), Y_COLOR)
		.append(target.clone().add(Vector3.new(0, 0, 0)), Z_COLOR)
		.append(target.clone().add(Vector3.new(0, 0, markerLength).rotate(targetOrientation)), Z_COLOR);

	const ball = new VertexBuilder()
		.append(target, TARGET_COLOR);

	targetAxesMesh.geometry.setVertexData(cross.build());
	targetAxesMesh.geometry.setIndexData(incrementingIndices(cross.builder.length / layout.stride));

	targetPointMesh.geometry.setVertexData(ball.build());
	targetPointMesh.geometry.setIndexData(incrementingIndices(ball.builder.length / layout.stride));
}

function buildJointAxes(jointPositions: Vector3[]) {
	const X_COLOR = Color.fromRGBA(255, 104, 104, 170);
	const Y_COLOR = Color.fromRGBA(255, 196, 82, 190);
	const Z_COLOR = Color.fromRGBA(116, 182, 255, 170);
	
	const builder = new VertexBuilder();

	for (let index = 0; index < jointPositions.length; index++) {
		const position = jointPositions[index]!;
		const rotation = jointRotationAt(index);
		const scale = index === jointPositions.length - 1 ? 0.26 : 0.34;
		const worldX = rotation.rotateVector(Vector3.new(1, 0, 0)).multiply(scale);
		const worldY = rotation.rotateVector(Vector3.new(0, 1, 0)).multiply(scale * 1.1);
		const worldZ = rotation.rotateVector(Vector3.new(0, 0, 1)).multiply(scale);

		builder.append(position, X_COLOR);
		builder.append(position.clone().add(worldX), X_COLOR);
		builder.append(position, Y_COLOR);
		builder.append(position.clone().add(worldY), Y_COLOR);
		builder.append(position, Z_COLOR);
		builder.append(position.clone().add(worldZ), Z_COLOR);
	}

	return builder;
}

function buildConstraintGuides(jointPositions: Vector3[]) {
	const builder = new VertexBuilder();

	for (let index = 0; index < chain.segments.length; index++) {
		const segment = chain.segments[index]!;
		const joint = jointPositions[index]!;
		const parentRotation = index === 0 ? chain.rootRotation : chain.segments[index - 1]!.rotation;

		if (segment.constraint instanceof IKSwingTwistConstraint3D) {
			builder.appendBuffer(
				buildSwingTwistGuide(
					joint,
					segment,
					segment.constraint.maxSwing,
					segment.constraint.minTwist,
					segment.constraint.maxTwist,
					segment.constraint.twistOrigin,
					parentRotation,
					jointRotationAt(index + 1)
				).build()
			);
		} else {
			builder.appendBuffer(
				buildHingeGuide(
					joint,
					segment.length,
					segment.constraint.minAngle,
					segment.constraint.maxAngle,
					parentRotation,
					segment.constraint.axis,
					segment.constraint.origin,
				).build()
			);
		}
	}

	return builder;
}

function buildSwingTwistGuide(
	joint: Vector3,
	segment: IKChainSegment3D,
	maxSwingRadians: number,
	minTwistRadians: number,
	maxTwistRadians: number,
	referenceUpLocal: Vector3,
	parentRotation: Quaternion,
	jointRotation: Quaternion,
) {
	const builder = buildCone(joint, segment.length * .3, maxSwingRadians, parentRotation);

	const axisWorld = jointRotation.rotateVector(Vector3.new(0, 1, 0)).normalize() ?? Vector3.new(0, 1, 0);
	const swingDirection = parentRotation.clone().invert()?.rotateVector(axisWorld) ?? Vector3.new(0, 1, 0);
	const swingRotation = Quaternion.fromTo(Vector3.new(0, 1, 0), swingDirection, Vector3.new(1, 0, 0));
	const referenceUp = parentRotation.clone().multiply(swingRotation).rotateVector(referenceUpLocal);
	const ringCenter = joint.clone().add(axisWorld.clone().multiply(segment.length * .8));
	const radius = .2;
	const liveLength = radius * 1.5;
	
	const liveColor = Color.fromRGBA(255, 99, 218, 255);
	const ringColor = liveColor.scaleAlpha(.5);

	for (let step = 0; step < 10; step++) {
		const angleA = minTwistRadians + ((maxTwistRadians - minTwistRadians) * step) / 10;
		const angleB = minTwistRadians + ((maxTwistRadians - minTwistRadians) * (step + 1)) / 10;
		const pointA = ringCenter.clone().add(referenceUp.clone().rotateAround(axisWorld, angleA).multiply(radius));
		const pointB = ringCenter.clone().add(referenceUp.clone().rotateAround(axisWorld, angleB).multiply(radius));
		builder.append(pointA, ringColor);
		builder.append(pointB, ringColor);
	}

	for (const angle of [minTwistRadians, maxTwistRadians]) {
		const spokePoint = ringCenter.clone().add(referenceUp.clone().rotateAround(axisWorld, angle).multiply(radius));
		builder.append(ringCenter, ringColor.scaleAlpha(0.85));
		builder.append(spokePoint, ringColor.scaleAlpha(0.85));
	}

	const constraint = segment.constraint as IKSwingTwistConstraint3D;

	const twist = extractTwistRadians(jointRotation, parentRotation, swingRotation, constraint.twistOrigin, Vector3.new(0, 1, 0));


	const livePoint = ringCenter.clone().add(referenceUp.clone().rotateAround(axisWorld, twist).multiply(liveLength));
	builder.append(ringCenter, liveColor);
	builder.append(livePoint, liveColor);

	return builder;
}

function buildCone(position: Vector3, length: number, radians: number, rotation: Quaternion) {
	const color = Color.fromRGBA(84, 232, 201, 95);

	const forward = IKChain3D.FORWARD.rotate(rotation);
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
	length: number,
	minAngleRadians: number,
	maxAngleRadians: number,
	parentRotation: Quaternion,
	axisLocal: Vector3,
	originLocal: Vector3,
) {
	const arcColor = Color.fromRGBA(121, 184, 255, 130);
	
	const axisWorld = parentRotation.rotateVector(axisLocal).normalize()!;
	const referenceWorld = parentRotation.rotateVector(originLocal).normalize()!;
	const radius = length * 0.3;

	const builder = new VertexBuilder();

	for (let step = 0; step < 18; step++) {
		const angleA = minAngleRadians + ((maxAngleRadians - minAngleRadians) * step) / 18;
		const angleB = minAngleRadians + ((maxAngleRadians - minAngleRadians) * (step + 1)) / 18;
		const pointA = joint.clone().add(referenceWorld.clone().rotateAround(axisWorld, angleA).multiply(radius));
		const pointB = joint.clone().add(referenceWorld.clone().rotateAround(axisWorld, angleB).multiply(radius));
		builder.append(pointA, arcColor);
		builder.append(pointB, arcColor);
	}

	for (const angle of [minAngleRadians, maxAngleRadians]) {
		const spokePoint = joint.clone().add(referenceWorld.clone().rotateAround(axisWorld, angle).multiply(radius));
		builder.append(joint, arcColor);
		builder.append(spokePoint, arcColor);
	}

	return builder;
}

function jointRotationAt(index: number) {
	if (index <= 0) return chain.rootRotation;
	if (index - 1 < chain.segments.length) return chain.segments[index - 1]!.rotation;
	return chain.segments[chain.segments.length - 1]!.rotation;
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
	const vertexCount = ((extent * 2) / step + 1) * 4;

	const builder = new VertexBuilder();
	for (let position = -extent; position <= extent + 0.0001; position += step) {
		const color = Math.abs(position) < 0.0001 ? Color.fromRGBHex(0x6c8cff) : Color.fromRGBA(80, 96, 124, 100);
		builder.append(Vector3.new(-extent, y, position), color);
		builder.append(Vector3.new(extent, y, position), color);
		builder.append(Vector3.new(position, y, -extent), color);
		builder.append(Vector3.new(position, y, extent), color);
	}

	const mesh = createMesh({
		primitiveType: RenderPrimitiveType.Lines,
		vertexCount,
		indices: incrementingIndices(vertexCount),
		material,
	});

	mesh.geometry.setVertexData(builder.build());
	
	return mesh;
}

function incrementingIndices(pointCount: number) {
	const indices = new Uint16Array(pointCount);
	for (let index = 0; index < pointCount; index++) {
		indices[index] = index;
	}
	return indices;
}