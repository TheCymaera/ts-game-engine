export class Random {
	constructor(private floatProvider: () => number) {}

	nextFloat(min = 0, max = 1): number {
		return this.floatProvider() * (max - min) + min;
	}

	nextInt(min = 0, max = 1): number {
		return Math.floor(this.nextFloat(min, max + 1));
	}

	nextBoolean(): boolean {
		return this.nextFloat() < 0.5;
	}

	normalDistribution(mean = 0, stdDev = 1): number {
		let u = 0, v = 0;
		while (u === 0) u = this.nextFloat(); // avoid log(0)
		while (v === 0) v = this.nextFloat();
		const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
		return z * stdDev + mean;
	}

	shuffle<T>(array: T[]): T[] {
		for (let i = array.length - 1; i > 0; i--) {
			const j = this.nextInt(0, i);
			[array[i], array[j]] = [array[j]!, array[i]!];
		}

		return array;
	}

	static readonly default = new Random(() => Math.random());

	static mulberry32(seed: number): Random {
		return new Random(() => {
			seed |= 0;
			seed = (seed + 0x6D2B79F5) | 0;
			let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), seed | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		});
	}
}