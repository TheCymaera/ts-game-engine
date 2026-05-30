import { Duration } from "@open-utilities/core/Duration";
import { IKChain3D, IKChainSegment3D, IKSwingTwistJoint3D, IKHingeJoint3D, IKChainPose3D, IKSwingTwistJointState3D, IKChainWorldNode3D } from "@open-utilities/inverse-kinematics/IKChain3D";
import { IKTarget3D } from "@open-utilities/inverse-kinematics/IKSolver";
import { createDampedLeastSquaresIKSolver3D } from "@open-utilities/inverse-kinematics/createDampedLeastSquaresIKSolver3D";
import { createIKEvaluator3D } from "@open-utilities/inverse-kinematics/ikEvaluator3D";
import { Matrix4 } from "@open-utilities/maths/Matrix4";
import { Quaternion } from "@open-utilities/maths/Quaternion";
import { Random } from "@open-utilities/maths/Random";
import { Vector3 } from "@open-utilities/maths/Vector3";
import { AnimationFrameScheduler } from "@open-utilities/rendering/AnimationFrameScheduler";
import { Color } from "@open-utilities/rendering/Color";
import { buildAxesMesh, buildGridMesh } from "../open-utilities/rendering/debugMeshes.js";
import { buildCuboidBetween, buildCircleArc, buildConeWire, buildUvSphere } from "../open-utilities/rendering/geometryBuilders.js";
import type { GeometryData } from "../open-utilities/rendering/geometryBuilders.js";
import { BufferBuilder, Geometry, GeometryUsage, Material, Mesh, RenderPrimitiveType, ShaderModule, VertexAttributeKind, VertexAttributeLayout, VertexAttributeType, WebGLRenderer, ShaderBuffer, uniforms } from "@open-utilities/rendering/WebGLRenderer";
import { dedent } from "@open-utilities/string/dedent";

const canvas = document.querySelector("canvas")!;

const debugText = document.querySelector("#debug-text") as HTMLElement;
debugText.style.color = "#f7f1da";

const renderer = WebGLRenderer.fromCanvas(canvas);
renderer.gl.clearColor(0.03, 0.04, 0.07, 1);

const passUniforms = {
	uProjection: uniforms.matrix4(Matrix4.identity()),
	uView: uniforms.matrix4(Matrix4.identity()),
};

const chain = IKChain3D.new({
	segments: [
		{ length: 0.80, joint: IKSwingTwistJoint3D.new({ referenceAxis: Vector3.new(0, 0, 1), maxSwing: 0.2 * Math.PI, minTwist: -1 * Math.PI, maxTwist: 1 * Math.PI }) },
		{ length: 1.05, joint: IKHingeJoint3D.new({ axis: Vector3.new(1, 0, 0), reference: Vector3.new(0, 1, 0), minAngle: -0.3 * Math.PI, maxAngle: 0.3 * Math.PI }) },
		{ length: 0.95, joint: IKHingeJoint3D.new({ axis: Vector3.new(1, 0, 0), reference: Vector3.new(0, 1, 0), minAngle: -0.3 * Math.PI, maxAngle: 0.3 * Math.PI }) },
		{ length: 0.80, joint: IKSwingTwistJoint3D.new({ referenceAxis: Vector3.new(0, 0, 1), maxSwing: 0.22 * Math.PI, minTwist: -0.4 * Math.PI, maxTwist: 0.4 * Math.PI }) },
		{ length: 0.65, joint: IKSwingTwistJoint3D.new({ referenceAxis: Vector3.new(0, 0, 1), maxSwing: 0.25 * Math.PI, minTwist: -0.4 * Math.PI, maxTwist: 0.4 * Math.PI }) },
	],
});

const pose = chain.createPose({
	position: Vector3.new(0, 1.2, 0),
	rotation: Quaternion.fromTo(IKChain3D.IDENTITY_VECTOR, Vector3.new(0, 1, 0)),
});

Object.assign(globalThis, { chain, pose });

