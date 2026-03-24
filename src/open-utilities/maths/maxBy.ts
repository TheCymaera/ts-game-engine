export function maxBy<T>(array: T[], fn: (item: T) => number): T {
	let maxItem = array[0]!;
	let maxValue = fn(maxItem);
	for (let i = 1; i < array.length; i++) {
		const item = array[i]!;
		const value = fn(item);
		if (value > maxValue) {
			maxValue = value;
			maxItem = item;
		}
	}
	return maxItem;
}
