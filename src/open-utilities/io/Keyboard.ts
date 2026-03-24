import { Vector2 } from "../maths/Vector2";

export class Keyboard {
	private constructor() {
		window.addEventListener("keydown", this.#onKeyDown);
		window.addEventListener("keyup", this.#onKeyUp);
	}

	static get instance() {
		return this.#instance ??= new Keyboard();
	}

	isKeyDown(key: string) {
		return this.#keys.has(key);
	}


	static getMoveVector(up: boolean, down: boolean, left: boolean, right: boolean) {
		let x = 0;
		let y = 0;
		if (up) y += 1;
		if (down) y -= 1;
		if (left) x -= 1;
		if (right) x += 1;
		return Vector2.new(x, y);
	}


	#keys = new Set<string>();
	#onKeyDown = (event: KeyboardEvent) => {
		this.#keys.add(event.code);
	}
	#onKeyUp = (event: KeyboardEvent) => {
		this.#keys.delete(event.code);
	}

	static #instance: Keyboard | null = null;
}