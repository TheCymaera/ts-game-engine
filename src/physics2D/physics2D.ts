import type { Entity } from "@open-utilities/ecs/ECS";
import { Circle } from "@open-utilities/maths/Circle";
import { Capsule2D } from "@open-utilities/maths/Capsule2D";
import { Polygon } from "@open-utilities/maths/Polygon";
import { Rect } from "@open-utilities/maths/Rect";
import { Vector2 } from "@open-utilities/maths/Vector2";
import { assertNever } from "@open-utilities/types/assertNever";
import { resolveCollisionWithoutRotation, resolveCollisionWithRotation } from "./resolvers/collisionResolvers";
import { colliderDiscrete, type Collider2DShape, type CollisionResult } from "./discrete/combined";
import { colliderInertia } from "./inertia/inertia";

export class PhysicsMaterial {
	restitution = .3
	staticFriction = 0.6
	dynamicFriction = 0.4
}

/**
 * A 2D physics body that can be used in the physics simulation.
 */
export class PhysicsBody {
	entity!: Entity;

	isStatic = false;

	mass = 1;
	material = new PhysicsMaterial();
	shape!: Collider2DShape;

	position!: Vector2;
	velocity = Vector2.new(0, 0);

	rotation = 0;
	angularVelocity = 0;

	// computed
	inverseInertia!: number;
	transformedShape!: Collider2DShape;
	boundingBox!: Rect;

	onCollide?: (this: this, collision: PhysicsCollisionResult) => void;
	canCollideWith: (other: PhysicsBody)=>boolean = () => true;

	movementBoundingBox(delta: number): Rect {
		const velocity = this.velocity.clone().multiply(delta);

		const boundingBox = this.boundingBox.clone();
		if (velocity.x > 0) boundingBox.maxX += velocity.x;
		if (velocity.x < 0) boundingBox.minX += velocity.x;
		if (velocity.y > 0) boundingBox.maxY += velocity.y;
		if (velocity.y < 0) boundingBox.minY += velocity.y;

		return boundingBox;
	}

	/**
	 * Dynamic bodies are affected by forces
	 */
	static dynamic(options: Partial<PhysicsBody> & { shape: Collider2DShape, position: Vector2 }) {
		return new PhysicsBody({ ...options });
	}

	/**
	 * Kinematic bodies are not affected by forces but can move and exert forces on other bodies.
	 */
	static kinematic(options: Partial<PhysicsBody> & { shape: Collider2DShape, position: Vector2 }) {
		return new PhysicsBody({ ...options, mass: Infinity });
	}

	/**
	 * Static bodies cannot move and are not affected by forces, but can exert forces on other bodies.
	 */
	static static(options: Partial<PhysicsBody> & { shape: Collider2DShape, position: Vector2 }) {
		return new PhysicsBody({ ...options, mass: Infinity, isStatic: true });
	}

	constructor(options: Partial<PhysicsBody> & { shape: Collider2DShape, position: Vector2 }) {
		for (const [key, value] of Object.entries(options)) {
			if (value === undefined) continue;
			// @ts-expect-error Assign property
			this[key] = value;
		}


		bodyUpdateComputedValues(this);
	}
}

export interface PhysicsCollisionResult extends CollisionResult {
	bodyA: PhysicsBody;
	bodyB: PhysicsBody;
}

export class Physics2D {
	public bodies: readonly PhysicsBody[] = [];
	public subSteps = 5;
	public collisionResolver = resolveCollisionWithRotation;

	step(deltaTime: number): void {
		for (let i = 0; i < this.subSteps; i++) {
			this.subStep(deltaTime / this.subSteps);
		}
	}

	subStep(deltaTime: number): void {
		// update position and cached values
		for (const body of this.bodies) {
			if (body.isStatic) continue;
			body.position.add(body.velocity.clone().multiply(deltaTime));
			body.rotation += body.angularVelocity * deltaTime;

			bodyUpdateComputedValues(body);
		}
		
		// detect collisions
		const collisions = detectCollisions(this.bodies, deltaTime);

		// resolve collisions and invoke callbacks
		for (const collision of collisions) {
			const bothStaticOrKinematic = collision.bodyA.mass === Infinity && collision.bodyB.mass === Infinity;
			if (!bothStaticOrKinematic) {
				this.collisionResolver(collision);
			}

			collision.bodyA.onCollide?.(collision);
			
			if (collision.bodyB.onCollide) collision.bodyB.onCollide(flipCollision(collision));
		}
	}

	static ResolveCollisionWithoutRotation = resolveCollisionWithoutRotation;
	static ResolveCollisionWithRotation = resolveCollisionWithRotation;
}

function detectCollisions(bodies: readonly PhysicsBody[], timeStep: number): PhysicsCollisionResult[] {
	// Broad phase (Sweep and Prune)
	const pairs: [number, number][] = [];
	bodies = bodies.toSorted((a, b) => a.boundingBox.minX - b.boundingBox.minX);

	for (let a = 0; a < bodies.length; a++) {
		const rectA = bodies[a]!.boundingBox;
		const bodyA = bodies[a]!;

		for (let b = a + 1; b < bodies.length; b++) {
			const rectB = bodies[b]!.boundingBox;
			const bodyB = bodies[b]!;

			if (rectB.minX >= rectA.maxX) break;

			if (bodyA.isStatic && bodyB.isStatic) continue;


			if (!bodyA.canCollideWith(bodyB) || !bodyB.canCollideWith(bodyA)) {
				continue;
			}

			if (rectA.minY < rectB.maxY && rectA.maxY > rectB.minY) {
				pairs.push([a, b]);
			}
		}
	}

	// Narrow phase
	const collisions: PhysicsCollisionResult[] = [];
	for (const [a, b] of pairs) {
		const bodyA = bodies[a]!;
		const bodyB = bodies[b]!;

		const collision = colliderDiscrete(bodyA.transformedShape, bodyB.transformedShape);
		if (!collision) continue;

		//if (bodyA.mass !== Infinity) bodyA.transformedShape = transformedCollider(bodyA);
		//if (bodyB.mass !== Infinity) bodyB.transformedShape = transformedCollider(bodyB);
		
		collisions.push({ ...collision, bodyA, bodyB });
	}

	return collisions;
}

function transformedCollider(body: PhysicsBody): Collider2DShape {
	if (body.shape instanceof Rect) {
		if (body.rotation === 0) return body.shape.clone().translate(body.position);

		return Polygon.fromRect(body.shape).rotate(body.rotation).translate(body.position);
	}

	if (body.shape instanceof Circle) {
		return body.shape.clone().translate(body.position);
	}

	if (body.shape instanceof Capsule2D) {
		return body.shape.clone().rotate(body.rotation).translate(body.position);
	}

	if (body.shape instanceof Polygon) {
		return body.shape.clone().rotate(body.rotation).translate(body.position);
	}

	assertNever(body.shape);
}

function bodyUpdateComputedValues(body: PhysicsBody): void {
	body.inverseInertia = body.mass === Infinity ? 0 : 1 / colliderInertia(body.mass, body.shape);
	body.transformedShape = transformedCollider(body);
	body.boundingBox = body.transformedShape.boundingBox();
}

function flipCollision(collision: PhysicsCollisionResult): PhysicsCollisionResult {
	[collision.bodyA, collision.bodyB] = [collision.bodyB, collision.bodyA];
	collision.penetration.multiply(-1);
	collision.normal.multiply(-1);
	return collision;
}