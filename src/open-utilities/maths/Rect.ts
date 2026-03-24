import { coerceBetween } from "./coerceBetween.js";
import { lerp } from "./lerp.js";
import { Vector2 } from './Vector2.js';

export class Rect {
	private constructor(
		public minX: number,
		public minY: number,
		public maxX: number,
		public maxY: number,
	) {}

	get min() {
		return Vector2.new(this.minX, this.minY);
	}

	get max() {
		return Vector2.new(this.maxX, this.maxY);
	}

	static fromPoints(p1: Vector2, p2: Vector2) {
		return new Rect(p1.x, p1.y, p2.x, p2.y);
	}

	static fromCenter(center: Vector2, xSize: number, ySize: number) {
		const x1 = center.x - xSize / 2;
		const y1 = center.y - ySize / 2;
		return new Rect(x1, y1, x1 + xSize, y1 + ySize);
	}

	static fromDimensions(x: number, y: number, width: number, height: number) {
		return new Rect(x, y, x + width, y + height);
	}

	static fromCorners(x1: number, y1: number, x2: number, y2: number) {
		return new Rect(x1, y1, x2, y2);
	}

	dimensions() {
		return Vector2.new(this.width, this.height);
	}

	clone() {
		return new Rect(this.minX, this.minY, this.maxX, this.maxY);
	}

	copy(other: Rect) {
		this.minX = other.minX;
		this.minY = other.minY;
		this.maxX = other.maxX;
		this.maxY = other.maxY;
		return this;
	}

	translate(offset: Vector2) {
		this.minX += offset.x;
		this.maxX += offset.x;
		this.minY += offset.y;
		this.maxY += offset.y;
		return this;
	}

	intersects(other: Rect) {
		return this.minX < other.maxX && this.maxX > other.minX && this.minY < other.maxY && this.maxY > other.minY;
	}

	containsPoint(point: Vector2) {
		return point.x >= this.minX && point.x <= this.maxX && point.y >= this.minY && point.y <= this.maxY;
	}

	containsPointExclusive(point: Vector2) {
		return point.x > this.minX && point.x < this.maxX && point.y > this.minY && point.y < this.maxY;
	}

	closestPoint(point: Vector2) {
		const x = coerceBetween(point.x, this.minX, this.maxX);
		const y = coerceBetween(point.y, this.minY, this.maxY);
		return Vector2.new(x, y);
	}

	vertices() {
		return [
			Vector2.new(this.minX, this.minY),
			Vector2.new(this.maxX, this.minY),
			Vector2.new(this.maxX, this.maxY),
			Vector2.new(this.minX, this.maxY),
		];
	}

	boundingBox() {
		return this.clone();
	}

	get width() {
		return this.maxX - this.minX;
	}

	get height() {
		return this.maxY - this.minY;
	}

	set width(value: number) {
		this.maxX = this.minX + value;
	}

	set height(value: number) {
		this.maxY = this.minY + value;
	}

	get isEmpty() {
		return this.minX === this.maxX && this.minY === this.maxY;
	}

	center() {
		return Vector2.new(
			(this.minX + this.maxX) / 2,
			(this.minY + this.maxY) / 2,
		);
	}

	expand(vector: Vector2) {
		this.minX -= vector.x;
		this.minY -= vector.y;
		this.maxX += vector.x;
		this.maxY += vector.y;
		return this;
	}

	lerp(other: Rect, fraction: number) {
		this.minX = lerp(this.minX, other.minX, fraction);
		this.minY = lerp(this.minY, other.minY, fraction);
		this.maxX = lerp(this.maxX, other.maxX, fraction);
		this.maxY = lerp(this.maxY, other.maxY, fraction);
		return this;
	}

	toString() {
		return `Rect(${this.minX.toFixed(3)}, ${this.minY.toFixed(3)}, ${this.width.toFixed(3)}, ${this.height.toFixed(3)})`;
	}

	//static mapPointOnto(i: Rect, point: Vector2, o: Rect) {
	//	const x = (point.x - i.minX) / (i.maxX - i.minX) * (o.maxX - o.minX) + o.minX;
	//	const y = (point.y - i.minY) / (i.maxY - i.minY) * (o.maxY - o.minY) + o.minY;
	//	return Vector2.new(x, y);
	//}

	//static mapRectOnto(i: Rect, r: Rect, o: Rect) {
	//	return Rect.fromPoints(
	//		Rect.mapPointOnto(i, Vector2.new(r.minX, r.minY), o), 
	//		Rect.mapPointOnto(i, Vector2.new(r.maxX, r.maxY), o),
	//	);
	//}
}

