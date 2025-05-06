import type { GraphicsLibrary } from "../../..";
import * as r from "restructure";
import { mat4, vec2, vec3, vec4 } from "gl-matrix";

export interface TileProperties {
    modelMatrix: mat4,
    modelMatrixInverse: mat4,
    color: vec4,
    props: vec4
}

// Because it is padded to 16 bytes -> 144 + 16 props 
const TileUniformSize: number = 160;

export const TileStruct = new r.Struct({
    modelMatrix: new r.Array(r.floatle, 16),
    modelMatrixInverse: new r.Array(r.floatle, 16),
    color: new r.Array(r.floatle, 4),
    props: new r.Array(r.floatle, 4)
});

export class Tile {
    static bindGroupLayout: GPUBindGroupLayout;
    static createBindGroupLayouts(device: GPUDevice): void {
        Tile.bindGroupLayout = device.createBindGroupLayout({
            label: "TileBGL",
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" },
            },
            {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {
                    sampleType: "unfilterable-float",
                    viewDimension: "2d"
                }
            },
            {
                binding: 2,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {
                    type: "non-filtering"
                }        
            }]
        });
    }
    
    private id: number;
    public properties: TileProperties;
    private propertiesBuffer: GPUBuffer;
    private scaleNum: number = 1;
    private rotateRad: number = 0;
    private globalRotateRad: number = 0;
    private globalTranslateVec: vec3 = vec3.fromValues(0, 0, 0);
    private translateVec: vec3 = vec3.fromValues(0, 0, 0);
    private dirty = false;
    
    private bindGroup!: GPUBindGroup;
    private texture!: GPUTexture;
    private sampler!: GPUSampler;
    private graphicsLibrary;


    constructor(graphicsLibrary: GraphicsLibrary, width: number, height: number, texData: ArrayBuffer, id: number) {
        this.graphicsLibrary = graphicsLibrary;
        this.id = id

        if (!Tile.bindGroupLayout) {
            Tile.createBindGroupLayouts(graphicsLibrary.device);
        }

        this.properties = TileStruct.fromBuffer(new Uint8Array(TileUniformSize));
        this.properties.modelMatrix = mat4.create();
        this.properties.modelMatrixInverse = mat4.invert(mat4.create(), this.properties.modelMatrix);
        this.properties.color = vec4.fromValues(0.0, 1.0, 1.0, 1.0);
        this.properties.props = [0.0, 0.0, 0.1, 0.0];

        this.propertiesBuffer = this.graphicsLibrary.device.createBuffer({
                size: TileUniformSize,
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        this.addTexture(width, height, texData);
        this.propertiesChanged();
    }

    public getId() {
        return this.id;
    }

    public addTexture(width: number, height: number, texData: ArrayBuffer) {
        this.texture = this.graphicsLibrary.device.createTexture({
            size: { width: width, height: height },
            format: 'r32float',
            dimension: "2d",
            mipLevelCount: 1,
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
        });

        this.graphicsLibrary.device.queue.writeTexture(
            { texture: this.texture },
            texData,
            { bytesPerRow: width * 4 },
            { width: width, height: height },
        );

        this.sampler = this.graphicsLibrary.device.createSampler({ magFilter: "nearest", minFilter: "nearest" });
    }

    public maxValue(max: number) {
        this.properties.props[2] = max;
        this.dirty = true;
    }

    // Flip tile around y = -x axis
    public flip(flip: boolean) {
        this.properties.props[1] = flip ? 1.0 : 0.0;
        this.dirty = true;
    }

    // Mirror bottom triangle of tile around y = -x axis
    public mirror(mirror: boolean) {
        this.properties.props[0] = mirror ? 1.0 : 0.0;
        this.dirty = true;
    }

    public color(c: vec3, alpha: number = 1.0): void {
        this.properties.color = vec4.fromValues(c[0], c[1], c[2], alpha)
        this.dirty = true;
    }

    public globalTranslate(t: vec2): void {
        this.globalTranslateVec = vec3.fromValues(t[0], t[1], 0);
        this.updateModelMatrix()
    }

    public translate(t: vec2): void {
        this.translateVec = vec3.fromValues(t[0], t[1], 0);
        this.updateModelMatrix()
    }

    public scale(s: number): void {
        if (s <= 0) {
            throw "Scale must be larger than zero."
        }

        this.scaleNum = s;
        this.updateModelMatrix();
    }


    public globalRotate(degrees: number): void {
        this.globalRotateRad = degrees * (Math.PI / 180.0);
        this.updateModelMatrix();
    }

    public rotate(degrees: number): void {
        this.rotateRad = degrees * (Math.PI / 180.0)
        this.updateModelMatrix();
    }

    private updateModelMatrix(): void {
        this.properties.modelMatrix = mat4.create();
        mat4.translate(this.properties.modelMatrix, this.properties.modelMatrix, this.globalTranslateVec);
        mat4.rotateZ(this.properties.modelMatrix, this.properties.modelMatrix, this.globalRotateRad);  
        mat4.translate(this.properties.modelMatrix, this.properties.modelMatrix, this.translateVec);
        mat4.rotateZ(this.properties.modelMatrix, this.properties.modelMatrix, this.rotateRad);  
        mat4.scale(this.properties.modelMatrix, this.properties.modelMatrix, vec3.fromValues(this.scaleNum, this.scaleNum, this.scaleNum));
        this.properties.modelMatrixInverse = mat4.invert(mat4.create(), this.properties.modelMatrix);
        this.dirty = true
    }

    public propertiesChanged(): void {
        this.graphicsLibrary.device.queue.writeBuffer(
            this.propertiesBuffer, 0,
            TileStruct.toBuffer(this.properties), 0,
            TileUniformSize,
        );

        this.bindGroup = this.graphicsLibrary.device.createBindGroup({
            label: "Tile Bind Group",
            layout: Tile.bindGroupLayout,
            entries: 
            [
                {
                    binding: 0,
                    resource: {
                        buffer: this.propertiesBuffer,
                        offset: 0,
                        size: TileUniformSize,
                    },
                },
                {
                    binding: 1, resource: this.texture.createView()
                },
                {
                    binding: 2, resource: this.sampler
                }
            ]
        });

        this.dirty = false;
    }

    public render(encoder: GPURenderPassEncoder): void {                
        if (this.dirty) {
            this.propertiesChanged();
        }

        // Set bind group
        encoder.setBindGroup(1, this.bindGroup);
        encoder.draw(4, 1, 0, 0);
    }
}