import { ECS, Entity } from "@open-utilities/ecs/ECS";
import { Circle } from "@open-utilities/maths/Circle";
import type { Duration } from "@open-utilities/core/Duration";
import { Vector2 } from "@open-utilities/maths/Vector2";
import { PhysicsBody } from "@physics2D/physics2D";
import { RenderedObject2D } from "@plugins/renderingPlugin";
import { Transform2D } from "@plugins/spatialPlugin";
import { Gravity } from "./gravity";

// Bullet
export function bulletPlugin(app: ECS) {
}

export class Bullet { }

//const shape = Rect.fromCenter(Vector2.new(0, 0), .2, .2);
const shape = Circle.fromRadius(Vector2.new(0, 0), .1);

export const bulletBundle = (options: { owner: Entity, position: Vector2, velocity: Vector2, lifeTime: Duration })=>[
	new Bullet(),
	//new MaxAge(options.lifeTime),
	new Gravity(),
	new Transform2D(options.position),
	PhysicsBody.dynamic({
		shape: shape,
		//isContinuous: options.velocity.length() > 10,
		position: options.position,
		velocity: options.velocity,
		canCollideWith(other: PhysicsBody) {
			return other.entity !== options.owner;// && other.entity.has(Bullet) === false;
		},
		onCollide() {
			//this.velocity.set(0, 0);
			//this.entity.remove(PhysicsBody);
		}
	}),
	RenderedObject2D.fromShape(shape)
]