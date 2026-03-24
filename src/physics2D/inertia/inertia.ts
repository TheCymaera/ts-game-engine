import { Circle } from "@open-utilities/maths/Circle";
import { Capsule2D } from "@open-utilities/maths/Capsule2D";
import { Polygon } from "@open-utilities/maths/Polygon";
import { Rect } from "@open-utilities/maths/Rect";
import type { Collider2DShape } from "../discrete/combined";

export function colliderInertia(mass: number, shape: Collider2DShape): number {
	if (shape instanceof Circle) return circleInertia(mass, shape);
	if (shape instanceof Capsule2D) return capsuleInertia(mass, shape);
	if (shape instanceof Polygon) return polygonInertia(mass, shape);
	if (shape instanceof Rect) return rectInertia(mass, shape);
	throw new Error("Unknown shape type for inertia calculation.");
}

export function rectInertia(mass: number, rect: Rect): number {
	const width = rect.width;
	const height = rect.height;
	return (1 / 12) * mass * (width * width + height * height);
}

export function circleInertia(mass: number, circle: Circle): number {
	return (1 / 2) * mass * circle.radius * circle.radius;
}

export function polygonInertia(mass: number, polygon: Polygon): number {
	let numerator = 0;
	let denominator = 0;
	const vertices = polygon.vertices;

	for (let i = 0; i < vertices.length; i++) {
		const current = vertices[i]!;
		const next = vertices[(i + 1) % vertices.length]!;

		const cross = Math.abs(current.cross(next));
		const dot = next.dot(next) + next.dot(current) + current.dot(current);

		numerator += cross * dot;
		denominator += cross;
	}

	return (mass / 6) * (numerator / denominator);
}

export function capsuleInertia(mass: number, capsule: Capsule2D): number {
	const segmentLength = capsule.point1.distance(capsule.point2);
	const radius = capsule.radius;
	const rectangleMass = segmentLength === 0 ? 0 : mass * (segmentLength / (segmentLength + Math.PI * radius));
	const circlesMass = mass - rectangleMass;

	const rectangleInertia = rectangleMass === 0
		? 0
		: (rectangleMass * (segmentLength * segmentLength + (2 * radius) * (2 * radius))) / 12;

	const halfCircleMass = circlesMass / 2;
	const centerOffset = segmentLength / 2;
	const semicircleOffset = centerOffset + 4 * radius / (3 * Math.PI);
	const halfCircleInertia = halfCircleMass * radius * radius * (0.5 - 16 / (9 * Math.PI * Math.PI));

	return rectangleInertia + 2 * (halfCircleInertia + halfCircleMass * semicircleOffset * semicircleOffset);
}