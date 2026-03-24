import { Duration, } from "../core/Duration.js";

export abstract class AnimationFrameScheduler {
	static schedule(): Promise<Duration> {
		const oldTime = performance.now();
		return new Promise(resolve=>requestAnimationFrame(()=>resolve(Duration.milliseconds(performance.now() - oldTime))));
	}

	static periodic(callback: (context: { elapsedTime: Duration })=>void) {
		let lastTime = performance.now();
		let handle: number;
		const loop = () => {
			const currentTime = performance.now();
			const elapsedTime = Duration.milliseconds(currentTime - lastTime);
			lastTime = currentTime;
			callback({ elapsedTime });
			handle = requestAnimationFrame(loop);
		}

		handle = requestAnimationFrame(loop);

		return { [Symbol.dispose]: ()=>cancelAnimationFrame(handle) }
	}
}