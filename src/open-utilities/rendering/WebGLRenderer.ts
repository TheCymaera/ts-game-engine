import { assertNever } from "@open-utilities/types/assertNever.js";
import { Matrix4 } from "../maths/Matrix4.js";
import { Color } from "./Color.js";
import type { Rect } from "../maths/Rect.js";
import { Vector2 } from "@open-utilities/maths/Vector2.js";
import { Vector3 } from "@open-utilities/maths/Vector3.js";
export { Int32, Float32, int32, float32 } from "./Struct.js";
import { Int32, Float32, type StructPrimitives } from "./Struct.js";
import { Quaternion } from "@open-utilities/maths/Quaternion.js";

export class WebGLRenderer {
	readonly derivedUniforms: { readonly [scope in UniformScope]: Record<string, DerivedUniformDefinition> } = {
		pass: {},
		draw: {},
	}

	constructor(readonly gl: WebGL2RenderingContext) {
		this.#applyPipelineState(PipelineState.default);
		this.#textureFilterAnisotropic = gl.getExtension("EXT_texture_filter_anisotropic") ?? undefined;

		this.derivedUniforms.draw.uModelViewProjection = {
			dependsOn: ["uProjection", "uView", "uModel"],
			get: (dependencies) => {
				const projection = dependencies.uProjection as Matrix4;
				const view = dependencies.uView as Matrix4;
				const model = dependencies.uModel as Matrix4;

				return projection.clone().multiply(view).multiply(model);
			},
		};
	}

	static fromCanvas(canvas: HTMLCanvasElement): WebGLRenderer {
		const gl = canvas.getContext("webgl2");
		if (!gl) throw new Error("WebGL2 not supported.");
		return new WebGLRenderer(gl);
	}

	setClearColor(color: Color) {
		this.gl.clearColor(color.r / 255, color.g / 255, color.b / 255, color.a / 255);
	}

	setClearDepth(depth: number) {
		this.gl.clearDepth(depth);
	}

	setClearStencil(stencil: number) {
		this.gl.clearStencil(stencil);
	}

	clear({ color = true, depth = true, stencil = false } = {}) {
		let bits = 0;
		if (color) bits |= this.gl.COLOR_BUFFER_BIT;
		if (depth) bits |= this.gl.DEPTH_BUFFER_BIT;
		if (stencil) bits |= this.gl.STENCIL_BUFFER_BIT;
		this.gl.clear(bits);
	}

	#currentTarget: Framebuffer | undefined = undefined;

