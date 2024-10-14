import { type Allocator, type GraphicsLibrary, type Intersection, IParametricObject, boundingBoxFromPoints } from "../../..";
import type { BoundingBox, Ray } from "../../../shared";
import * as r from "restructure";
import { mat4, vec2, vec3, vec4 } from "gl-matrix";
import { dynamicVolumeFromPathlines } from "./dynamicVolumeFromPathlines";

class Pipelines {
    private static _instance: Pipelines;
    private static _lastDeviceUsed: GPUDevice;

    public shaderModules: Map<string, GPUShaderModule>;
    public bindGroupLayouts: Map<string, GPUBindGroupLayout>;
    public pipelineLayouts: Map<string, GPUPipelineLayout>;
    public renderPipelines: Map<string, GPURenderPipeline>;
    public computePipelines: Map<string, GPUComputePipeline>;

    private constructor(graphicsLibrary: GraphicsLibrary) {
        const device = graphicsLibrary.device;

        this.shaderModules = new Map();
        this.bindGroupLayouts = new Map();
        this.pipelineLayouts = new Map();
        this.renderPipelines = new Map();
        this.computePipelines = new Map();

        const volumeFromPathlinesBGL = device.createBindGroupLayout({
            label: "DynamicVolumeFromPathlines",
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "uniform" },
            },
            {
                binding: 1,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "read-only-storage" },
            },
            {
                binding: 2,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "storage" },
            },
            {
                binding: 3,
                visibility: GPUShaderStage.COMPUTE,
                buffer: { type: "storage" },
            }]
        });

        const volumeFromPathlinesPL = device.createPipelineLayout({
            bindGroupLayouts: [volumeFromPathlinesBGL]
        });

        this.bindGroupLayouts.set("dynamicVolumeFromPathlines", volumeFromPathlinesBGL);
        this.pipelineLayouts.set("dynamicVolumeFromPathlines", volumeFromPathlinesPL)

        const volumeFromPathlinesModule = device.createShaderModule({
            code: dynamicVolumeFromPathlines(),
        });
        this.shaderModules.set("dynamicVolumeFromPathlines", volumeFromPathlinesModule);

        this.computePipelines.set("dynamicVolumeFromPathlines", device.createComputePipeline({
            layout: volumeFromPathlinesPL,
            compute: {
                module: volumeFromPathlinesModule,
                entryPoint: "main",
            }
        }));

        Pipelines._lastDeviceUsed = graphicsLibrary.device;
    }

    public static getInstance(graphicsLibrary: GraphicsLibrary): Pipelines {
        if (this._instance && Pipelines._lastDeviceUsed === graphicsLibrary.device) {
            return this._instance;
        }

        return this._instance = new this(graphicsLibrary);
    }
}

export interface DynamicVolumeProperties {
    modelMatrix: mat4,
    modelMatrixInverse: mat4,
    color: vec4,
    translate: vec4,
    scale: vec4,
    transparency: number,
    func: number,
}

// The "number" types are actually 8 bytes and not 4 bytes, so size must be bigger
const VolumeUniformSize = 192;

export const DynamicVolumeStruct = new r.Struct({
    modelMatrix: new r.Array(r.floatle, 16),
    modelMatrixInverse: new r.Array(r.floatle, 16),
    color: new r.Array(r.floatle, 4),
    translate: new r.Array(r.floatle, 4),
    scale: new r.Array(r.floatle, 4),
    transparency: r.floatle,
    func: r.uint32le,
});

export const DynamicVolumeTextureSize: number = 64;

export class DynamicVolume extends IParametricObject {
    public static variableName = "dynamicVolume";
    public static typeName = "DynamicVolume";

    public getVariableName(): string { return DynamicVolume.variableName }
    public getTypeName(): string { return DynamicVolume.typeName }

