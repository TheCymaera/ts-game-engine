import { Rect } from "./Rect.js";
import { Vector2 } from "./Vector2.js";

export class Circle {
	center: Vector2;
	radius: number;

	constructor(center: Vector2, radius: number) {
		this.center = center;
		this.radius = radius;
	}

	clone() {
		return new Circle(this.center.clone(), this.radius);
	}

	translate(vector: Vector2) {
		this.center.add(vector);
		return this;
	}

	boundingBox() {
		return Rect.fromCenter(this.center, this.radius * 2, this.radius * 2);
	}

	static fromRadius(center: Vector2, radius: number) {
		return new Circle(center, radius);
	}
}