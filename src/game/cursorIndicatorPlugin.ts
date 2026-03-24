import { ECS, type ECSUpdateContext } from "@open-utilities/ecs/ECS";
import { Circle } from "@open-utilities/maths/Circle";
import { Color } from "@open-utilities/rendering/Color";
import { ShapeStyle } from "@open-utilities/rendering/ShapeStyle";
import { mouse, renderer } from "./resources";


export function cursorIndicatorPlugin(ecs: ECS) {
	ecs.systems.onRender.add(renderCursor);
}

function renderCursor(context: ECSUpdateContext) {
	renderer.drawCircle({
		circle: new Circle(mouse.worldPosition, .2),
		style: ShapeStyle.outline(Color.green, .05),
		zIndex: 1
	});
}