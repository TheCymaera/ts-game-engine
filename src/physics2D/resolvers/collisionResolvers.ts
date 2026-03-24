import type { Vector2 } from "@open-utilities/maths/Vector2";
import { colliderContactPoints } from "../contact-points/contactPoints";
import type { PhysicsBody, PhysicsCollisionResult } from "@physics2D/physics2D";

export function resolveCollisionWithoutRotation(collision: PhysicsCollisionResult) {
	separateBodies(collision);

	const { bodyA, bodyB, normal } = collision;

	// Calculate relative velocity
	const relativeVelocity = collision.bodyB.velocity.clone().subtract(collision.bodyA.velocity);

	// If they are separating, no need to resolve
	const velocityAlongNormal = relativeVelocity.dot(collision.normal);
	if (velocityAlongNormal > 0) return;

	// Calculate restitution
	const restitution = Math.min(bodyA.material.restitution, bodyB.material.restitution);

	// Apply impulse
	const impulseScalar = (-(1 + restitution) * velocityAlongNormal) / (1 / bodyA.mass + 1 / bodyB.mass);
	const impulse = normal.clone().multiply(impulseScalar);
	bodyA.velocity.add(impulse.clone().divide(-bodyA.mass))
	bodyB.velocity.add(impulse.clone().divide(bodyB.mass));

	// Apply friction
	const tangent = relativeVelocity.clone().subtract(normal.clone().multiply(velocityAlongNormal));
	if (tangent.isNearlyZero()) return;
	tangent.normalize();

	const jt = -relativeVelocity.dot(tangent) / (1 / bodyA.mass + 1 / bodyB.mass);
	const j = impulseScalar;

	const staticFriction = Math.sqrt(bodyA.material.staticFriction * bodyB.material.staticFriction);
	const dynamicFriction = Math.sqrt(bodyA.material.dynamicFriction * bodyB.material.dynamicFriction);

	let frictionImpulse: Vector2;
	if (Math.abs(jt) <= j * staticFriction) {
		frictionImpulse = tangent.clone().multiply(jt);
	} else {
		frictionImpulse = tangent.clone().multiply(-j * dynamicFriction);
	}

	bodyA.velocity.add(frictionImpulse.clone().divide(-bodyA.mass));
	bodyB.velocity.add(frictionImpulse.clone().divide(bodyB.mass));
}


export function resolveCollisionWithRotation(collision: PhysicsCollisionResult) {
	separateBodies(collision);
	
	const { bodyA, bodyB, normal } = collision;

	const restitution = Math.min(bodyA.material.restitution, bodyB.material.restitution);
	const staticFriction = Math.sqrt(bodyA.material.staticFriction * bodyB.material.staticFriction);
	const dynamicFriction = Math.sqrt(bodyA.material.dynamicFriction * bodyB.material.dynamicFriction);

	const contactPoints = colliderContactPoints(bodyA.transformedShape, bodyB.transformedShape);


	let impulses: Readonly<{ impulse: Vector2; raPerp: Vector2; rbPerp: Vector2 }>[] = [];
	const jList = contactPoints.map(() => 0);
	for (const [i, contactPoint] of contactPoints.entries()) {
		const { relativeVelocity, raPerp, rbPerp } = calculateRelativeVelocity(bodyA, bodyB, contactPoint);

		const velocityAlongNormal = relativeVelocity.dot(normal);
		if (velocityAlongNormal > 0) continue;

		const j = -(1 + restitution) * calculateImpulseScalar(
			velocityAlongNormal, normal,
			bodyA, bodyB, 
			raPerp, rbPerp,
			contactPoints.length
		);

		jList[i] = j;

		const impulse = normal.clone().multiply(j);
		impulses.push({ impulse, raPerp, rbPerp });
	}

	applyImpulses(bodyA, bodyB, impulses);
	
	impulses = [];
	for (const [i, contactPoint] of contactPoints.entries()) {
		const { relativeVelocity, raPerp, rbPerp } = calculateRelativeVelocity(bodyA, bodyB, contactPoint);

		const tangent = relativeVelocity.clone().subtract(normal.clone().multiply(relativeVelocity.dot(normal)));
		if (tangent.isNearlyZero()) continue;
		tangent.normalize();

		const jt = calculateImpulseScalar(
			-relativeVelocity.dot(tangent), tangent, 
			bodyA, bodyB, 
			raPerp, rbPerp, 
			contactPoints.length
		);

		const j = jList[i]!;

		let impulse: Vector2;
		if (Math.abs(jt) <= j * staticFriction) {
			impulse = tangent.clone().multiply(jt);
		} else {
			impulse = tangent.clone().multiply(-j * dynamicFriction);
		}

		impulses.push({ impulse, raPerp, rbPerp });
	}

	applyImpulses(bodyA, bodyB, impulses);
}


function calculateImpulseScalar(
	velocityAlongDirection: number, direction: Vector2,
	bodyA: PhysicsBody, bodyB: PhysicsBody,
	raPerp: Vector2, rbPerp: Vector2,
	contactPointsCount: number
) {
	const denom = (1 / bodyA.mass) + (1 / bodyB.mass) +
		(raPerp.dot(direction) ** 2) * bodyA.inverseInertia +
		(rbPerp.dot(direction) ** 2) * bodyB.inverseInertia ;

	return velocityAlongDirection / denom / contactPointsCount;
}

function applyImpulses(bodyA: PhysicsBody, bodyB: PhysicsBody, impulses: Readonly<{ impulse: Vector2; raPerp: Vector2; rbPerp: Vector2 }>[] ) {
	for (const { impulse, raPerp, rbPerp } of impulses) {
		bodyA.velocity.add(impulse.clone().divide(-bodyA.mass));
		bodyB.velocity.add(impulse.clone().divide(bodyB.mass));

		bodyA.angularVelocity += bodyA.inverseInertia * raPerp.dot(impulse.clone().multiply(-1));
		bodyB.angularVelocity += bodyB.inverseInertia * rbPerp.dot(impulse);
	}
}

function calculateRelativeVelocity(bodyA: PhysicsBody, bodyB: PhysicsBody, contactPoint: Vector2) {
	const raPerp = contactPoint.clone().subtract(bodyA.position).perpendicular();
	const rbPerp = contactPoint.clone().subtract(bodyB.position).perpendicular();

	const angularLinearA = raPerp.clone().multiply(bodyA.angularVelocity);
	const angularLinearB = rbPerp.clone().multiply(bodyB.angularVelocity);

	const relativeVelocity = 
		bodyB.velocity.clone().add(angularLinearB)
		.subtract(bodyA.velocity.clone().add(angularLinearA));

	return { relativeVelocity, raPerp, rbPerp };
}

function separateBodies(collision: PhysicsCollisionResult): void {
	const { bodyA, bodyB, penetration } = collision;

	const ratio = bodyB.mass === Infinity ? 1 : bodyB.mass / (bodyA.mass + bodyB.mass);

	const moveA = penetration.clone().multiply(-ratio);
	const moveB = penetration.clone().multiply(1 - ratio);
	
	bodyA.position.add(moveA);
	bodyB.position.add(moveB);
}