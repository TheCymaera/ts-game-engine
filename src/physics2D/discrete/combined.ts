import { Circle } from "@open-utilities/maths/Circle";
import { Capsule2D } from "@open-utilities/maths/Capsule2D";
import { Polygon } from "@open-utilities/maths/Polygon";
import { Rect } from "@open-utilities/maths/Rect";
import type { Vector2 } from "@open-utilities/maths/Vector2";
import { aabbVsAabbDiscrete, aabbVsCircleDiscrete, circleVsCircleDiscrete, capsuleVsCircleDiscrete, capsuleVsCapsuleDiscrete } from "./simpleShapes";
import { aabbVsPolygonDiscrete, circleVsPolygonDiscrete, capsuleVsAabbDiscrete, capsuleVsPolygonDiscrete, polygonVsPolygonDiscrete } from "./separatingAxisTheorem";
import { assertNever } from "@open-utilities/types/assertNever";

export type Collider2DShape = Rect | Circle | Polygon | Capsule2D;

export interface CollisionResult {
	penetration: Vector2;
	normal: Vector2;
}

export function colliderDiscrete(collider: Collider2DShape, other: Collider2DShape): CollisionResult | undefined {
	if (collider instanceof Rect) return rectDiscrete(collider, other);
	if (collider instanceof Circle) return circleDiscrete(collider, other);
	if (collider instanceof Polygon) return polygonDiscrete(collider, other);
	if (collider instanceof Capsule2D) return capsuleDiscrete(collider, other);
	assertNever(collider);
}

export function rectDiscrete(rect: Rect, other: Collider2DShape): CollisionResult | undefined {
	if (other instanceof Rect) return aabbVsAabbDiscrete(rect, other);
	if (other instanceof Polygon) return aabbVsPolygonDiscrete(rect, other);
	if (other instanceof Circle) return flipCollision(aabbVsCircleDiscrete(other, rect));
	if (other instanceof Capsule2D) return flipCollision(capsuleVsAabbDiscrete(other, rect));
	assertNever(other);
}

export function circleDiscrete(circle: Circle, other: Collider2DShape): CollisionResult | undefined {
	if (other instanceof Rect) return aabbVsCircleDiscrete(circle, other);
	if (other instanceof Circle) return circleVsCircleDiscrete(circle, other);
	if (other instanceof Polygon) return circleVsPolygonDiscrete(circle, other);
	if (other instanceof Capsule2D) return flipCollision(capsuleVsCircleDiscrete(other, circle));
	assertNever(other);
}

export function polygonDiscrete(polygon: Polygon, other: Collider2DShape): CollisionResult | undefined {
	if (other instanceof Rect) return flipCollision(aabbVsPolygonDiscrete(other, polygon));
	if (other instanceof Circle) return flipCollision(circleVsPolygonDiscrete(other, polygon));
	if (other instanceof Polygon) return polygonVsPolygonDiscrete(polygon, other);
	if (other instanceof Capsule2D) return flipCollision(capsuleVsPolygonDiscrete(other, polygon));
	assertNever(other);
}

export function capsuleDiscrete(capsule: Capsule2D, other: Collider2DShape): CollisionResult | undefined {
	if (other instanceof Rect) return capsuleVsAabbDiscrete(capsule, other);
	if (other instanceof Circle) return capsuleVsCircleDiscrete(capsule, other);
	if (other instanceof Polygon) return capsuleVsPolygonDiscrete(capsule, other);
	if (other instanceof Capsule2D) return capsuleVsCapsuleDiscrete(capsule, other);
	assertNever(other);
}

function flipCollision(result: CollisionResult | undefined): CollisionResult | undefined {
	if (!result) return undefined;
	
	result.penetration.multiply(-1);
	result.normal.multiply(-1);

	return result;
}