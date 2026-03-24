import type { ECS, ECSUpdateContext } from "@open-utilities/ecs/ECS";
import { Matrix4 } from "@open-utilities/maths/Matrix4";
import { Rect } from "@open-utilities/maths/Rect";
import { Vector2 } from "@open-utilities/maths/Vector2";
import { Renderer2D } from "@open-utilities/rendering/Renderer2D";
import { RenderedObject2D } from "./renderingPlugin";

export function tileMapPlugin(app: ECS) {
	app.systems.onRender.add(renderTileMaps);
}

export class TileMap {
	readonly layers: SparseTileMapLayer[] = [];

	addLayer() {
		const out = new SparseTileMapLayer();
		this.layers.push(out);
		return out;
	}
}

export class Tile {
	constructor(readonly tile: TileType, readonly position: Vector2) {}

	collider() {
		return this.tile.collider(this.position).translate(this.position);
	}
}

export class SparseTileMapLayer {
	readonly tiles: Map<string, TileType> = new Map();

	getTile(vec: Vector2) {
		return this.tiles.get(this.#key(vec));
	}

	setTile(vec: Vector2, tile: TileType | undefined) {
		const key = this.#key(vec);
		if (!tile) this.tiles.delete(key);
		else this.tiles.set(key, tile);
	}

	tilesFromRect(rect: Rect) {
		const out: Tile[] = [];
		for (let x = Math.floor(rect.minX); x < rect.maxX; x++) {
			for (let y = Math.floor(rect.minY); y < rect.maxY; y++) {
				const position = Vector2.new(x, y)
				const tile = this.getTile(position);
				if (tile) out.push(new Tile(tile, position));
			}
		}

		return out;
	}

	tilesFromRects(rects: Rect[]) {
		const visited = new Set<string>();
		const out: Tile[] = [];
		for (const rect of rects) {
			for (let x = Math.floor(rect.minX); x < rect.maxX; x++) {
				for (let y = Math.floor(rect.minY); y < rect.maxY; y++) {
					const key = x + "," + y;
					if (visited.has(key)) continue;
					visited.add(key);

					const position = Vector2.new(x, y)
					const tile = this.getTile(position);
					if (tile) out.push(new Tile(tile, position));
				}
			}
		}

		return out;
	}

	putTileMap(tileMap: SparseTileMapLayer, position: Vector2) {
		for (const [key, value] of tileMap.tiles) {
			const pos = this.#vector(key);
			this.setTile(pos.add(position), value);
		}
	}

	clear() {
		this.tiles.clear();
	}

	#key(vector: Vector2) {
		return Math.floor(vector.x) + "," + Math.floor(vector.y);
	}

	#vector(key: string) {
		const [x, y] = key.split(",");
		return Vector2.new(+x!, +y!);
	}
}

export interface TileType {
	render(coordinate: Vector2, renderer: Renderer2D): void;
	collider(coordinate: Vector2): Rect;
}

export class StandardTileType implements TileType {
	constructor(
		mesh: RenderedObject2D = RenderedObject2D.fromShape(Rect.fromCorners(0, 0, 1, 1)),
		collider: Rect = Rect.fromCorners(0, 0, 1, 1),
	) {
		this.#mesh = mesh;
		this.#collider = collider;
	}

	render(position: Vector2, renderer: Renderer2D) {
		renderer.withTransform(Matrix4.translation(position.to3d(0)), () => {
			this.#mesh.render(renderer);
		});
	}

	collider(): Rect {
		return this.#collider.clone();
	}

	#mesh: RenderedObject2D;
	#collider: Rect;
}

function renderTileMaps(update: ECSUpdateContext) {
	const renderer = update.ecs.resources.get(Renderer2D);
	const ortho = renderer.getTransform().getOrthoRect();

	for (const [tileMap] of update.entities.query(TileMap)) {
		for (const layer of tileMap.layers) {
			const tiles = layer.tilesFromRect(ortho);

			for (const tile of tiles) {
				tile.tile.render(tile.position, renderer);
			}
		}
	}
}