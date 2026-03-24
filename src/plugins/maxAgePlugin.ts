import { ECS, Entity, type ECSUpdateContext } from "@open-utilities/ecs/ECS";
import type { Duration } from "@open-utilities/core/Duration";

export function maxAgePlugin(ecs: ECS) {
	ecs.systems.onUpdate.add(removeExpiredEntities);
}

export class MaxAge {
	constructor(readonly time: Duration, readonly spawnTime = Date.now()) {}
}


function removeExpiredEntities(context: ECSUpdateContext) {
	for (const [entity, maxAge] of context.entities.query(Entity, MaxAge)) {
		const age = Date.now() - maxAge.spawnTime;
		if (age > maxAge.time.milliseconds) {
			context.entities.remove(entity);
		}
	}
}