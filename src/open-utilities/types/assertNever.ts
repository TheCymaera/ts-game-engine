export function assertNever(value: never): never {
	throw new Error(value + " is not a valid type.");
}