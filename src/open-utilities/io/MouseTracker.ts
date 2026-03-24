import { Vector2 } from "../maths/Vector2";
import type { Renderer2D } from "../rendering/Renderer2D";

export class MouseTracker {
	clientPosition: Vector2;
	#worldPosition = Vector2.new(0,0);
	
	get worldPosition() {
		return this.#worldPosition.clone();
	}

	leftButtonDown = false;
	
	private constructor(
		readonly element: HTMLElement,
		initialPosition: Vector2,
		private readonly toWorldPosition: (vector: Vector2) => Vector2
	) {
		this.clientPosition = initialPosition.clone();
		this.update();

		element.addEventListener("pointermove", (event: PointerEvent) => {
			this.clientPosition = Vector2.new(event.offsetX, event.offsetY);
		});
		element.addEventListener("pointerdown", (event: PointerEvent) => {
			if (event.button === 0) this.leftButtonDown = true;
		});
		element.addEventListener("pointerup", (event: PointerEvent) => {
			if (event.button === 0) this.leftButtonDown = false;
		});
	}

	update = ()=>{
		this.#worldPosition = this.toWorldPosition(this.clientPosition);
	}
	
	static from2DRenderer(renderer: Renderer2D) {
		const initial = renderer.bitmapDimensions.divide(2);

		return new MouseTracker(renderer.ctx.canvas, initial, (vector) => {
			return vector.clone().transformMatrix4(renderer.clientToWorldSpaceTransform);
		});
	}
}