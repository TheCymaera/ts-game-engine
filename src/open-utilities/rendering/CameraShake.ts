import type { Duration } from "../core/Duration";
import { Random } from "../maths/Random";
import { Vector2 } from "../maths/Vector2";

export class CameraShake {
	get offset() {
		return this.#shakeOffset;
	}

	update(delta: Duration) {
		this.#shakeOffset = Vector2.new(0, 0);

		for (let i = this.#shakes.length - 1; i >= 0; i--) {
			const shake = this.#shakes[i]!;
			
			const offset = shake.update(delta);
			this.#shakeOffset.add(offset);

			if (shake.magnitude <= 0) {
				this.#shakes.splice(i, 1);
			}
		}
	}

	randomShake(shake: RandomShakeOptions) {
		this.#shakes.push(new RandomShake(shake));
	}

	directionalShake(shake: DirectionalShakeOptions) {
		this.#shakes.push(new DirectionalShake(shake));
	}

	#shakes: (DirectionalShake | RandomShake)[] = [];
	#shakeOffset = Vector2.new(0, 0);
}

export interface DirectionalShakeOptions {
	magnitude: number;
	period: Duration;
	duration: Duration;
	direction: Vector2;
}

class DirectionalShake {
	private currentTime = 0;
	public magnitude: number;
	private decayPerSecond: number;
	constructor(readonly options: DirectionalShakeOptions) {
		this.decayPerSecond = options.magnitude / options.duration.seconds;
		this.magnitude = options.magnitude;
	}

	update(delta: Duration) {
		this.currentTime += delta.seconds;
		
		const offset = this.options.direction.clone().normalize()!.multiply(
			Math.sin(this.currentTime / this.options.period.seconds * Math.PI * 2) * this.magnitude
		);
		this.magnitude -= this.decayPerSecond * delta.seconds;
		return offset;
	}
}

export interface RandomShakeOptions {
	magnitude: number;
	duration: Duration;
	random?: Random;
}

class RandomShake {
	private currentTime = 0;
	public magnitude: number;
	private decayPerSecond: number;
	private random: Random;
	constructor(readonly options: RandomShakeOptions) {
		this.decayPerSecond = options.magnitude / options.duration.seconds;
		this.magnitude = options.magnitude;
		this.random = options.random ?? Random.default;
	}

	update(delta: Duration) {
		this.currentTime += delta.seconds;

		const offset = Vector2.new(
			this.random.nextFloat(-1, 1) * this.magnitude,
			this.random.nextFloat(-1, 1) * this.magnitude
		);
		this.magnitude -= this.decayPerSecond * delta.seconds;
		return offset;
	}
}