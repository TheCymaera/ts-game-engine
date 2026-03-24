import { Duration } from "../core/Duration";
import { type ClassOf } from "../types/ClassOf";

/**
 * Entity Component System
 */
export class ECS {
	readonly entities = new EntityList;
	readonly systems = new ECSSystemsList();
	readonly resources = new ResourceList();

	startUp() {
		for (const system of this.systems.onStartUp) {
			system({
				delta: Duration.milliseconds(0),
				entities: this.entities,
				ecs: this,
				interpolation: 0,
				resources: this.resources
			});
		}
	}

	runMainLoop(delta: Duration) {
		if (this.systems.tickMode === ECSTickMode.Fixed) {
			this.#runTickFixed(delta);
		} else if (this.systems.tickMode === ECSTickMode.Clamped) {
			this.#runTickSubStepped(delta);
		}

		const interpolation = this.#tickInterpolation();
		this.#runSystems(this.#updateSystems(), {
			delta,
			entities: this.entities,
			resources: this.resources,
			ecs: this,
			interpolation
		});

		this.reRender();
	}

	reRender() {
		const interpolation = this.#tickInterpolation();
		this.#runSystems(this.#renderSystems(), {
			delta: Duration.milliseconds(0),
			entities: this.entities,
			ecs: this,
			interpolation,
			resources: this.resources
		});
	}

	#tickInterpolation() {
		return (this.#tickDeltaAccumulator) / this.systems.tickDelta.milliseconds;
	}

	#tickDeltaAccumulator = 0;
	#runTickFixed(delta: Duration) {
		this.#tickDeltaAccumulator += delta.milliseconds;
		while (this.#tickDeltaAccumulator >= this.systems.tickDelta.milliseconds) {
			this.#runSystems(this.#tickSystems(), {
				delta: this.systems.tickDelta,
				entities: this.entities,
				ecs: this,
				interpolation: 0,
				resources: this.resources
			});
			this.#tickDeltaAccumulator -= this.systems.tickDelta.milliseconds;
		}
	}
	#runTickSubStepped(delta: Duration) {
		const steps = Math.ceil(delta.milliseconds / this.systems.tickDelta.milliseconds);
		const deltaPerStep = Duration.milliseconds(delta.milliseconds / steps);

		for (let i = 0; i < steps; i++) {
			this.#runSystems(this.#tickSystems(), {
				delta: deltaPerStep,
				entities: this.entities,
				ecs: this,
				interpolation: 0,
				resources: this.resources
			});
		}
		this.#tickDeltaAccumulator = 0;
	}

	#runSystems<T>(systems: Iterable<(event:T)=>void>, event: T) {
		for (const system of systems) {
			system(event);
		}
	}

	#tickSystems() {
		return [
			...this.systems.onPreTick,
			...this.systems.onTick,
			...this.systems.onPostTick,
		];
	}

	#updateSystems() {
		return [
			...this.systems.onPreUpdate,
			...this.systems.onUpdate,
			...this.systems.onPostUpdate,
		];
	}

	#renderSystems() {
		return [
			...this.systems.onPreRender,
			...this.systems.onRender,
			...this.systems.onPostRender,
		];
	}
}

export enum ECSTickMode {
	/**
	 * Run ticks at a fixed rate, ensuring simulations are deterministic and reproducible.
	 * Physics objects should be rendered with interpolation to avoid jitter.
	 */
	Fixed,
	/**
	 * Runs ticks together with updates, breaking them into smaller sub-ticks as needed.
	 * Physics objects can be rendered without interpolation, but simulations may be non-deterministic.
	 */
	Clamped,
}


export class ECSSystemsList {
	tickDelta = Duration.seconds(1 / 50);
	tickMode = ECSTickMode.Fixed;

	readonly onStartUp = new Set<System>();

	readonly onPreTick = new Set<System>();
	readonly onTick = new Set<System>();
	readonly onPostTick = new Set<System>();

	readonly onPreUpdate = new Set<System>();
	readonly onUpdate = new Set<System>();
	readonly onPostUpdate = new Set<System>();
	
	readonly onPreRender = new Set<System>();
	readonly onRender = new Set<System>();
	readonly onPostRender = new Set<System>();
}

export type ECSPlugin = (ecs: ECS) => void;

export class Entity {
	readonly id: string = crypto.randomUUID();

	constructor(params: Object[]) {
		this.components = new Map();
		for (const param of params) {
			this.components.set(param.constructor as ClassOf<any>, param);
		}
	}

	add<T extends Object>(component: T) {
		this.components.set(component.constructor, component);
		return this;
	}

	remove<T extends Function>(type: T) {
		this.components.delete(type);
		return this;
	}

	query<T>(type: ClassOf<T>): T | undefined {
		// @ts-expect-error Cannot infer type
		if (type === Entity) return this as T;
		return this.components.get(type);
	}

	has<T extends Object>(type: ClassOf<T>): boolean {
		return this.components.has(type);
	}

	components: Map<ClassOf<any>, any>;
}


export type System = (context: ECSUpdateContext) => void;


export interface ECSUpdateContext {
	readonly ecs: ECS;
	readonly delta: Duration;
	readonly entities: EntityList;
	readonly resources: ResourceList;
	readonly interpolation: number;
}


export class EntityList {
	#entities: Entity[] = [];

	constructor(entities: Entity[] = []) {
		this.#entities = entities;
	}

	get size() {
		return this.#entities.length;
	}

	spawn<T extends unknown[]>(components: T) {
		const entity = new Entity(components as Object[]);
		this.#entities.push(entity);
		return entity;
	}

	remove(entity: Entity) {
		const index = this.#entities.indexOf(entity);
		if (index !== -1) {
			this.#entities.splice(index, 1);
		}
		return this;
	}

	query<T extends any[]>(...types: { [K in keyof T]: ClassOf<T[K]> }) {
		const results: T[] = [];
		for (const entity of this.#entities) {
			const items = types.map(type => entity.query(type));
			if (items.every(Boolean)) {
				results.push(items as T);
			}
		}
		return results.values()
	}

	has(entity: Entity) {
		return this.#entities.includes(entity);
	}
}

export class ResourceList {
	#resources = new Map<ClassOf<any>, any>();

	add<T extends Object>(resource: T) {
		this.#resources.set(resource.constructor, resource);
		return this;
	}

	get<T>(type: ClassOf<T>): T {
		const resource = this.#resources.get(type);
		if (!resource) throw new Error(`Resource of type ${type.name} not found`);
		return resource as T;
	}
}