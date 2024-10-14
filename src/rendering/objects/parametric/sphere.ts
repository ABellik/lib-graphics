import { vec3 } from "gl-matrix";
import type { Allocator, GraphicsLibrary, Intersection } from "../../..";
import { boundingBoxEmpty, type BoundingBox, type Ray, boundingBoxExtendByPoint, boundingBoxCalculateCenter } from "../../../shared";
import { IParametricObject } from "./shared";
import * as r from "restructure";

export interface SphereProperties {
    center: [number, number, number],
    radius: number,
    color: [number, number, number, number],
}

export const SphereStruct = new r.Struct({
    center: new r.Array(r.floatle, 3),
    radius: r.floatle,
    color: new r.Array(r.floatle, 4)
});

export class Sphere extends IParametricObject {
    public static variableName = "sphere";
    public static typeName = "Sphere";

    public getVariableName(): string { return Sphere.variableName }
    public getTypeName(): string { return Sphere.typeName }

    static bindGroupLayouts: Array<GPUBindGroupLayout> = [];
    static createBindGroupLayouts(device: GPUDevice): void {
        Sphere.bindGroupLayouts = [device.createBindGroupLayout({
            label: this.typeName,
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" },
            }]
        })];
    }

    public properties: SphereProperties;

    //#region GPU Code
    public static gpuCodeGlobals = /* wgsl */`
        struct ${this.typeName} {
            center: vec3<f32>,
            radius: f32,
            color: vec4<f32>,
        };
        
        @group(1) @binding(0) var<uniform> ${this.variableName}: ${this.typeName};
    `;

    public static gpuCodeGetObject = "";
    public static gpuCodeGetObjectUntypedArray = "";

    static gpuCodeIntersectionTest = /* wgsl */`
        fn ray${this.typeName}Intersection(ray: Ray, ${this.variableName}: ${this.typeName}) -> Intersection {
            let oc = ray.origin - ${this.variableName}.center;
            let b = dot( oc, ray.direction );
            let c = dot( oc, oc ) - ${this.variableName}.radius * ${this.variableName}.radius;
            var h = b*b - c;
        
            // no intersection
            if(h < 0.0) {
                return Intersection(
                    -1.0,
                    vec3<f32>(0.0),
                    vec3<f32>(0.0)
                );
            }
            h = sqrt( h );
            let t = -b - h;

            let intersection = camera.position.xyz + t * ray.direction.xyz;
            let normal = normalize(intersection - ${this.variableName}.center);
        
            return Intersection(
                t,
                intersection,
                normal
            );
        }

        // simplified Phong shading model
        fn calculateLight(ray: Ray, intersection: Intersection) -> vec4<f32> {
            var ambient = 0.05;
            
            var norm =  -intersection.normal;
            var lightDir = ray.direction;
            var diffuse = max(dot(norm, lightDir), 0.0);
            
            var result = (ambient + diffuse) * sphere.color.rgb;

            return vec4(result, sphere.color.a);
        }
    `;

    static gpuCodeGetOutputValue(variable: "color" | "normal" | "ao"): string {
        switch (variable) {
            case "color": {
                return "";
            }
            case "normal": {
                return `
                    let normal = intersection.normal;
                `;
            }
            case "ao": {
                return `
                    let ao = vec2(1.0);
                `;
            }
        }
    }

    public static gpuCodeGetIntersection(name: string, typeName: string): string {
        return /* wgsl */`
        var intersection = ray${typeName}Intersection(ray, ${name});
        var color = vec4<f32>(calculateLight(ray, intersection));
        `
    }

    static gpuCodeGetBoundingRectangleVertex = `
        let boundingRectangleVertex = sphereToBoundingRectangleVertex(${this.variableName}.center.xyz, ${this.variableName}.radius, vertexIndex);
    `;
    //#endregion GPU Code

    public rayIntersection(ray: Ray): Intersection | null {
        if(!this.collisionEnabled){
            return null;
        }

        const center = this.properties.center;
        const radius = this.properties.radius;
        
        const oc = vec3.create();
        vec3.sub(oc, ray.origin, center);
        const b = vec3.dot(oc, ray.direction);
        const c = vec3.dot( oc, oc ) - radius * radius;
        let h = b*b - c;
    
        // no intersection
        if(h < 0.0) {
            return null;
        }
        h = Math.sqrt( h );
        const t = -b - h;
        return {bin: 0, t, object: this};
    }

    public toBoundingBoxes(): BoundingBox[] {
        const result = boundingBoxEmpty();

        const spherePosition = this.properties.center;
        const sphereRadius = this.properties.radius;
    
        boundingBoxExtendByPoint(result, vec3.add(vec3.create(), spherePosition, vec3.fromValues(sphereRadius, sphereRadius, sphereRadius)));
        boundingBoxExtendByPoint(result, vec3.add(vec3.create(), spherePosition, vec3.fromValues(-sphereRadius, -sphereRadius, -sphereRadius)));
    
        boundingBoxCalculateCenter(result);
    
        return [result];
    }

    private _bindGroup: GPUBindGroup | null = null;

    constructor(id: number, graphicsLibrary: GraphicsLibrary, allocator: Allocator) {
        super(id, graphicsLibrary, allocator);

        this._allocation = allocator.allocate(128);

        this.properties = SphereStruct.fromBuffer(new Uint8Array(128));
        this.properties.center = [0.0, 0.0, 0.0];
        this.properties.radius = 1.0;
        this.properties.color = [1.0, 0.0, 1.0, 1.0];

        this.onAllocationMoved();
    }

    public onAllocationMoved(): void {
        if (!this._allocation || !Sphere.bindGroupLayouts[0]) {
            return;
        }

        this._bindGroup = this._graphicsLibrary.device.createBindGroup({
            layout: Sphere.bindGroupLayouts[0],
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
        u8View.set(SphereStruct.toBuffer(this.properties), 0);
    }

    public setTransparent(){
        this._transparent = true;
    }
}