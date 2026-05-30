import { assertNever } from "@open-utilities/types/assertNever.js";
import { Matrix4 } from "../maths/Matrix4.js";

export class WebGLRenderer {
	readonly derivedUniforms: { readonly [scope in UniformScope]: Record<string, DerivedUniformDefinition> } = {
		pass: {},
		draw: {},
	}

	constructor(readonly gl: WebGL2RenderingContext) {
		gl.enable(gl.BLEND);
		gl.enable(gl.DEPTH_TEST);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		this.derivedUniforms.draw.uModelViewProjection = {
			dependsOn: ["uProjection", "uView", "uModel"],
			get: (dependencies) => {
				const projection = (dependencies.uProjection as ShaderUniformMatrix4).value;
				const view = (dependencies.uView as ShaderUniformMatrix4).value;
				const model = (dependencies.uModel as ShaderUniformMatrix4).value;

				return uniforms.matrix4(projection.clone().multiply(view).multiply(model));
			},
		};
	}

	static fromCanvas(canvas: HTMLCanvasElement): WebGLRenderer {
		const gl = canvas.getContext("webgl2");
		if (!gl) throw new Error("WebGL2 not supported.");
		return new WebGLRenderer(gl);
	}

	clear() {
		this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
	}

	#passUniforms: UniformList = {};
	beginPass(uniforms: UniformList) {
		this.#passUniforms = uniforms;
	}

	#lastMaterial = new Map<WebGLProgram, Material>();
	drawMesh(mesh: Mesh, uniforms: UniformList = {}) {
		const program = this.#getProgram(mesh.material.shader);
		this.gl.useProgram(program);

		const uniformLocations = this.#cache.uniforms.getOrInsertComputed(program, ()=>new Map());
		const passDerivedUniforms = this.#resolveDerivedUniforms(program, "pass", this.#passUniforms, uniformLocations);

		const drawUniforms = { ...this.#passUniforms, ...passDerivedUniforms, ...uniforms };
		const drawDerivedUniforms = this.#resolveDerivedUniforms(program, "draw", drawUniforms, uniformLocations);

		this.#applyUniforms(program, this.#passUniforms, uniformLocations, false);
		this.#applyUniforms(program, passDerivedUniforms, uniformLocations, false);
		this.#applyUniforms(program, uniforms, uniformLocations, false);
		this.#applyUniforms(program, drawDerivedUniforms, uniformLocations, false);

		// apply material uniforms
		if (this.#lastMaterial.get(program) !== mesh.material || mesh.material.needsUniformUpdate) {
			this.#lastMaterial.set(program, mesh.material);
			this.#applyUniforms(program, mesh.material.uniforms, uniformLocations, true);
		}

		// apply geometry
		const geometryBuffer = this.#getGeometryBuffers(mesh.geometry);
		this.#syncBuffer(mesh.geometry.vertices, geometryBuffer.vertexBuffer, this.gl.ARRAY_BUFFER);
		this.#syncBuffer(mesh.geometry.indices, geometryBuffer.indexBuffer, this.gl.ELEMENT_ARRAY_BUFFER);
		this.#validateProgramAttributeLayout(program, mesh.geometry.attributeLayout);
		this.gl.bindVertexArray(geometryBuffer.vao);

		// draw
		this.gl.drawElements(
			glRenderPrimitiveType(mesh.geometry.primitiveType),
			mesh.geometry.indices.buffer.length,
			glIndexType(mesh.geometry.indices.buffer),
			0
		);
		this.gl.bindVertexArray(null);
	}

	#resolveDerivedUniforms(
		program: WebGLProgram,
		scope: UniformScope,
		availableUniforms: UniformList,
		locations: Map<string, WebGLUniformLocation | null>,
	) {
		const resolved: UniformList = {};
		const resolving = new Set<string>();

		for (const name in this.derivedUniforms[scope]) {
			this.#resolveDerivedUniform(program, scope, name, availableUniforms, resolved, resolving, locations);
		}

		return resolved;
	}

