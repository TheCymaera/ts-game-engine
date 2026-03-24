export function sumArray(array: readonly number[]) {
	let sum = 0;
	for (const value of array) {
		sum += value;
	}
	return sum;
}