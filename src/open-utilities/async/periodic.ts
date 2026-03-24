import type { Duration } from "../core/Duration.js";

export function periodic(duration: Duration, callback: ()=>void) {
	const handle = setInterval(()=>{
		callback();
	}, duration.milliseconds);

	return { [Symbol.dispose]: ()=>clearInterval(handle) }
}