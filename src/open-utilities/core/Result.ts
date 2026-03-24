import { isRecord } from "../types/isRecord";

export interface ResultOk<T> {
	readonly isOk: true;
	readonly ok: T;
}

export interface ResultError<E> {
	readonly isOk: false;
	readonly error: E;
}

export type Result<T, E> = ResultOk<T> | ResultError<E>;

export const Result = {
	ok<T, _E>(ok: T): Result<T, _E> {
		return { isOk: true, ok } as ResultOk<T>;
	},

	error<_T, E>(error: E): Result<_T, E> {
		return { isOk: false, error } as ResultError<E>;
	},

	[Symbol.hasInstance](value: unknown): boolean {
		if (!isRecord(value)) return false;
		if (value["isOk"] === true && "ok" in value) return true;
		if (value["isOk"] === false && "error" in value) return true;
		return false;
	}
}