const totalReach = chain.totalLength;
const targetRadiusMin = totalReach * 0.2;
const targetRadiusMax = totalReach * 0.8;
const targetOrigin = pose.position.clone().add(Vector3.new(0, .7, 0));
const groundTargetsOnly: boolean = false;
const random = Random.default;

const SEGMENT_THICKNESS = 0.05;
const NODE_RADIUS = 0.09;
const TARGET_RADIUS = 0.11;
const GRID_LINE_THICKNESS = 0.01;
const GUIDE_LINE_THICKNESS = 0.01;
const AXIS_LINE_THICKNESS = GUIDE_LINE_THICKNESS;

const tolerance = 0.01;
const evaluator = createIKEvaluator3D({
	tolerance: tolerance
});
const solver = createDampedLeastSquaresIKSolver3D({
	evaluator,
});

//const solver = (chain: IKChain3D, pose: IKChainPose3D, target: IKTarget3D) => {
//	let bestPose = pose.clone();
//	let bestEvaluation = evaluator(chain, bestPose, target);

//	const random = Random.mulberry32(0);

//	for (let pass = 0; pass < 1; pass++) {
//		if (bestEvaluation.isSolved) {
//			break;
//		}

//		const solvedPose = bestPose.clone();
//		if (pass > 0) solvedPose.randomize(chain, random);
		
		
//		childSolver(chain, solvedPose, target);

//		const evaluation = evaluator(chain, solvedPose, target);

//		if (evaluation.score < bestEvaluation.score) {
//			bestPose = solvedPose;
//			bestEvaluation = evaluation;
//		}
//	}

//	pose.copy(bestPose);
//}

const shadedShader = new ShaderModule({
	vertexShader: /*glsl*/`#version 300 es
		uniform mat4 uModel;
		uniform mat4 uModelViewProjection;

		layout(location = 0) in vec3 aPosition;
		layout(location = 1) in vec4 aColor;
		layout(location = 2) in vec3 aNormal;

		out vec4 vColor;
		out vec3 vNormal;

		void main() {
			gl_Position = uModelViewProjection * vec4(aPosition, 1.0);
			vColor = aColor;
			vNormal = mat3(uModel) * aNormal;
		}
	`,
	fragmentShader: /*glsl*/`#version 300 es
		precision mediump float;

		uniform float uAmbient;
		uniform float uDiffuseA;
		uniform float uDiffuseB;

		in vec4 vColor;
		in vec3 vNormal;
		out vec4 outColor;

		void main() {
			vec3 normal = normalize(vNormal);
			vec3 lightA = normalize(vec3(0.5, 0.9, 0.35));
			vec3 lightB = normalize(vec3(-0.35, 0.3, -0.85));
			float diffuseA = max(dot(normal, lightA), 0.0);
			float diffuseB = max(dot(normal, lightB), 0.0);
			float light = uAmbient + (diffuseA * uDiffuseA) + (diffuseB * uDiffuseB);
			outColor = vec4(vColor.rgb * light, vColor.a);
		}
	`,
});

const solidLayout = new VertexAttributeLayout()
	.append("aPosition", 3, VertexAttributeType.Float32)
	.append("aColor", 4, VertexAttributeType.Uint8, { normalized: true, kind: VertexAttributeKind.Float })
	.append("aNormal", 3, VertexAttributeType.Float32);

const shadedMaterial = new Material({
	shader: shadedShader,
	uniforms: {
		uAmbient: uniforms.float(0.3),
		uDiffuseA: uniforms.float(0.7),
		uDiffuseB: uniforms.float(0.2),
	},
});

const unshadedMaterial = new Material({
	shader: shadedShader,
	uniforms: {
		uAmbient: uniforms.float(1),
		uDiffuseA: uniforms.float(0),
		uDiffuseB: uniforms.float(0),
	},
});

