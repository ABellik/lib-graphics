import type { Allocator, GraphicsLibrary, Intersection } from "../../..";
import { BoundingBox, Ray } from "../../../shared";
import { IParametricObject } from "./shared";
import * as r from "restructure";

// eslint-disable-next-line @typescript-eslint/naming-convention
export const RayStruct = new r.Struct({
    origin: new r.Array(r.floatle, 3),
    minT: r.floatle,
    direction: new r.Array(r.floatle, 3),
    maxT: r.floatle,
});

export class RayObject extends IParametricObject {
    public static variableName = "rayObject";
    public static typeName = "RayObject";

    public getVariableName(): string { return RayObject.variableName }
    public getTypeName(): string { return RayObject.typeName }

    static bindGroupLayouts: Array<GPUBindGroupLayout> = [];
    static createBindGroupLayouts(device: GPUDevice): void {
        RayObject.bindGroupLayouts = [device.createBindGroupLayout({
            label: this.typeName,
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" },
            }]
        })];
    }

    public properties: Ray;

    //#region GPU Code
    public static gpuCodeGlobals = /* wgsl */`
        struct ${this.typeName} {
            origin: vec3<f32>,
            minT: f32,
            direction: vec3<f32>,
            maxT: f32,
        };
        
        @group(1) @binding(0) var<uniform> ${this.variableName}: ${this.typeName};
    `;

    public static gpuCodeGetObject = "";
    public static gpuCodeGetObjectUntypedArray = "";

    static gpuCodeIntersectionTest = /* wgsl */`
        fn ray${this.typeName}Intersection(ray: Ray, ${this.variableName}: ${this.typeName}) -> Intersection {
            let p1 = ray.origin;
            let p2 = ${this.variableName}.origin;
            let v1 = normalize(ray.direction);
            let v2 = ${this.variableName}.direction;
            
            var n = cross(v1, v2);
            n = normalize(n);
        
            let distance: f32 = dot(n, p1 - p2);
            
            if (abs(distance) > 0.01) {
                return Intersection(
                    -1.0,
                    vec3(0.0),
                    vec3(0.0)
                );
            }

            // adjust p2 so they are on plane
            let p2_adjusted = p2 + n * distance;
        
            var n2 = cross(v2, n);
            n2 = normalize(n2);
    
            let t1 = dot(n2, v1);
            if (abs(t1) < 1e-6) {
                return Intersection(
                    -1.0,
                    vec3(0.0),
                    vec3(0.0)
                );
            }
            let t = dot(n2, p2_adjusted - p1) / t1;

            let intersection = p1 + t * v1;

            // ray should start in origin
            if (dot(intersection - p2_adjusted, v2) < 0) {
                return Intersection(
                    -1.0,
                    vec3(0.0),
                    vec3(0.0)
                );
            }
        

            return Intersection(
                t,
                intersection,
                camera.position.xyz - intersection
            );
        }
    `;

    static gpuCodeGetOutputValue(variable: "color" | "normal" | "ao"): string {
        switch (variable) {
            case "color": {
                return `
                    let color = vec4(1.0,0.0,0.0,1.0);
                `;
            }
            case "normal": {
                return `
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

    static gpuCodeGetBoundingRectangleVertex = `
        let boundingRectangleVertex = fullQuad(vertexIndex);
    `;
    //#endregion GPU Code

    public rayIntersection(ray: Ray): Intersection | null {
        return null;
    }

    public toBoundingBoxes(): BoundingBox[] {
        return [];
    }

    private _bindGroup: GPUBindGroup | null = null;

    constructor(id: number, graphicsLibrary: GraphicsLibrary, allocator: Allocator) {
        super(id, graphicsLibrary, allocator);

        this._allocation = allocator.allocate(128);

        this.properties = RayStruct.fromBuffer(new Uint8Array(128));

        this.onAllocationMoved();
    }

    public onAllocationMoved(): void {
        if (!this._allocation || !RayObject.bindGroupLayouts[0]) {
            return;
        }

        this._bindGroup = this._graphicsLibrary.device.createBindGroup({
            layout: RayObject.bindGroupLayouts[0],
            entries: [
                {
                    binding: 0, resource: {
                        buffer: this._allocation.gpuBuffer.inner,
                        offset: this._allocation.allocationRange.offset,
                        size: this._allocation.allocationRange.size,
                    }
                }
            ]
        });
        this.toBuffer(this._allocation.cpuBuffer.inner, this._allocation.allocationRange.offset);
    }

    public record(encoder: GPURenderPassEncoder, bindGroupLayoutsOffset = 1): void {
        if (!this._bindGroup) {
            return;
        }

        // Set bind group
        encoder.setBindGroup(bindGroupLayoutsOffset + 0, this._bindGroup);

        // Draw
        encoder.draw(4, 1, 0, 0);
    }

    public toBuffer(buffer: ArrayBuffer, offset: number): void {
        const u8View = new Uint8Array(buffer, offset);
        u8View.set(RayStruct.toBuffer(this.properties), 0);
    }
}