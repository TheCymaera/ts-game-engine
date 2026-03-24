import { ECS, Entity, type ECSUpdateContext } from "@open-utilities/ecs/ECS";
import { Matrix4 } from "@open-utilities/maths/Matrix4";
import { Vector2 } from "@open-utilities/maths/Vector2";

export function spatial2DPlugin(app: ECS) {
	app.systems.onPostUpdate.add(propagateTransforms);
	app.systems.onPostUpdate.add(despawnUnParentedChildren);
}

export class Transform2D {
	constructor(
		public position = Vector2.new(0, 0),
		public rotation = 0,
	) {}

	toMatrix4(): Matrix4 {
		return Matrix4.identity()
			.translate(this.position.to3d(0))
			.rotateZ(this.rotation);
	}
}

export class GlobalTransform {
	constructor(
		public transform = Matrix4.identity()
	) {}
}


export class ChildOf {
	constructor(public parent: Entity) {}
}

function propagateTransforms(context: ECSUpdateContext) {
	const visited = new Set<Entity>();

	function visit(entity: Entity, transform: Transform2D) {
		if (visited.has(entity)) return;
		visited.add(entity);

		const globalTransform = new GlobalTransform();
		entity.add(globalTransform);

		const parent = entity.query(ChildOf);
		const parentTransform = parent?.parent.query(Transform2D);

		// visit and copy parent
		if (parent && parentTransform) {
			visit(parent.parent, parentTransform);
			const parentGlobalTransform = parent.parent.query(GlobalTransform)!!
			globalTransform.transform = parentGlobalTransform.transform.clone();
		}

		// apply local transform
		globalTransform.transform.multiply(transform.toMatrix4());
	}

	for (const [entity, transform] of context.entities.query(Entity, Transform2D)) {
		visit(entity, transform);
	}
}

function despawnUnParentedChildren(context: ECSUpdateContext) {
	for (const [entity, childOf] of context.entities.query(Entity, ChildOf)) {
		if (!context.entities.has(childOf.parent)) {
			context.entities.remove(entity);
		}
	}
}