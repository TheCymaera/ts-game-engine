export function denormalize(normalized: number, min: number, max: number) {
	return normalized * (max - min) + min;
}
