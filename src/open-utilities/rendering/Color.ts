import { lerp } from "@open-utilities/maths/lerp";
import { coerceBetween } from "../maths/coerceBetween";

export class Color {
	static fromRGBA(r: number, g: number, b: number, a: number): Color {
		return new Color(r, g, b, a);
	}

	static fromRGBAHex(rgba: number): Color {
		const r = (rgba >> 24) & 0xFF;
		const g = (rgba >> 16) & 0xFF;
		const b = (rgba >> 8) & 0xFF;
		const a = rgba & 0xFF;
		return new Color(r, g, b, a);
	}

	static fromRGBHex(rgb: number): Color {
		const r = (rgb >> 16) & 0xFF;
		const g = (rgb >> 8) & 0xFF;
		const b = rgb & 0xFF;
		return new Color(r, g, b, 255);
	}

	static readonly black = new Color(0, 0, 0, 255);
	static readonly white = new Color(255, 255, 255, 255);
	static readonly transparent = new Color(0, 0, 0, 0);
	static readonly red = new Color(255, 0, 0, 255);
	static readonly green = new Color(0, 255, 0, 255);
	static readonly blue = new Color(0, 0, 255, 255);

	private constructor(readonly r: number, readonly g: number, readonly b: number, readonly a: number) {}

	toHexString() {
		return "#" + 
		(this.r | 0).toString(16).padStart(2, "0") + 
		(this.g | 0).toString(16).padStart(2, "0") +
		(this.b | 0).toString(16).padStart(2, "0") +
		(this.a | 0).toString(16).padStart(2, "0");
	}

	scaleRGB(scale: number) {
		return new Color(
			coerceBetween(this.r * scale, 0, 255),
			coerceBetween(this.g * scale, 0, 255),
			coerceBetween(this.b * scale, 0, 255),
			this.a
		);
	}

	scaleAlpha(scale: number) {
		return new Color(this.r,this.g,this.b, coerceBetween(this.a * scale, 0, 255));
	}

	toString() {
		return this.toHexString();
	}

	lerp(other: Color, t: number) {
		return new Color(
			coerceBetween(lerp(this.r, other.r, t), 0, 255),
			coerceBetween(lerp(this.g, other.g, t), 0, 255),
			coerceBetween(lerp(this.b, other.b, t), 0, 255),
			coerceBetween(lerp(this.a, other.a, t), 0, 255),
		);
	}
}