export function normalize(value: number, min: number, max: number) {
	if (max === min) return 0;
	return (value - min) / (max - min);
}