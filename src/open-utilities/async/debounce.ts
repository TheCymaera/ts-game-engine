import type { Duration } from "../core/Duration.js";

export function debounceFunction<T extends (...args: any[]) => any>(wait: Duration, func: T): T {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	return function (this: T, ...args: unknown[]) {
		const later = () => {
			timeout = undefined;
			func.apply(this, args);
		};
		clearTimeout(timeout);
		timeout = setTimeout(later, wait.milliseconds);
	} as T;
}