	setFramebuffer(target: Framebuffer | undefined) {
		if (this.#currentTarget === target) return;
		
		this.#currentTarget = target;
		this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, target ? this.#getFramebuffer(target) : null);
		
		// invalidate depth-attachment
		this.#lastPipelineState = null;
		
		if (target) {
			this.gl.viewport(0, 0, target.width, target.height);
		}
	}

	setViewport(viewport: Rect) {
		this.gl.viewport(viewport.minX, viewport.minY, viewport.width, viewport.height);
	}

	#passUniforms: UniformList = {};
	beginPass(uniforms: UniformList) {
		this.#passUniforms = uniforms;
	}

	#lastMaterial = new Map<WebGLProgram, Material>();
	#lastPipelineState: PipelineState | null = null;
	#textureUnitCounter = 0;

	drawMesh(mesh: Mesh, uniforms: UniformList = {}) {
		const program = this.#getProgram(mesh.material.shader);
		this.gl.useProgram(program);

		this.#applyPipelineStateIfChanged(mesh.material.pipelineState);

		// bind uniform buffers declared on the material (per binding point)
		for (const [bindingPoint, buffer] of mesh.material.uniformGroups) {
			this.#bindUniformBuffer(bindingPoint, buffer);
		}

		this.#textureUnitCounter = 0;

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

	#applyPipelineStateIfChanged(state: PipelineState) {
		if (this.#lastPipelineState === state) return;
		this.#applyPipelineState(state);
		this.#lastPipelineState = state;
	}

	#applyPipelineState(state: PipelineState) {
		const gl = this.gl;
		const last = this.#lastPipelineState;

		if (last?.depthTest !== state.depthTest) {
			if (state.depthTest) gl.enable(gl.DEPTH_TEST);
			else gl.disable(gl.DEPTH_TEST);
		}
		if (last?.depthWrite !== state.depthWrite) {
			gl.depthMask(state.depthWrite);
		}
		if (last?.depthFunc !== state.depthFunc) {
			gl.depthFunc(glDepthFunc(state.depthFunc));
		}
		if (last?.blend !== state.blend) {
			if (state.blend === BlendMode.None) {
				gl.disable(gl.BLEND);
			} else {
				gl.enable(gl.BLEND);
				const [sf, df] = glBlendFunc(state.blend);
				gl.blendFunc(sf, df);
			}
		}
		if (last?.cullFace !== state.cullFace) {
			if (state.cullFace === CullFace.None) {
				gl.disable(gl.CULL_FACE);
			} else {
				gl.enable(gl.CULL_FACE);
				gl.cullFace(glCullFace(state.cullFace));
			}
		}
		if (last?.frontFace !== state.frontFace) {
			gl.frontFace(glFrontFace(state.frontFace));
		}
		if (last?.colorWriteMask !== state.colorWriteMask) {
			gl.colorMask(
				(state.colorWriteMask & ColorWriteMasks.Red) !== 0,
				(state.colorWriteMask & ColorWriteMasks.Green) !== 0,
				(state.colorWriteMask & ColorWriteMasks.Blue) !== 0,
				(state.colorWriteMask & ColorWriteMasks.Alpha) !== 0,
			);
		}
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
		textures: new Map<Texture, WebGLTexture>(),
		samplers: new Map<Sampler, WebGLSampler>(),
		framebuffers: new Map<Framebuffer, WebGLFramebuffer>(),
		uniformBuffers: new Map<ShaderBuffer<ArrayBuffer>, WebGLBuffer>(),
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
		this.gl.bufferData(kind, buffer.buffer, glBufferUsage(buffer.usage));
		this.gl.bindBuffer(kind, null);
		buffer.isDirty = false;
	}
	
	#getAndSyncTexture(texture: Texture): WebGLTexture {
		const out = this.#cache.textures.getOrInsertComputed(texture, () => {
			const gl = this.gl;
			const glTexture = gl.createTexture();
			texture.isDirty = true;
			return glTexture;
		});
		this.#syncTexture(texture, out);
		return out;
	}

	#syncTexture(texture: Texture, glTexture: WebGLTexture) {
		if (!texture.isDirty) return;

		const gl = this.gl;
		gl.bindTexture(gl.TEXTURE_2D, glTexture);
		
		const [internalFormat, format, type] = glTextureFormat(texture.format);
		
		const source = texture.source;

		gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, texture.width, texture.height, 0, format, type, source as ArrayBufferView | null);
		
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, texture.mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
		if (texture.mipmaps) gl.generateMipmap(gl.TEXTURE_2D);

		gl.bindTexture(gl.TEXTURE_2D, null);
		
		texture.isDirty = false;
	}

	#getSampler(sampler: Sampler): WebGLSampler {
		return this.#cache.samplers.getOrInsertComputed(sampler, () => {
			const gl = this.gl;
			const glSampler = gl.createSampler();
			gl.samplerParameteri(glSampler, gl.TEXTURE_MIN_FILTER, glTextureFilter(sampler.minFilter));
			gl.samplerParameteri(glSampler, gl.TEXTURE_MAG_FILTER, glTextureFilter(sampler.magFilter));
			gl.samplerParameteri(glSampler, gl.TEXTURE_WRAP_S, glTextureWrap(sampler.wrapS));
			gl.samplerParameteri(glSampler, gl.TEXTURE_WRAP_T, glTextureWrap(sampler.wrapT));
			if (sampler.compareFunc !== CompareFunc.None) {
				gl.samplerParameteri(glSampler, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
				gl.samplerParameteri(glSampler, gl.TEXTURE_COMPARE_FUNC, glCompareFunc(sampler.compareFunc));
			} else {
				gl.samplerParameteri(glSampler, gl.TEXTURE_COMPARE_MODE, gl.NONE);
			}
			if (sampler.maxAnisotropy > 1) {
				const ext = this.#textureFilterAnisotropic;
				if (ext) {
					gl.samplerParameterf(glSampler, ext.TEXTURE_MAX_ANISOTROPY_EXT, sampler.maxAnisotropy);
				}
			}
			return glSampler;
		});
	}

	#textureFilterAnisotropic: EXT_texture_filter_anisotropic | undefined = undefined;

	#getFramebuffer(framebuffer: Framebuffer): WebGLFramebuffer {
		return this.#cache.framebuffers.getOrInsertComputed(framebuffer, () => {
			return createFramebuffer(this.gl, framebuffer, (texture) => this.#getAndSyncTexture(texture));
		});
	}

	#getAndSyncUniformBuffer(buffer: ShaderBuffer<ArrayBuffer>): WebGLBuffer {
		const glBuffer = this.#cache.uniformBuffers.getOrInsertComputed(buffer, () => {
			const gl = this.gl;
			const out = gl.createBuffer();
			buffer.isDirty = true;
			return out;
		});
		this.#syncUniformBuffer(buffer, glBuffer);
		return glBuffer;
	}

	#syncUniformBuffer(buffer: ShaderBuffer<ArrayBuffer>, glBuffer: WebGLBuffer) {
		if (!buffer.isDirty) return;
		const gl = this.gl;
		gl.bindBuffer(gl.UNIFORM_BUFFER, glBuffer);
		gl.bufferData(gl.UNIFORM_BUFFER, buffer.buffer, glBufferUsage(buffer.usage));
		gl.bindBuffer(gl.UNIFORM_BUFFER, null);
		buffer.isDirty = false;
	}

	#boundUniformBuffers = new Map<number, ShaderBuffer<ArrayBuffer>>();

	#bindUniformBuffer(bindingPoint: number, buffer: ShaderBuffer<ArrayBuffer>) {
		// Skip re-binding if the same buffer is already bound at this point
		// and hasn't been updated since (isDirty would require a re-sync).
		if (this.#boundUniformBuffers.get(bindingPoint) === buffer && !buffer.isDirty) return;
		const glBuffer = this.#getAndSyncUniformBuffer(buffer);
		this.gl.bindBufferBase(this.gl.UNIFORM_BUFFER, bindingPoint, glBuffer);
		this.#boundUniformBuffers.set(bindingPoint, buffer);
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
		const gl = this.gl;
		for (const key in uniforms) {
			const uniform = uniforms[key]!;
			const location = locations.getOrInsertComputed(key, ()=> {
				const out = gl.getUniformLocation(program, key);
				if (!out) {
					if (required) throw new Error(`Uniform "${key}" not found in shader.`);
					return null;
				}
				return out;
			});

			if (!location) continue;

			if (uniform instanceof Int32) {
				gl.uniform1i(location, uniform.value);
				continue;
			}
			if (uniform instanceof Float32) {
				gl.uniform1f(location, uniform.value);
				continue;
			}
			if (uniform instanceof Matrix4) {
				gl.uniformMatrix4fv(location, false, uniform.toColumnMajor(Float32Array));
				continue;
			}
			if (uniform instanceof Vector2) {
				gl.uniform2f(location, uniform.x, uniform.y);
				continue;
			}
			if (uniform instanceof Vector3) {
				gl.uniform3f(location, uniform.x, uniform.y, uniform.z);
				continue;
			}
			if (uniform instanceof Quaternion) {
				gl.uniform4f(location, uniform.x, uniform.y, uniform.z, uniform.w);
				continue;
			}
			if (uniform instanceof Color) {
				gl.uniform4f(location, uniform.r / 255, uniform.g / 255, uniform.b / 255, uniform.a / 255);
				continue;
			}
			if (uniform instanceof Texture) {
				const unit = this.#claimTextureUnit();
				gl.activeTexture(gl.TEXTURE0 + unit);
				gl.bindTexture(gl.TEXTURE_2D, this.#getAndSyncTexture(uniform));
				gl.bindSampler(unit, this.#getSampler(uniform.sampler));
				gl.uniform1i(location, unit);
				continue;
			}
			assertNever(uniform);
		}
	}

	#claimTextureUnit() {
		const unit = this.#textureUnitCounter++;
		const max = this.gl.getParameter(this.gl.MAX_TEXTURE_IMAGE_UNITS) as number;
		if (unit >= max) {
			throw new Error(`Texture unit overflow: shader requires more than ${max} texture units in a single draw.`);
		}
		return unit;
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
	readonly pipelineState: PipelineState;
	readonly uniformGroups: Map<number, ShaderBuffer<ArrayBuffer>> = new Map();
	needsUniformUpdate = true;

	constructor(options: {
		readonly shader: ShaderModule,
		readonly uniforms: TUniforms,
		readonly pipelineState?: PipelineState,
		readonly uniformGroups?: ReadonlyMap<number, ShaderBuffer<ArrayBuffer>> | Record<number, ShaderBuffer<ArrayBuffer>>,
	}) {
		this.shader = options.shader;
		this.uniforms = options.uniforms;
		this.pipelineState = options.pipelineState ?? PipelineState.default;
		if (options.uniformGroups) {
			const entries: Iterable<readonly [number, ShaderBuffer<ArrayBuffer>]> = options.uniformGroups instanceof Map
				? options.uniformGroups
				: Object.entries(options.uniformGroups).map(([k, v]) => [Number(k), v] as const);
			for (const [k, v] of entries) this.uniformGroups.set(k, v);
		}
	}
}

export type ShaderUniform = StructPrimitives | Texture;

export enum RenderPrimitiveType {
	Points,
	Lines,
	Triangles,
}

export enum DepthFunc {
	Never,
	Less,
	Equal,
	LessOrEqual,
	Greater,
	NotEqual,
	GreaterOrEqual,
	Always,
}

export enum BlendMode {
	None,
	Alpha,
	Additive,
	Premultiplied,
}

export enum CullFace {
	None,
	Back,
	Front,
}

export enum FrontFace {
	Clockwise,
	CounterClockwise,
}

export enum ColorWriteMasks {
	Red = 1,
	Green = 2,
	Blue = 4,
	Alpha = 8,

	None = 0,
	All = Red | Green | Blue | Alpha,
}

export type ColorWriteMask = number;

export class PipelineState {
	readonly depthTest: boolean;
	readonly depthWrite: boolean;
	readonly depthFunc: DepthFunc;
	readonly blend: BlendMode;
	readonly cullFace: CullFace;
	readonly frontFace: FrontFace;
	readonly colorWriteMask: ColorWriteMask;

	constructor(options: {
		depthTest?: boolean,
		depthWrite?: boolean,
		depthFunc?: DepthFunc,
		blend?: BlendMode,
		cullFace?: CullFace,
		frontFace?: FrontFace,
		colorWriteMask?: ColorWriteMask,
	} = {}) {
		this.depthTest = options.depthTest ?? true;
		this.depthWrite = options.depthWrite ?? true;
		this.depthFunc = options.depthFunc ?? DepthFunc.Less;
		this.blend = options.blend ?? BlendMode.Alpha;
		this.cullFace = options.cullFace ?? CullFace.None;
		this.frontFace = options.frontFace ?? FrontFace.CounterClockwise;
		this.colorWriteMask = options.colorWriteMask ?? ColorWriteMasks.All;
	}

	static readonly default = new PipelineState();
	static readonly opaque = new PipelineState({ blend: BlendMode.None });
	static readonly additive = new PipelineState({ blend: BlendMode.Additive, depthWrite: false });
	static readonly transparent = new PipelineState({ blend: BlendMode.Alpha, depthWrite: false });
}

export enum TextureFormat {
	R8,
	RG8,
	RGBA8,
	R16F,
	RG16F,
	RGBA16F,
	R32F,
	RG32F,
	RGBA32F,
	Depth24,
	Depth24Stencil8,
}

export enum TextureFilter {
	Nearest,
	Linear,
	NearestMipmapNearest,
	LinearMipmapNearest,
	NearestMipmapLinear,
	LinearMipmapLinear,
}

export enum TextureWrap {
	Repeat,
	ClampToEdge,
	MirroredRepeat,
}

export enum CompareFunc {
	None,
	Never,
	Less,
	Equal,
	LessOrEqual,
	Greater,
	NotEqual,
	GreaterOrEqual,
	Always,
}

export class Texture {
	isDirty = true;
	readonly width: number;
	readonly height: number;
	readonly format: TextureFormat;
	readonly mipmaps: boolean;
	readonly sampler: Sampler;
	readonly source: TexImageSource | ArrayBufferView | null;

	constructor(options: {
		width: number,
		height: number,
		format?: TextureFormat,
		mipmaps?: boolean,
		source?: TexImageSource | ArrayBufferView,
		sampler?: Sampler,
	}) {
		this.width = options.width;
		this.height = options.height;
		this.format = options.format ?? TextureFormat.RGBA8;
		this.mipmaps = options.mipmaps ?? false;
		this.source = options.source ?? null;
		this.sampler = options.sampler ?? Sampler.default;
	}

	setData(source: TexImageSource | ArrayBufferView) {
		// @ts-expect-error Privately mutable
		this.source = source;
		this.isDirty = true;
	}

	static fromImage({ image, format, mipmaps, sampler }: {
		image: TexImageSource,
		format?: TextureFormat,
		mipmaps?: boolean,
		sampler?: Sampler,
	}) {
		const width = 
			image instanceof HTMLImageElement ? image.naturalWidth :
			image instanceof VideoFrame ? image.codedWidth :
			image.width;
		const height =
			image instanceof HTMLImageElement ? image.naturalHeight :
			image instanceof VideoFrame ? image.codedHeight :
			image.height;
			

		return new Texture({
			width: width,
			height: height,
			format: format ?? TextureFormat.RGBA8,
			mipmaps: mipmaps ?? false,
			source: image,
			sampler: sampler ?? Sampler.default,
		});
	}
}

export class Sampler {
	readonly minFilter: TextureFilter;
	readonly magFilter: TextureFilter;
	readonly wrapS: TextureWrap;
	readonly wrapT: TextureWrap;
	readonly compareFunc: CompareFunc;
	readonly maxAnisotropy: number;

	constructor(options: {
		minFilter?: TextureFilter,
		magFilter?: TextureFilter,
		wrapS?: TextureWrap,
		wrapT?: TextureWrap,
		compareFunc?: CompareFunc,
		maxAnisotropy?: number,
	} = {}) {
		this.minFilter = options.minFilter ?? TextureFilter.Linear;
		this.magFilter = options.magFilter ?? TextureFilter.Linear;
		this.wrapS = options.wrapS ?? TextureWrap.ClampToEdge;
		this.wrapT = options.wrapT ?? TextureWrap.ClampToEdge;
		this.compareFunc = options.compareFunc ?? CompareFunc.None;
		this.maxAnisotropy = options.maxAnisotropy ?? 1;
	}

	static readonly default = new Sampler();
	static readonly nearest = new Sampler({ minFilter: TextureFilter.Nearest, magFilter: TextureFilter.Nearest });
	static readonly linear = new Sampler({ minFilter: TextureFilter.Linear, magFilter: TextureFilter.Linear });
	static readonly linearMipmap = new Sampler({ minFilter: TextureFilter.LinearMipmapLinear, magFilter: TextureFilter.Linear });
}

export class Framebuffer {
	readonly width: number;
	readonly height: number;
	readonly colorAttachments: readonly Texture[];
	readonly depthAttachment: Texture | null;

	constructor(options: {
		width: number,
		height: number,
		colorAttachments?: Texture[],
		depthAttachment?: Texture | null,
	}) {
		this.width = options.width;
		this.height = options.height;
		this.colorAttachments = options.colorAttachments ?? [];
		this.depthAttachment = options.depthAttachment ?? null;
		for (const attachment of [...this.colorAttachments, this.depthAttachment]) {
			if (attachment && (attachment.width !== this.width || attachment.height !== this.height)) {
				throw new Error(
					`Framebuffer attachment size (${attachment.width}x${attachment.height}) does not match framebuffer size (${this.width}x${this.height}).`
				);
			}
		}
	}
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

export class ShaderBuffer<T extends AllowSharedBufferSource = AllowSharedBufferSource> {
	isDirty = true;
	constructor(readonly buffer: T, readonly usage: BufferUsage) {}

	set(newBuffer: T) {
		// @ts-expect-error Privately mutable
		this.buffer = newBuffer;
		this.isDirty = true;
	}
}

export enum BufferUsage {
	Static,
	Dynamic,
	Stream,
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
	gl.bufferData(gl.ARRAY_BUFFER, geometry.vertices.buffer, glBufferUsage(geometry.vertices.usage));

	const ibo = gl.createBuffer();
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices.buffer, glBufferUsage(geometry.indices.usage));
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

function glBufferUsage(usage: BufferUsage) {
	switch (usage) {
		case BufferUsage.Static: return WebGL2RenderingContext.STATIC_DRAW;
		case BufferUsage.Dynamic: return WebGL2RenderingContext.DYNAMIC_DRAW;
		case BufferUsage.Stream: return WebGL2RenderingContext.STREAM_DRAW;
		default: assertNever(usage);
	}
}

function glDepthFunc(func: DepthFunc) {
	switch (func) {
		case DepthFunc.Never: return WebGL2RenderingContext.NEVER;
		case DepthFunc.Less: return WebGL2RenderingContext.LESS;
		case DepthFunc.Equal: return WebGL2RenderingContext.EQUAL;
		case DepthFunc.LessOrEqual: return WebGL2RenderingContext.LEQUAL;
		case DepthFunc.Greater: return WebGL2RenderingContext.GREATER;
		case DepthFunc.NotEqual: return WebGL2RenderingContext.NOTEQUAL;
		case DepthFunc.GreaterOrEqual: return WebGL2RenderingContext.GEQUAL;
		case DepthFunc.Always: return WebGL2RenderingContext.ALWAYS;
		default: assertNever(func);
	}
}

function glBlendFunc(mode: BlendMode): [GLenum, GLenum] {
	switch (mode) {
		case BlendMode.None: return [WebGL2RenderingContext.ONE, WebGL2RenderingContext.ZERO];
		case BlendMode.Alpha: return [WebGL2RenderingContext.SRC_ALPHA, WebGL2RenderingContext.ONE_MINUS_SRC_ALPHA];
		case BlendMode.Additive: return [WebGL2RenderingContext.SRC_ALPHA, WebGL2RenderingContext.ONE];
		case BlendMode.Premultiplied: return [WebGL2RenderingContext.ONE, WebGL2RenderingContext.ONE_MINUS_SRC_ALPHA];
		default: assertNever(mode);
	}
}

function glCullFace(face: CullFace) {
	switch (face) {
		case CullFace.None: throw new Error("CullFace.None should be handled by disabling culling, not by calling gl.cullFace.");
		case CullFace.Back: return WebGL2RenderingContext.BACK;
		case CullFace.Front: return WebGL2RenderingContext.FRONT;
		default: assertNever(face);
	}
}

function glFrontFace(face: FrontFace) {
	switch (face) {
		case FrontFace.Clockwise: return WebGL2RenderingContext.CW;
		case FrontFace.CounterClockwise: return WebGL2RenderingContext.CCW;
		default: assertNever(face);
	}
}

function glTextureFilter(filter: TextureFilter) {
	switch (filter) {
		case TextureFilter.Nearest: return WebGL2RenderingContext.NEAREST;
		case TextureFilter.Linear: return WebGL2RenderingContext.LINEAR;
		case TextureFilter.NearestMipmapNearest: return WebGL2RenderingContext.NEAREST_MIPMAP_NEAREST;
		case TextureFilter.LinearMipmapNearest: return WebGL2RenderingContext.LINEAR_MIPMAP_NEAREST;
		case TextureFilter.NearestMipmapLinear: return WebGL2RenderingContext.NEAREST_MIPMAP_LINEAR;
		case TextureFilter.LinearMipmapLinear: return WebGL2RenderingContext.LINEAR_MIPMAP_LINEAR;
		default: assertNever(filter);
	}
}

function glTextureWrap(wrap: TextureWrap) {
	switch (wrap) {
		case TextureWrap.Repeat: return WebGL2RenderingContext.REPEAT;
		case TextureWrap.ClampToEdge: return WebGL2RenderingContext.CLAMP_TO_EDGE;
		case TextureWrap.MirroredRepeat: return WebGL2RenderingContext.MIRRORED_REPEAT;
		default: assertNever(wrap);
	}
}

function glCompareFunc(func: CompareFunc) {
	switch (func) {
		case CompareFunc.None: throw new Error("CompareFunc.None should be handled by disabling compare mode, not by calling gl.TEXTURE_COMPARE_FUNC.");
		case CompareFunc.Never: return WebGL2RenderingContext.NEVER;
		case CompareFunc.Less: return WebGL2RenderingContext.LESS;
		case CompareFunc.Equal: return WebGL2RenderingContext.EQUAL;
		case CompareFunc.LessOrEqual: return WebGL2RenderingContext.LEQUAL;
		case CompareFunc.Greater: return WebGL2RenderingContext.GREATER;
		case CompareFunc.NotEqual: return WebGL2RenderingContext.NOTEQUAL;
		case CompareFunc.GreaterOrEqual: return WebGL2RenderingContext.GEQUAL;
		case CompareFunc.Always: return WebGL2RenderingContext.ALWAYS;
		default: assertNever(func);
	}
}

function glTextureFormat(format: TextureFormat): [GLenum, GLenum, GLenum] {
	// returns [internalFormat, format, type]
	switch (format) {
		case TextureFormat.R8: return [WebGL2RenderingContext.R8, WebGL2RenderingContext.RED, WebGL2RenderingContext.UNSIGNED_BYTE];
		case TextureFormat.RG8: return [WebGL2RenderingContext.RG8, WebGL2RenderingContext.RG, WebGL2RenderingContext.UNSIGNED_BYTE];
		case TextureFormat.RGBA8: return [WebGL2RenderingContext.RGBA8, WebGL2RenderingContext.RGBA, WebGL2RenderingContext.UNSIGNED_BYTE];
		case TextureFormat.R16F: return [WebGL2RenderingContext.R16F, WebGL2RenderingContext.RED, WebGL2RenderingContext.HALF_FLOAT];
		case TextureFormat.RG16F: return [WebGL2RenderingContext.RG16F, WebGL2RenderingContext.RG, WebGL2RenderingContext.HALF_FLOAT];
		case TextureFormat.RGBA16F: return [WebGL2RenderingContext.RGBA16F, WebGL2RenderingContext.RGBA, WebGL2RenderingContext.HALF_FLOAT];
		case TextureFormat.R32F: return [WebGL2RenderingContext.R32F, WebGL2RenderingContext.RED, WebGL2RenderingContext.FLOAT];
		case TextureFormat.RG32F: return [WebGL2RenderingContext.RG32F, WebGL2RenderingContext.RG, WebGL2RenderingContext.FLOAT];
		case TextureFormat.RGBA32F: return [WebGL2RenderingContext.RGBA32F, WebGL2RenderingContext.RGBA, WebGL2RenderingContext.FLOAT];
		case TextureFormat.Depth24: return [WebGL2RenderingContext.DEPTH_COMPONENT24, WebGL2RenderingContext.DEPTH_COMPONENT, WebGL2RenderingContext.UNSIGNED_INT];
		case TextureFormat.Depth24Stencil8: return [WebGL2RenderingContext.DEPTH24_STENCIL8, WebGL2RenderingContext.DEPTH_STENCIL, WebGL2RenderingContext.UNSIGNED_INT_24_8];
		default: assertNever(format);
	}
}

function createFramebuffer(
	gl: WebGL2RenderingContext,
	framebuffer: Framebuffer,
	textureProvider: (texture: Texture) => WebGLTexture,
): WebGLFramebuffer {
	const glFramebuffer = gl.createFramebuffer();
	gl.bindFramebuffer(gl.FRAMEBUFFER, glFramebuffer);

	const colorAttachments = framebuffer.colorAttachments;
	const drawBuffers: GLenum[] = [];
	for (let i = 0; i < colorAttachments.length; i++) {
		const texture = colorAttachments[i]!;
		const glTextureObj = textureProvider(texture);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, glTextureObj, 0);
		drawBuffers.push(gl.COLOR_ATTACHMENT0 + i);
	}
	if (drawBuffers.length > 0) {
		gl.drawBuffers(drawBuffers);
	}

	if (framebuffer.depthAttachment) {
		const glTextureObj = textureProvider(framebuffer.depthAttachment);
		const attachmentPoint = framebuffer.depthAttachment.format === TextureFormat.Depth24Stencil8
			? gl.DEPTH_STENCIL_ATTACHMENT
			: gl.DEPTH_ATTACHMENT;
		gl.framebufferTexture2D(gl.FRAMEBUFFER, attachmentPoint, gl.TEXTURE_2D, glTextureObj, 0);
	}

	const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
	if (status !== gl.FRAMEBUFFER_COMPLETE) {
		const statusName = framebufferStatusName(status);
		throw new Error(`Framebuffer is incomplete: ${statusName}`);
	}

	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	return glFramebuffer;
}

function framebufferStatusName(status: GLenum): string {
	switch (status) {
		case WebGL2RenderingContext.FRAMEBUFFER_COMPLETE: return "FRAMEBUFFER_COMPLETE";
		case WebGL2RenderingContext.FRAMEBUFFER_INCOMPLETE_ATTACHMENT: return "FRAMEBUFFER_INCOMPLETE_ATTACHMENT";
		case WebGL2RenderingContext.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT: return "FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT";
		case WebGL2RenderingContext.FRAMEBUFFER_INCOMPLETE_DIMENSIONS: return "FRAMEBUFFER_INCOMPLETE_DIMENSIONS";
		case WebGL2RenderingContext.FRAMEBUFFER_UNSUPPORTED: return "FRAMEBUFFER_UNSUPPORTED";
		case WebGL2RenderingContext.FRAMEBUFFER_INCOMPLETE_MULTISAMPLE: return "FRAMEBUFFER_INCOMPLETE_MULTISAMPLE";
		default: return `0x${status.toString(16)}`;
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