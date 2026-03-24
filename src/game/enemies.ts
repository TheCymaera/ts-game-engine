import type { ECS, ECSUpdateContext } from "@open-utilities/ecs/ECS";
import { Circle } from "@open-utilities/maths/Circle";
import { Rect } from "@open-utilities/maths/Rect";
import { Vector2 } from "@open-utilities/maths/Vector2";
import { PhysicsBody } from "@physics2D/physics2D";
import { RenderedObject2D } from "@plugins/renderingPlugin";
import { Transform2D } from "@plugins/spatialPlugin";

export function spiderPlugin(app: ECS) {
	app.systems.onUpdate.add(handleSpiderMovement);
}


export class Spider {}

export const spiderBundle = (position: Vector2)=>[
	new Transform2D(),
	new Spider(),
	RenderedObject2D.fromShape(Circle.fromRadius(Vector2.new(0, 0), .5)),
	PhysicsBody.dynamic({
		mass: 10,
		shape: Rect.fromCenter(Vector2.new(0, 0), 1, 1),
		//shape: Circle.fromRadius(Vector2.new(0, 0), .5),
		position: position
	}),
]

function handleSpiderMovement(context: ECSUpdateContext) {
}