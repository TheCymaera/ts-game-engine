import type { ECS, ECSUpdateContext } from "@open-utilities/ecs/ECS"
import { LineSegment } from "@open-utilities/maths/LineSegment"
import { Matrix4 } from "@open-utilities/maths/Matrix4"
import { Vector2 } from "@open-utilities/maths/Vector2"
import { Vector3 } from "@open-utilities/maths/Vector3"
import { Color } from "@open-utilities/rendering/Color"
import { PathStyle } from "@open-utilities/rendering/PathStyle"
import { Renderer2D } from "@open-utilities/rendering/Renderer2D"

export function coordinateGrid2DPlugin(app: ECS) {
	app.systems.onRender.add(renderCoordinateGrids);
}


export class CoordinateGrid2D {
	constructor(
		public interval: number,
		public subdivision: number,
		public style: (x: number) => PathStyle,
	) {}

	static new(subdivision = 10, originColor = Color.black.scaleAlpha(.5)): CoordinateGrid2D {
		const originStyle = new PathStyle({ width: .03, color: originColor });
		const majorStyle = new PathStyle({ width: .02, color: originColor.scaleAlpha(.6) });
		const minorStyle = new PathStyle({ width: .01, color: originColor.scaleAlpha(.4) });

		return new CoordinateGrid2D(1, subdivision, (x) => {
			if (x === 0) return originStyle
			if (x % subdivision === 0) return majorStyle
			return minorStyle
		});
	}
}


function renderCoordinateGrids(update: ECSUpdateContext) {
	const renderer = update.ecs.resources.get(Renderer2D);
	for (const [grid] of update.entities.query(CoordinateGrid2D)) {
		renderCoordinateGrid(renderer, grid);
	}
}

function renderCoordinateGrid(renderer: Renderer2D, grid: CoordinateGrid2D) {
	const interval = grid.interval

	const transform = renderer.getTransform()

	const rect = transform.getOrthoRect()
	const startX = Math.ceil(rect.minX / interval) * interval;
	const startY = Math.ceil(rect.minY / interval) * interval;

	for (let i = startX; i <= rect.maxX; i += interval) {
		const line = LineSegment.fromPoints(Vector2.new(i, rect.minY), Vector2.new(i, rect.maxY));
		renderer.drawLine({ line, style: grid.style(i) });
	}

	for (let i = startY; i <= rect.maxY; i += interval) {
		const line = LineSegment.fromPoints(Vector2.new(rect.minX, i), Vector2.new(rect.maxX, i));
		renderer.drawLine({ line, style: grid.style(i) });
	}

	//const buffer = grid.subdivision;

	//for (let x = startX - buffer; x <= rect.maxX; x += interval) {
	//	const xIsSubdivision = x % grid.subdivision === 0;
	//	for (let y = startY - buffer; y <= rect.maxY; y += interval) {
	//		const yIsSubdivision = y % grid.subdivision === 0;

	//		if (xIsSubdivision && yIsSubdivision) {
	//			renderer.withTransform(Matrix4.identity().translate(Vector3.new(x, y, 0)).scale(Vector3.splat(.5)), ()=> {
	//				renderer.drawText({
	//					text: `(${x}, ${y})`,
	//					color: Color.black.scaleAlpha(.7)
	//				});
	//			});
	//		}
	//	}
	//}
}
