import { Rect } from "@open-utilities/maths/Rect";
import { Vector2 } from "@open-utilities/maths/Vector2";
import { SparseTileMapLayer } from "@plugins/tileMapPlugin";
import { random } from "./resources";
import { roomTemplates, spawnRoom, type RoomTemplate } from "./rooms";

interface RoomCandidate {
	template: RoomTemplate;
	entrance: number;
}

interface Exit {
	connection: Room | undefined;
	candidates: RoomCandidate[];
}

export class Room {
	readonly exits: Exit[] = [];

	constructor(
		readonly origin: Vector2,
		readonly template: RoomTemplate,
	) {
		this.exits = this.template.exits.map(i => {
			const opposite = i.direction.clone().multiply(-1);

			const allowSameTemplate = false;//random.nextBoolean();

			const candidates: RoomCandidate[] = [];
			for (const room of roomTemplates) {
				if (!allowSameTemplate && room === this.template) continue;
				for (const [candidateIndex, candidate] of room.exits.entries()) {
					if (candidate.direction.equals(opposite)) {
						candidates.push({ template: room, entrance: candidateIndex });
					}
				}
			}

			return {
				candidates: random.shuffle(candidates),
				connection: undefined,
			}
		});
	}

	*getEntities() {
		for (const entity of this.template.entities) {
			const position = this.origin.clone().add(entity.position);
			yield entity.create(position);
		}
	}
}

const MIN_ROOMS = 4;
const MAX_ROOMS = 10;
const ALLOW_WALL_OVERLAP = true;
export function generateDungeon() {
	const tileMap = new SparseTileMapLayer();
	const rooms = generate(tileMap);
	return {
		rooms: rooms,
		tileMap: tileMap,
	}
}

async function generate(tileMap: SparseTileMapLayer) {
	const rooms: Room[] = [];

	while (true) {
		for (const room of rooms) {
			tileMap.putTileMap(room.template.tileMap, room.origin);
		}

		await new Promise(i => setTimeout(i, 1))

		if (generateIteration(rooms)) break;
		tileMap.clear();
	}

	return rooms;
}

function canPlaceRoom(rooms: Room[], template: RoomTemplate, origin: Vector2) {
	const rect = Rect.fromPoints(origin, origin.clone().add(Vector2.new(template.width, template.height)))
	if (ALLOW_WALL_OVERLAP) rect.expand(Vector2.new(-1,-1));

	for (const room of rooms) {
		const otherRect = Rect.fromPoints(room.origin, room.origin.clone().add(Vector2.new(room.template.width, room.template.height)));
		if (rect.intersects(otherRect)) return false;
	}

	return true;
}

function generateIteration(rooms: Room[]) {
	// if no rooms, add a spawn room
	if (!rooms.length) {
		rooms.push(new Room(Vector2.new(-spawnRoom.width / 2, -spawnRoom.height / 2), spawnRoom))
		return false;
	}

	// delete connections to rooms that no longer exist
	for (const room of rooms) {
		for (const exit of room.exits) {
			if (exit.connection && !rooms.includes(exit.connection)) exit.connection = undefined
		}
	}

	if (rooms.length > MAX_ROOMS) {
		rooms.pop();
		return false;
	}

	const complete = rooms.every(i => i.exits.every(j => j.connection))

	if (complete) {
		if (rooms.length >= MIN_ROOMS) return true;
			
		rooms.pop();
		return false;
	}

	for (const room of rooms.toReversed()) {
		for (const [i, exit] of random.shuffle([...room.exits.entries()])) {
			// ignore if already connected
			if (exit.connection) continue;

			if (exit.candidates.length === 0) {
				rooms.length = rooms.indexOf(room);
				return false;
			}

			const candidate = exit.candidates.pop()!;

			const entrance = candidate.template.exits[candidate.entrance]!;

			const exitTemplate = room.template.exits[i]!;

			const candidateOrigin = room.origin.clone().add(exitTemplate.position).subtract(entrance.position)
			if (!ALLOW_WALL_OVERLAP) candidateOrigin.add(exitTemplate.direction);

			// ignore if invalid
			if (!canPlaceRoom(rooms, candidate.template, candidateOrigin)) continue

			const candidateRoom = new Room(candidateOrigin, candidate.template);
			rooms.push(candidateRoom);

			exit.connection = candidateRoom;
			candidateRoom.exits[candidate.entrance]!.connection = room;
			return false;
		}
	}

	return false;
}