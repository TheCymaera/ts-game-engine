import { Circle } from "../maths/Circle.js";
import { Path } from "../maths/Path.js";
import { Capsule2D } from "../maths/Capsule2D.js";
import { PathStyle } from "./PathStyle.js";
import { ShapeStyle } from "./ShapeStyle.js";
import { Vector3 } from "../maths/Vector3.js";
import { Matrix4 } from "../maths/Matrix4.js";
import { Vector2 } from "../maths/Vector2.js";
import type { Rect } from "../maths/Rect.js";
import { Color } from "./Color.js";
import type { Polygon } from "../maths/Polygon.js";
import { LineSegment } from "@open-utilities/maths/LineSegment.js";

export enum ImageSmoothingMode {
	NearestNeighbor,
	AntiAliasing,
}

export class Renderer2D {
	/**
	 * A matrix for transforming from client space to world space.
	 * Used to convert mouse coordinates to world coordinates.
	 */
	public clientToWorldSpaceTransform = Matrix4.identity();

	clearColor = Color.transparent;

	constructor(readonly ctx: CanvasRenderingContext2D) { }

	static fromCanvas(canvas: HTMLCanvasElement): Renderer2D {
		return new Renderer2D(canvas.getContext("2d")!);
	}

	resize() {
		this.clientToWorldSpaceTransform = this.#clientToWorldSpaceTransform();
	}

	setImageSmoothingMode(mode: ImageSmoothingMode) {
		if (mode === ImageSmoothingMode.AntiAliasing) {
			this.ctx.imageSmoothingEnabled = true;
			this.ctx.canvas.style.imageRendering = "";
		} else {
			this.ctx.imageSmoothingEnabled = false;
			this.ctx.canvas.style.imageRendering = "pixelated";
		}
	}

	setTransform(transform: Matrix4) {
		this.#viewTransform = transform.clone();
		this.clientToWorldSpaceTransform = this.#clientToWorldSpaceTransform();
	}

	getTransform() {
		return this.#viewTransform.clone();
	}

	set bitmapDimensions(dimensions: Vector2) {
		const width = dimensions.x, height = dimensions.y;

		this.ctx.canvas.width = width;
		this.ctx.canvas.height = height;
		
		this.#projectionTransform = this.#clipspaceToBitmapTransform();
	}

	get bitmapDimensions() {
		return Vector2.new(this.ctx.canvas.width, this.ctx.canvas.height);
	}

	get clientDimensions() {
		return Vector2.new(this.ctx.canvas.clientWidth, this.ctx.canvas.clientHeight);
	}

	clear() {
		this.ctx.save();
		this.ctx.setTransform(1, 0, 0, 1, 0, 0);
		
		if (this.clearColor.a !== 255) {
			this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
		}
		
		if (this.clearColor.a > 0) {
			this.ctx.fillStyle = this.clearColor.toString();
			this.ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
		}

		this.ctx.restore();
	}

	withTransform(transform: Matrix4, callback: ()=>void) {
		const oldTransform = this.#modelTransform.clone();
		this.#modelTransform = oldTransform.clone().multiply(transform);
		callback();
		this.#modelTransform = oldTransform;
	}
	
