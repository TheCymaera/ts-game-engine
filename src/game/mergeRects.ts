import { Meter } from "@open-utilities/testing/Meter";
import { Rect } from "@open-utilities/maths/Rect";

const meter = new Meter();

export const mergeRects = mergeRects1;

function mergeRects1(rects: Rect[]) {
	//using _ = meter.timer();

	const merged = [...rects];

	let didMerge = true;
	while (didMerge) {
		didMerge = false;
		for (let i = 0; i < merged.length; i++) {
			for (let j = i + 1; j < merged.length; j++) {
				const mergeResult = merge(merged[i]!, merged[j]!);
				if (mergeResult) {
					merged.splice(j, 1);
					merged.splice(i, 1, mergeResult);
					didMerge = true;
					break;
				}
			}
			if (didMerge) break;
		}
	}

	return merged;
}

function merge(a: Rect, b: Rect) {
	if (a.min.x === b.min.x && a.max.x === b.max.x) {
		if (a.min.y === b.max.y || a.max.y === b.min.y) {
			return Rect.fromCorners(a.min.x, Math.min(a.min.y, b.min.y), a.max.x, Math.max(a.max.y, b.max.y));
		}
	}

	if (a.min.y === b.min.y && a.max.y === b.max.y) {
		if (a.min.x === b.max.x || a.max.x === b.min.x) {
			return Rect.fromCorners(Math.min(a.min.x, b.min.x), a.min.y, Math.max(a.max.x, b.max.x), a.max.y);
		}
	}

	return undefined;
}

function mergeRects2(rects: Rect[]) {
	//using _ = meter.timer();

	// Optional tolerance for float coords; set to 0 for exact matching
	const epsilon = 1e-6;

	rects = rects.slice();

	let changed = true;
	while (changed) {
		changed = false;

		// Pass 1: merge vertically within groups that share identical [minX,maxX]
		{
			const groups = new Map<string, Rect[]>();
			for (const r of rects) {
				const key = `${r.minX},${r.maxX}`;
				const arr = groups.get(key);
				if (arr) arr.push(r); else groups.set(key, [r]);
			}

			const next: Rect[] = [];
			for (const arr of groups.values()) {
				// Sort by Y to scan and coalesce neighbors
				arr.sort((a, b) => (a.minY - b.minY) || (a.maxY - b.maxY));

				let cur = arr[0]!;
				for (let i = 1; i < arr.length; i++) {
					const b = arr[i]!;
					// Check if they touch vertically and x-extent is already equal by grouping
					const touches =
						Math.abs(cur.maxY - b.minY) <= epsilon ||
						Math.abs(b.maxY - cur.minY) <= epsilon;

					if (touches) {
						// Merge into a taller rect
						cur = Rect.fromCorners(
							cur.minX,
							Math.min(cur.minY, b.minY),
							cur.maxX,
							Math.max(cur.maxY, b.maxY)
						);
						changed = true;
					} else {
						next.push(cur);
						cur = b;
					}
				}
				next.push(cur);
			}

			if (changed) {
				rects = next;
				continue; // run vertical pass again first, to fully collapse columns
			}
		}

		// Pass 2: merge horizontally within groups that share identical [minY,maxY]
		{
			const groups = new Map<string, Rect[]>();
			for (const r of rects) {
				const key = `${r.minY},${r.maxY}`;
				const arr = groups.get(key);
				if (arr) arr.push(r); else groups.set(key, [r]);
			}

			const next: Rect[] = [];
			for (const arr of groups.values()) {
				// Sort by X to scan and coalesce neighbors
				arr.sort((a, b) => (a.minX - b.minX) || (a.maxX - b.maxX));

				let cur = arr[0]!;
				for (let i = 1; i < arr.length; i++) {
					const b = arr[i]!;
					// Check if they touch horizontally and y-extent is already equal by grouping
					const touches =
						Math.abs(cur.maxX - b.minX) <= epsilon ||
						Math.abs(b.maxX - cur.minX) <= epsilon;

					if (touches) {
						// Merge into a wider rect
						cur = Rect.fromCorners(
							Math.min(cur.minX, b.minX),
							cur.minY,
							Math.max(cur.maxX, b.maxX),
							cur.maxY
						);
						changed = true;
					} else {
						next.push(cur);
						cur = b;
					}
				}
				next.push(cur);
			}

			rects = next;
		}
	}

	return rects;
}