import { Color } from "./Color.js";

export class PathStyle {
	color: Color;
	width: number;
	cap: PathStyle.Cap;
	join: PathStyle.Join;
	miterLimit: number;
	
	constructor({
		color = Color.transparent,
		width = 1,
		cap = PathStyle.Cap.Square,
		join = PathStyle.Join.Miter,
		miterLimit = 10,
	} = {}) {
		this.color = color;
		this.width = width;
		this.cap = cap;
		this.join = join;
		this.miterLimit = miterLimit;
	}
}

export namespace PathStyle {
	export enum Cap {
		Butt,
		Round,
		Square,
	}

	export enum Join {
		Miter,
		Round,
		Bevel,
	}
}