    static bindGroupLayouts: Array<GPUBindGroupLayout> = [];
    static createBindGroupLayouts(device: GPUDevice): void {
        DynamicVolume.bindGroupLayouts = [device.createBindGroupLayout({
            label: this.typeName,
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: "read-only-storage" },
            }, {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {
                    type: "filtering"
                }
            }, {
                binding: 2,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    viewDimension: "2d"
                }
            }, {
                binding: 3,
                visibility: GPUShaderStage.FRAGMENT,
                buffer: { type: "read-only-storage" },
            }, {
                binding: 4,
                visibility: GPUShaderStage.FRAGMENT,
                buffer: { type: "read-only-storage" },
            }]
        }),
        device.createBindGroupLayout({
            label: this.typeName,
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    viewDimension: "2d",
                    sampleType: "depth"
                }
            }]
        })
        ];
    }

    static accumulationTextures: [GPUTexture, GPUTexture] | null = null;

    public properties: DynamicVolumeProperties[];

    //#region GPU Code
    public static gpuCodeGlobals = /* wgsl */`
        struct ${this.typeName} {
            modelMatrix: mat4x4<f32>,
            modelMatrixInverse: mat4x4<f32>,
            color: vec4<f32>,
            translate: vec4<f32>,
            scale: vec4<f32>,
            transparency: f32,
            func: u32,
        };
        
        @group(1) @binding(0) var<storage, read> ${this.variableName}: array<${this.typeName}>;
        @group(1) @binding(1) var linearSampler: sampler;
        @group(1) @binding(2) var colormap: texture_2d<f32>;
        @group(1) @binding(3) var<storage, read> lastTimestepGrids: array<array<array<array<f32, ${DynamicVolumeTextureSize}>, ${DynamicVolumeTextureSize}>, ${DynamicVolumeTextureSize}>>;
        @group(1) @binding(4) var<storage, read> numberOfTimestepGrids: array<array<array<array<f32, ${DynamicVolumeTextureSize}>, ${DynamicVolumeTextureSize}>, ${DynamicVolumeTextureSize}>>;

        const M_PI: f32 = 3.14159265358979323846;
    `;

    public static gpuCodeGetObject = "";
    public static gpuCodeGetObjectUntypedArray = "";


    static gpuCodeIntersectionTest = /* wgsl */`
        fn sampleLastTimestepGrid(tex_coord: vec3<f32>, i: u32) -> f32 {
            var coords = ${DynamicVolumeTextureSize} * tex_coord;
            let coordsU32 = vec3<u32>(floor(coords));
            let coordsFract = fract(coords);
            let tx = coordsFract.x;
            let ty = coordsFract.y;       
            let tz = coordsFract.z;

            let c000 = lastTimestepGrids[i][coordsU32.x][coordsU32.y][coordsU32.z];
            let c100 = lastTimestepGrids[i][coordsU32.x + 1][coordsU32.y][coordsU32.z];
            let c010 = lastTimestepGrids[i][coordsU32.x][coordsU32.y + 1][coordsU32.z];
            let c110 = lastTimestepGrids[i][coordsU32.x + 1][coordsU32.y + 1][coordsU32.z];
            let c001 = lastTimestepGrids[i][coordsU32.x][coordsU32.y][coordsU32.z + 1];
            let c101 = lastTimestepGrids[i][coordsU32.x + 1][coordsU32.y][coordsU32.z + 1];
            let c011 = lastTimestepGrids[i][coordsU32.x][coordsU32.y + 1][coordsU32.z + 1];
            let c111 = lastTimestepGrids[i][coordsU32.x + 1][coordsU32.y + 1][coordsU32.z + 1];

            return 
                (1.0 - tx) * (1.0 - ty) * (1.0 - tz) * c000 + 
                tx * (1.0 - ty) * (1.0 - tz) * c100 + 
                (1.0 - tx) * ty * (1.0 - tz) * c010 + 
                tx * ty * (1.0 - tz) * c110 + 
                (1.0 - tx) * (1.0 - ty) * tz * c001 + 
                tx * (1.0 - ty) * tz * c101 + 
                (1.0 - tx) * ty * tz * c011 + 
                tx * ty * tz * c111; 
        }  
    
        fn sampleNumberOfTimestepsGrid(tex_coord: vec3<f32>, i: u32) -> f32 {
            var coords = ${DynamicVolumeTextureSize} * tex_coord;
            let coordsU32 = vec3<u32>(floor(coords));
            let coordsFract = fract(coords);
            let tx = coordsFract.x;
            let ty = coordsFract.y;       
            let tz = coordsFract.z;

            let c000 = numberOfTimestepGrids[i][coordsU32.x][coordsU32.y][coordsU32.z];
            let c100 = numberOfTimestepGrids[i][coordsU32.x + 1][coordsU32.y][coordsU32.z];
            let c010 = numberOfTimestepGrids[i][coordsU32.x][coordsU32.y + 1][coordsU32.z];
            let c110 = numberOfTimestepGrids[i][coordsU32.x + 1][coordsU32.y + 1][coordsU32.z];
            let c001 = numberOfTimestepGrids[i][coordsU32.x][coordsU32.y][coordsU32.z + 1];
            let c101 = numberOfTimestepGrids[i][coordsU32.x + 1][coordsU32.y][coordsU32.z + 1];
            let c011 = numberOfTimestepGrids[i][coordsU32.x][coordsU32.y + 1][coordsU32.z + 1];
            let c111 = numberOfTimestepGrids[i][coordsU32.x + 1][coordsU32.y + 1][coordsU32.z + 1];

            return 
                (1.0 - tx) * (1.0 - ty) * (1.0 - tz) * c000 + 
                tx * (1.0 - ty) * (1.0 - tz) * c100 + 
                (1.0 - tx) * ty * (1.0 - tz) * c010 + 
                tx * ty * (1.0 - tz) * c110 + 
                (1.0 - tx) * (1.0 - ty) * tz * c001 + 
                tx * (1.0 - ty) * tz * c101 + 
                (1.0 - tx) * ty * tz * c011 + 
                tx * ty * tz * c111; 
        }  
    
        fn rayUnitBoxIntersection(ray: Ray) -> vec2<f32> {
            let tMin = (vec3<f32>(-1.0) - ray.origin) / ray.direction;
            let tMax = (vec3<f32>(1.0) - ray.origin) / ray.direction;

            let t1 = min(tMin, tMax);
            let t2 = max(tMin, tMax);

            let tN = max( max( t1.x, t1.y ), t1.z );
            let tF = min( min( t2.x, t2.y ), t2.z );

            return vec2(tN, tF);
        }

        fn ray${this.typeName}Intersection(ray: Ray, ${this.variableName}: ${this.typeName}) -> Intersection {
            let rayOriginLocalSpace = (${this.variableName}.modelMatrixInverse * vec4<f32>(ray.origin, 1.0)).xyz;
            let rayDirectionLocalSpace = normalize(${this.variableName}.modelMatrixInverse * vec4<f32>(ray.direction, 0.0)).xyz;

            let tMin = (vec3<f32>(-1.0) - rayOriginLocalSpace) / rayDirectionLocalSpace;
            let tMax = (vec3<f32>(1.0) - rayOriginLocalSpace) / rayDirectionLocalSpace;

            let t1 = min(tMin, tMax);
            let t2 = max(tMin, tMax);

            let tN = max( max( t1.x, t1.y ), t1.z );
            let tF = min( min( t2.x, t2.y ), t2.z );

            if(tN > tF) {
                return Intersection(
                    -1.0,
                    vec3<f32>(0.0),
                    vec3<f32>(0.0),
                );
            }

            var normal = vec3<f32>(0.0);
            if (tN > 0.0) {
                normal = step(vec3<f32>(tN), t1);
            } else {
                normal = step(t2, vec3<f32>(tF));
            }
            normal = normal * (-sign(rayDirectionLocalSpace.xyz));

            let t = max(tN, 0.0);
            let intersection = rayOriginLocalSpace + t * rayDirectionLocalSpace;

            return Intersection(
                t,
                (${this.variableName}.modelMatrix * vec4<f32>(intersection, 1.0)).xyz,
                normal
            );
        }
    `;

    static gpuCodeGetOutputValue(variable: "color" | "normal" | "ao"): string {
        switch (variable) {
            case "color": {
                return /* wgsl */`
                    // The volume object is normalized and situated at origin so no need to transform ray
                    let rayOriginLocalSpace = (${this.variableName}[0].modelMatrixInverse * vec4<f32>(ray.origin, 1.0)).xyz;
                    let rayDirectionLocalSpace = normalize(${this.variableName}[0].modelMatrixInverse * vec4<f32>(ray.direction, 0.0)).xyz;
                    let rayLocalSpace = Ray(rayOriginLocalSpace, rayDirectionLocalSpace);
                    var t_interval = rayUnitBoxIntersection(rayLocalSpace);
                    if (t_interval.x > t_interval.y) {
                        discard;
                    }
                    
                    // Helpers for early discard
                    let previousDepth: f32 = textureLoad(depthTexture, vec2<u32>(vertexOuput.Position.xy), 0);
                    var intersectionWorldSpace = vec3(0.0);
                    var depth = 0.0;
                    
                    // Step-size
                    let dt_vec = 1.0 / (vec3(${DynamicVolumeTextureSize}) * abs(rayDirectionLocalSpace));
                    let dt = min(dt_vec.x, min(dt_vec.y, dt_vec.z));
                    
                    var color = vec4<f32>(0.0);
                    // Ray-marching
                    for (var t = max(t_interval.x, 0.0); t < t_interval.y; t += dt) {
                        let p = rayOriginLocalSpace + t * rayDirectionLocalSpace;
                        let tex_coord = 0.5 * p + vec3(0.5);                        

                        // Create the color and opacity for volume composition
                        var p_color: vec3<f32> = vec3(0.0, 0.0, 0.0);
                        var p_alpha: f32 = 1.0;
                        var accumulator: f32 = 0.0;

                        // Iterate over every volume
                        for(var i: u32 = 0; i < arrayLength(&${this.variableName}); i++) {
                            // Sample the grid
                            var grid_value: f32 = 0.0;
                            if (${this.variableName}[i].func == 0) { 
                                grid_value = sampleLastTimestepGrid(tex_coord, i);
                            } else {
                                grid_value = sampleNumberOfTimestepsGrid(tex_coord, i);
                            }

                            // Apply the transfer function to create the volume color and opacity at p 
                            var grid_color = ${this.variableName}[i].color.rgb;
                            if (${this.variableName}[i].color.w == 0.0) {
                                grid_color = textureSampleLevel(colormap, linearSampler, vec2<f32>(grid_value, 0.5), 0.0).rgb;
                            }
                            let grid_alpha: f32 = ${this.variableName}[i].transparency * grid_value;

                            // Compose using inclusive opacity
                            p_alpha = p_alpha * (1 - grid_alpha);
                            p_color += grid_alpha * grid_color;
                            accumulator += grid_alpha;
                        }

                        p_alpha = 1 - p_alpha;
                        p_color = p_color / max(accumulator, 0.0001);

                        // Accumulate the color and opacity using front-to-back
                        color.r += (1.0 - color.a) * p_alpha * p_color.r;
                        color.g += (1.0 - color.a) * p_alpha * p_color.g;
                        color.b += (1.0 - color.a) * p_alpha * p_color.b;
                        color.a += (1.0 - color.a) * p_alpha;

                        intersectionWorldSpace = camera.position.xyz + t * ray.direction.xyz;
                        var depthVec = camera.projectionView * vec4<f32>(intersectionWorldSpace.xyz, 1.0);
                        depthVec = depthVec * (1.0 / depthVec.w);
                        depth = depthVec.z;

                        // Optimization: break out of the loop when the color is near opaque
                        if (color.a >= 0.99 || depth < previousDepth) {
                            break;
                        }                        
                    }                    
                `;
            }
            case "normal": {
                return /* wgsl */`
                    let normal = intersection.normal;
                `;
            }
            case "ao": {
                return /* wgsl */`
                    let ao = vec2(0.0, 0.0);
                `;
            }
        }
    }

    static gpuCodeGetBoundingRectangleVertex = /* wgsl */`
        let begin = ${this.variableName}[0].modelMatrix * vec4<f32>(-1.0, -1.0, -1.0, 1.0);
        let end = ${this.variableName}[0].modelMatrix * vec4<f32>(1.0);

        let center = 0.5 * (begin.xyz + end.xyz);
        let radius = distance(center, begin.xyz);

        let boundingRectangleVertex = sphereToBoundingRectangleVertex(center.xyz, radius, vertexIndex);
    `;
    //#endregion GPU Code

    public rayIntersection(ray: Ray): Intersection | null {
        return null;
    }

    public toBoundingBoxes(): BoundingBox[] {
        return [];
    }

    //private _colorMap: GPUTexture | null = null;
    private _allocator: Allocator;
    private _colorMap: GPUTexture | null = null;
    private _volumes: DynamicVolumeUnit[] = [];
    private _lastObjectID: number = 42;
    private _lastTimestepGrids: GPUBuffer | null = null;
    private _numberTimestepsGrids: GPUBuffer | null = null;
    private _gridSize: number = 0;

    constructor(id: number, graphicsLibrary: GraphicsLibrary, allocator: Allocator, instances: number = 1) {
        super(id, graphicsLibrary, allocator);
        this._allocator = allocator;

        this.properties = new r.Array(VolumeUniformSize, instances);
        this.onAllocationMoved();
    }

    public isEmpty(): Boolean {
        return this._volumes.length === 0;
    }

    public addVolume<T extends DynamicVolumeUnit>(objectType: new (id: number, graphicsLibrary: GraphicsLibrary, dynamicVolume: DynamicVolume) => T): [T, number] {
        const objectID = this._lastObjectID++;
        const object = new objectType(objectID, this._graphicsLibrary, this);

        this._volumes.push(object);
        this.recreateBuffers();
        this.recreateAllocation();
        // There is a potential problem here where adding a volume and not calling 
        // fromPoints on some volume will cause this to break because the buffers dont get updates
        return [object, objectID];
    }

    public removeVolumeByID(volumeID: number) {
        const objectIndex = this._volumes.findIndex((object) => object.id === volumeID);
        const object = this._volumes[objectIndex];

        if (objectIndex >= 0 && object) {
            this._volumes.splice(objectIndex, 1);
            this.recreateBuffers();
            this.recreateAllocation();
            this.updateGridArrays();
        }
    }

    public updateGridArrays() {
        if (!this._lastTimestepGrids || !this._numberTimestepsGrids) {
            return;
        }

        const commandEncoder = this._graphicsLibrary.device.createCommandEncoder();
        for (let i = 0; i < this._volumes.length; i++) {
            commandEncoder.copyBufferToBuffer(this._volumes[i].lastTimestepGrid, 0, this._lastTimestepGrids, i * this._volumes[i].gridSize, this._volumes[i].gridSize);
            commandEncoder.copyBufferToBuffer(this._volumes[i].numberTimestepsGrid, 0, this._numberTimestepsGrids, i * this._volumes[i].gridSize, this._volumes[i].gridSize);
        }
        this._graphicsLibrary.device.queue.submit([commandEncoder.finish()]);
    }

    private recreateBuffers() {
        this._lastTimestepGrids?.destroy();
        this._numberTimestepsGrids?.destroy();

        const instances = this._volumes.length;
        this._lastTimestepGrids = this._graphicsLibrary.device.createBuffer({ size: DynamicVolumeTextureSize * DynamicVolumeTextureSize * DynamicVolumeTextureSize * 4 * instances, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE });
        this._numberTimestepsGrids = this._graphicsLibrary.device.createBuffer({ size: DynamicVolumeTextureSize * DynamicVolumeTextureSize * DynamicVolumeTextureSize * 4 * instances, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE });
        this._gridSize = DynamicVolumeTextureSize * DynamicVolumeTextureSize * DynamicVolumeTextureSize * 4 * instances;
    }

    private recreateAllocation() {
        if (this._allocation !== null) 
            this._allocator.deallocate([this._allocation]);
        this._allocation = this._allocator.allocate(VolumeUniformSize * this._volumes.length);
        this.toBuffer(this._allocation.cpuBuffer.inner, this._allocation.allocationRange.offset);
    }

    public async setColorMapFromBitmap(bitmap: ImageBitmap) {
        const texture = this._graphicsLibrary.device.createTexture({
            size: [bitmap.width, bitmap.height, 1],
            format: "rgba8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
        });

        const src = { source: bitmap };
        const dst = { texture: texture };

        this._graphicsLibrary.device.queue.copyExternalImageToTexture(src, dst, [bitmap.width, bitmap.height]);

        this._colorMap = texture;

        this.setDirtyCPU();
        this.onAllocationMoved();
    }

    public onAllocationMoved(): void {
        if (!this._allocation || !DynamicVolume.bindGroupLayouts[0] || !this._colorMap) {
            return;
        }

        this.toBuffer(this._allocation.cpuBuffer.inner, this._allocation.allocationRange.offset);
    }

    public record(encoder: GPURenderPassEncoder, bindGroupLayoutsOffset = 1, frameID: number): void {
        if (!this._allocation || !this._lastTimestepGrids || !this._numberTimestepsGrids || !this._colorMap) {
            return;
        }

        if (this.hidden) {
            return;
        }

        const bindGroup = this._graphicsLibrary.device.createBindGroup({
            layout: DynamicVolume.bindGroupLayouts[0],
            entries: [
                {
                    binding: 0, resource: {
                        buffer: this._allocation.gpuBuffer.inner,
                        offset: this._allocation.allocationRange.offset,
                        size: this._allocation.allocationRange.size,
                    },
                },
                {
                    binding: 1, resource: this._graphicsLibrary.linearSampler
                },
                {
                    binding: 2, resource: this._colorMap.createView()
                },
                {
                    binding: 3, resource: {
                        buffer: this._lastTimestepGrids,
                        offset: 0,
                        size: this._gridSize,
                    },
                },
                {
                    binding: 4, resource: {
                        buffer: this._numberTimestepsGrids,
                        offset: 0,
                        size: this._gridSize,
                    },
                }
            ]
        });

        // Set bind group
        encoder.setBindGroup(bindGroupLayoutsOffset + 0, bindGroup);

        // Draw
        encoder.draw(4, 1, 0, 0);
    }

    public toBuffer(buffer: ArrayBuffer, offset: number): void {
        const u8View = new Uint8Array(buffer, offset);
        
        // This isnt very efficient as it updates the whole buffer when one volume is updated
        for (let i = 0; i < this._volumes.length; i++) {
            u8View.set(DynamicVolumeStruct.toBuffer(this._volumes[i].properties), i * VolumeUniformSize);
        }
    }
}

