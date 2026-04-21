import { Quaternion } from "@open-utilities/maths/Quaternion.js";
import { Vector3 } from "../maths/Vector3.js";

export interface GeometryDataVertex {
	position: Vector3;
	normal: Vector3;
}

export class GeometryData {
	vertices: GeometryDataVertex[] = [];
	indices: number[] = [];

	append(data: GeometryData) {
		const indexOffset = this.vertices.length;

		this.vertices.push(...data.vertices);
		this.indices.push(...data.indices.map(index => index + indexOffset));
	}

	appendQuad(options: {
		a: GeometryDataVertex;
		b: GeometryDataVertex;
		c: GeometryDataVertex;
		d: GeometryDataVertex;
	}) {
		this.appendTriangle({
			a: options.a,
			b: options.b,
			c: options.c,
		});
		this.appendTriangle({
			a: options.a,
			b: options.c,
			c: options.d,
		});
	}

	appendTriangle(options: {
		a: GeometryDataVertex;
		b: GeometryDataVertex;
		c: GeometryDataVertex;
	}) {
		const indexA = this.appendVertex(options.a);
		const indexB = this.appendVertex(options.b);
		const indexC = this.appendVertex(options.c);
		this.indices.push(indexA, indexB, indexC);
	}

	appendFlatQuad(options: {
		a: Vector3;
		b: Vector3;
		c: Vector3;
		d: Vector3;
		normalHint?: Vector3;
	}) {
		const faceNormal = options.b.clone()
			.subtract(options.a)
			.cross(options.c.clone().subtract(options.a))
			.normalize() ?? options.normalHint?.clone().normalize() ?? Vector3.new(0, 1, 0);

		const normal = options.normalHint?.clone().normalize() ?? faceNormal;
		this.appendQuad({
			a: { position: options.a, normal },
			b: { position: options.b, normal },
			c: { position: options.c, normal },
			d: { position: options.d, normal },
		});
	}

	appendVertex(vertex: GeometryDataVertex) {
		this.vertices.push(vertex);
		return this.vertices.length - 1;
	}
}

export function buildUvSphere(options: {
	readonly center?: Vector3;
	readonly radius: number;
	readonly latitudeSteps?: number;
	readonly longitudeSteps?: number;
}): GeometryData {
	const center = options.center?.clone() ?? Vector3.new(0, 0, 0);
	const latitudeSteps = options.latitudeSteps ?? 9;
	const longitudeSteps = options.longitudeSteps ?? 14;
	const geometryData = new GeometryData();

	for (let latitude = 0; latitude < latitudeSteps; latitude++) {
		const thetaA = (latitude / latitudeSteps) * Math.PI;
		const thetaB = ((latitude + 1) / latitudeSteps) * Math.PI;

		for (let longitude = 0; longitude < longitudeSteps; longitude++) {
			const phiA = (longitude / longitudeSteps) * Math.PI * 2;
			const phiB = ((longitude + 1) / longitudeSteps) * Math.PI * 2;

			const normalA = sphereNormal(thetaA, phiA);
			const normalB = sphereNormal(thetaA, phiB);
			const normalC = sphereNormal(thetaB, phiB);
			const normalD = sphereNormal(thetaB, phiA);

			const positionA = center.clone().add(normalA.clone().multiply(options.radius));
			const positionB = center.clone().add(normalB.clone().multiply(options.radius));
			const positionC = center.clone().add(normalC.clone().multiply(options.radius));
			const positionD = center.clone().add(normalD.clone().multiply(options.radius));

			const a = { position: positionA, normal: normalA };
			const b = { position: positionB, normal: normalB };
			const c = { position: positionC, normal: normalC };
			const d = { position: positionD, normal: normalD };

			if (latitude === 0) {
				geometryData.appendTriangle({ a, b: c, c: d });
				continue;
			}

			if (latitude === latitudeSteps - 1) {
				geometryData.appendTriangle({ a, b, c });
				continue;
			}

			geometryData.appendQuad({ a, b, c, d });
		}
	}

	return geometryData;
}

