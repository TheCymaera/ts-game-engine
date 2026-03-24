export function assertNever(value: never): never {
	throw new Error(value + " is not a valid type.");
}

export function assertUnreachable(message = "This code should be unreachable."): never {
	throw new Error(message);
}