import { GraphicsLibrary } from "../../..";
import ssaoShader from "./ssao.wgsl?raw";

export class Pipelines {
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

        //#region Graphics Library Requirements
        const cameraBGL = graphicsLibrary.bindGroupLayouts.get("camera");

        if (!cameraBGL) {
            throw "Camera BGL of Graphics Library should have been initialized at this point."
        }
        //#endregion Graphics Library Requirements

        const shaderModule = device.createShaderModule({
            label: "SSAO",
            code: ssaoShader
        });
        this.shaderModules.set("SSAO", shaderModule);

        const globalsBGL = device.createBindGroupLayout({
            entries: [
                // Globals Uniform
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    buffer: {
                        type: "uniform",
                    }
                },
                // Noise Texture
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    texture: {
                        sampleType: "unfilterable-float",
                        viewDimension: "2d",
                        multisampled: false,
                    }
                },
                // Ambient Occlusion Input
                {
                    binding: 2,
                    visibility: GPUShaderStage.COMPUTE,
                    texture: {
                        sampleType: "unfilterable-float",
                        viewDimension: "2d"
                    }
                },
                // Ambient Occlusion Output
                {
                    binding: 3,
                    visibility: GPUShaderStage.COMPUTE,
                    storageTexture: {
                        access: "write-only",
                        format: "r32float",
                        viewDimension: "2d",
                    }
                },
            ]
        });

        const inputBGL = device.createBindGroupLayout({
            entries: [
                // Depth/gBufferWorldPositions
                {
                    binding: 0,
                    visibility: GPUShaderStage.COMPUTE,
                    texture: {
                        sampleType: "depth",
                        viewDimension: "2d",
                        multisampled: false,
                    }
                },
                // gBufferWorldNormals
                {
                    binding: 1,
                    visibility: GPUShaderStage.COMPUTE,
                    texture: {
                        sampleType: "unfilterable-float",
                        viewDimension: "2d",
                        multisampled: false,
                    }
                }]
        });

        this.bindGroupLayouts.set("Globals", globalsBGL);
        this.bindGroupLayouts.set("Input", inputBGL);

        const pipelineLayout = device.createPipelineLayout({
            label: "SSAO",
            bindGroupLayouts: [...[cameraBGL], globalsBGL, inputBGL],
        });
        this.pipelineLayouts.set("SSAO", pipelineLayout);

        this.computePipelines.set("SSAO", device.createComputePipeline({
            label: "SSAO",
            layout: pipelineLayout,
            compute: {
                module: shaderModule,
                entryPoint: "main"
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