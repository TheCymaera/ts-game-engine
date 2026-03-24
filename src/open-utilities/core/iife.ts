/**
 * Utilities for working with immediately-invoked function expressions (IIFEs).
 */
export namespace iife {
	/**
	 * Invokes the given function immediately and returns its result.
	 */
	export function result<T extends ()=>any>(fn: T): ReturnType<T> {
		return fn();
	}

	/**
	 * Invokes the given function immediately and returns the function itself.
	 */
	export function fn<T extends ()=>any>(fn: T): T {
		fn();
		return fn;
	}
}