export function buildIcosphere(options: {
	readonly center?: Vector3;
	readonly radius: number;
	readonly subdivisions?: number;
}): GeometryData {
	function getOrCreateMidpoint(
		normals: Vector3[],
		cache: Map<string, number>,
		indexA: number,
		indexB: number,
	) {
		const key = indexA < indexB ? `${indexA}:${indexB}` : `${indexB}:${indexA}`;
		const cached = cache.get(key);
		if (cached !== undefined) return cached;

		const midpoint = normals[indexA]!.clone().add(normals[indexB]!).normalize() ?? Vector3.new(0, 1, 0);
		const index = normals.push(midpoint) - 1;
		cache.set(key, index);
		return index;
	}

	const center = options.center?.clone() ?? Vector3.new(0, 0, 0);
	const subdivisions = options.subdivisions ?? 0;
	const t = (1 + Math.sqrt(5)) * 0.5;
	const normals = [
		Vector3.new(-1, t, 0),
		Vector3.new(1, t, 0),
		Vector3.new(-1, -t, 0),
		Vector3.new(1, -t, 0),
		Vector3.new(0, -1, t),
		Vector3.new(0, 1, t),
		Vector3.new(0, -1, -t),
		Vector3.new(0, 1, -t),
		Vector3.new(t, 0, -1),
		Vector3.new(t, 0, 1),
		Vector3.new(-t, 0, -1),
		Vector3.new(-t, 0, 1),
	].map(normal => normal.normalize() ?? Vector3.new(0, 1, 0));

	let faces = [
		[0, 11, 5],
		[0, 5, 1],
		[0, 1, 7],
		[0, 7, 10],
		[0, 10, 11],
		[1, 5, 9],
		[5, 11, 4],
		[11, 10, 2],
		[10, 7, 6],
		[7, 1, 8],
		[3, 9, 4],
		[3, 4, 2],
		[3, 2, 6],
		[3, 6, 8],
		[3, 8, 9],
		[4, 9, 5],
		[2, 4, 11],
		[6, 2, 10],
		[8, 6, 7],
		[9, 8, 1],
	] as [number, number, number][];

	for (let subdivision = 0; subdivision < subdivisions; subdivision++) {
		const midpointCache = new Map<string, number>();
		const nextFaces: [number, number, number][] = [];

		for (const [indexA, indexB, indexC] of faces) {
			const indexAB = getOrCreateMidpoint(normals, midpointCache, indexA, indexB);
			const indexBC = getOrCreateMidpoint(normals, midpointCache, indexB, indexC);
			const indexCA = getOrCreateMidpoint(normals, midpointCache, indexC, indexA);

			nextFaces.push(
				[indexA, indexAB, indexCA],
				[indexB, indexBC, indexAB],
				[indexC, indexCA, indexBC],
				[indexAB, indexBC, indexCA],
			);
		}

		faces = nextFaces;
	}

	const vertices = normals.map(normal => ({
		position: center.clone().add(normal.clone().multiply(options.radius)),
		normal: normal.clone(),
	}));
	const flatIndices = faces.flat();

	//return {
	//	vertices,
	//	indices: flatIndices,
	//};

	const geometryData = new GeometryData();
	geometryData.vertices.push(...vertices);
	geometryData.indices.push(...flatIndices);

	return geometryData;
}

function buildOrientedCuboid(options: {
	readonly center: Vector3;
	readonly right: Vector3;
	readonly up: Vector3;
	readonly forward: Vector3;
}): GeometryData {
	const geometryData = new GeometryData();
	const { center, right, up, forward } = options;
	const backBottomLeft = center.clone().subtract(right).subtract(up).subtract(forward);
	const backBottomRight = center.clone().add(right).subtract(up).subtract(forward);
	const backTopLeft = center.clone().subtract(right).add(up).subtract(forward);
	const backTopRight = center.clone().add(right).add(up).subtract(forward);
	const frontBottomLeft = center.clone().subtract(right).subtract(up).add(forward);
	const frontBottomRight = center.clone().add(right).subtract(up).add(forward);
	const frontTopLeft = center.clone().subtract(right).add(up).add(forward);
	const frontTopRight = center.clone().add(right).add(up).add(forward);

	geometryData.appendFlatQuad({ a: frontBottomLeft, b: frontBottomRight, c: frontTopRight, d: frontTopLeft, normalHint: forward });
	geometryData.appendFlatQuad({ a: backBottomRight, b: backBottomLeft, c: backTopLeft, d: backTopRight, normalHint: forward.clone().multiply(-1) });
	geometryData.appendFlatQuad({ a: backBottomLeft, b: frontBottomLeft, c: frontTopLeft, d: backTopLeft, normalHint: right.clone().multiply(-1) });
	geometryData.appendFlatQuad({ a: frontBottomRight, b: backBottomRight, c: backTopRight, d: frontTopRight, normalHint: right });
	geometryData.appendFlatQuad({ a: backTopLeft, b: frontTopLeft, c: frontTopRight, d: backTopRight, normalHint: up });
	geometryData.appendFlatQuad({ a: backBottomRight, b: frontBottomRight, c: frontBottomLeft, d: backBottomLeft, normalHint: up.clone().multiply(-1) });

	return geometryData;
}

