import { Circle } from "@open-utilities/maths/Circle";
import { LineSegment } from "@open-utilities/maths/LineSegment";
import { Matrix4 } from "@open-utilities/maths/Matrix4";
import { Rect } from "@open-utilities/maths/Rect";
import { Vector2 } from "@open-utilities/maths/Vector2";
import { Vector3 } from "@open-utilities/maths/Vector3";
import { AnimationFrameScheduler } from "@open-utilities/rendering/AnimationFrameScheduler";
import { Color } from "@open-utilities/rendering/Color";
import { PathStyle } from "@open-utilities/rendering/PathStyle";
import { Renderer2D } from "@open-utilities/rendering/Renderer2D";
import { ShapeStyle } from "@open-utilities/rendering/ShapeStyle";

export const debugText = document.querySelector("#debug-text")!;
export const renderer = Renderer2D.fromCanvas(document.querySelector("canvas")!);

AnimationFrameScheduler.periodic((delta) => {
	renderer.drawLine({
		line: LineSegment.fromPoints(Vector2.new(0, 0), Vector2.new(1, 1)),
		style: new PathStyle({
			color: Color.red,
			width: 0.1,
		})
	})

	renderer.drawCircle({
		circle: Circle.fromRadius(Vector2.new(0, 0), 1),
		style: new ShapeStyle({
			stroke: new PathStyle({
				color: Color.green,
				width: 0.1,
			}),
		})
	})
	
	renderer.withTransform(Matrix4.identity().scale(Vector3.new(.3, .3, 0)), ()=>{
		renderer.drawCircle({
			circle: Circle.fromRadius(Vector2.new(0, 0), 1),
			style: new ShapeStyle({
				stroke: new PathStyle({
					color: Color.green,
					width: 0.1,
				}),
			})
		})
	})

	renderer.setTransform(Matrix4.ortho(
		Rect.fromPoints(Vector2.new(-1, -1), Vector2.new(2, 2)),
	));

	renderer.flush();
})

renderer.bitmapDimensions = Vector2.new(100, 100);