export class DynamicVolumeUnit {
    private opSmoothUnion(d1: number, d2: number, k: number): number {
        let h = Math.min(Math.max(0.5 + 0.5 * (d2 - d1) / k, 0.0), 1.0);
        return (d2 * (1.0 - h) + d1 * h) - k*h*(1.0-h);
    }
    
    private sdSphere(p: vec3, c: vec3, s: number ): number
    {
      return vec3.dist(p, c) - s;
    }

    private sdCapsule(p: vec3, a: vec3, b: vec3, r: number ): number
    {
      let pa = vec3.sub(vec3.fromValues(0, 0, 0), p, a); // p - a;
      let ba = vec3.sub(vec3.fromValues(0, 0, 0), b, a);// b - a;
      
      let h = Math.min(Math.max(vec3.dot(pa,ba) / vec3.dot(ba,ba), 0.0), 1.0);
    
      let temp = vec3.fromValues(pa[0] - ba[0] * h, pa[1] - ba[1] * h, pa[2] - ba[2] * h);
      return vec3.length(temp) - r;
    }

    private calculateVolumeGridValue(p: vec3): vec2 {
        var smoothing = 0.1;

        var lastTimestep: number = 0;
        var countTimesteps: number = 0;
        // Repeat for every timestep
        for(var step = 0; step < this._steps; step++) {
    
            var sdf = this.sdSphere(p, this._volumePoints[step * this._sizeOfStep], this._radius);
            if (this._sizeOfStep > 1) {
                // Repeat for every point pair inside timestep
                for(let i = step * this._sizeOfStep; i < step * this._sizeOfStep + this._sizeOfStep - 1; i++) {
                    let p1 = this._volumePoints[i];
                    let p2 = this._volumePoints[i + 1];
            
                    let sdf2 = this.sdCapsule(p, p1, p2, this._radius);
                    sdf = this.opSmoothUnion(sdf, sdf2, smoothing);
                }
                var sdFinal = this.sdSphere(p, this._volumePoints[step * this._sizeOfStep + this._sizeOfStep - 1], this._radius);
                sdf = this.opSmoothUnion(sdf, sdFinal, smoothing);
            }
    
            if (sdf < 0.0) {
                lastTimestep = step;
                countTimesteps += 1;
            }
            
        }
    
        return vec2.fromValues(lastTimestep / this._steps, countTimesteps / this._steps);
    }