export function buildCuboidBetween(options: {
	readonly start: Vector3;
	readonly end: Vector3;
	readonly thickness: number;
	readonly upHint?: Vector3;
}): GeometryData {
	const delta = options.end.clone().subtract(options.start);
	const length = delta.length();
	if (length <= 0.000001) return new GeometryData();

	const forwardDirection = delta.clone().divide(length);
	let right = forwardDirection.clone().cross(options.upHint ?? Vector3.new(0, 1, 0)).normalize();
	if (!right) {
		right = forwardDirection.clone().orthogonal().normalize() ?? Vector3.new(1, 0, 0);
	}

	const up = right.clone().cross(forwardDirection).normalize() ?? Vector3.new(0, 1, 0);
	const halfThickness = options.thickness / 2;
	const center = options.start.clone().add(options.end).divide(2);

	return buildOrientedCuboid({
		center,
		right: right.multiply(halfThickness),
		up: up.multiply(halfThickness),
		forward: forwardDirection.multiply(length / 2),
	});
}



export function buildCircleArc(options: {
	readonly center: Vector3;
	readonly axis: Vector3;
	readonly forward: Vector3;
	readonly radius: number;
	readonly minAngle: number;
	readonly maxAngle: number;
	readonly steps: number;
	readonly thickness: number;
}): GeometryData {
	const geometryData = buildCircleArcCurve(options);
	geometryData.append(buildCircleArcSpokes(options));
	return geometryData;
}

function buildCircleArcCurve(options: {
	readonly center: Vector3;
	readonly axis: Vector3;
	readonly forward: Vector3;
	readonly radius: number;
	readonly minAngle: number;
	readonly maxAngle: number;
	readonly steps: number;
	readonly thickness: number;
}): GeometryData {
	const geometryData = new GeometryData();

	for (let step = 0; step < options.steps; step++) {
		const angleA = options.minAngle + ((options.maxAngle - options.minAngle) * step) / options.steps;
		const angleB = options.minAngle + ((options.maxAngle - options.minAngle) * (step + 1)) / options.steps;
		const pointA = options.center.clone().add(options.forward.clone().rotateAround(options.axis, angleA).multiply(options.radius));
		const pointB = options.center.clone().add(options.forward.clone().rotateAround(options.axis, angleB).multiply(options.radius));
		geometryData.append(buildCuboidBetween({ start: pointA, end: pointB, thickness: options.thickness, upHint: options.axis }));
	}
	return geometryData;
}

export function buildConeWire(options: {
	readonly position: Vector3;
	readonly length: number;
	readonly radians: number;
	readonly rotation: Quaternion;
	readonly thickness: number;
	readonly spokes: number;
	readonly ringSteps: number;
}): GeometryData {
	const forward = Vector3.new(0, 1, 0).rotate(options.rotation);
	const up = Vector3.new(0, 1, 0).orthogonal().rotate(options.rotation);
	const right = forward.clone().cross(up);

	const rimRadius = Math.sin(options.radians) * options.length;
	const rimCenter = options.position.clone().add(forward.clone().multiply(Math.cos(options.radians) * options.length));

	const geometryData = buildCircleArcCurve({
		center: rimCenter,
		axis: forward,
		forward: right,
		radius: rimRadius,
		minAngle: 0,
		maxAngle: Math.PI * 2,
		steps: options.ringSteps,
		thickness: options.thickness,
	});

	for (let step = 0; step < options.spokes; step++) {
		const azimuth = (step / options.spokes) * Math.PI * 2;
		const rimPoint = rimCenter.clone()
			.add(right.clone().multiply(Math.cos(azimuth) * rimRadius))
			.add(up.clone().multiply(Math.sin(azimuth) * rimRadius));
		geometryData.append(buildCuboidBetween({ start: options.position, end: rimPoint, thickness: options.thickness, upHint: forward }));
	}

	return geometryData;
}

function buildCircleArcSpokes(options: {
	readonly center: Vector3;
	readonly axis: Vector3;
	readonly forward: Vector3;
	readonly radius: number;
	readonly minAngle: number;
	readonly maxAngle: number;
	readonly thickness: number;
}): GeometryData {
	const geometryData = new GeometryData();
	for (const angle of [options.minAngle, options.maxAngle]) {
		const spokePoint = options.center.clone().add(options.forward.clone().rotateAround(options.axis, angle).multiply(options.radius));
		geometryData.append(buildCuboidBetween({ start: options.center, end: spokePoint, thickness: options.thickness, upHint: options.axis }));
	}
	return geometryData;
}

function sphereNormal(theta: number, phi: number) {
	const horizontal = Math.sin(theta);
	return Vector3.new(
		horizontal * Math.cos(phi),
		Math.cos(theta),
		horizontal * Math.sin(phi),
	).normalize() ?? Vector3.new(0, 1, 0);
}