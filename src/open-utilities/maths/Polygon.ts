import { Vector2 } from "./Vector2.js";
import { Rect } from "./Rect.js";
import { minBy } from "./minBy.js";
import { LineSegment } from "./LineSegment.js";

export class Polygon {
	public vertices: Vector2[];

	constructor(vertices: Vector2[]) {
		if (vertices.length < 3) {
			throw new Error("Polygon must have at least 3 vertices");
		}
		this.vertices = vertices.map(v => v.clone());
	}

	/**
	 * Create a polygon from a rectangle
	 */
	static fromRect(rect: Rect): Polygon {
		const vertices = [
			Vector2.new(rect.min.x, rect.min.y), // bottom-left
			Vector2.new(rect.max.x, rect.min.y), // bottom-right
			Vector2.new(rect.max.x, rect.max.y), // top-right
			Vector2.new(rect.min.x, rect.max.y), // top-left
		];
		return new Polygon(vertices);
	}

	/**
	 * Clone the polygon
	 */
	clone(): Polygon {
		return new Polygon(this.vertices);
	}

	/**
	 * Translate the polygon by a vector
	 */
	translate(offset: Vector2): Polygon {
		for (const vertex of this.vertices) {
			vertex.add(offset);
		}
		return this;
	}

	/**
	 * Rotate the polygon around a center point
	 */
	rotate(angle: number): Polygon {
		if (angle === 0) return this;

		const cos = Math.cos(angle);
		const sin = Math.sin(angle);

		for (const vertex of this.vertices) {
			// Rotate
			const x = vertex.x * cos - vertex.y * sin;
			const y = vertex.x * sin + vertex.y * cos;
			vertex.set(x, y);
		}
		return this;
	}

	/**
	 * Get the center point of the polygon
	 */
	center(): Vector2 {
		let sumX = 0;
		let sumY = 0;
		for (const vertex of this.vertices) {
			sumX += vertex.x;
			sumY += vertex.y;
		}
		return Vector2.new(sumX / this.vertices.length, sumY / this.vertices.length);
	}

	/**
	 * Get the axis-aligned bounding box of the polygon
	 */
	boundingBox(): Rect {
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;

		for (const vertex of this.vertices) {
			minX = Math.min(minX, vertex.x);
			minY = Math.min(minY, vertex.y);
			maxX = Math.max(maxX, vertex.x);
			maxY = Math.max(maxY, vertex.y);
		}

		return Rect.fromCorners(minX, minY, maxX, maxY);
	}

	/**
	 * Check if a point is inside the polygon using the ray casting algorithm
	 */
	containsPoint(point: Vector2): boolean {
		let inside = false;
		const vertices = this.vertices;
		
		for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
			const vi = vertices[i]!;
			const vj = vertices[j]!;
			
			if (((vi.y > point.y) !== (vj.y > point.y)) &&
				(point.x < (vj.x - vi.x) * (point.y - vi.y) / (vj.y - vi.y) + vi.x)) {
				inside = !inside;
			}
		}
		
		return inside;
	}

	edges() {
		const segments: LineSegment[] = [];
		for (let i = 0; i < this.vertices.length; i++) {
			const current = this.vertices[i]!;
			const next = this.vertices[(i + 1) % this.vertices.length]!;
			segments.push(LineSegment.fromPoints(current.clone(), next.clone()));
		}
		return segments;
	}

	edgeNormals() {
		return this.edges().map(edge => edge.normal()!);
	}

	//edges() {
	//	const edges: Vector2[] = [];
	//	for (let i = 0; i < this.vertices.length; i++) {
	//		const current = this.vertices[i]!;
	//		const next = this.vertices[(i + 1) % this.vertices.length]!;
	//		edges.push(next.clone().subtract(current));
	//	}
	//	return edges;
	//}

	//edgeNormals() {
	//	const normals: Vector2[] = [];
	//	for (const edge of this.edges()) {
	//		const normal = Vector2.new(-edge.y, edge.x).normalize();
	//		normals.push(normal ?? Vector2.new(1, 0));
	//	}
	//	return normals;
	//}

	closestPointOnEdge(point: Vector2): Vector2 {
		const edgePoints = this.edges().map(edge => edge.closestPoint(point));
		return minBy(edgePoints, p => point.distanceSquared(p))!;
	} 
}
