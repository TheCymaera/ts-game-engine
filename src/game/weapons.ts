import { Duration } from "@open-utilities/core/Duration";
import { ECS, Entity, type ECSUpdateContext as ECSContext } from "@open-utilities/ecs/ECS";
import { cameraShake } from "./resources";
import type { Player } from "./player";

export interface ProjectileWeapon {
	cooldown: number;
	bulletSpeed: number;
	bulletLifetime: Duration;
	onFire?: (context: ECSContext, player: Player, bullet: Entity) => void;
}

export const machineGun: ProjectileWeapon = {
	cooldown: .5 / 100,
	bulletSpeed: 50 * 1,
	bulletLifetime: Duration.seconds(1),
	onFire: () => {
		cameraShake.randomShake({
			magnitude: .3 / 5,
			duration: Duration.seconds(.1),
		});
	}
}