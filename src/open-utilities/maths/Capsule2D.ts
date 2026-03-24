import { LineSegment } from "./LineSegment.js";
import { Rect } from "./Rect.js";
import { Vector2 } from "./Vector2.js";

export class Capsule2D {
	constructor(
		public point1: Vector2,
		public point2: Vector2,
		public radius: number
	) {}

	static fromCenter(center: Vector2, size: Vector2) {
		const radius = Math.min(size.x, size.y) / 2;
		const halfStride = Math.max(size.x, size.y) / 2 - radius;

		if (size.x >= size.y) {
			return new Capsule2D(
				Vector2.new(center.x - halfStride, center.y),
				Vector2.new(center.x + halfStride, center.y),
				radius,
			);
		}

		return new Capsule2D(
			Vector2.new(center.x, center.y - halfStride),
			Vector2.new(center.x, center.y + halfStride),
			radius,
		);
	}

	clone() {
		return new Capsule2D(this.point1.clone(), this.point2.clone(), this.radius);
	}

	translate(vector: Vector2) {
		this.point1.add(vector);
		this.point2.add(vector);
		return this;
	}

	rotate(angle: number) {
		if (angle === 0) return this;
		this.point1.rotate(angle);
		this.point2.rotate(angle);
		return this;
	}

	center() {
		return this.point1.clone().add(this.point2).divide(2);
	}

	axis() {
		return this.point2.clone().subtract(this.point1);
	}

	line() {
		return LineSegment.fromPoints(this.point1.clone(), this.point2.clone());
	}

	closestPoint(point: Vector2) {
		const closest = this.line().closestPoint(point);
		const direction = point.clone().subtract(closest);
		const distance = direction.length();

		if (distance === 0) {
			const normal = this.axis().perpendicular().normalize() ?? Vector2.new(1, 0);
			return closest.add(normal.multiply(this.radius));
		}

		return closest.add(direction.divide(distance).multiply(this.radius));
	}

	boundingBox() {
		return Rect.fromCorners(
			Math.min(this.point1.x, this.point2.x) - this.radius,
			Math.min(this.point1.y, this.point2.y) - this.radius,
			Math.max(this.point1.x, this.point2.x) + this.radius,
			Math.max(this.point1.y, this.point2.y) + this.radius,
		);
	}

	containsPoint(point: Vector2) {
		return this.line().closestPoint(point).distanceSquared(point) <= this.radius * this.radius;
	}
}