    public rayIntersection(ray: Ray): number | null {
        if (this._bb == null) {
            return null;
        }

        // The volume object is situated in world space so no need to transform ray
        const tMin = vec3.div(vec3.create(), vec3.sub(vec3.create(), this._bb.min, ray.origin), ray.direction);
        const tMax = vec3.div(vec3.create(), vec3.sub(vec3.create(), this._bb.max, ray.origin), ray.direction);

        const t1 = vec3.min(vec3.create(), tMin, tMax);
        const t2 = vec3.max(vec3.create(), tMin, tMax);

        const tN = Math.max(Math.max(t1[0], t1[1]), t1[2]);
        const tF = Math.min(Math.min(t2[0], t2[1]), t2[2]);

        if (tN > tF) {
            return null;
        }

        // Step 3: Compute the step size to march through the volume grid
        let dt = 2.0 * Math.min(Math.abs(ray.direction[0] * (1.0 / DynamicVolumeTextureSize)), Math.min(Math.abs(ray.direction[1] * (1.0 / DynamicVolumeTextureSize)), Math.abs(ray.direction[2] * (1.0 / DynamicVolumeTextureSize))));

        // Step 4: Starting from the entry point, march the ray through the volume
        // and sample it
        for (let t = Math.max(tN, 0.0); t < tF; t += dt) {
            // Step 4.1: Sample the volume, and color it by the transfer function.
            // Note that here we don't use the opacity from the transfer function,
            // and just use the sample value as the opacity
            let intersection: vec3 = vec3.scaleAndAdd(vec3.create(), ray.origin, ray.direction, t);

            var texValue = 0.0;
            let value = this.calculateVolumeGridValue(intersection);
            if (this.properties.func == 0) { 
                texValue = value[0];
            } else {
                texValue = value[1];
            }
            
            if (texValue > 0.1) {
                return t;
            }
                     
        } 
        return null;
    }

