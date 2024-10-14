import { GraphicsLibrary } from "../../..";
import { Image } from "image-js";
import noiseImagePNG from "./HDR_RGB_0.png";
import { vec3 } from "gl-matrix";

export class BlueNoise {
    private static _instance: BlueNoise;
    private static _lastDeviceUsed: GPUDevice;

    public noiseTexture: GPUTexture;
    public normalizedImageSamples: vec3[];

    private constructor(graphicsLibrary: GraphicsLibrary, noiseTexture: GPUTexture, normalizedImageSamples: vec3[]) {
        this.noiseTexture = noiseTexture;
        this.normalizedImageSamples = normalizedImageSamples;
    }

    public static async getInstance(graphicsLibrary: GraphicsLibrary): Promise<BlueNoise> {
        if (this._instance && BlueNoise._lastDeviceUsed === graphicsLibrary.device) {
            return this._instance;
        }

        const noiseTexture = graphicsLibrary.device.createTexture({
            size: {
                width: 64,
                height: 64,
                depthOrArrayLayers: 1,
            },
            format: "rgba32float",
            usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING
        });
        const normalizedImageSamples = [];

        const noiseImage = await Image.load(noiseImagePNG);

        for (let i = 0; i < 256; i++) {
            const sample = vec3.fromValues(
                (noiseImage.data[i * 3 + 0] / noiseImage.maxValue) * 2.0 - 1.0,
                (noiseImage.data[i * 3 + 1] / noiseImage.maxValue) * 2.0 - 1.0,
                (noiseImage.data[i * 3 + 2] / noiseImage.maxValue)
            );

            vec3.normalize(sample, sample);
            normalizedImageSamples.push(sample);
        }

        const noiseTextureBuffer = new Float32Array(64 * 64 * 4);

        for (let i = 0; i < 64 * 64; i++) {
            noiseTextureBuffer.set([
                (noiseImage.data[i * 3 + 0] / noiseImage.maxValue) * 2.0 - 1.0,
                (noiseImage.data[i * 3 + 1] / noiseImage.maxValue) * 2.0 - 1.0,
                0.0,
                1.0
            ], i * 4);
        }

        graphicsLibrary.device.queue.writeTexture(
            { texture: noiseTexture, },
            noiseTextureBuffer,
            { bytesPerRow: 1024, },
            { width: 64, height: 64, depthOrArrayLayers: 1 }
        );

        return this._instance = new this(graphicsLibrary, noiseTexture, normalizedImageSamples);
    }
}
