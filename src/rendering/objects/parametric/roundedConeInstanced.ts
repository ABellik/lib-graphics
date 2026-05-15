import { Allocator, GraphicsLibrary } from "../../..";
import type { BoundingBox, Ray } from "../../../shared";
import { IParametricObject, type Intersection } from "./shared";
import { vec3 } from "gl-matrix";
import * as r from "restructure";

export interface RoundedConeInstancedProperties {
    start: [number, number, number],
    startRadius: number,
    end: [number, number, number],
    endRadius: number,
    startColor: [number, number, number, number],
    endColor: [number, number, number, number],
}


export class RoundedConeInstanced extends IParametricObject {
    public static variableName = "roundedConeInstanced";
    public static typeName = "RoundedConeInstanced";

    public getVariableName(): string { return RoundedConeInstanced.variableName }
    public getTypeName(): string { return RoundedConeInstanced.typeName }

    static bindGroupLayouts: Array<GPUBindGroupLayout> = [];
    static createBindGroupLayouts(device: GPUDevice): void {
        RoundedConeInstanced.bindGroupLayouts = [device.createBindGroupLayout({
            label: this.typeName,
            entries: [{
                binding: 0,
                visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
                buffer: { type: "read-only-storage" },
            }]
        })];
    }

    private roundedConeInstancedStruct;

    private instances: number;
    public properties: RoundedConeInstancedProperties[];

    //#region GPU Code
    public static gpuCodeGlobals = /* wgsl */`
        struct ${this.typeName} {
            start: vec3<f32>,
            start_radius: f32,
            end: vec3<f32>,
            end_radius: f32,
            startColor: vec4<f32>,
            endColor: vec4<f32>,
        };
        
        @group(1) @binding(0) var<storage> ${this.variableName}Storage: array<${this.typeName}>;
    `;