	#resolveDerivedUniform(
		program: WebGLProgram,
		scope: UniformScope,
		name: string,
		availableUniforms: UniformList,
		resolved: UniformList,
		resolving: Set<string>,
		locations: Map<string, WebGLUniformLocation | null>,
	) {
		if (name in resolved) return resolved[name]!;


		const definition = this.derivedUniforms[scope][name];
		if (!definition) return availableUniforms[name] ?? null;

		// skip if not used by the program
		const location = locations.getOrInsertComputed(name, ()=>this.gl.getUniformLocation(program, name));
		if (!location) return null;

		if (resolving.has(name)) {
			throw new Error(`Derived uniform cycle detected for "${name}".`);
		}

		resolving.add(name);
		const dependencies: Record<string, ShaderUniform> = {};
		for (const dependencyName of definition.dependsOn) {
			const dependency = 
				availableUniforms[dependencyName] ?? 
				this.#resolveDerivedUniform(program, scope, dependencyName, availableUniforms, resolved, resolving, locations);

			if (!dependency) {
				throw new Error(`Derived uniform "${name}" requires uniform "${dependencyName}".`);
			}

			dependencies[dependencyName] = dependency;
		}

		const out = definition.get(dependencies);
		resolved[name] = out;
		resolving.delete(name);
		return out;
	}

	#cache = {
		programs: new Map<ShaderModule, WebGLProgram>(),
		uniforms: new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>(),
		geometryBuffers: new Map<Geometry, WebGLGeometryBuffers>(),
	}

	#getProgram(shaderModule: ShaderModule): WebGLProgram {
		return this.#cache.programs.getOrInsertComputed(shaderModule, ()=>{
			return createProgram(this.gl, shaderModule.vertexShader, shaderModule.fragmentShader);
		});
	}

	#getGeometryBuffers(geometry: Geometry) {
		return this.#cache.geometryBuffers.getOrInsertComputed(geometry, ()=> {
			geometry.vertices.isDirty = false;
			geometry.indices.isDirty = false;
			return createGeometryBuffers(this.gl, geometry)
		});
	}

	#syncBuffer(buffer: ShaderBuffer, glBuffer: WebGLBuffer, kind: GLenum) {
		if (!buffer.isDirty) return;
		this.gl.bindBuffer(kind, glBuffer);
		this.gl.bufferData(kind, buffer.buffer, glGeometryUsage(buffer.usage));
		this.gl.bindBuffer(kind, null);
		buffer.isDirty = false;
	}

	#validatedAttributeLayouts = new Map<WebGLProgram, WeakSet<VertexAttributeLayout>>();
	#validateProgramAttributeLayout(program: WebGLProgram, attributeLayout: VertexAttributeLayout) {
		const validatedLayouts = this.#validatedAttributeLayouts.getOrInsertComputed(program, ()=>new WeakSet());
		if (validatedLayouts.has(attributeLayout)) return;

		for (const attribute of attributeLayout.attributes) {
			const location = this.gl.getAttribLocation(program, attribute.name);
			if (location < 0) continue;

			if (location !== attribute.location) {
				throw new Error(
					`Attribute "${attribute.name}" is bound to location ${location} in the shader, but geometry expects location ${attribute.location}. ` +
					`Declare explicit shader attribute locations to match the geometry layout.`
				);
			}
		}

		validatedLayouts.add(attributeLayout);
	}

	#applyUniforms(program: WebGLProgram, uniforms: UniformList, locations: Map<string, WebGLUniformLocation | null>, required: boolean) {
		for (const key in uniforms) {
			const uniform = uniforms[key]!;
			const location = locations.getOrInsertComputed(key, ()=> {
				const out = this.gl.getUniformLocation(program, key);
				if (!out) {
					if (required) throw new Error(`Uniform "${key}" not found in shader.`);
					return null;
				}
				return out;
			});

			if (location) {
				uniform.bindGl(this.gl, location);
			}
		}
	}
}

export class ShaderModule {
	readonly vertexShader: string;
	readonly fragmentShader: string;

