export function wrapRadians(angle: number) {
	let wrapped = angle;
	while (wrapped > Math.PI) wrapped -= Math.PI * 2;
	while (wrapped < -Math.PI) wrapped += Math.PI * 2;
	return wrapped;
}