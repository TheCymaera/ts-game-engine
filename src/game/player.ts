import { ECS, Entity, type ECSUpdateContext } from "@open-utilities/ecs/ECS";
import { Keyboard } from "@open-utilities/io/Keyboard";
import { Vector2 } from "@open-utilities/maths/Vector2";
import { bulletBundle } from "./bullet";
import { PhysicsBody } from "@physics2D/physics2D";
import { RenderedObject2D } from "@plugins/renderingPlugin";
import { Transform2D } from "@plugins/spatialPlugin";
import { inputMap, mouse } from "./resources";
import { machineGun } from "./weapons";
import { Gravity } from "./gravity";
import { Capsule2D } from "@open-utilities/maths/Capsule2D";

export function playerPlugin(app: ECS) {
	app.systems.onTick.add(handlePlayerControls)
}

export class Player {
	speed = 5 * 1.5
	acceleration = this.speed * 10;
	lastShootTime = Date.now();
	weapon = machineGun;
}

//const shape = Rect.fromCenter(Vector2.new(0, 0), 1, 1);
const shape = Capsule2D.fromCenter(
	Vector2.new(0, 0),
	Vector2.new(1, 2)
);

//Circle.fromRadius(Vector2.new(0, 0), 0.5);

export const playerBundle = ()=> [
	new Player(),
	new Transform2D(),
	PhysicsBody.dynamic({
		shape: shape,
		//isContinuous: true,
		position: Vector2.new(0, 0)
	}),
	RenderedObject2D.fromShape(shape),
]

function handlePlayerControls(context: ECSUpdateContext) {
	for (const [player, physicsBody, transform, entity] of context.entities.query(Player, PhysicsBody, Transform2D, Entity)) {
		// Move character
		const moveDirection = Keyboard.getMoveVector(inputMap.arrowUp, inputMap.arrowDown, inputMap.arrowLeft, inputMap.arrowRight);
		const targetVelocity = moveDirection.multiply(player.speed);

		if (entity.query(Gravity)) {
			targetVelocity.y = physicsBody.velocity.y;
		}

		physicsBody.velocity.moveTowards(targetVelocity, player.acceleration * context.delta.seconds);
		physicsBody.angularVelocity = 2;
	
		// Fire weapon
		const weapon = player.weapon;
		const hasCooldown = Date.now() - player.lastShootTime < weapon.cooldown * 1000;
		if (inputMap.fire && !hasCooldown) {
			player.lastShootTime = Date.now();

			const direction = mouse.worldPosition.subtract(transform.position).normalize() ?? Vector2.new(0, 1);

			const bullet = context.entities.spawn(bulletBundle({
				owner: entity,
				position: transform.position.clone(),
				velocity: direction.multiply(weapon.bulletSpeed),
				lifeTime: weapon.bulletLifetime,
			}));

			weapon.onFire?.(context, player, bullet);
		}
	}
}