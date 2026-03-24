import type { ECS, ECSUpdateContext } from "@open-utilities/ecs/ECS"
import { LineSegment } from "@open-utilities/maths/LineSegment"
import { Vector2 } from "@open-utilities/maths/Vector2"
import { Color } from "@open-utilities/rendering/Color"
import { PathStyle } from "@open-utilities/rendering/PathStyle"
import { Renderer2D } from "@open-utilities/rendering/Renderer2D"

export function coordinateGrid2DPlugin(app: ECS) {
	app.systems.onRender.add(renderCoordinateGrids);
}


export class CoordinateGrid2D {
	constructor(
		public interval = 1,
		public style: (x: number) => PathStyle,
	) {}

	static new(subdivision = 5, originColor = Color.black.scaleAlpha(.5)): CoordinateGrid2D {
		const originStyle = new PathStyle({ width: .03, color: originColor });
		const majorStyle = new PathStyle({ width: .02, color: originColor.scaleAlpha(.6) });
		const minorStyle = new PathStyle({ width: .01, color: originColor.scaleAlpha(.4) });

		return new CoordinateGrid2D(1, (x) => {
			if (x === 0) return originStyle
			if (x % subdivision === 0) majorStyle
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
	const startX = rect.minX / interval | 0 * interval
	const startY = rect.minY / interval | 0 * interval

	for (let i = startX; i <= rect.maxX; i += interval) {
		const line = LineSegment.fromPoints(Vector2.new(i, rect.minY), Vector2.new(i, rect.maxY));
		renderer.drawLine({ line, style: grid.style(i) });
	}

	for (let i = startY; i <= rect.maxY; i += interval) {
		const line = LineSegment.fromPoints(Vector2.new(rect.minX, i), Vector2.new(rect.maxX, i));
		renderer.drawLine({ line, style: grid.style(i) });
	}
}
