export function minBy<T>(array: T[], fn: (item: T) => number): T {
	let minItem = array[0]!;
	let minValue = fn(minItem);
	for (let i = 1; i < array.length; i++) {
		const item = array[i]!;
		const value = fn(item);
		if (value < minValue) {
			minValue = value;
			minItem = item;
		}
	}
	return minItem;
}
