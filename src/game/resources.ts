import { iife } from "@open-utilities/core/iife";
import { ECS } from "@open-utilities/ecs/ECS";
import { Keyboard } from "@open-utilities/io/Keyboard";
import { MouseTracker as MouseTracker } from "@open-utilities/io/MouseTracker";
import { Random } from "@open-utilities/maths/Random";
import { Vector2 } from "@open-utilities/maths/Vector2";
import { CameraShake } from "@open-utilities/rendering/CameraShake";
import { Renderer2D } from "@open-utilities/rendering/Renderer2D";
import { Physics2D } from "@physics2D/physics2D";
import { StandardTileType, TileMap } from "@plugins/tileMapPlugin";

export const app = new ECS();

export const random = Random.default;

export const debugText = document.querySelector("#debug-text")!;
debugText.textContent = "Hello, World!";

export const renderer = Renderer2D.fromCanvas(document.querySelector("canvas")!);
export const mouse = MouseTracker.from2DRenderer(renderer);
export const cameraShake = new CameraShake();
export const tileMap = new TileMap();

export namespace MyTileTypes {
	export const Wall = new StandardTileType();
}

export const keyboard = Keyboard.instance;

export const inputMap = new class InputMap {
	get arrowUp() { return keyboard.isKeyDown("ArrowUp") || keyboard.isKeyDown("KeyW"); }
	get arrowDown() { return keyboard.isKeyDown("ArrowDown") || keyboard.isKeyDown("KeyS"); }
	get arrowLeft() { return keyboard.isKeyDown("ArrowLeft") || keyboard.isKeyDown("KeyA"); }
	get arrowRight() { return keyboard.isKeyDown("ArrowRight") || keyboard.isKeyDown("KeyD"); }
	get fire() { return keyboard.isKeyDown("Space") || mouse.leftButtonDown; }
}

export const physics2D = new Physics2D();

await new Promise<void>((resolve) => setTimeout(resolve, 100));