    public toBoundingBoxes(): BoundingBox[] {
        return [];
    }

    private _pipelines: Pipelines;
    public properties: DynamicVolumeProperties;
    public lastTimestepGrid: GPUBuffer;
    public numberTimestepsGrid: GPUBuffer;
    public gridSize: number = 0;
    public id: number;
    private _dynamicVolume: DynamicVolume;
    private _volumePoints: vec3[] = [];
    private _bb: BoundingBox | null = null;
    private _radius: number = 0;
    private _steps: number = 0;
    private _sizeOfStep: number = 0;

    constructor(id: number, graphicsLibrary: GraphicsLibrary, dynamicVolume: DynamicVolume) {
        this.id = id;
        this._pipelines = Pipelines.getInstance(graphicsLibrary);
        this._dynamicVolume = dynamicVolume;

        this.lastTimestepGrid = graphicsLibrary.device.createBuffer({ size: DynamicVolumeTextureSize * DynamicVolumeTextureSize * DynamicVolumeTextureSize * 4, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.STORAGE });
        this.numberTimestepsGrid = graphicsLibrary.device.createBuffer({ size: DynamicVolumeTextureSize * DynamicVolumeTextureSize * DynamicVolumeTextureSize * 4, usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.STORAGE });
        this.gridSize = DynamicVolumeTextureSize * DynamicVolumeTextureSize * DynamicVolumeTextureSize * 4;

        this.properties = new r.Array(VolumeUniformSize, 1);
        this.properties = DynamicVolumeStruct.fromBuffer(new Uint8Array(VolumeUniformSize));
        this.properties.modelMatrix = mat4.create();
        this.properties.modelMatrixInverse = mat4.invert(mat4.create(), this.properties.modelMatrix);
        this.properties.color = vec4.fromValues(0.0, 0.0, 0.0, 0.0);
        this.properties.translate = vec4.fromValues(0.0, 0.0, 0.0, 0.0);
        this.properties.scale = vec4.fromValues(1.0, 1.0, 1.0, 1.0);
        this.properties.func = 0;
        this.properties.transparency = 1.0;
    }

