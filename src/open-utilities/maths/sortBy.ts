export function sortBy<T>(array: T[], fn: (item: T) => number): T[] {
	const entries = array.map(item => ({ item, value: fn(item) }));
	entries.sort((a, b) => a.value - b.value);
	return entries.map(entry => entry.item);
}