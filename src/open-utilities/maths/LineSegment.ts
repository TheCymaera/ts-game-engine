import { coerceBetween } from "./coerceBetween";
import { Vector2 } from "./Vector2";

export class LineSegment {
	private constructor(
		public point1: Vector2, 
		public point2: Vector2
	) { }

	static fromPoints(point1: Vector2, point2: Vector2) {
		return new LineSegment(point1, point2);
	}

	normal() {
		const edge = this.point2.clone().subtract(this.point1);
		return Vector2.new(-edge.y, edge.x).normalize();
	}

	stride() {
		return this.point2.clone().subtract(this.point1);
	}

	closestPoint(point: Vector2) {
		const stride = this.stride();
		const lengthSquared = stride.x * stride.x + stride.y * stride.y;
		
		// If the edge has zero length, return the start point
		if (lengthSquared === 0) return this.point1.clone();

		// Calculate parameter t for the closest point on the line
		const pointToStart = point.clone().subtract(this.point1);
		const t = coerceBetween(pointToStart.dot(stride) / lengthSquared, 0, 1);
		
		// Return the point on the edge
		return this.point1.clone().add(stride.multiply(t));
	}


	shortestLineBetween(other: LineSegment): LineSegment {
		const p1 = this.point1;
		const p2 = other.point1;

		const d1 = this.stride();
		const d2 = other.stride();
		const r = p1.clone().subtract(p2);

		const a = d1.dot(d1);
		const e = d2.dot(d2);
		const f = d2.dot(r);
		const epsilon = 1e-8;

		let s = 0;
		let t = 0;

		if (a <= epsilon && e <= epsilon) {
			return new LineSegment(p1.clone(), p2.clone());
		}

		if (a <= epsilon) {
			t = coerceBetween(f / e, 0, 1);
			return new LineSegment(p1.clone(), p2.clone().add(d2.multiply(t)));
		}

		const c = d1.dot(r);
		if (e <= epsilon) {
			s = coerceBetween(-c / a, 0, 1);
			return new LineSegment(p1.clone().add(d1.multiply(s)), p2.clone());
		}

		const b = d1.dot(d2);
		const denom = a * e - b * b;

		if (denom !== 0) {
			s = coerceBetween((b * f - c * e) / denom, 0, 1);
		}

		t = (b * s + f) / e;

		if (t < 0) {
			t = 0;
			s = coerceBetween(-c / a, 0, 1);
		} else if (t > 1) {
			t = 1;
			s = coerceBetween((b - c) / a, 0, 1);
		}

		return new LineSegment(p1.clone().add(d1.multiply(s)), p2.clone().add(d2.multiply(t)));
	}
}