    public static gpuCodeGetObject = `let ${this.variableName}: ${this.typeName} = ${this.variableName}Storage[instanceIndex];`;
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
            // let invRayDirection = vec3<f32>(1.0 / ray.direction.x, 1.0 / ray.direction.y, 1.0 / ray.direction.z);

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
                }
            }

            intersection = camera.position.xyz + t * ray.direction.xyz;

            return Intersection(
                t,
                intersection,
                normal
            );
        }
    `;

    static gpuCodeGetOutputValue(variable: "color" | "normal" | "ao"): string {
        switch (variable) {
            case "color": {
                return `
                    let startDist = length(${this.variableName}.start - intersection.position);
                    let endDist = length(${this.variableName}.end - intersection.position);
                    
                    var albedo = ${this.variableName}.endColor;
                    if(startDist < endDist){
                        albedo = ${this.variableName}.startColor;
                    }
                    let color = phong(ray, intersection, albedo);
                `;
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

static gpuCodeGetBoundingRectangleVertex = /* wgsl */`
    let T: mat4x4<f32> = mat4x4<f32>(
        vec4<f32>(${this.variableName}.start_radius, 0.0, 0.0, 0.0),
        vec4<f32>(0.0, ${this.variableName}.start_radius, 0.0, 0.0),
        vec4<f32>(0.0, 0.0, ${this.variableName}.start_radius, 0.0),
        vec4<f32>(${this.variableName}.start.x, ${this.variableName}.start.y, ${this.variableName}.start.z, 1.0)
    );

    let R: mat4x4<f32> = transpose(camera.projectionView * T);

    let roots_horizontal_s: vec2<f32> = quadraticRoots(dot(R[3], D * R[3]), -2.0 * dot(R[0], D * R[3]), dot(R[0], D * R[0]));
    let half_width_s: f32 = abs(roots_horizontal_s.x - roots_horizontal_s.y) * 0.5;

    let roots_vertical_s: vec2<f32> = quadraticRoots(dot(R[3], D * R[3]), -2.0 * dot(R[1], D * R[3]), dot(R[1], D * R[1]));
    let half_height_s: f32 = abs(roots_vertical_s.x - roots_vertical_s.y) * 0.5;

    var center_s: vec4<f32> = vec4<f32>(dot(R[0], D * R[3]), dot(R[1], D * R[3]), 0.0, dot(R[3], D * R[3]));
    center_s.x = center_s.x / center_s.w;
    center_s.y = center_s.y / center_s.w;


    let T2: mat4x4<f32> = mat4x4<f32>(
        vec4<f32>(${this.variableName}.end_radius, 0.0, 0.0, 0.0),
        vec4<f32>(0.0, ${this.variableName}.end_radius, 0.0, 0.0),
        vec4<f32>(0.0, 0.0, ${this.variableName}.end_radius, 0.0),
        vec4<f32>(${this.variableName}.end.x, ${this.variableName}.end.y, ${this.variableName}.end.z, 1.0)
    );

    let R2: mat4x4<f32> = transpose(camera.projectionView * T2);

    let roots_horizontal_e: vec2<f32> = quadraticRoots(dot(R2[3], D * R2[3]), -2.0 * dot(R2[0], D * R2[3]), dot(R2[0], D * R2[0]));
    let half_width_e: f32 = abs(roots_horizontal_e.x - roots_horizontal_e.y) * 0.5;

    let roots_vertical_e: vec2<f32> = quadraticRoots(dot(R2[3], D * R2[3]), -2.0 * dot(R2[1], D * R2[3]), dot(R2[1], D * R2[1]));
    let half_height_e: f32 = abs(roots_vertical_e.x - roots_vertical_e.y) * 0.5;

    var center_e: vec4<f32> = vec4<f32>(dot(R2[0], D * R2[3]), dot(R2[1], D * R2[3]), 0.0, dot(R2[3], D * R2[3]));
    center_e.x = center_e.x / center_e.w;
    center_e.y = center_e.y / center_e.w;


    var boundingRectangleVertex: vec2<f32> = vec2<f32>(0.0, 0.0);
    switch(vertexIndex) {
        case 0: {
        // Left-top
        boundingRectangleVertex = vec2<f32>(min(center_s.x - half_width_s, center_e.x - half_width_e), max(center_s.y + half_height_s, center_e.y + half_height_e));
        }
        case 1: {
        // Right-top
        boundingRectangleVertex = vec2<f32>(max(center_s.x + half_width_s, center_e.x + half_width_e), max(center_s.y + half_height_s, center_e.y + half_height_e));
        }
        case 2: {
        // Left-bot
        boundingRectangleVertex = vec2<f32>(min(center_s.x - half_width_s, center_e.x - half_width_e), min(center_s.y - half_height_s, center_e.y - half_height_e));
        }
        default: { // 3
        // Right-bot
        boundingRectangleVertex = vec2<f32>(max(center_s.x + half_width_s, center_e.x + half_width_e), min(center_s.y - half_height_s, center_e.y - half_height_e));
        }
    }
    `;
    //#endregion GPU Code

    public rayIntersection(ray: Ray): Intersection | null {
        let bestT = Infinity;
        let bestCone = -1;
        for (let i = 0; i < this.instances; i++) {
            const ba = vec3.create();
            vec3.sub(ba, this.properties[i].end, this.properties[i].start);
            const oa = vec3.create();
            vec3.sub(oa, ray.origin, this.properties[i].start);
            const ob = vec3.create();
            vec3.sub(ob, ray.origin, this.properties[i].end);
            const rr = this.properties[i].startRadius - this.properties[i].endRadius;
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
            const k1 = d2 * m3 - m1 * m2 + m2 * rr * this.properties[i].startRadius;
            const k0 = d2 * m5 - m1 * m1 + m1 * rr * this.properties[i].startRadius * 2.0 - m0 * this.properties[i].startRadius * this.properties[i].startRadius;
                
            const h = k1 * k1 - k0 * k2;
            
            if (h < 0.0) {
                continue;
            }
            
            let t = (-Math.sqrt(h) - k1) / k2;          
            const y = m1 - this.properties[i].startRadius * rr + t * m2;
    
            if(y > 0.0 && y < d2) 
            {
                if (t < bestT) {
                    bestT = t;
                    bestCone = i;
                }
            }
    
            // caps          
            const h1 = m3*m3 - m5 + this.properties[i].startRadius * this.properties[i].startRadius;
            const h2 = m6*m6 - m7 + this.properties[i].endRadius * this.properties[i].endRadius;
            if(Math.max(h1,h2) < 0.0) {
                continue;
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
            if (t < bestT) {
                bestT = t;
                bestCone = i;
            }
        }

        if(bestCone === -1){
            return null;
        }

        const intersection = vec3.scaleAndAdd(vec3.create(), ray.origin, ray.direction, bestT);
        
        const lengthStart = vec3.length(vec3.sub(vec3.create(), intersection, this.properties[bestCone].start));
        const lengthEnd = vec3.length(vec3.sub(vec3.create(), intersection, this.properties[bestCone].end));
      
        const bestBin = lengthStart <= lengthEnd ? bestCone : bestCone + 1;
        return { t: bestT, object: this, bin: bestBin, instance: bestCone };
    }

    public toBoundingBoxes(): BoundingBox[] {
        return [];
    }

    private _bindGroup: GPUBindGroup | null = null;

    constructor(id: number, graphicsLibrary: GraphicsLibrary, allocator: Allocator, instances = 1) {
        super(id, graphicsLibrary, allocator);

        this._allocation = allocator.allocate(instances * 64);

        this.instances = instances;
        this.roundedConeInstancedStruct = new r.Array(new r.Struct({
            start: new r.Array(r.floatle, 3),
            startRadius: r.floatle,
            end: new r.Array(r.floatle, 3),
            endRadius: r.floatle,
            startColor: new r.Array(r.floatle, 4),
            endColor: new r.Array(r.floatle, 4)
        }), instances);
        this.properties = this.roundedConeInstancedStruct.fromBuffer(new Uint8Array(this._allocation.cpuBuffer.inner.byteLength));

        this.onAllocationMoved();
    }

    public onAllocationMoved(): void {
        if (!this._allocation || !RoundedConeInstanced.bindGroupLayouts[0]) {
            return;
        }

        this._bindGroup = this._graphicsLibrary.device.createBindGroup({
            layout: RoundedConeInstanced.bindGroupLayouts[0],
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
    }

    public record(encoder: GPURenderPassEncoder, bindGroupLayoutsOffset = 1): void {
        if (!this._bindGroup) {
            return;
        }

        // Set bind group
        encoder.setBindGroup(bindGroupLayoutsOffset + 0, this._bindGroup);

        // Draw
        encoder.draw(4, this.instances, 0, 0);
    }

    public toBuffer(buffer: ArrayBuffer, offset: number): void {
        const u8View = new Uint8Array(buffer, offset);
        u8View.set(this.roundedConeInstancedStruct.toBuffer(this.properties), 0);
    }
}