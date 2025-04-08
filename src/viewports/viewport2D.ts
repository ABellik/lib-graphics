import { CameraConfigurationType, Ortho2DCamera, type OrthoCameraConfiguration } from "../cameras/index";
import { GraphicsLibrary } from "..";
import { tileShader } from "./tileShader";

//export const squareRadius = 0.7071;
//export const squareDiameter = 2.0 * squareRadius;
/*
export class BinPosition {
    from = 0;
    to = 0;
}
*/
function distanceMapBindGroupLayout(): GPUBindGroupLayoutDescriptor {
    return {
        label: "Tile Camera BGL",
        entries: [
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: {
                    type: "uniform",
                }
            }
        ],
    };
}

function distanceMapPipelineLayout(device : GPUDevice): GPUPipelineLayoutDescriptor {
    return {
        bindGroupLayouts: [
            device.createBindGroupLayout(distanceMapBindGroupLayout())
        ],
    }
}

function distanceMapPipelineDescriptor(device: GPUDevice): GPURenderPipelineDescriptor {
    return {
        layout: device.createPipelineLayout(distanceMapPipelineLayout(device)),
        vertex: {
            module: device.createShaderModule({ code: tileShader }),
            entryPoint: "main_vertex",
        },
        fragment: {
            module: device.createShaderModule({ code: tileShader }),
            entryPoint: "main_fragment",
            targets: [
                {
                    format: "bgra8unorm",
                },
            ]
        },
        primitive: {
            topology: "triangle-strip",
        },
    };
}
/*
export function worldPositionToBins(position: vec4, lod = 0): BinPosition {
    // Line Slope Form
    // y = m*x + b
    // m = 1
    // b = y - x;
    const b1 = position[1] - position[0];
    // y = 0 => 0 = x + b => x = -b
    const interceptX1 = -b1;

    const squareDiameterLoD = Math.pow(2.0, lod) * squareDiameter;

    // const leftX = position[0] - position[1];
    const rightX = position[0] + position[1];

    const from = Math.floor(interceptX1 / squareDiameterLoD);
    const to = Math.floor(rightX / squareDiameterLoD);

    return {
        from: from,
        to: to
    };
}

export function binsToCenter(binPosition: BinPosition, lod = 0): vec2 {
    const squareRadiusLoD = Math.pow(2.0, lod) * squareRadius;
    const squareDiameterLoD = Math.pow(2.0, lod) * squareDiameter;

    const diff = binPosition.to - binPosition.from;

    const start = vec2.fromValues(binPosition.from * squareDiameterLoD + squareRadiusLoD, 0);
    const stepVector = vec2.scale(vec2.create(), vec2.normalize(vec2.create(), vec2.fromValues(1.0, 1.0)), Math.pow(2.0, lod) * diff);

    return vec2.add(vec2.create(), start, stepVector);
}

export function binsToCenterVec4(binPosition: BinPosition, lod = 0): vec4 {
    const bin = binsToCenter(binPosition, lod);

    return vec4.fromValues(bin[0], bin[1], 0.0, 1.0);
}

export function binToInstanceIndex(binPosition: BinPosition, size: number): number {
    const invert = (size - 1) - binPosition.from;
    const gaussSum = ((invert) * (invert + 1)) / 2.0;

    const diff = binPosition.to - binPosition.from;

    return gaussSum + diff;
}

export type Globals = {
    sizes: number[],
    offsets: number[],
    maxDistances: number[],
    currentLoD: number,
}

export function globalsNew(): Globals {
    return {
        sizes: new Array(32).fill(0),
        offsets: new Array(32).fill(0),
        maxDistances: new Array(32).fill(0),
        currentLoD: 0,
    }
}

export function globalsToArrayBuffer(globals: Globals): ArrayBuffer {
    const buffer = new ArrayBuffer(512);

    //const i32View = new Int32Array(buffer);
    const u32View = new Uint32Array(buffer);
    const f32View = new Float32Array(buffer);

    u32View.set(globals.sizes, 0);
    u32View.set(globals.offsets, 32);
    f32View.set(globals.maxDistances, 64);
    u32View.set([globals.currentLoD], 96);

    return buffer;
}
*/

export class Viewport2D {
    protected graphicsLibrary: GraphicsLibrary;

    private clearColor: GPUColor =  { r: 0.0, g: 0.0, b: 0.0, a: 1.0 };

    //protected _canvas: HTMLCanvasElement | null = null;
    //protected _context: GPUCanvasContext | null = null;

    public setClearColor(color: GPUColor) {
        this.clearColor = color;
    }

    private width = 0;
    private height = 0;

    private _camera: Ortho2DCamera;

    //public globals: Globals;
    //private globalsGPU: GPUBuffer;

    //private positions: GPUBuffer | null = null;
    //private colors: GPUBuffer | null = null;

    constructor(
        graphicsLibrary: GraphicsLibrary,
    ) {
        this.graphicsLibrary = graphicsLibrary;
        this._camera = new Ortho2DCamera(
            this.graphicsLibrary.device,
            0,
            0
        );
/*
        this.globals = globalsNew();
        this.globalsGPU = this.graphicsLibrary.device.createBuffer({
            size: 512,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
*/

    }

    public deallocate(): void {
        //this._scene?.deallocate();
    
        this.width = 0;
        this.height = 0;
    
        //this._camera = null;
        //this._scene = null;
      }

    resize(width: number, height: number): void {
        this.width = width;
        this.height = height;

    
        if (width <= 0 || height <= 0) {
          return;
        }

        if (this._camera) {
          this._camera.width = this.width;
          this._camera.height = this.height;
        }

    }
    