function createSolidMesh(geometryData: GeometryData, color: Color, material: Material, usage: GeometryUsage = GeometryUsage.Static) {
	const vertexBuffer = new BufferBuilder();
	for (const vertex of geometryData.vertices) {
		vertexBuffer.appendFloat32(vertex.position.x, vertex.position.y, vertex.position.z);
		vertexBuffer.appendUint8(color.r, color.g, color.b, color.a);
		vertexBuffer.appendFloat32(vertex.normal.x, vertex.normal.y, vertex.normal.z);
	}

	const indices = geometryData.vertices.length > 0xffff
		? new Uint32Array(geometryData.indices)
		: new Uint16Array(geometryData.indices);

	return new Mesh({
		material,
		geometry: new Geometry({
			attributeLayout: solidLayout,
			vertices: new ShaderBuffer(vertexBuffer.build(), usage),
			indices: new ShaderBuffer(indices, usage),
			primitiveType: RenderPrimitiveType.Triangles,
		}),
	});
}

const gridMesh = buildGridMesh({ y: 0, extent: 6, step: 0.5, thickness: GRID_LINE_THICKNESS });
const nodeAxesMesh = buildAxesMesh({ length: 0.3, thickness: AXIS_LINE_THICKNESS });
const targetAxesMesh = buildAxesMesh({ length: 0.5, thickness: AXIS_LINE_THICKNESS });

const boneMeshes = chain.segments.map((segment, index) => {
	const progress = index / chain.segments.length;
	const color = Color.fromRGBHex(0x67d8ef).lerp(Color.fromRGBHex(0xffb34d), progress);

	return createSolidMesh(
		buildCuboidBetween({
			start: Vector3.new(0, 0, 0),
			end: IKChain3D.IDENTITY_VECTOR.multiply(segment.length),
			thickness: SEGMENT_THICKNESS,
			upHint: Vector3.new(0, 1, 0),
		}),
		color,
		shadedMaterial,
	)
});

const nodeMeshes = Array.from({ length: chain.segments.length + 1 }, (_, index) => {
	const progress = index / (chain.segments.length + 1);
	const color = Color.fromRGBHex(0x96f2d7).lerp(Color.fromRGBHex(0xffb86c), progress);
	
	return createSolidMesh(
		buildUvSphere({ radius: NODE_RADIUS }),
		color,
		shadedMaterial,
	)
});
const targetPendingMesh = createSolidMesh(buildUvSphere({ radius: TARGET_RADIUS }), Color.red, shadedMaterial);
const targetReachedMesh = createSolidMesh(buildUvSphere({ radius: TARGET_RADIUS }), Color.green, shadedMaterial);
const hingeGuideMeshes = chain.segments.map(segment => {
	if (!(segment.joint instanceof IKHingeJoint3D)) return undefined;
	return createSolidMesh(
		buildCircleArc({
			center: Vector3.new(0, 0, 0),
			axis: segment.joint.axis,
			forward: segment.joint.reference,
			radius: segment.length * 0.3,
			minAngle: segment.joint.minAngle,
			maxAngle: segment.joint.maxAngle,
			steps: 18,
			thickness: GUIDE_LINE_THICKNESS,
		}),
		Color.fromRGBA(121, 184, 255, 130),
		unshadedMaterial,
	);
});
const twistIndicatorMesh = createSolidMesh(
	buildCuboidBetween({
		start: Vector3.new(0, 0, 0),
		end: IKChain3D.IDENTITY_VECTOR.multiply(0.15),
		thickness: GUIDE_LINE_THICKNESS * 1.2,
		upHint: Vector3.new(0, 1, 0),
	}),
	Color.fromRGBA(255, 99, 218, 255),
	unshadedMaterial,
);
const swingTwistGuideMeshes = chain.segments.map((segment) => {
	if (!(segment.joint instanceof IKSwingTwistJoint3D)) return undefined;
	const twistArc = createSolidMesh(
		buildCircleArc({
			center: Vector3.new(0, segment.length * 0.8, 0),
			axis: IKChain3D.IDENTITY_VECTOR,
			forward: segment.joint.referenceAxis,
			radius: 0.1,
			minAngle: segment.joint.minTwist,
			maxAngle: segment.joint.maxTwist,
			steps: 10,
			thickness: GUIDE_LINE_THICKNESS,
		}),
		Color.fromRGBA(255, 99, 218, 128),
		unshadedMaterial,
	);

	const swingCone = createSolidMesh(
		buildConeWire({
			position: Vector3.new(0, 0, 0),
			length: segment.length * 0.3,
			radians: segment.joint.maxSwing,
			rotation: Quaternion.identity(),
			thickness: GUIDE_LINE_THICKNESS,
			ringSteps: 12,
			spokes: 3,
		}),
		Color.fromRGBA(84, 232, 201, 95),
		unshadedMaterial,
	);

	return { swingCone, twistArc };
});

