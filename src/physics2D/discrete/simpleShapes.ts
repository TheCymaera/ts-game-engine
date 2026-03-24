import type { Circle } from "@open-utilities/maths/Circle";
import { Capsule2D } from "@open-utilities/maths/Capsule2D";
import { Rect } from "@open-utilities/maths/Rect";
import { Vector2 } from "@open-utilities/maths/Vector2";
import { type CollisionResult } from "./combined";

export function aabbVsAabbDiscrete(rectA: Rect, rectB: Rect): CollisionResult | undefined {
	const diff = minkowskiDifference(rectA, rectB);

	if (!diff.containsPointExclusive(Vector2.zero())) return undefined;

	const penetration = minkowskiPenetrationVector(diff);

	return { penetration, normal: penetration.clone().normalize()! };
}

export function circleVsCircleDiscrete(circleA: Circle, circleB: Circle): CollisionResult | undefined {
	const distance = circleA.center.distance(circleB.center);
	const radiusSum = circleA.radius + circleB.radius;

	if (distance >= radiusSum) return undefined;

	const penetration = radiusSum - distance;
	const normal = circleB.center.clone().subtract(circleA.center).normalize()!;
	return { penetration: normal.clone().multiply(penetration), normal: normal };
}

export function aabbVsCircleDiscrete(circle: Circle, rect: Rect): CollisionResult | undefined {
	const closest = rect.closestPoint(circle.center);
	const toClosest = closest.clone().subtract(circle.center);

	const distanceSquared = toClosest.lengthSquared();
	const radius = circle.radius;

	// Outside
	if (distanceSquared >= radius * radius) return undefined;

	if (!rect.containsPointExclusive(circle.center)) {
		// normalize
		const distance = Math.sqrt(distanceSquared) || 1e-16;
		const normal = toClosest.clone().divide(distance);
		
		const penetrationMagnitude = radius - distance;
		return { penetration: normal.clone().multiply(penetrationMagnitude), normal };
	}

	// Circle center is inside the rect. Push towards the nearest face.
	const left = circle.center.x - rect.minX;
	const right = rect.maxX - circle.center.x;
	const top = circle.center.y - rect.minY;
	const bottom = rect.maxY - circle.center.y;

	let penetration: Vector2;
	let normal: Vector2;
	if (left <= right && left <= top && left <= bottom) {
		penetration = Vector2.new(left + radius, 0);
		normal = Vector2.new(1, 0);
	} else if (right <= top && right <= bottom) {
		penetration = Vector2.new(-(right + radius), 0);
		normal = Vector2.new(-1, 0);
	} else if (top <= bottom) {
		penetration = Vector2.new(0, top + radius);
		normal = Vector2.new(0, 1);
	} else {
		penetration = Vector2.new(0, -(bottom + radius));
		normal = Vector2.new(0, -1);
	}

	return { penetration, normal };
}

export function capsuleVsCircleDiscrete(capsule: Capsule2D, circle: Circle): CollisionResult | undefined {
	const closest = capsule.line().closestPoint(circle.center);
	const offset = circle.center.clone().subtract(closest);
	const distance = offset.length();
	const radiusSum = capsule.radius + circle.radius;

	if (distance >= radiusSum) return undefined;

	const normal = offset.normalize() ?? circle.center.clone().subtract(capsule.center()).normalize() ?? capsule.axis().perpendicular().normalize() ?? Vector2.new(1, 0);
	return {
		penetration: normal.clone().multiply(radiusSum - distance),
		normal,
	};
}

export function capsuleVsCapsuleDiscrete(capsuleA: Capsule2D, capsuleB: Capsule2D): CollisionResult | undefined {
	const pair = capsuleA.line().shortestLineBetween(capsuleB.line());
	const delta = pair.point2.clone().subtract(pair.point1);
	const distance = delta.length();
	const radiusSum = capsuleA.radius + capsuleB.radius;

	if (distance >= radiusSum) return undefined;

	const normal = delta.normalize() ?? capsuleB.center().subtract(capsuleA.center()).normalize() ?? capsuleA.axis().perpendicular().normalize() ?? Vector2.new(1, 0);
	return {
		penetration: normal.clone().multiply(radiusSum - distance),
		normal,
	};
	}

function minkowskiDifference(main: Rect, other: Rect) {
	const min = main.min.clone().subtract(other.max);
	const max = main.max.clone().subtract(other.min);
	return Rect.fromCorners(min.x, min.y, max.x, max.y);
}

function minkowskiPenetrationVector(minkowskiDifference: Rect) {
	const min = minkowskiDifference.min;
	const max = minkowskiDifference.max;

	let minDist = Math.abs(min.x);
	const out = Vector2.new(min.x, 0);

	if (Math.abs(max.x) < minDist) {
		minDist = Math.abs(max.x);
		out.x = max.x;
	}

	if (Math.abs(min.y) < minDist) {
		minDist = Math.abs(min.y);
		out.x = 0;
		out.y = min.y;
	}

	if (Math.abs(max.y) < minDist) {
		out.x = 0;
		out.y = max.y;
	}

	return out;
}