	constructor(options: {
		vertexShader: string,
		fragmentShader: string
	}) {
		this.vertexShader = options.vertexShader;
		this.fragmentShader = options.fragmentShader;

		const inputsWithoutLocations = findVertexShaderInputsWithoutExplicitLocations(this.vertexShader);
		if (inputsWithoutLocations.length > 0) {
			console.warn(
				`ShaderModule vertex inputs without explicit locations: ${inputsWithoutLocations.join(", ")}. ` +
				`Use layout(location = N) on vertex shader inputs so VAOs can be shared across materials.`
			);
		}
	}
}

export type UniformList = Record<string, ShaderUniform>;

export type UniformScope = "pass" | "draw";

export interface DerivedUniformDefinition<TUniform extends ShaderUniform = ShaderUniform> {
	dependsOn: readonly string[];
	get(dependencies: Readonly<Record<string, ShaderUniform>>): TUniform;
}

export class Material<TUniforms extends UniformList = UniformList> {
	readonly shader: ShaderModule;
	readonly uniforms: TUniforms;
	needsUniformUpdate = true;

	constructor(options: {
		readonly shader: ShaderModule,
		readonly uniforms: TUniforms
	}) {
		this.shader = options.shader;
		this.uniforms = options.uniforms;
	}
}

export interface ShaderUniform {
	bindGl(gl: WebGL2RenderingContext, location: WebGLUniformLocation): void;
}

export class ShaderUniformInt implements ShaderUniform {
	constructor(public value: number) {}

	bindGl(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
		gl.uniform1i(location, this.value);
	}
}

export class ShaderUniformFloat implements ShaderUniform {
	constructor(public value: number) {}

	bindGl(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
		gl.uniform1f(location, this.value);
	}
}

export class ShaderUniformMatrix4 implements ShaderUniform {
	constructor(public value: Matrix4) {}

	bindGl(gl: WebGL2RenderingContext, location: WebGLUniformLocation) {
		gl.uniformMatrix4fv(location, false, this.value.toColumnMajor(Float32Array));
	}
}

export namespace uniforms {
	export const int = (value: number) => new ShaderUniformInt(value);
	export const float = (value: number) => new ShaderUniformFloat(value);
	export const matrix4 = (value: Matrix4) => new ShaderUniformMatrix4(value);
}

export enum RenderPrimitiveType {
	Points,
	Lines,
	Triangles,
}

export enum VertexAttributeType {
	Int8,
	Uint8,
	Int16,
	Uint16,
	Int32,
	Uint32,
	Float32,
}

export enum VertexAttributeKind {
	Float,
	Integer,
}

//export type IndexBufferData = Uint16Array | Uint32Array;

export class ShaderBuffer<T extends AllowSharedBufferSource = AllowSharedBufferSource> {
	isDirty = true;
	constructor(readonly buffer: T, readonly usage: GeometryUsage) {}

	set(newBuffer: T) {
		// @ts-expect-error Privately mutable
		this.buffer = newBuffer;
		this.isDirty = true;
	}
}

export enum GeometryUsage {
	Static, Dynamic, Stream,
}

export class Geometry {
	readonly attributeLayout: VertexAttributeLayout;
	readonly vertices: ShaderBuffer;
	readonly indices: ShaderBuffer<IndexBufferData>;
	readonly primitiveType: RenderPrimitiveType;

	constructor(options: {
		attributeLayout: VertexAttributeLayout,
		vertices: ShaderBuffer,
		indices: ShaderBuffer<IndexBufferData>,
		primitiveType?: RenderPrimitiveType,
	}) {
		this.attributeLayout = options.attributeLayout;
		this.vertices = options.vertices;
		this.indices = options.indices;

		this.primitiveType = options.primitiveType ?? RenderPrimitiveType.Triangles;
	}
}

export class Mesh {
	readonly geometry: Geometry;
	readonly material: Material;

	constructor(options: {
		geometry: Geometry,
		material: Material,
	}) {
		this.geometry = options.geometry;
		this.material = options.material;
	}
}

export class VertexAttributeLayout {
	stride = 0;
	readonly attributes: {
		name: string;
		location: number;
		size: number;
		type: VertexAttributeType;
		normalized: boolean;
		kind: VertexAttributeKind;
		offset: number;
	}[] = [];

