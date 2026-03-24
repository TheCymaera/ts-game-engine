import { ECSTickMode, Entity, type ECSUpdateContext as ECSContext } from "@open-utilities/ecs/ECS";
import { Matrix4 } from "@open-utilities/maths/Matrix4";
import { Rect } from "@open-utilities/maths/Rect";
import { Vector2 } from "@open-utilities/maths/Vector2";
import { AnimationFrameScheduler } from "@open-utilities/rendering/AnimationFrameScheduler";
import { dedent } from "@open-utilities/string/dedent";
import { renderingPlugin } from "@plugins/renderingPlugin";
import { app, cameraShake, debugText, mouse, renderer, tileMap } from "./resources";
import * as resources from "./resources";
import { ChildOf, spatial2DPlugin, Transform2D } from "@plugins/spatialPlugin";
import { TileMap, tileMapPlugin } from "@plugins/tileMapPlugin";
import { CoordinateGrid2D, coordinateGrid2DPlugin } from "@plugins/coordinateGridPlugin";
import { generateDungeon } from "./dungeonGeneration";
import { maxAgePlugin } from "@plugins/maxAgePlugin";
import { physics2DPlugin, PhysicsSmoothingMode, PhysicsOptions, physics2DRenderCollidersPlugin } from "@physics2D/physics2DPlugin";
import { cursorIndicatorPlugin } from "./cursorIndicatorPlugin";
import { mergeRects } from "./mergeRects";
import { Player, playerBundle, playerPlugin } from "./player";
import { bulletPlugin } from "./bullet";
import { spiderPlugin } from "./enemies";
import { PhysicsBody } from "@physics2D/physics2D";
import { Circle } from "@open-utilities/maths/Circle";
import { Polygon } from "@open-utilities/maths/Polygon";
import { Meter } from "@open-utilities/testing/Meter";
import { Duration } from "@open-utilities/core/Duration";
import { Vector3 } from "@open-utilities/maths/Vector3";
import { Gravity, gravityPlugin } from "./gravity";
import { iife } from "@open-utilities/core/iife";

Object.assign(globalThis, {
	Matrix4, Vector3, Vector2, app
});

const cameraHeight = 20;

Promise.resolve().then(main);
function main() {
	app.systems.tickMode = ECSTickMode.Clamped;
	app.systems.tickDelta = Duration.seconds(1 / 60);
	
	app.resources.add(PhysicsOptions.new(PhysicsSmoothingMode.None));
	//renderer.setInterpolationMode(InterpolationMode.NearestNeighbor);

	for (const resource of Object.values(resources)) {
		app.resources.add(resource);
	}

	// core plugins
	coordinateGrid2DPlugin(app);
	cursorIndicatorPlugin(app);
	spatial2DPlugin(app);
	tileMapPlugin(app);
	renderingPlugin(app);
	maxAgePlugin(app);
	spiderPlugin(app);

	// game systems
	gravityPlugin(app);
	physics2DPlugin(app);
	physics2DRenderCollidersPlugin(app);
	playerPlugin(app);
	bulletPlugin(app);

	app.systems.onStartUp.add(setUpGame);
	app.systems.onTick.add(updateTileColliders);
	app.systems.onPreUpdate.add(mouse.update);
	app.systems.onUpdate.add(updateCamera);
	app.systems.onUpdate.add(context => cameraShake.update(context.delta));

	// begin game
	app.startUp();
}


// update debug text and run main loop
const tpsMeter = new Meter();
AnimationFrameScheduler.periodic(({ elapsedTime }) => {
	const tps = 1 / elapsedTime.seconds;
	tpsMeter.addSample(tps);

	app.runMainLoop(elapsedTime);

	debugText.textContent = dedent`
		TPS: ${tpsMeter}\n
		Entities: ${app.entities.size}
	`;
})

// sync canvas dimensions to screen size
new ResizeObserver(iife.fn(() => {
	const canvas = renderer.ctx.canvas;
	const width = canvas.clientWidth;
	const height = canvas.clientHeight;

	renderer.bitmapDimensions = Vector2.new(width, height).multiply(window.devicePixelRatio || 1);
	renderer.resize();

	app.reRender();
})).observe(renderer.ctx.canvas);

mouse.clientPosition = renderer.clientDimensions.divide(2);
mouse.update();



async function setUpGame(context: ECSContext) {
	const level = generateDungeon();
	tileMap.layers.push(level.tileMap);
	app.entities.spawn([tileMap]);

	const player = app.entities.spawn(playerBundle());

	app.entities.spawn([CoordinateGrid2D.new()]);

	// circle
	app.entities.spawn([
		new Transform2D(),
		PhysicsBody.static({
			shape: Circle.fromRadius(Vector2.new(0, 0), .5),
			position: Vector2.new(2, 0),
		}),
	]);

	// circles
	for (let i = 0; i < 2; i++) {
		app.entities.spawn([
			new Transform2D(),
			PhysicsBody.dynamic({
				shape: Circle.fromRadius(Vector2.new(0, 0), .5),
				position: Vector2.new(4, 0 + i * 1.1),
			}),
			new Gravity,
		]);
	}

	// polygon
	app.entities.spawn([
		new Transform2D(),
		PhysicsBody.static({
			shape: Polygon.fromRect(Rect.fromCenter(Vector2.new(0, 0), 2, 4)),
			position: Vector2.new(-5, 0),
			rotation: Math.PI / 4,
		}),
	]);


	for (const room of await level.rooms) {
		for (const entity of room.getEntities()) {
			app.entities.spawn(entity);
		}
	}
}

const cameraTarget = Vector2.new(0, 0);
const cameraPosition = Vector2.new(0, 0);

function updateCamera(context: ECSContext) {
	const playerPosition = app.entities.query(Transform2D, Player)?.next().value?.[0]
		?.position.clone() ??
		Vector2.new(0, 0);
	
	cameraTarget.lerp(playerPosition.lerp(mouse.worldPosition,.2), .1);

	cameraPosition.moveTowards(cameraTarget, 80 * context.delta.seconds);

	const cameraWidth = cameraHeight * renderer.bitmapDimensions.x / renderer.bitmapDimensions.y;

	const viewport = Rect.fromCenter(cameraPosition, cameraWidth, cameraHeight).translate(cameraShake.offset);
	
	renderer.setTransform(Matrix4.ortho(viewport));
}

class TileCollider {}

function updateTileColliders(context: ECSContext) {
	const tileMapComponents = app.entities.query(TileMap, Entity).next().value;
	if (!tileMapComponents) return;
	const [tileMap, tileMapEntity] = tileMapComponents;

	// get relevant tiles
	const boundingBoxes: Rect[] = [];

	for (const [physicsBody] of context.entities.query(PhysicsBody)) {
		// skip static bodies
		if (physicsBody.isStatic) continue;


		const boundingBox = physicsBody.movementBoundingBox(context.delta.seconds).expand(Vector2.new(.5, .5));

		boundingBoxes.push(boundingBox);
	}

	const colliders = mergeRects(tileMap.layers.flatMap(layer => layer.tilesFromRects(boundingBoxes).map(i => i.collider()).filter(i => !i.isEmpty)));
	
	// remove old colliders
	context.entities.query(Entity, TileCollider).forEach(([entity]) => context.entities.remove(entity));

	// add new colliders
	for (const collider of colliders) {
		context.entities.spawn([
			new TileCollider(), 
			new Transform2D(),
			PhysicsBody.static({
				shape: collider, 
				position: Vector2.new(0, 0)
			}),
			new ChildOf(tileMapEntity),
		]);
	}
}