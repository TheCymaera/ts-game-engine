import type { ECS, ECSUpdateContext } from "@open-utilities/ecs/ECS";
import { PhysicsBody } from "@physics2D/physics2D";

export class Gravity {}

export function gravityPlugin(app: ECS) {
	app.systems.onTick.add(applyGravity);
}

function applyGravity(context: ECSUpdateContext) {
	const gravity = 9.81;
	for (const [_, physicsBody] of context.entities.query(Gravity, PhysicsBody)) {
		physicsBody.velocity.y -= gravity * context.delta.seconds;
	}
}