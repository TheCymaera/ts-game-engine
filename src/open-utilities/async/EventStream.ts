export abstract class EventStream<T> {
	abstract listen(onData: (data: T)=>void, options?: {onClose?: ()=>void}): Disposable;

	next() {
		return new Promise<T>(resolve=>{
			const subscription = this.listen((data)=>{
				subscription[Symbol.dispose]();
				resolve(data);
			});
		});
	}

	[Symbol.asyncIterator]() {
		return new EventStreamIterator(this);
	}
}

export class EventStreamController<T> extends EventStream<T> {
	listen(onData: (data: T)=>void) {
		if (this.#subscriptions.includes(onData)) return { [Symbol.dispose]: ()=>{} };
		
		this.#subscriptions.push(onData);
		return {
			[Symbol.dispose]: ()=>{
				const index = this.#subscriptions.indexOf(onData);
				if (index !== -1) this.#subscriptions.splice(index, 1);
			}
		};
	}

	emit(data: T) {
		for (const subscription of this.#subscriptions) subscription(data);
	}

	readonly #subscriptions: ((value: T)=>void)[] = [];
}

class EventStreamIterator<T> implements AsyncIterableIterator<T> {
	constructor(emitter: EventStream<T>) {
		this.#queue = [];
		emitter.listen(
			value=>{
				this.#queue.push({done: false, value: value});
				this.onPush();
			},
			{
				onClose: ()=>{
					this.#queue.push({done: true, value: undefined});
					this.onPush();
				}
			}
		);
	}

	[Symbol.asyncIterator](): AsyncIterableIterator<T> {
		return this;
	}

	async next(): Promise<IteratorResult<T, void>> {
		if (this.#queue.length === 0) await new Promise<void>(resolve=>this.onPush = resolve);
		return this.#queue.shift()!;
	}

	readonly #queue: IteratorResult<T>[];
	onPush: ()=>void = ()=>{};
}