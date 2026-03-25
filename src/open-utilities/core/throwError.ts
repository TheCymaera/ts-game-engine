export function throwError(message: string | Error): never {
	throw message instanceof Error ? message : new Error(message);
}
