import { Color } from "./Color.js";
import { PathStyle } from "./PathStyle.js";

export class ShapeStyle {
	stroke: PathStyle;
	fill: Color;
	constructor({ 
		stroke = new PathStyle(), 
		fill = Color.transparent 
	} = {}) {
		this.stroke = stroke;
		this.fill = fill;
	}

	static outline(color: Color, width: number) {
		return new ShapeStyle({
			stroke: new PathStyle({ color, width })
		})
	}

	static fill(color: Color) {
		return new ShapeStyle({
			fill: color
		})
	}
}