//export function benchmark(label: string) {
//	const start = performance.now();
//	return {
//		[Symbol.dispose]() {
//			const end = performance.now();
//			console.log(`Benchmark [${label}]: ${ (end - start).toFixed(3) } ms`);
//		}
//	};
//}