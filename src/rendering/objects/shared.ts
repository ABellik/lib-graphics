import type { Allocation, Allocator, GraphicsLibrary } from "../..";
import type { BoundingBox } from "../../shared";

export abstract class IObject {
    /**
     * Unique ID identifying the object.
     */
    protected _id: number;
    protected _allocation: Allocation | null = null;

    protected _graphicsLibrary: GraphicsLibrary;

    protected _frameID: number = 0;

    public static variableName = "iParametric";
    public static typeName = "IParametric";

    public parent: IObject | null = null;

    constructor(id: number, graphicsLibrary: GraphicsLibrary, allocator: Allocator) {
        this._id = id;
        this._graphicsLibrary = graphicsLibrary;
    }

    public get id(): number {
        return this._id;
    }

    public get allocation(): Allocation | null {
        return this.allocation
    }
}

export abstract class ComposedObject extends IObject {

}

export abstract class ConcreteObject extends IObject {
    protected _allocation: Allocation | null = null;

    protected _visible = true;
    protected _transparent = false;

    protected _dirtyCPU = true;
    protected _dirtyGPU = true;

    static bindGroupLayouts: GPUBindGroupLayout[] = [];

    public abstract onAllocationMoved(): void;

    public update(): void {
        if (this._allocation?.allocationRange.moved) {
            this.onAllocationMoved();
            this.toBuffer(this._allocation.cpuBuffer.inner, this._allocation.allocationRange.offset);

            this._allocation.allocationRange.moved = false;
            
            this._dirtyGPU = true;
        } else if (this._allocation && this.dirtyCPU) {
            this.toBuffer(this._allocation.cpuBuffer.inner, this._allocation.allocationRange.offset);
            
            this._dirtyGPU = true;
        }

        this._dirtyCPU = false;
    }

    public record(encoder: GPURenderPassEncoder, bindGroupLayoutsOffset: number, frameID: number) {
        if (this.hidden) {
            return;
        }
    }
    
    /**
     * Whether this object should be part of bounding volume hierarchy.
     * For example, overlayed Gizmo may not want to be included. Gizmo's
     * movement would unnecessarily cause recomputation of BVH. 
     */
    protected inBVH = false;

    /**
     * Whether BVH needs to recomputed due to changes to this object.
     */
    protected dirtyBVH = false;

    public abstract toBuffer(buffer: ArrayBuffer, offset: number): void;
    public abstract toBoundingBoxes(): BoundingBox[];

    public set visible(visible: boolean) {
        this._visible = visible;
    }

    public get visible(): boolean { return this._visible; }
    public get hidden(): boolean { return !this._visible; }

    public get opaque(): boolean { return !this._transparent; }
    public get transparent(): boolean { return this._transparent; }

    public setDirtyCPU(): void { this._dirtyCPU = true; }
    public setCleanGPU(): void { this._dirtyGPU = false; }

    public get dirtyGPU(): boolean { return this._dirtyGPU; }
    public get dirtyCPU(): boolean { return this._dirtyCPU; }

    public get allocation(): Allocation | null {
        return this._allocation;
    }
}

