import { Circle } from "@open-utilities/maths/Circle";
import { Capsule2D } from "@open-utilities/maths/Capsule2D";
import { Polygon } from "@open-utilities/maths/Polygon";
import type { Rect } from "@open-utilities/maths/Rect";
import { Vector2 } from "@open-utilities/maths/Vector2";
import type { Collider2DShape, CollisionResult } from "./combined";

export function polygonVsPolygonDiscrete(polygonA: Polygon, polygonB: Polygon): CollisionResult | undefined {
	const axes = [...polygonAxes(polygonA), ...polygonAxes(polygonB)];
	return testAxes(axes, polygonA, polygonB, projectPolygon, projectPolygon);
}

export function circleVsPolygonDiscrete(circle: Circle, polygon: Polygon): CollisionResult | undefined {
	// Test all polygon edge normals
	const axes = polygonAxes(polygon);

	// Test the axis from closest polygon vertex/edge to circle center
	const closestPoint = polygon.closestPointOnEdge(circle.center);
	const circleToClosest = circle.center.clone().subtract(closestPoint);
	const distanceToClosest = circleToClosest.length();

	// If the closest point is inside the circle, we need to test this axis
	if (distanceToClosest > 0) axes.push(circleToClosest.normalize()!);

	// Test axes
	return testAxes(axes, circle, polygon, projectCircle, projectPolygon);
}

export function aabbVsPolygonDiscrete(rect: Rect, polygon: Polygon): CollisionResult | undefined {
	const axes = polygonAxes(polygon);
	axes.push(Vector2.new(1, 0), Vector2.new(0, 1));

	return testAxes(axes, rect, polygon, projectRect, projectPolygon);
}

export function capsuleVsPolygonDiscrete(capsule: Capsule2D, polygon: Polygon): CollisionResult | undefined {
	const axes = polygonAxes(polygon);
	const capsuleNormal = capsule.axis().perpendicular().normalize();
	if (capsuleNormal) axes.push(capsuleNormal);

	for (const point of [capsule.point1, capsule.point2]) {
		const axis = point.clone().subtract(polygon.closestPointOnEdge(point)).normalize();
		if (axis) axes.push(axis);
	}

	return testAxes(axes, capsule, polygon, projectCapsule, projectPolygon);
}

export function capsuleVsAabbDiscrete(capsule: Capsule2D, rect: Rect): CollisionResult | undefined {
	const axes = [Vector2.new(1, 0), Vector2.new(0, 1)];
	const capsuleNormal = capsule.axis().perpendicular().normalize();
	if (capsuleNormal) axes.push(capsuleNormal);

	for (const point of [capsule.point1, capsule.point2]) {
		const axis = point.clone().subtract(rect.closestPoint(point)).normalize();
		if (axis) axes.push(axis);
	}

	return testAxes(axes, capsule, rect, projectCapsule, projectRect);
}

function polygonAxes(polygon: Polygon): Vector2[] {
	return polygon.edgeNormals();
	//if (polygon["$axesCache"]) return polygon["$axesCache"];
	//let axes = polygon.edgeNormals();

	//if (axes.length === 4) {
	//	const dot1 = axes[0]!.dot(axes[2]!);
	//	const dot2 = axes[1]!.dot(axes[3]!);
	//	if (almostEqual(dot1, -1) && almostEqual(dot2, -1)) {
	//		axes = [axes[0]!, axes[1]!];
	//	}
	//}

	//polygon["$axesCache"] = axes;

	//return axes;
}

interface ProjectionResult {
	min: number;
	max: number;
}

function testAxes<A extends Collider2DShape, B extends Collider2DShape>(
	axes: Vector2[], 
	shapeA: A, 
	shapeB: B, 
	projectA: (shape: A, axis: Vector2) => ProjectionResult, 
	projectB: (shape: B, axis: Vector2) => ProjectionResult,
) {
	let minOverlap = Infinity;
	let collisionAxis = Vector2.new(0, 0);

	for (const axis of axes) {
		const projA = projectA(shapeA, axis);
		const projB = projectB(shapeB, axis);

		if (projA.max < projB.min || projB.max < projA.min) return undefined;
		
		const overlap = Math.min(projA.max - projB.min, projB.max - projA.min);

		if (overlap < minOverlap) {
			minOverlap = overlap;
			collisionAxis = axis.clone();
		}
	}

	// Ensure the normal points from a to b
	const centerA = shapeCenter(shapeA);
	const centerB = shapeCenter(shapeB);

	const direction = centerB.subtract(centerA);
	if (direction.dot(collisionAxis) < 0) collisionAxis.multiply(-1);

	const penetration = collisionAxis.clone().multiply(minOverlap);
	const normal = collisionAxis.normalize() || Vector2.new(0, 0);

	return { penetration, normal };
}

function projectCircle(circle: Circle, axis: Vector2): { min: number; max: number } {
	const projection = circle.center.dot(axis);
	return {
		min: projection - circle.radius,
		max: projection + circle.radius
	};
}

function projectCapsule(capsule: Capsule2D, axis: Vector2): { min: number; max: number } {
	const projection1 = capsule.point1.dot(axis);
	const projection2 = capsule.point2.dot(axis);
	const min = Math.min(projection1, projection2);
	const max = Math.max(projection1, projection2);
	return {
		min: min - capsule.radius,
		max: max + capsule.radius,
	};
}

function projectPolygon(polygon: Polygon, axis: Vector2): { min: number; max: number } {
	let min = Infinity;
	let max = -Infinity;

	for (const vertex of polygon.vertices) {
		const dot = vertex.dot(axis);
		min = Math.min(min, dot);
		max = Math.max(max, dot);
	}

	return { min, max };
}

function projectRect(rect: Rect, axis: Vector2): { min: number; max: number } {
	let min = Infinity;
	let max = -Infinity;

	for (const vertex of rect.vertices()) {
		const dot = vertex.dot(axis);
		min = Math.min(min, dot);
		max = Math.max(max, dot);
	}

	return { min, max };
}

function shapeCenter(shape: Collider2DShape) {
	if (shape instanceof Circle) return shape.center.clone();
	return shape.center();
}