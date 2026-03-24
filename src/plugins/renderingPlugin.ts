import type { ECS, ECSUpdateContext } from "@open-utilities/ecs/ECS";
import { Circle } from "@open-utilities/maths/Circle";
import { Capsule2D } from "@open-utilities/maths/Capsule2D";
import { Rect } from "@open-utilities/maths/Rect";
import { Color } from "@open-utilities/rendering/Color";
import { Renderer2D } from "@open-utilities/rendering/Renderer2D";
import { ShapeStyle } from "@open-utilities/rendering/ShapeStyle";
import { assertNever } from "@open-utilities/types/assertNever";
import { GlobalTransform } from "./spatialPlugin";

export class RenderedObject2D {
	static readonly defaultStyle = ShapeStyle.fill(Color.fromRGBA(255, 0, 0, 255 / 2))

	constructor(public render: (renderer: Renderer2D)=>void) {}

	static fromShape(shape: Circle | Rect | Capsule2D, style = this.defaultStyle, zIndex?: number) {
		if (shape instanceof Circle) return new RenderedObject2D(renderer => {
			renderer.drawCircle({ circle: shape, style, zIndex })
		});

		if (shape instanceof Rect) return new RenderedObject2D(renderer => {
			renderer.drawRect({ rect: shape, style, zIndex });
		});

		if (shape instanceof Capsule2D) return new RenderedObject2D(renderer => {
			renderer.drawCapsule({ capsule: shape, style, zIndex });
		});

		assertNever(shape);
	}
}

export function renderingPlugin(ecs: ECS) {
	ecs.systems.onRender.add(renderShapes);

	const renderer = ecs.resources.get(Renderer2D);
	ecs.systems.onPreUpdate.add(()=>renderer.clear());
	ecs.systems.onPostRender.add(()=>renderer.flush());
}

export type RenderedLayer = {
	shape: Circle | Rect | Capsule2D;
	style?: ShapeStyle;
	zIndex?: number;
}


function renderShapes(context: ECSUpdateContext) {
	const renderer = context.ecs.resources.get(Renderer2D);
	for (const [shape, transform] of context.entities.query(RenderedObject2D, GlobalTransform)) {
		renderer.withTransform(transform.transform, ()=> {
			shape.render(renderer);
		});
	}
}