	append(
		name: string,
		size: number,
		type: VertexAttributeType,
		inputAs: {
			location?: number,
			kind?: VertexAttributeKind,
			normalized?: boolean,
		} = {}
	) {
		const location = inputAs.location ?? this.attributes.length;
		const kind = inputAs.kind ?? defaultAttributeInputType(type);
		const normalized = inputAs.normalized ?? false;

		if (kind === VertexAttributeKind.Integer && normalized) {
			throw new Error(`Integer input ${name} cannot be normalized.`);
		}

		if (this.attributes.some(attribute => attribute.location === location)) {
			throw new Error(`Attribute location ${location} is already in use.`);
		}

		this.attributes.push({ name, location, size, type, normalized, kind: kind, offset: this.stride });
		this.stride += size * this.#getTypeSize(type);
		return this;
	}

	#getTypeSize(type: VertexAttributeType): number {
		switch (type) {
			case VertexAttributeType.Int8:
			case VertexAttributeType.Uint8:
				return 1;
			case VertexAttributeType.Int16:
			case VertexAttributeType.Uint16:
				return 2;
			case VertexAttributeType.Int32:
			case VertexAttributeType.Uint32:
			case VertexAttributeType.Float32:
				return 4;
			default:
				assertNever(type);
		}
	}
}

export class BufferBuilder {
	appendInt8(...values: number[]) {
		return this.appendBuffer(new Int8Array(values));
	}

	appendUint8(...values: number[]) {
		return this.appendBuffer(new Uint8Array(values));
	}

	appendInt16(...values: number[]) {
		return this.appendBuffer(new Int16Array(values));
	}

	appendUint16(...values: number[]) {
		return this.appendBuffer(new Uint16Array(values));
	}

	appendInt32(...values: number[]) {
		return this.appendBuffer(new Int32Array(values));
	}

	appendUint32(...values: number[]) {
		return this.appendBuffer(new Uint32Array(values));
	}

	appendFloat32(...values: number[]) {
		return this.appendBuffer(new Float32Array(values));
	}

	appendBuffer(buffer: ArrayBufferView) {
		const uint8View = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
		this.data.push(...uint8View);
		return this;
	}

	build(): Uint8Array {
		return new Uint8Array(this.data);
	}

	get length() {
		return this.data.length;
	}

	private data: number[] = [];
}

type IndexBufferData = Uint16Array | Uint32Array;

function compileShader(
	gl: WebGL2RenderingContext,
	type: WebGL2RenderingContext["VERTEX_SHADER"] | WebGL2RenderingContext["FRAGMENT_SHADER"],
	source: string
): WebGLShader {
	const typeName = {
		[gl.VERTEX_SHADER]: "vertex",
		[gl.FRAGMENT_SHADER]: "fragment",
	}[type];

	const shader = gl.createShader(type);
	if (!shader) throw new Error(`Failed to create ${typeName} shader.`);
	gl.shaderSource(shader, source);
	gl.compileShader(shader);
	
	// oxlint-disable-next-line typescript/strict-boolean-expressions
	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		const info = gl.getShaderInfoLog(shader);
		gl.deleteShader(shader);
		throw new Error(`Failed to compile ${typeName} shader: ` + info);
	}
	
	return shader;
}

function createProgram(
	gl: WebGL2RenderingContext,
	vertexShaderSource: string,
	fragmentShaderSource: string
): WebGLProgram {
	const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
	const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

	const program = gl.createProgram();
	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);
	
	// oxlint-disable-next-line typescript/strict-boolean-expressions
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		const info = gl.getProgramInfoLog(program);
		gl.deleteProgram(program);
		throw new Error("Failed to link shader program: " + info);
	}

	gl.deleteShader(vertexShader);
	gl.deleteShader(fragmentShader);

	return program;
}

