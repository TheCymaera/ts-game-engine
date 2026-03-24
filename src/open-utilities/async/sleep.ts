import type { Duration } from "../core/Duration.js";

export function sleep(duration: Duration) {
	return new Promise(resolve=>setTimeout(resolve, duration.milliseconds));
}