    async render(textureView: GPUTextureView): Promise<void> {
        const device = this.graphicsLibrary.device;

        if (this._camera === null || this.width <= 0 || this.height <= 0) {
            return;
        }

        const commandEncoder = device.createCommandEncoder();

        const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [
                {
                    view: textureView,
                    clearValue: this.clearColor,
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        };

        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);

        this._camera.updateGPU(device.queue);

        /*
        const globalsBuffer = globalsToArrayBuffer(this.globals);
        device.queue.writeBuffer(
            this.globalsGPU, 0,
            globalsBuffer, 0,
            globalsBuffer.byteLength,
        );*/

        const primitivesBindGroup =
            device.createBindGroup({
                layout: device.createBindGroupLayout(distanceMapBindGroupLayout()),
                entries: [
                    {
                        binding: 0,
                        resource: {
                            buffer: this._camera.bufferGPU,
                            offset: 0,
                        }
                    }
                ]
            });

        passEncoder.setBindGroup(0, primitivesBindGroup);
        passEncoder.setPipeline(device.createRenderPipeline(distanceMapPipelineDescriptor(device)));
        passEncoder.draw(4, 1, 0, 0);
        passEncoder.end();

        device.queue.submit([commandEncoder.finish()]);
    }

    /*
    ///
    /// Setters & Getters
    ///
    public getHoveredElement(mousePosition: vec2, lod: number | null = null): BinPosition | null {
        if (this._camera === null) {
            return null;
        }

        // 1. Transform canvas screen space to world space
        const screenSpace = vec4.fromValues(mousePosition[0], mousePosition[1], 0.0, 1.0);
        const normalizedSpace = vec4.clone(screenSpace);
        normalizedSpace[0] = (normalizedSpace[0] / this.width) * 2.0 - 1.0;
        normalizedSpace[1] = (1.0 - (normalizedSpace[1] / this.height)) * 2.0 - 1.0;

        const worldSpace = vec4.create();
        vec4.transformMat4(worldSpace, normalizedSpace, this._camera.viewProjectionInverseMatrix);

        if (worldSpace[1] < 0.0 || worldSpace[1] < 0.0) {
            return null;
        }

        // Find line intersection with X axis for left/right values in worldspace
        const leftX = worldSpace[0] - worldSpace[1];
        const rightX = worldSpace[0] + worldSpace[1];

        //const size = this.globals.sizes[lod ? lod : 0];
        const squareDiameterWithLoD = squareDiameter * Math.pow(2, lod ? lod : 0);

        const leftIndex = Math.floor(leftX / squareDiameterWithLoD);
        const rightIndex = Math.floor(rightX / squareDiameterWithLoD);

        return {
            from: leftIndex,
            to: rightIndex,
        };
    }

    public getVisibleRectangle(ndcCorners: Array<vec4> | null = null): Array<vec4> {
        if (ndcCorners === null) {
            ndcCorners = [
                vec4.fromValues(-1.0, 1.0, 0.0, 1.0),
                vec4.fromValues(1.0, 1.0, 0.0, 1.0),
                vec4.fromValues(1.0, -1.0, 0.0, 1.0),
                vec4.fromValues(-1.0, -1.0, 0.0, 1.0),
            ];
        }

        const worldSpaceCorners = new Array(4);
        for (let i = 0; i < 4; i++) {
            worldSpaceCorners[i] = vec4.create();
            vec4.transformMat4(worldSpaceCorners[i], ndcCorners[i], this._camera.viewProjectionInverseMatrix);
            vec4.scale(worldSpaceCorners[i], worldSpaceCorners[i], 1.0 / worldSpaceCorners[i][3]);
        }

        return worldSpaceCorners;
    }

    public getVisibleRectangleBins(ndcCorners: Array<vec4> | null = null): Array<BinPosition> {
        const visibleRectangle = this.getVisibleRectangle(ndcCorners);

        const bins: Array<BinPosition> = new Array(4);
        for (let i = 0; i < 4; i++) {
            bins[i] = worldPositionToBins(visibleRectangle[i], 0);
        }
        bins[0].from -= 1;
        bins[1].to += 1;
        bins[2].from += 1;
        bins[3].to -= 1;

        return bins;
    }

    public worldSpaceToScreenSpace(worldSpace: vec4): vec2 {
        const result = vec4.create();

        vec4.transformMat4(result, worldSpace, this._camera.viewProjectionMatrix);
        vec4.scale(result, result, 1.0 / result[3]);
        vec4.scale(result, result, 0.5);

        result[0] = result[0] + 0.5;
        result[1] = 1.0 - (result[1] + 0.5);
        result[2] = result[2] + 0.5;

        return vec2.fromValues(
            result[0] * (this.width / window.devicePixelRatio),
            result[1] * (this.height / window.devicePixelRatio)
        );
    }
*/

    public get camera(): Ortho2DCamera {
        return this._camera;
    }

    public set cameraConfiguration(cameraConfiguration: OrthoCameraConfiguration) {
        if (this._camera) {
            this._camera.maxZoom = cameraConfiguration.maxZoom;
            this._camera.zoom = cameraConfiguration.zoom;
            this._camera.translateX = cameraConfiguration.translateX;
            this._camera.translateY = cameraConfiguration.translateY;
        }
    }

    public get cameraConfiguration(): OrthoCameraConfiguration {
        return this._camera?.cameraConfiguration ?? {
            type: CameraConfigurationType.Ortho,

            zoom: 1.0,
            maxZoom: 1.0,
            translateX: 0.0,
            translateY: 0.0
        }
    }

    public get canvas(): HTMLCanvasElement | null {
        return null;
    } 
}
