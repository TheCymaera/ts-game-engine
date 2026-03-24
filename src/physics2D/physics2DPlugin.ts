import { ECS, Entity, type ECSUpdateContext } from "@open-utilities/ecs/ECS";
import { ShapeStyle } from "@open-utilities/rendering/ShapeStyle";
import { Color } from "@open-utilities/rendering/Color";
import { Transform2D } from "@plugins/spatialPlugin";
import { Physics2D, PhysicsBody } from "@physics2D/physics2D";
import { Rect } from "@open-utilities/maths/Rect";
import { Circle } from "@open-utilities/maths/Circle";
import { Capsule2D } from "@open-utilities/maths/Capsule2D";
import { Polygon } from "@open-utilities/maths/Polygon";
import { Vector2 } from "@open-utilities/maths/Vector2";
import { Renderer2D } from "@open-utilities/rendering/Renderer2D";
import { PathStyle } from "@open-utilities/rendering/PathStyle";
import { LineSegment } from "@open-utilities/maths/LineSegment";

export enum PhysicsSmoothingMode {
	/**
	 * Physics bodies are rendered as-is.
	 * Bodies may "jitter" if physics updates are not synchronized with frame updates,
	 * as such it should be used with `ECSTickMode.Clamped`.
	 */
	None,
	/**
	 * Interpolates bodies using their previous position and current position.
	 * Use with `ECSTickMode.Fixed`.
	 */
	Interpolation,
	/**
	 * Predicts the next position based on the current velocity.
	 * Use with `ECSTickMode.Fixed`.
	 */
	Extrapolation,
}

export class PhysicsOptions {
	private constructor(readonly smoothingMode: PhysicsSmoothingMode) {}
	static new(smoothingMode: PhysicsSmoothingMode) {
		return new PhysicsOptions(smoothingMode);
	}

	static readonly default = new PhysicsOptions(PhysicsSmoothingMode.Interpolation);
}

export function physics2DPlugin(ecs: ECS) {
	ecs.systems.onTick.add(stepPhysics);
	ecs.systems.onUpdate.add(update);
}

export function physics2DRenderCollidersPlugin(ecs: ECS) {
	ecs.systems.onRender.add(renderColliders);
}

const previousPositions: WeakMap<PhysicsBody, { position: Vector2, rotation: number }> = new WeakMap();

function stepPhysics(context: ECSUpdateContext) {
	const physics2D = context.ecs.resources.get(Physics2D);
	const query = context.entities.query(PhysicsBody, Entity).toArray();
	
	const bodies: PhysicsBody[] = [];
	for (const [physicsBody, entity] of query) {
		bodies.push(physicsBody);

		previousPositions.set(physicsBody, { position: physicsBody.position.clone(), rotation: physicsBody.rotation });
		physicsBody.entity = entity;
	}

	physics2D.bodies = bodies;
	physics2D.step(context.delta.seconds)

	for (const [physicsBody, entity] of query) {
		const transform = entity.query(Transform2D);
		if (!transform) {
			throw new Error("PhysicsBody must be attached to an entity with a Transform2D component.");
		}
		
		transform.position = physicsBody.position;
		transform.rotation = physicsBody.rotation;
	}
}

function update(context: ECSUpdateContext) {
	const interpolation = context.interpolation;
	const extrapolation = context.interpolation * context.ecs.systems.tickDelta.seconds;

	const physicsOptions = context.ecs.resources.get(PhysicsOptions) ?? PhysicsOptions.default;

	for (const [entity, physicsBody, transform] of context.entities.query(Entity, PhysicsBody, Transform2D)) {
		const options = entity.query(PhysicsOptions) ?? physicsOptions;
		
			if (options.smoothingMode === PhysicsSmoothingMode.Extrapolation) {
			updateExtrapolation(physicsBody, transform, extrapolation);
		}

		if (options.smoothingMode === PhysicsSmoothingMode.Interpolation) {
			updateInterpolation(physicsBody, transform, interpolation);
		}
	}
}

function updateInterpolation(physicsBody: PhysicsBody, transform: Transform2D, interpolation: number) {
	const { position: previousPosition, rotation: previousRotation } = previousPositions.get(physicsBody) ?? physicsBody;
	const deltaPosition = physicsBody.position.clone().subtract(previousPosition);
	transform.position = previousPosition.clone().add(deltaPosition.multiply(interpolation));

	const deltaRotation = physicsBody.rotation - previousRotation;
	transform.rotation = previousRotation + deltaRotation * interpolation;
}

function updateExtrapolation(physicsBody: PhysicsBody, transform: Transform2D, interpolation: number) {
	transform.position = physicsBody.position.clone().add(physicsBody.velocity.clone().multiply(interpolation));
	transform.rotation = physicsBody.rotation + physicsBody.angularVelocity * interpolation;
}

function renderColliders(context: ECSUpdateContext) {
	const renderer = context.ecs.resources.get(Renderer2D);
	for (const [physicsBody] of context.entities.query(PhysicsBody)) {
		const shape = physicsBody.transformedShape;
		const style = ShapeStyle.outline(Color.red, .1);
		const pathStyle = new PathStyle({ 
			color: Color.red,
			width: 0.1,
			cap: PathStyle.Cap.Butt,
		});

		if (shape instanceof Rect) {
			renderer.drawRect({ rect: shape, style });
		}

		if (shape instanceof Circle) {
			renderer.drawCircle({ circle: shape, style });
			
			const end = shape.center.clone().add(Vector2.new(Math.cos(physicsBody.rotation), Math.sin(physicsBody.rotation)).multiply(shape.radius));
			renderer.drawLine({
				line: LineSegment.fromPoints(shape.center, end),
				style: pathStyle,
			});
		}

		if (shape instanceof Capsule2D) {
			renderer.drawCapsule({ capsule: shape, style });
		}

		if (shape instanceof Polygon) {
			renderer.drawPolygon({ polygon: shape, style });
		}
	}
}