	drawLine({ line, style, zIndex = 0 }: { line: LineSegment, style: PathStyle, zIndex?: number }) {
		this.#scheduleDraw(zIndex, () =>{
			this.#setPathStyle(style);
			this.ctx.beginPath();
			this.ctx.moveTo(line.point1.x, line.point1.y);
			this.ctx.lineTo(line.point2.x, line.point2.y);
			this.ctx.stroke();
		});
	}

	drawPath({ path, style, zIndex = 0 }: { path: Path, style: ShapeStyle, zIndex?: number }) {
		this.#scheduleDraw(zIndex, () =>{
			this.#setShapeStyle(style);
			this.#usePath(path);
			if (style.fill.a) this.ctx.fill();
			this.ctx.stroke();
		});
	}

	drawPolygon({ polygon, style, zIndex = 0 }: { polygon: Polygon, style: ShapeStyle, zIndex?: number }) {
		this.drawPath({ path: Path.fromPolygon(polygon, style.stroke.width), style, zIndex });
	}

	drawCircle({ circle, style, zIndex = 0 }: { circle: Circle, style: ShapeStyle, zIndex?: number }) {
		this.#scheduleDraw(zIndex, () =>{
			this.#setShapeStyle(style);
			this.ctx.beginPath();
			const buffer = style.stroke.color.a ? style.stroke.width / 2 : 0;
			this.ctx.arc(circle.center.x, circle.center.y, circle.radius - buffer, 0, 2 * Math.PI);
			if (style.fill.a) this.ctx.fill();
			this.ctx.stroke();
		});
	}

	drawCapsule({ capsule, style, zIndex = 0 }: { capsule: Capsule2D, style: ShapeStyle, zIndex?: number }) {
		this.#scheduleDraw(zIndex, () =>{
			this.#setShapeStyle(style);
			const axis = capsule.axis();
			const axisLength = axis.length();
			const buffer = style.stroke.color.a ? style.stroke.width / 2 : 0;
			const radius = Math.max(capsule.radius - buffer, 0);

			if (radius === 0 || axisLength === 0) {
				this.ctx.beginPath();
				this.ctx.arc(capsule.point1.x, capsule.point1.y, radius, 0, 2 * Math.PI);

				if (style.fill.a) this.ctx.fill();
				this.ctx.stroke();
				return;
			}

			const center = capsule.center();
			const angle = Math.atan2(axis.y, axis.x);
			const p1 = Vector2.new(-axisLength / 2, 0);
			const p2 = Vector2.new(axisLength / 2, 0);

			this.ctx.save();

			this.ctx.translate(center.x, center.y);
			this.ctx.rotate(angle);

			this.ctx.beginPath();

			this.ctx.moveTo(p1.x, p1.y + radius);
			this.ctx.arc(p1.x, p1.y, radius, Math.PI / 2, Math.PI * 3 / 2);
			this.ctx.lineTo(p2.x, p2.y - radius);
			this.ctx.arc(p2.x, p2.y, radius, Math.PI * 3 / 2, Math.PI / 2);

			this.ctx.closePath();

			if (style.fill.a) this.ctx.fill();
			this.ctx.stroke();

			this.ctx.restore();
		});
	}

	drawRect({ rect, style, zIndex = 0 }: { rect: Rect, style: ShapeStyle, zIndex?: number }) {
		this.#scheduleDraw(zIndex, () =>{
			this.#setShapeStyle(style);
			this.ctx.beginPath();
			const buffer = style.stroke.color.a ? style.stroke.width / 2 : 0;
			this.ctx.rect(rect.minX + buffer, rect.minY + buffer, rect.width - buffer * 2, rect.height - buffer * 2);
			if (style.fill.a) this.ctx.fill();
			this.ctx.stroke();
		});
	}

	drawImage(rect: Rect, bitmap: CanvasImageSource, zIndex = 0) {
		this.#scheduleDraw(zIndex, () =>{
			this.ctx.drawImage(
				bitmap,
				rect.minX,
				rect.minY,
				rect.width,
				rect.height,
			);
		});
	}

	flush() {
		// sort by z
		this.#toDraw.sort((a, b) => a.z - b.z);

		// draw
		const projView = this.#projectionTransform.clone().multiply(this.#viewTransform);
		for (const { transform: model, func } of this.#toDraw) {
			this.ctx.setTransform(projView.clone().multiply(model))
			func();
		}

		// clear queue
		this.#toDraw.length = 0;
	}

	#usePath(path: Path) {
		this.ctx.beginPath();
		const p = path.origin;
		this.ctx.moveTo(p.x, p.y);
		for (const segment of path.segments) {
			if (segment instanceof Path.LineTo) {
				const p = segment.point;
				this.ctx.lineTo(p.x, p.y);
			}

			if (segment instanceof Path.Close) {
				this.ctx.closePath();
			}
		}
	}

	#setPathStyle(pathStyle: PathStyle) {
		this.ctx.lineWidth = pathStyle.width;
		this.ctx.strokeStyle = pathStyle.color.toString();
		this.ctx.miterLimit = pathStyle.miterLimit;

		switch (pathStyle.cap) {
			case PathStyle.Cap.Butt: this.ctx.lineCap = "butt"; break;
			case PathStyle.Cap.Round: this.ctx.lineCap = "round"; break;
			case PathStyle.Cap.Square: this.ctx.lineCap = "square"; break;
		}

		switch (pathStyle.join) {
			case PathStyle.Join.Miter: this.ctx.lineJoin = "miter"; break;
			case PathStyle.Join.Round: this.ctx.lineJoin = "round"; break;
			case PathStyle.Join.Bevel: this.ctx.lineJoin = "bevel"; break;
		}
	}

	#setShapeStyle(shapeStyle: ShapeStyle) {
		this.#setPathStyle(shapeStyle.stroke);
		this.ctx.fillStyle = shapeStyle.fill.toString();
	}

	#toDraw: { z: number, transform: Matrix4, func: ()=>void }[] = []

	#scheduleDraw(z: number, callback: ()=>void) {
		this.#toDraw.push({ z, transform: this.#modelTransform, func: callback });
	}

	#modelTransform = Matrix4.identity();
	#viewTransform = Matrix4.identity();
	#projectionTransform = Matrix4.identity();

	#clientToWorldSpaceTransform() {
		return (this.#viewTransform.clone().invert() ?? Matrix4.identity())
			.translate(Vector3.new(-1, 1, 0))
			.scale(Vector3.new(2 / this.ctx.canvas.clientWidth, -2 / this.ctx.canvas.clientHeight, 1))
	}

	#clipspaceToBitmapTransform() {
		const width = this.ctx.canvas.width;
		const height = this.ctx.canvas.height;
		return Matrix4.identity()
			.scale(Vector3.new(width / 2, -height / 2, 1))
			.translate(Vector3.new(1,-1,0))
	}
}