const RETARGET_INTERVAL = () => Duration.seconds(random.nextFloat(2.2, 4.2));
let retargetTimer = RETARGET_INTERVAL();
let orbitAngle = 0;
let orbitSpeed = 0.22;


function randomTarget(): IKTarget3D {
	const position = randomVectorInRadius(targetRadiusMin, targetRadiusMax).add(targetOrigin);
	if (groundTargetsOnly) position.y = 0;
	const orientation = undefined; //Quaternion.fromAxisAngle(Vector3.new(0, 1, 0), random.nextFloat(0, Math.PI * 2))
	
	return new IKTarget3D(position, orientation);
}

let desiredTarget = randomTarget();
const currentTarget = desiredTarget;

//{
//	retargetTimer = Duration.seconds(Infinity);
//	//orbitSpeed = 0;
//	orbitAngle = Math.PI / 4;

//	desiredTarget = new IKTarget3D(Vector3.new(0, 1.5, 2.0));
//	currentTarget.position.copy(desiredTarget.position);
//}

AnimationFrameScheduler.periodic(({ elapsedTime }) => {
	updateCanvasDimensions();

	retargetTimer = retargetTimer.subtract(elapsedTime);
	if (retargetTimer.milliseconds <= 0) {
		desiredTarget = randomTarget();
		retargetTimer = RETARGET_INTERVAL();
	}

	const targetLerp = 1.5;
	const chainLerp = Infinity;
	//const maxChainRotateDelta = 2;

	currentTarget.lerp(desiredTarget, 1 - Math.exp(-elapsedTime.seconds * targetLerp));
	

	const solvedPose = pose.clone();
	solver(chain, solvedPose, currentTarget);

	pose.lerp(solvedPose, 1 - Math.exp(-elapsedTime.seconds * chainLerp));
	//pose.rotateTowards(solvedPose, maxChainRotateDelta * elapsedTime.seconds);

	const solvedEvaluation = evaluator(chain, pose, currentTarget);
	const evaluation = evaluator(chain, pose, currentTarget);
	const nodes = chain.getWorldNodes(pose);

	const effector = nodes.at(-1)!.position;
	orbitAngle += elapsedTime.seconds * orbitSpeed;

	passUniforms.uView.value = Matrix4.lookAt({
		eye: Vector3.new(7.4, 7.0, 0).rotateY(orbitAngle),
		target: pose.position.clone().add(Vector3.new(0, 1.3, 0)),
		up: Vector3.new(0, 1, 0),
	});

	renderer.beginPass(passUniforms);
	renderer.clear();
	drawMesh(gridMesh);
	drawConstraintGuides(chain, pose, nodes);
	for (const node of nodes) {
		drawMesh(nodeAxesMesh, Matrix4.identity().translate(node.position).rotate(node.worldRotation));
	}
	
	drawBones(nodes);
	drawNodes(nodes);

	drawMesh(evaluation.isSolved ? targetReachedMesh : targetPendingMesh, Matrix4.translation(currentTarget.position));
	if (currentTarget.orientation) {
		drawMesh(targetAxesMesh, Matrix4.identity().translate(currentTarget.position).rotate(currentTarget.orientation));
	}

	debugText.textContent = dedent`
		target: ${currentTarget.position.toString()}
		effector: ${effector.toString()}
		error: ${solvedEvaluation.positionError.toFixed(4)}
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
	passUniforms.uProjection.value = Matrix4.perspective({
		fovy: Math.PI / 3,
		aspectRatio: width / height,
		near: 0.1,
		far: 100,
	});
}

function drawMesh(mesh: Mesh, modelTransform = Matrix4.identity()) {
	renderer.drawMesh(mesh, {
		uModel: uniforms.matrix4(modelTransform),
	});
}

function drawBones(nodes: IKChainWorldNode3D[]) {
	for (let index = 0; index < nodes.length - 1; index++) {
		drawMesh(
			boneMeshes[index]!,
			Matrix4.identity()
				.translate(nodes[index]!.position)
				.rotate(nodes[index + 1]!.worldRotation),
		);
	}
}

function drawNodes(nodes: IKChainWorldNode3D[]) {
	for (let index = 0; index < nodes.length; index++) {
		drawMesh(nodeMeshes[index]!, Matrix4.translation(nodes[index]!.position));
	}
}

function drawConstraintGuides(chain: IKChain3D, pose: IKChainPose3D, joints: IKChainWorldNode3D[]) {
	for (let index = 0; index < chain.segments.length; index++) {
		const segment = chain.segments[index]!;
		const jointPose = pose.segments[index]!;
		const parent = joints[index]!;
		const child = joints[index + 1]!;

		if (segment.joint instanceof IKSwingTwistJoint3D && jointPose instanceof IKSwingTwistJointState3D) {
			drawSwingTwistGuide(
				index,
				parent.position,
				segment,
				parent.worldRotation,
				child.worldRotation,
			);
			continue;
		}

		if (segment.joint instanceof IKHingeJoint3D) {
			drawMesh(
				hingeGuideMeshes[index]!,
				Matrix4.identity()
					.translate(parent.position)
					.rotate(parent.worldRotation),
			);
			continue;
		}

		throw new Error(`Unknown joint type at segment ${index}: ${segment.joint.constructor.name}`);
	}
}

function drawSwingTwistGuide(
	index: number,
	jointPosition: Vector3,
	segment: IKChainSegment3D,
	parentRotation: Quaternion,
	jointRotation: Quaternion,
) {
	const constraint = segment.joint as IKSwingTwistJoint3D;

	const axisWorld = jointRotation.rotateVector(Vector3.new(0, 1, 0)).normalize() ?? Vector3.new(0, 1, 0);
	const swingDirection = parentRotation.clone().invert()?.rotateVector(axisWorld) ?? Vector3.new(0, 1, 0);
	const swingRotation = Quaternion.fromTo(Vector3.new(0, 1, 0), swingDirection, Vector3.new(1, 0, 0));
	const swingBasis = parentRotation.clone().multiply(swingRotation).normalize() ?? parentRotation.clone();
	const ringCenter = jointPosition.clone().add(axisWorld.clone().multiply(segment.length * .8));

	drawMesh(
		swingTwistGuideMeshes[index]!.swingCone,
		Matrix4.identity()
			.translate(jointPosition)
			.rotate(parentRotation),
	);

	drawMesh(
		swingTwistGuideMeshes[index]!.twistArc,
		Matrix4.identity()
			.translate(jointPosition)
			.rotate(swingBasis),
	);
	
	drawMesh(
		twistIndicatorMesh,
		Matrix4.identity()
			.translate(ringCenter)
			.rotate(jointRotation)
			.rotate(Quaternion.fromTo(IKChain3D.IDENTITY_VECTOR, constraint.referenceAxis))
	);
}

function randomVectorInRadius(min: number, max: number) {
	const theta = random.nextFloat(0, Math.PI * 2);
	const vertical = random.nextFloat(-1, 1);
	const horizontal = Math.sqrt(1 - vertical * vertical);
	const length = Math.cbrt(random.nextFloat()) * (max - min) + min;

	return Vector3.new(
		horizontal * Math.cos(theta),
		vertical,
		horizontal * Math.sin(theta),
	).multiply(length);
}