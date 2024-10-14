import { GraphicsLibrary } from "../../..";
import { Allocator } from "../../../allocation";
import type { Ray } from "../../../shared";
import { ConcreteObject } from "../shared";

export interface Intersection{
    t: number,
    bin: number,
    object: IParametricObject,
}

export abstract class IParametricObject extends ConcreteObject {   
    public static variableName = "iParametric";
    public static typeName = "IParametric";

    public getTypeName() { return IParametricObject.typeName; }

    static bindGroupLayouts: GPUBindGroupLayout[] = [];

    //#region CPU Intersection Functions
    public abstract rayIntersection(ray: Ray): Intersection | null;

    public collisionEnabled: boolean = true;

    //#region GPU Functions for Shader Construction
    public static gpuCodeGlobals: string = "";

    public static gpuCodeGetObject: string = `let ${this.variableName} = ${this.typeName};`;
    public static gpuCodeGetObjectUntypedArray: string = `
        let ${this.variableName}: ${this.typeName} = ${this.typeName}();
    `;

    public static resize(graphicsLibrary: GraphicsLibrary, width: number, height: number, ): void {}

    constructor(id: number, graphicsLibrary: GraphicsLibrary, allocator: Allocator) {
        super(id, graphicsLibrary, allocator);
    }

    /**
     * rayIntersection(ray: Ray, `name`: capitalize(`name`)): -> Intersection;
     * 
     * where
     * 
     * Intersection {
     *  t: f32,
     *  worldPosition: vec3<f32>,
     *  normal: vec3<f32>,
     * }
     */
     public static gpuCodeIntersectionTest: string;

    /**
     * Code should look like:
     * 
     * ```
     *  // ... some retrieval stuff
     *  let color = sphereUniform[instance].color;
     * ```
     */
     public static gpuCodeGetOutputValue(variable: "color" | "normal" | "ao"): string { return ""; }

    /**
     * GPU function that projects this parametric object's bounding rectangle based on current camera.
     * 
     * `name`ToBoundingRectangle(`name`: capitalize(`name`)): -> BoundingRectangle;
     * 
     * where
     * - BoundingRectangle == vec4<vec2<f32>>
     * 
     * acces to globals
     *  - Camera
     */
     public static gpuCodeGetBoundingRectangleVertex: string;

     public static gpuCodeGetIntersection(name: string, typeName: string): string { return /* wgsl */`var intersection = ray${typeName}Intersection(ray, ${name});`}
    //#endregion
}
