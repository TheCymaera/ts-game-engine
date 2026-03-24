import { Vector2 } from "@open-utilities/maths/Vector2";
import { SparseTileMapLayer, type TileType } from "@plugins/tileMapPlugin";
import { spiderBundle } from "./enemies";
import { MyTileTypes } from "./resources";


export const spawnRoom = parseRoom(`
xxxxxxxxxxxxxx
x            x
x            x
x         s  x
x            x
x            x
              
<            >
x            x
x            x
x            x
x            x
x            x
xxxxxxxxxxxxxx
`);

export const fourWay = parseRoom(`
xxxxxx^ xxxxxx
x            x
x x        x x
x            x
x            x
x            x
              
<            >
x            x
x            x
x            x
x x        x x
x            x
xxxxxxv xxxxxx
`);
	

export const verticalHallway = parseRoom(`
xx^ xx
x    x
x    x
x    x
x    x
x    x
x    x
x    x
x    x
x    x
x    x
x    x
x    x
x    x
x    x
xxv xx
`);


export const horizontalHallway = parseRoom(`
xxxxxxxxxxxxxxxxxxxxxxxxxx
x                        x
                          
<                        >
x                        x
xxxxxxxxxxxxxxxxxxxxxxxxxx
`);


export const room4 = parseRoom(`
xxxxxxxxxxxx
x          x
x          x
x          x
x           
x          >
x          x
x          x
x          x
xxxxxxxxxxxx
`);


export const room5 = parseRoom(`
xxxxxxxxxxxx
x          x
x          x
x          x
           x
<          x
x          x
x          x
x          x
xxxxxxxxxxxx
`);

export const room6 = parseRoom(`
xxxxxxxxxxxx
x          x
x          x
x          x
           x
<          x
x          x
x          x
x          x
xxxxxv xxxxx
`);


export const room7 = parseRoom(`
xxxxxxxx^ xx
x          x
x          x
x          x
           x
<          x
x          x
x          x
x          x
xxxxxxxxxxxx
`);


export const roomTemplates = [ fourWay, verticalHallway, horizontalHallway, room4, room5, room6, room7 ];
	
export interface RoomTemplate {
	tileMap: SparseTileMapLayer;
	width: number;
	height: number;
	exits: { direction: Vector2, position: Vector2 }[];
	entities: { position: Vector2, create: (position: Vector2)=>unknown[] }[];
}


function parseRoom(dungeon: string): RoomTemplate {
	const lines = dungeon.trim().split("\n").reverse();

	const out: RoomTemplate = {
		tileMap: new SparseTileMapLayer(),
		width: lines[0]!.length,
		height: lines.length,
		exits: [],
		entities: [],
	}

	const types: Record<string, TileType | undefined> = {
		"x": MyTileTypes.Wall,
	}

	const exits: Record<string, Vector2> = {
		"<": Vector2.new(-1, 0),
		">": Vector2.new( 1, 0),
		"^": Vector2.new( 0, 1),
		"v": Vector2.new( 0,-1),
	}

	const entityTypes: Record<string, (position: Vector2)=>unknown[]> = {
		"s": (position) => spiderBundle(position),
	}

	const tileMap = out.tileMap;
	
	for (let y = 0; y < lines.length; y++) {
		const line = lines[y]!;
		for (let x = 0; x < line.length; x++) {
			const type = types[line[x]!];
			if (type) tileMap.setTile(Vector2.new(x, y), type);

			const exitDirection = exits[line[x]!];
			if (exitDirection) out.exits.push({ direction: exitDirection, position: Vector2.new(x, y) });

			const createEntity = entityTypes[line[x]!];
			if (createEntity) out.entities.push({ position: Vector2.new(x + .5, y + .5), create: createEntity });
		}
	}
	
	return out;
}