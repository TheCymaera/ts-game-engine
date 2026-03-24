import { Circle } from "@open-utilities/maths/Circle";
import { LineSegment } from "@open-utilities/maths/LineSegment";
import { Capsule2D } from "@open-utilities/maths/Capsule2D";
import { almostEqual } from "@open-utilities/maths/almostEqual";
import { Polygon } from "@open-utilities/maths/Polygon";
import { Rect } from "@open-utilities/maths/Rect";
import { Vector2 } from "@open-utilities/maths/Vector2";
import { assertNever } from "@open-utilities/types/assertNever";
import type { Collider2DShape } from "../discrete/combined";

export function colliderContactPoints(colliderA: Collider2DShape, colliderB: Collider2DShape): Vector2[] {
	if (colliderA instanceof Circle) return circleContactPoints(colliderA, colliderB);
	if (colliderA instanceof Capsule2D) return capsuleContactPoints(colliderA, colliderB);
	if (colliderA instanceof Polygon) return polygonContactPoints(colliderA, colliderB);
	if (colliderA instanceof Rect) return rectContactPoints(colliderA, colliderB);
	assertNever(colliderA);
}

export function circleContactPoints(circle: Circle, collider: Collider2DShape): Vector2[] {
	if (collider instanceof Circle) return [circleVsCircleContactPoint(circle, collider)];
	if (collider instanceof Capsule2D) return [collider.closestPoint(circle.center)];
	if (collider instanceof Polygon) return [collider.closestPointOnEdge(circle.center)];
	if (collider instanceof Rect) return [collider.closestPoint(circle.center)];
	assertNever(collider);
}

export function capsuleContactPoints(capsule: Capsule2D, collider: Collider2DShape): Vector2[] {
	if (collider instanceof Circle) return [capsule.closestPoint(collider.center)];
	if (collider instanceof Capsule2D) return [capsuleVsCapsuleContactPoint(capsule, collider)];
	if (collider instanceof Polygon) return [capsuleVsEdgesContactPoint(capsule, collider.edges())];
	if (collider instanceof Rect) return [capsuleVsEdgesContactPoint(capsule, rectLineSegments(collider))];
	assertNever(collider);
}

export function polygonContactPoints(polygon: Polygon, collider: Collider2DShape): Vector2[] {
	if (collider instanceof Circle) return [polygon.closestPointOnEdge(collider.center)];
	if (collider instanceof Capsule2D) return [capsuleVsEdgesContactPoint(collider, polygon.edges())];
	if (collider instanceof Polygon) return polygonVsPolygonContactPoints(polygon, collider);
	if (collider instanceof Rect) return rectVsPolygonContactPoints(collider, polygon);
	assertNever(collider);
}

export function rectContactPoints(rect: Rect, collider: Collider2DShape): Vector2[] {
	if (collider instanceof Circle) return [rect.closestPoint(collider.center)];
	if (collider instanceof Capsule2D) return [capsuleVsEdgesContactPoint(collider, rectLineSegments(rect))];
	if (collider instanceof Polygon) return rectVsPolygonContactPoints(rect, collider);
	if (collider instanceof Rect) return rectVsRectContactPoints(rect, collider);
	assertNever(collider);
}

function circleVsCircleContactPoint(bodyA: Circle, bodyB: Circle): Vector2 {
	const diff = bodyB.center.clone().subtract(bodyA.center);
	const direction = diff.clone().normalize()! ?? Vector2.new(1, 0);
	const contactPoint = bodyA.center.clone().add(direction.multiply(bodyA.radius));
	return contactPoint;
}

function polygonVsPolygonContactPoints(polygonA: Polygon, polygonB: Polygon): Vector2[] {
	return getContactPoints([
		...polygonA.vertices.map(v => [v, polygonB.edges()] as const),
		...polygonB.vertices.map(v => [v, polygonA.edges()] as const),
	]);
}

function rectVsRectContactPoints(rectA: Rect, rectB: Rect): Vector2[] {
	return getContactPoints([
		...rectA.vertices().map(v => [v, rectEdges(rectB)] as const),
		...rectB.vertices().map(v => [v, rectEdges(rectA)] as const),
	]);
}

function rectVsPolygonContactPoints(rect: Rect, polygon: Polygon): Vector2[] {
	return getContactPoints([
		...rect.vertices().map(v => [v, polygon.edges()] as const),
		...polygon.vertices.map(v => [v, rectEdges(rect)] as const),
	]);
}

function capsuleVsCapsuleContactPoint(capsuleA: Capsule2D, capsuleB: Capsule2D): Vector2 {
	const pair = capsuleA.line().shortestLineBetween(capsuleB.line());
	const normal = pair.point2.clone().subtract(pair.point1).normalize()
		?? capsuleB.center().subtract(capsuleA.center()).normalize()
		?? capsuleA.axis().perpendicular().normalize()
		?? Vector2.new(1, 0);
	return pair.point1.add(normal.multiply(capsuleA.radius));
}

function capsuleVsEdgesContactPoint(capsule: Capsule2D, edges: LineSegment[]): Vector2 {
	let minDistance = Infinity;
	let out = capsule.point1.clone();
	const segment = capsule.line();

	for (const edge of edges) {
		const pair = segment.shortestLineBetween(edge);
		const distance = pair.point1.distanceSquared(pair.point2);
		if (distance < minDistance) {
			minDistance = distance;
			out = pair.point2;
		}
	}

	return out;
}

function rectLineSegments(rect: Rect): LineSegment[] {
	const [topLeft, topRight, bottomRight, bottomLeft] = rect.vertices();
	return [
		LineSegment.fromPoints(topLeft!, topRight!),
		LineSegment.fromPoints(topRight!, bottomRight!),
		LineSegment.fromPoints(bottomRight!, bottomLeft!),
		LineSegment.fromPoints(bottomLeft!, topLeft!),
	];
}

type LineSegmentLike = LineSegment | VerticalLineSegment | HorizontalLineSegment;

function getContactPoints(vertices: (readonly [Vector2, LineSegmentLike[]])[]): Vector2[] {
	let min = Infinity;
	const contactPoints: Vector2[] = [];

	for (const [vertex, edges] of vertices) {
		for (const edge of edges) {
			const closest = edge.closestPoint(vertex);
			const distance = vertex.distanceSquared(closest);
			
			if (distance < min) {
				min = distance;
				contactPoints.length = 0;
			}
				
			if (almostEqual(distance, min)) {
				contactPoints.push(closest);
			}
		}
	}

	return contactPoints;
}

function rectEdges(rect: Rect) {
	return [
		new HorizontalLineSegment(rect.min.y, rect.min.x, rect.max.x),
		new VerticalLineSegment(rect.max.x, rect.min.y, rect.max.y),
		new HorizontalLineSegment(rect.max.y, rect.min.x, rect.max.x),
		new VerticalLineSegment(rect.min.x, rect.min.y, rect.max.y),
	];
}

class VerticalLineSegment {
	constructor(public x: number, public y1: number, public y2: number) {}

	closestPoint(point: Vector2): Vector2 {
		const clampedY = Math.max(this.y1, Math.min(this.y2, point.y));
		return Vector2.new(this.x, clampedY);
	}
}

class HorizontalLineSegment {
	constructor(public y: number, public x1: number, public x2: number) {}

	closestPoint(point: Vector2): Vector2 {
		const clampedX = Math.max(this.x1, Math.min(this.x2, point.x));
		return Vector2.new(clampedX, this.y);
	}
}