    public fromPoints(device: GPUDevice, points: vec3[][], radius: number) {
        this._volumePoints = points.flat();
        this._radius = radius;
        this._bb = boundingBoxFromPoints(this._volumePoints);
        this._bb.min = vec3.sub(vec3.create(), this._bb.min, vec3.fromValues(radius, radius, radius));
        this._bb.max = vec3.add(vec3.create(), this._bb.max, vec3.fromValues(radius, radius, radius));
        this._steps = points.length;
        this._sizeOfStep = points[0].length;
        const pipeline = this._pipelines.computePipelines.get("dynamicVolumeFromPathlines");
        const bgl = this._pipelines.bindGroupLayouts.get("dynamicVolumeFromPathlines");

        if (!pipeline || !bgl) {
            return;
        }

        const pointsFlat = points.flat();
        const pointsCPUBuffer = new Float32Array(pointsFlat.length * 4);
        for (let i = 0; i < pointsFlat.length; i++) {
            pointsCPUBuffer.set([pointsFlat[i][0], pointsFlat[i][1], pointsFlat[i][2]], 4 * i);
        }

        const globalsCPUBuffer = new ArrayBuffer(64);
        const globalsCPUBufferF32 = new Float32Array(globalsCPUBuffer);
        const globalsCPUBufferU32 = new Uint32Array(globalsCPUBuffer);
        globalsCPUBufferF32[0] = radius;
        globalsCPUBufferF32[1] = this.properties.scale[0];
        globalsCPUBufferU32[2] = points.length;
        globalsCPUBufferU32[3] = points[0].length;

        const globalsBuffer = device.createBuffer({ label: "GlobalsComputeBuffer", size: 64, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        const pointsBuffer = device.createBuffer({ label: "PointsComputeBuffer", size: pointsFlat.length * 4 * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.STORAGE });

        const bindGroup = device.createBindGroup({
            layout: bgl,
            entries: [{
                binding: 0,
                resource: { buffer: globalsBuffer }
            }, {
                binding: 1,
                resource: { buffer: pointsBuffer }
            }, {
                binding: 2,
                resource: { buffer: this.lastTimestepGrid }
            }, {
                binding: 3,
                resource: { buffer: this.numberTimestepsGrid }
            }]
        });

        device.queue.writeBuffer(globalsBuffer, 0, globalsCPUBuffer, 0);
        device.queue.writeBuffer(pointsBuffer, 0, pointsCPUBuffer, 0);
        const commandEncoder = device.createCommandEncoder();
        const computePass = commandEncoder.beginComputePass();
        computePass.setPipeline(pipeline);
        computePass.setBindGroup(0, bindGroup);
        const workgroups = DynamicVolumeTextureSize / 4;
        computePass.dispatchWorkgroups(workgroups, workgroups, workgroups);
        computePass.end();

        device.queue.submit([commandEncoder.finish()]);

        this._dynamicVolume.updateGridArrays();
    }

    public async setColorMapFromBitmap(bitmap: ImageBitmap) {
        this._dynamicVolume.setColorMapFromBitmap(bitmap);
    }

    public setColor(color: vec4) {
        this.properties.color = [color[0], color[1], color[2], color[3]];
        this._dynamicVolume.setDirtyCPU();
    }

    public set transparency(a: number) {
        this.properties.transparency = a;
        this._dynamicVolume.setDirtyCPU();
    }

    public set func(f: number) {
        this.properties.func = f;
        this._dynamicVolume.setDirtyCPU();
    }

    public set translate(t: vec3) {
        this.properties.translate = [t[0], t[1], t[2], 1.0];
        this.properties.modelMatrix = mat4.create();

        mat4.scale(this.properties.modelMatrix, this.properties.modelMatrix, vec3.fromValues(this.properties.scale[0], this.properties.scale[1], this.properties.scale[2]));

        this.properties.modelMatrix[12] = this.properties.translate[0];
        this.properties.modelMatrix[13] = this.properties.translate[1];
        this.properties.modelMatrix[14] = this.properties.translate[2];
        this.properties.modelMatrix[15] = 1.0;

        this.properties.modelMatrixInverse = mat4.invert(mat4.create(), this.properties.modelMatrix);

        this._dynamicVolume.setDirtyCPU();
    }

    public set scale(s: number) {
        this.properties.scale = [s, s, s, 1.0];
        this.properties.modelMatrix = mat4.create();
        mat4.scale(this.properties.modelMatrix, this.properties.modelMatrix, vec3.fromValues(s, s, s));

        this.properties.modelMatrix[12] = this.properties.translate[0];
        this.properties.modelMatrix[13] = this.properties.translate[1];
        this.properties.modelMatrix[14] = this.properties.translate[2];
        this.properties.modelMatrix[15] = 1.0;
        this.properties.modelMatrixInverse = mat4.invert(mat4.create(), this.properties.modelMatrix);

        this._dynamicVolume.setDirtyCPU();
    }
}