function createGeometryBuffers(
	gl: WebGL2RenderingContext,
	geometry: Geometry,
) {
	const vbo = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
	gl.bufferData(gl.ARRAY_BUFFER, geometry.vertices.buffer, glGeometryUsage(geometry.vertices.usage));

	const ibo = gl.createBuffer();
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices.buffer, glGeometryUsage(geometry.indices.usage));
	gl.bindBuffer(gl.ARRAY_BUFFER, null);
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);


	const vao = gl.createVertexArray();
	gl.bindVertexArray(vao);
	gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);

	for (const attribute of geometry.attributeLayout.attributes) {
		const attributeType = glVertexAttributeType(attribute.type);
		gl.enableVertexAttribArray(attribute.location);

		if (attribute.kind === VertexAttributeKind.Integer) {
			gl.vertexAttribIPointer(attribute.location, attribute.size, attributeType, geometry.attributeLayout.stride, attribute.offset);
		} else {
			gl.vertexAttribPointer(attribute.location, attribute.size, attributeType, attribute.normalized, geometry.attributeLayout.stride, attribute.offset);
		}
	}

	gl.bindVertexArray(null);
	gl.bindBuffer(gl.ARRAY_BUFFER, null);
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

	return {
		vertexBuffer: vbo,
		indexBuffer: ibo,
		vao: vao,
	} as const;
}

type WebGLGeometryBuffers = ReturnType<typeof createGeometryBuffers>;

function defaultAttributeInputType(type: VertexAttributeType): VertexAttributeKind {
	switch (type) {
		case VertexAttributeType.Int8:
		case VertexAttributeType.Uint8:
		case VertexAttributeType.Int16:
		case VertexAttributeType.Uint16:
		case VertexAttributeType.Int32:
		case VertexAttributeType.Uint32:
			return VertexAttributeKind.Integer;
		case VertexAttributeType.Float32:
			return VertexAttributeKind.Float;
		default:
			assertNever(type);
	}
}

function glVertexAttributeType(type: VertexAttributeType): number {
	switch (type) {
		case VertexAttributeType.Int8   : return WebGL2RenderingContext.BYTE;
		case VertexAttributeType.Uint8  : return WebGL2RenderingContext.UNSIGNED_BYTE;
		case VertexAttributeType.Int16  : return WebGL2RenderingContext.SHORT;
		case VertexAttributeType.Uint16 : return WebGL2RenderingContext.UNSIGNED_SHORT;
		case VertexAttributeType.Int32  : return WebGL2RenderingContext.INT;
		case VertexAttributeType.Uint32 : return WebGL2RenderingContext.UNSIGNED_INT;
		case VertexAttributeType.Float32: return WebGL2RenderingContext.FLOAT;
		default: assertNever(type);
	}
}

function glIndexType(indexData: IndexBufferData) {
	if (indexData instanceof Uint16Array) return WebGL2RenderingContext.UNSIGNED_SHORT;
	if (indexData instanceof Uint32Array) return WebGL2RenderingContext.UNSIGNED_INT;
	assertNever(indexData);
}

function glRenderPrimitiveType(primitiveType: RenderPrimitiveType) {
	switch (primitiveType) {
		case RenderPrimitiveType.Points   : return WebGL2RenderingContext.POINTS;
		case RenderPrimitiveType.Lines    : return WebGL2RenderingContext.LINES;
		case RenderPrimitiveType.Triangles: return WebGL2RenderingContext.TRIANGLES;
		default: assertNever(primitiveType);
	}
}

function glGeometryUsage(usage: GeometryUsage) {
	switch (usage) {
		case GeometryUsage.Static: return WebGL2RenderingContext.STATIC_DRAW;
		case GeometryUsage.Dynamic: return WebGL2RenderingContext.DYNAMIC_DRAW;
		case GeometryUsage.Stream: return WebGL2RenderingContext.STREAM_DRAW;
		default: assertNever(usage);
	}
}

function findVertexShaderInputsWithoutExplicitLocations(source: string) {
	const inputsWithoutLocations: string[] = [];
	const attributePattern = /^\s*(layout\s*\(\s*location\s*=\s*\d+\s*\)\s*)?in\s+\w+\s+(\w+)\s*;/gm;

	for (const match of source.matchAll(attributePattern)) {
		const [, layoutQualifier, name] = match;
		if (!layoutQualifier && name) {
			inputsWithoutLocations.push(name);
		}
	}

	return inputsWithoutLocations;
}