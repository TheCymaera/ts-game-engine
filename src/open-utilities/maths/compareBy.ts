export function compareBy<T>(...fun: ((a: T, b: T) => number)[]) {
	return (a: T, b: T) => {
		for (const fn of fun) {
			const result = fn(a, b);
			if (result !== 0) return result;
		};
		return 0;
	}
}