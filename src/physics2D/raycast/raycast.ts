import { Circle } from "@open-utilities/maths/Circle";
import { minBy } from "@open-utilities/maths/minBy";
import { Capsule2D } from "@open-utilities/maths/Capsule2D";
import type { Polygon } from "@open-utilities/maths/Polygon";
import type { Rect } from "@open-utilities/maths/Rect";
import { Vector2 } from "@open-utilities/maths/Vector2";

export interface RaycastResult {
	origin: Vector2;
	ray: Vector2;
	contactPoint: Vector2;
	normal: Vector2;
	time: number;
}


export function raycastAabb(origin: Vector2, ray: Vector2, rect: Rect): RaycastResult | undefined {
	if (ray.x === 0 && ray.y === 0) return undefined;

	const invDirection = Vector2.new(1 / ray.x, 1 / ray.y);

	const tNear = rect.min.clone().subtract(origin).multiplyVector(invDirection);
	const tFar = rect.max.clone().subtract(origin).multiplyVector(invDirection);

	if (isNaN(tFar.y) || isNaN(tFar.x)) return undefined;
	if (isNaN(tNear.y) || isNaN(tNear.x)) return undefined;

	if (tNear.x > tFar.x) [tNear.x, tFar.x] = [tFar.x, tNear.x];
	if (tNear.y > tFar.y) [tNear.y, tFar.y] = [tFar.y, tNear.y];

	if (tNear.x > tFar.y || tNear.y > tFar.x) return undefined;

	const tHitNear = Math.max(tNear.x, tNear.y);

	const tHitFar = Math.min(tFar.x, tFar.y);

	if (tHitFar < 0) return undefined;

	const contactPoint = origin.clone().add(ray.clone().multiply(tHitNear))
	
	let contactNormal = Vector2.new(0, 0);
	if (tNear.x > tNear.y) {
		if (invDirection.x < 0) contactNormal = Vector2.new(1, 0);
		else contactNormal = Vector2.new(-1, 0);
	} else if (tNear.x < tNear.y) {
		if (invDirection.y < 0) contactNormal = Vector2.new(0, 1);
		else contactNormal = Vector2.new(0, -1);
	}

	return { origin, ray, contactPoint, normal: contactNormal, time: tHitNear };
}

export function raycastCircle(origin: Vector2, ray: Vector2, circle: Circle): RaycastResult | undefined {
	// Vector from ray origin to circle center
	const toCircle = circle.center.clone().subtract(origin);
	
	// Project toCircle onto ray direction to find closest point on ray to circle center
	const rayLength = ray.length();
	if (rayLength === 0) return undefined;
	
	const rayDir = ray.clone().normalize()!;
	const projectionLength = toCircle.dot(rayDir);
	
	// Find closest point on ray to circle center
	const closestPoint = origin.clone().add(rayDir.clone().multiply(projectionLength));
	
	// Distance from circle center to closest point on ray
	const distanceToRay = circle.center.distance(closestPoint);
	
	// If distance is greater than radius, no collision
	if (distanceToRay > circle.radius) return undefined;
	
	// Calculate how far along the ray the collision occurs
	const halfChord = Math.sqrt(circle.radius * circle.radius - distanceToRay * distanceToRay);
	const collisionDistance = projectionLength - halfChord;
	
	// Calculate contact point and normal
	const time = collisionDistance / rayLength;
	const contactPoint = origin.clone().add(rayDir.clone().multiply(collisionDistance));
	const normal = contactPoint.clone().subtract(circle.center).normalize()!;

	return { origin, ray, contactPoint, normal, time };
}

export function raycastCapsule(origin: Vector2, ray: Vector2, capsule: Capsule2D): RaycastResult | undefined {
	const hits: RaycastResult[] = [];
	const axis = capsule.axis();
	const axisLength = axis.length();

	const end1 = raycastCircle(origin, ray, new Circle(capsule.point1, capsule.radius));
	if (end1 && end1.time >= 0) hits.push(end1);

	const end2 = raycastCircle(origin, ray, new Circle(capsule.point2, capsule.radius));
	if (end2 && end2.time >= 0) hits.push(end2);

	if (axisLength > 0) {
		axis.divide(axisLength);
		const normal = Vector2.new(-axis.y, axis.x).multiply(capsule.radius);
		const side1 = raycastLineSegment(origin, ray, capsule.point1.clone().add(normal), capsule.point2.clone().add(normal));
		if (side1 && side1.time >= 0) {
			hits.push({
				origin,
				ray,
				contactPoint: origin.clone().add(ray.clone().multiply(side1.time)),
				normal: side1.normal,
				time: side1.time,
			});
		}

		const side2 = raycastLineSegment(origin, ray, capsule.point1.clone().subtract(normal), capsule.point2.clone().subtract(normal));
		if (side2 && side2.time >= 0) {
			hits.push({
				origin,
				ray,
				contactPoint: origin.clone().add(ray.clone().multiply(side2.time)),
				normal: side2.normal,
				time: side2.time,
			});
		}
	}

	return minBy(hits, hit => hit.time);
}

/**
 * Raycast against a polygon and return the closest intersection
 */
export function raycastPolygon(origin: Vector2, ray: Vector2, polygon: Polygon): RaycastResult | undefined {
	let closestTime = Infinity;
	let closestNormal = Vector2.new(0, 0);
	let hasHit = false;

	// Test each edge of the polygon
	for (let i = 0; i < polygon.vertices.length; i++) {
		const start = polygon.vertices[i]!;
		const end = polygon.vertices[(i + 1) % polygon.vertices.length]!;
		
		const result = raycastLineSegment(origin, ray, start, end);
		if (result && result.time >= 0 && result.time < closestTime) {
			closestTime = result.time;
			closestNormal = result.normal;
			hasHit = true;
		}
	}

	if (!hasHit) return undefined;

	const contactPoint = origin.clone().add(ray.clone().multiply(closestTime));
	return { origin, ray, contactPoint, normal: closestNormal, time: closestTime };
}

/**
 * Raycast against a line segment
 */
export function raycastLineSegment(rayOrigin: Vector2, rayDirection: Vector2, segmentStart: Vector2, segmentEnd: Vector2): { time: number; normal: Vector2 } | undefined {
	const segmentVector = segmentEnd.clone().subtract(segmentStart);
	const rayToSegmentStart = segmentStart.clone().subtract(rayOrigin);
	
	const cross1 = rayDirection.x * segmentVector.y - rayDirection.y * segmentVector.x;
	
	// Parallel rays and segments don't intersect
	if (Math.abs(cross1) < 0.0001) return undefined;
	
	const t = (rayToSegmentStart.x * segmentVector.y - rayToSegmentStart.y * segmentVector.x) / cross1;
	const u = (rayToSegmentStart.x * rayDirection.y - rayToSegmentStart.y * rayDirection.x) / cross1;
	
	// Check if intersection is within the ray (t >= 0) and line segment (0 <= u <= 1)
	if (t >= 0 && u >= 0 && u <= 1) {
		// Calculate normal (perpendicular to the segment, pointing away from ray origin)
		const segmentNormal = Vector2.new(-segmentVector.y, segmentVector.x).normalize();
		if (!segmentNormal) return undefined;
		
		// Ensure normal points toward the ray origin
		const intersectionPoint = rayOrigin.clone().add(rayDirection.clone().multiply(t));
		const toOrigin = rayOrigin.clone().subtract(intersectionPoint);
		if (segmentNormal.dot(toOrigin) < 0) segmentNormal.multiply(-1);
		
		return { time: t, normal: segmentNormal };
	}
	
	return undefined;
}