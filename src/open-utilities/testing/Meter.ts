export interface MeterStats {
	min: number;
	max: number;
	average: number;
	current: number;
	median: number;
	standardDeviation: number;
	sampleCount: number;
	lifetimeMin: number;
	lifetimeMax: number;
}

export class Meter {
	constructor(maxSamples = 100) {
		this.#maxSamples = maxSamples;
	}

	get stats(): MeterStats {
		this.#updateStats();
		return this.#statsCached;
	}

	timer() {
		const start = performance.now();
		return {
			[Symbol.dispose]: () => {
				const end = performance.now();
				this.addSample(end - start);
			}
		};
	}

	addSample(value: number): void {
		this.#samples.push(value);

		this.#statsCached.lifetimeMin = Math.min(this.#statsCached.lifetimeMin, value);
		this.#statsCached.lifetimeMax = Math.max(this.#statsCached.lifetimeMax, value);
		
		// Maintain rolling window
		if (this.#samples.length > this.#maxSamples) {
			const removed = this.#samples.shift()!;
			this.#sum -= removed;
			this.#sumSquares -= removed * removed;
		}
		
		this.#sum += value;
		this.#sumSquares += value * value;

		this.#statsNeedsUpdate = true;
	}

	toString(precision = 2): string {
		const stats = this.stats;

		return `min=${stats.min.toFixed(precision)}, `+
			`max=${stats.max.toFixed(precision)}, `+
			`avg=${stats.average.toFixed(precision)}, `+
			`current=${stats.current.toFixed(precision)}, `+
			`median=${stats.median.toFixed(precision)}, `+
			`stdDev=${stats.standardDeviation.toFixed(precision)}, `+
			`percentile(50=${this.getPercentile(50).toFixed(precision)},`+
			`75=${this.getPercentile(75).toFixed(precision)},`+
			`90=${this.getPercentile(90).toFixed(precision)})`;

	}

	isOutlier(value: number): boolean {
		const stats = this.stats;
		const threshold = 2 * stats.standardDeviation;
		return Math.abs(value - stats.average) > threshold;
	}


	getPercentile(p: number) {
		this.#updateStats();
		const sorted = this.#statsCached.sortedSamples;
		const index = Math.floor((p / 100) * (sorted.length - 1));
		return sorted[index] ?? 0;
	}


	#samples: number[] = [];
	#maxSamples: number;
	
	#sum = 0;
	#sumSquares = 0;
	#statsNeedsUpdate = false;

	readonly #statsCached = {
		sortedSamples: [] as number[],
		min: 0,
		max: 0,
		average: 0,
		current: 0,
		median: 0,
		standardDeviation: 0,
		sampleCount: 0,
		lifetimeMin: -Infinity,
		lifetimeMax: Infinity,
	}

	#updateStats() {
		if (!this.#statsNeedsUpdate) return;
		if (this.#samples.length === 0) return

		const sorted = [...this.#samples].sort((a, b) => a - b);
		const count = this.#samples.length;
		const average = this.#sum / count;
		
		// Calculate standard deviation
		const variance = (this.#sumSquares / count) - (average * average);
		const standardDeviation = Math.sqrt(Math.max(0, variance));

		const median = count % 2 === 0
			? (sorted[Math.floor(count / 2) - 1]! + sorted[Math.floor(count / 2)]!) / 2
			: sorted[Math.floor(count / 2)]!;

		this.#statsCached.sortedSamples = sorted;
		
		this.#statsCached.min = sorted[0]!;
		this.#statsCached.max = sorted[sorted.length - 1]!;
		this.#statsCached.average = average;
		this.#statsCached.current = this.#samples[this.#samples.length - 1]!;
		this.#statsCached.median = median;
		this.#statsCached.standardDeviation = standardDeviation;
		this.#statsCached.sampleCount = count;
	}
}
