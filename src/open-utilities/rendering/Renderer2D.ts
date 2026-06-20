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
		this.#appendTransform(transform);
		callback();
		this.#popTransform();
	}
	
	drawLine({ line, style }: { line: LineSegment, style: PathStyle }) {
		this.#setPathStyle(style);
		this.ctx.beginPath();
		this.ctx.moveTo(line.point1.x, line.point1.y);
		this.ctx.lineTo(line.point2.x, line.point2.y);
		this.ctx.stroke();
	}

	/**
	 * @experimental
	 */
	drawText({ text, color }: { text: string, color: Color }) {
		const transform = Matrix4.identity()
			.scale(Vector3.new(1, -1, 1).multiply(1/10));
		
		this.withTransform(transform, () => {
			this.ctx.fillStyle = color.toString();
			this.ctx.font = "14px sans-serif";
			this.ctx.fillText(text, 0, 0);//position.x, position.y);
		});
	}

	drawPath({ path, style }: { path: Path, style: ShapeStyle }) {
		this.#setShapeStyle(style);
		this.#usePath(path);
		if (style.fill.a) this.ctx.fill();
		this.ctx.stroke();
	}

	drawPolygon({ polygon, style }: { polygon: Polygon, style: ShapeStyle }) {
		this.drawPath({ path: Path.fromPolygon(polygon, style.stroke.width), style });
	}

	drawCircle({ circle, style }: { circle: Circle, style: ShapeStyle }) {
		this.#setShapeStyle(style);
		this.ctx.beginPath();
		const buffer = style.stroke.color.a ? style.stroke.width / 2 : 0;
		this.ctx.arc(circle.center.x, circle.center.y, circle.radius - buffer, 0, 2 * Math.PI);
		if (style.fill.a) this.ctx.fill();
		this.ctx.stroke();
	}

	drawCapsule({ capsule, style }: { capsule: Capsule2D, style: ShapeStyle }) {
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
	}

	drawRect({ rect, style }: { rect: Rect, style: ShapeStyle }) {
		this.#setShapeStyle(style);
		this.ctx.beginPath();
		const buffer = style.stroke.color.a ? style.stroke.width / 2 : 0;
		this.ctx.rect(rect.minX + buffer, rect.minY + buffer, rect.width - buffer * 2, rect.height - buffer * 2);
		if (style.fill.a) this.ctx.fill();
		this.ctx.stroke();
	}

	drawImage({ rect, bitmap }: { rect: Rect, bitmap: CanvasImageSource }) {
		this.ctx.drawImage(
			bitmap,
			rect.minX,
			rect.minY,
			rect.width,
			rect.height,
		);
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

	#viewTransform = Matrix4.identity();
	#projectionTransform = Matrix4.identity();

	#transformStack: Matrix4[] = [];
	#appendTransform(modelTransform: Matrix4) {
		const currentTop = this.#currentTransform();
		const newTop = currentTop.clone().multiply(modelTransform);
		this.#transformStack.push(newTop);
		this.ctx.setTransform(newTop);
	}

	#popTransform() {
		this.#transformStack.pop();
		this.ctx.setTransform(this.#currentTransform());
	}

	#currentTransform() {
		if (this.#transformStack.length === 0) {
			return this.#projectionTransform.clone().multiply(this.#viewTransform);
		} else {
			return this.#transformStack[this.#transformStack.length - 1]!;
		}
	}

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