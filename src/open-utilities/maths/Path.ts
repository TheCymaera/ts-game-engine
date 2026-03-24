import { Polygon } from "./Polygon.js";
import { Vector2 } from "./Vector2.js";

export class Path {
	origin = Vector2.new(0, 0);
	readonly segments: Path.Segment[] =  [];

	setOrigin(origin: Vector2) {
		this.origin = origin;
		return this;
	}

	lineTo(point: Vector2) {
		this.segments.push(new Path.LineTo(point));
		return this;
	}

	close() {
		this.segments.push(new Path.Close());
		return this;
	}

	static fromPolygon(polygon: Polygon, strokeWidth: number): Path {
		if (!polygon.vertices.length) return new Path();
		
		// shrink the polygon by half the stroke width
		if (strokeWidth > 0) {
			polygon = Path.expandPolygon(polygon, -strokeWidth / 2);
		}
		
		const path = new Path();
		path.setOrigin(polygon.vertices[0]!);
		for (let i = 1; i < polygon.vertices.length; i++) {
			path.lineTo(polygon.vertices[i]!);
		}
		path.close();
		return path;
	}

	private static expandPolygon(polygon: Polygon, distance: number): Polygon {
		const vertices = polygon.vertices;
		const edgeNormals = polygon.edges().map(edge => edge.normal());

		const newVertices: Vector2[] = [];
		
		for (let i = 0; i < vertices.length; i++) {
			const prevIndex = (i - 1 + vertices.length) % vertices.length;
			const current = vertices[i]!;
			
			const prevNormal = edgeNormals[prevIndex]!
			const currentNormal = edgeNormals[i]!
			const avgNormal = prevNormal.clone().add(currentNormal).normalize() ?? Vector2.new(0, 1);
			
			// Calculate the distance to move based on the angle between edges
			// Use the sine of half the angle to maintain consistent offset
			const dot = prevNormal.dot(currentNormal);
			const scale =  - (dot > -0.999 ? distance / Math.sqrt((1 + dot) / 2) : distance);
			
			newVertices.push(current.clone().add(avgNormal.multiply(scale)));
		}
		
		return new Polygon(newVertices);
	}
}


export namespace Path {
	export class LineTo {
		constructor(readonly point: Vector2) {}
	}

	export class Close {
		constructor() {}
	}

	export type Segment = LineTo|Close;
}

