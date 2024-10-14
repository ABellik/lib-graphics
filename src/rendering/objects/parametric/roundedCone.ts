import type { Allocator, GraphicsLibrary, Intersection } from "../../..";
import type { BoundingBox, Ray } from "../../../shared";
import { IParametricObject } from "./shared";
import { vec3 } from "gl-matrix";
import * as r from "restructure";

export interface RoundedConeProperties {
    start: [number, number, number],
    startRadius: number,
    end: [number, number, number],
    endRadius: number,
    color: [number, number, number, number],
}

export const RoundedConeStruct = new r.Struct({
    start: new r.Array(r.floatle, 3),
    startRadius: r.floatle,
    end: new r.Array(r.floatle, 3),
    endRadius: r.floatle,
    color: new r.Array(r.floatle, 4)
});

export class RoundedCone extends IParametricObject {
    public static variableName = "roundedCone";
    public static typeName = "RoundedCone";

    public getVariableName(): string { return RoundedCone.variableName }
    public getTypeName(): string { return RoundedCone.typeName }

    static bindGroupLayouts: Array<GPUBindGroupLayout> = [];
    static createBindGroupLayouts(device: GPUDevice): void {
        RoundedCone.bindGroupLayouts = [device.createBindGroupLayout({
            label: this.typeName,
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: "uniform" },
            }]
        })];
    }

    public properties: RoundedConeProperties;

    //#region GPU Code
    public static gpuCodeGlobals = /* wgsl */`
        struct ${this.typeName} {
            start: vec3<f32>,
            start_radius: f32,
            end: vec3<f32>,
            end_radius: f32,
            color: vec4<f32>,
        };
        
        @group(1) @binding(0) var<uniform> ${this.variableName}: ${this.typeName};
    `;

    public static gpuCodeGetObject = "";
    public static gpuCodeGetObjectUntypedArray = `
        let ${this.variableName}: ${this.typeName} = ${this.typeName}(
            vec3<f32>(words[0], words[1], words[2]),
            vec3<f32>(words[3]),
            vec3<f32>(words[4], words[5], words[6]),
            vec3<f32>(words[7]),
            vec3<f32>(words[8], words[9], words[10]),
        );
    `;

    static gpuCodeIntersectionTest = /* wgsl */`
        fn ray${this.typeName}Intersection(ray: Ray, ${this.variableName}: ${this.typeName}) -> Intersection {
            let invRayDirection = vec3<f32>(1.0 / ray.direction.x, 1.0 / ray.direction.y, 1.0 / ray.direction.z);

            let ba = ${this.variableName}.end - ${this.variableName}.start;
            let oa = ray.origin - ${this.variableName}.start;
            let ob = ray.origin - ${this.variableName}.end;
            let rr = ${this.variableName}.start_radius - ${this.variableName}.end_radius;
            let m0 = dot(ba,ba);
            let m1 = dot(ba,oa);
            let m2 = dot(ba,ray.direction);
            let m3 = dot(ray.direction, oa);
            let m5 = dot(oa,oa);
            let m6 = dot(ob,ray.direction);
            let m7 = dot(ob,ob);
          
            // body
            let d2 = m0 - rr*rr;
            let k2 = d2    - m2*m2;
            let k1 = d2*m3 - m1*m2 + m2*rr*${this.variableName}.start_radius;
            let k0 = d2*m5 - m1*m1 
            + m1*rr*${this.variableName}.start_radius*2.0 
            - m0*${this.variableName}.start_radius*${this.variableName}.start_radius;
              
            let h = k1*k1 - k0*k2;
          
            if (h < 0.0) {
                return Intersection(
                    -1.0,
                    vec3(0.0),
                    vec3(0.0)
                );
            }
          
            var t = (-sqrt(h)-k1)/k2;          
            let y = m1 - ${this.variableName}.start_radius * rr + t*m2;

            if(y > 0.0 && y < d2) 
            {
                let intersection = camera.position.xyz + t * ray.direction.xyz;
                return Intersection(
                    t,
                    intersection,
                    normalize( d2*(oa + t*ray.direction)-ba*y)
                );
            }

            // caps          
            let h1 = m3*m3 - m5 + ${this.variableName}.start_radius*${this.variableName}.start_radius;
            let h2 = m6*m6 - m7 + ${this.variableName}.end_radius*${this.variableName}.end_radius;
            if(max(h1,h2) < 0.0) {
                return Intersection(
                    -1.0,
                    vec3(0.0),
                    vec3(0.0)
                );
            }
          
            t = 1e20;
            var intersection = vec3(0.0);
            var normal = vec3(0.0);

            if( h1>0.0 )
            {        
                t = -m3 - sqrt( h1 );
                normal = (oa+t*ray.direction)/${this.variableName}.start_radius;
            }

            if( h2>0.0 )
            {
                let t2 = -m6 - sqrt( h2 );

                if(t2 < t) {                    
                    t = t2;
                    normal = (ob+t*ray.direction)/${this.variableName}.end_radius;
                } else {

                }
            }

            intersection = camera.position.xyz + t * ray.direction.xyz;

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
            
            var result = (ambient + diffuse) * ${this.variableName}.color.rgb;

            return vec4(result, 1.0);
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
                return /* wgsl */`
                    let ao = vec2(1.0, 1.0);
                `;
            }
        }
    }

    public static gpuCodeGetIntersection(name: string, typeName: string): string {
        return /* wgsl */`
        var intersection = ray${typeName}Intersection(ray, ${name});
        var color = vec4<f32>(calculateLight(ray, intersection));
        `}

    static gpuCodeGetBoundingRectangleVertex = `
        let center: vec3<f32> = 0.5 * (${this.variableName}.start.xyz + ${this.variableName}.end.xyz);
        let diameter = length(${this.variableName}.start.xyz - ${this.variableName}.end.xyz);
        let radius: f32 = 0.5 * diameter + max(${this.variableName}.start_radius, ${this.variableName}.end_radius);

        let boundingRectangleVertex = sphereToBoundingRectangleVertex(center, radius, vertexIndex);
    `;
    //#endregion GPU Code

    public rayIntersection(ray: Ray): Intersection | null {
        const ba = vec3.create();
        vec3.sub(ba, this.properties.end, this.properties.start);
        const oa = vec3.create();
        vec3.sub(oa, ray.origin, this.properties.start);
        const ob = vec3.create();
        vec3.sub(ob, ray.origin, this.properties.end);
        const rr = this.properties.startRadius - this.properties.endRadius;
        const m0 = vec3.dot(ba,ba);
        const m1 = vec3.dot(ba,oa);
        const m2 = vec3.dot(ba,ray.direction);
        const m3 = vec3.dot(ray.direction, oa);
        const m5 = vec3.dot(oa,oa);
        const m6 = vec3.dot(ob,ray.direction);
        const m7 = vec3.dot(ob,ob);
        
        // body
        const d2 = m0 - rr * rr;
        const k2 = d2    - m2 * m2;
        const k1 = d2 * m3 - m1 * m2 + m2 * rr * this.properties.startRadius;
        const k0 = d2 * m5 - m1 * m1 + m1 * rr * this.properties.startRadius * 2.0 - m0 * this.properties.startRadius * this.properties.startRadius;
            
        const h = k1 * k1 - k0 * k2;
        
        if (h < 0.0) {
            return null;
        }
        
        let t = (-Math.sqrt(h) - k1) / k2;          
        const y = m1 - this.properties.startRadius * rr + t * m2;

        if(y > 0.0 && y < d2) 
        {
            const intersection = vec3.scaleAndAdd(vec3.create(), ray.origin, ray.direction, t);
            const lengthStart = vec3.length(vec3.sub(vec3.create(), intersection, this.properties.start));
            const lengthEnd = vec3.length(vec3.sub(vec3.create(), intersection, this.properties.end));
          
            const bestBin = lengthStart <= lengthEnd ? 0 : 1;
            return { t, object: this, bin: bestBin };
        }

        // caps          
        const h1 = m3*m3 - m5 + this.properties.startRadius * this.properties.startRadius;
        const h2 = m6*m6 - m7 + this.properties.endRadius * this.properties.endRadius;
        if(Math.max(h1,h2) < 0.0) {
            return null;
        }
        
        t = Infinity;
        
        if(h1 > 0.0)
        {        
            t = -m3 - Math.sqrt(h1);
        }

        if(h2 > 0.0)
        {
            const t2 = -m6 - Math.sqrt(h2);

            if(t2 < t) {                    
                t = t2;
            }
        }

        const intersection = vec3.scaleAndAdd(vec3.create(), ray.origin, ray.direction, t);
        const lengthStart = vec3.length(vec3.sub(vec3.create(), intersection, this.properties.start));
        const lengthEnd = vec3.length(vec3.sub(vec3.create(), intersection, this.properties.end));
      
        const bestBin = lengthStart <= lengthEnd ? 0 : 1;
        return { t, object: this, bin: bestBin };
    }

    public toBoundingBoxes(): BoundingBox[] {
        return [];
    }

    protected _bindGroup: GPUBindGroup | null = null;

    constructor(id: number, graphicsLibrary: GraphicsLibrary, allocator: Allocator) {
        super(id, graphicsLibrary, allocator);

        this._allocation = allocator.allocate(128);

        this.properties = RoundedConeStruct.fromBuffer(new Uint8Array(128));

        this.onAllocationMoved();
    }

    public onAllocationMoved(): void {
        if (!this._allocation || !RoundedCone.bindGroupLayouts[0]) {
            return;
        }

        this._bindGroup = this._graphicsLibrary.device.createBindGroup({
            layout: RoundedCone.bindGroupLayouts[0],
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
        u8View.set(RoundedConeStruct.toBuffer(this.properties), 0);
    }
}