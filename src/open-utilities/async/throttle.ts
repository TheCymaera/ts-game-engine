import type { Duration } from "../core/Duration.js";

export function throttleFunction<T extends (...args: unknown[]) => unknown>(wait: Duration, func: T): T {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	return function (this: T, ...args: unknown[]) {
		const later = () => {
			timeout = undefined;
			func.apply(this, args);
		};
		if (!timeout) {
			timeout = setTimeout(later, wait.milliseconds);
		}
	} as T;
}