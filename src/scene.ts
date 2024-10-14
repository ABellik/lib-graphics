import type { Allocator } from "./allocation/index"
import type { GraphicsLibrary, Intersection } from ".";
import type { BoundingBox, Ray } from "./shared";

import { BasicAllocator } from "./allocation/index";
// import { vec3, vec4 } from "gl-matrix";
import { ConcreteObject, IObject, IParametricObject, Volume } from "./rendering";
import { Mesh } from "./rendering/objects/mesh";
import { vec3 } from "gl-matrix";
import { DynamicVolume, DynamicVolumeUnit } from "./rendering/objects/parametric/dynamicVolume";

export enum RenderObjects {
    Transparent,
    Opaque,
}

export class Scene {
    private graphicsLibrary: GraphicsLibrary;

    private _objects: IObject[] = [];
    private _dynamicVolume: DynamicVolume | null = null;
    private colormap: ImageBitmap | null = null;
    private _lastObjectID = 0;

    private _allocator: BasicAllocator;

    private _version = 1;

    //#region BVH & Ray-tracing
    private bvhWorker: Worker | null = null;
    // private _useBVH = true;
    // private _bvh: BoundingVolumeHierarchy | null = null;
    private _globalBBox: BoundingBox | null = null;

    // private _bboxesBuffer: GPUBuffer | null = null;
    // private _nodesBuffer: GPUBuffer | null = null;

    // private _bvhBindGroup: GPUBindGroup | null = null;
    //#endregion    

    constructor(graphicsLibrary: GraphicsLibrary, useBVH = true) {
        this.graphicsLibrary = graphicsLibrary;

        this._allocator = new BasicAllocator(graphicsLibrary.device);

        // this._useBVH = useBVH;
    }

    public deallocate(): void {
        this._objects = [];
        this._allocator.deallocate();
    }

    public buildBVH(): void {
        console.time("scene::buildBVH");

        if (this.bvhWorker !== null) {
            this.bvhWorker.terminate();
        }

        // console.time('scene::buildBVH::bboxes');
        // TODO: get bounding Boxes
        // console.timeEnd('scene::buildBVH::bboxes');

        // this.bvhWorker = new BinnedSAHBuilderWorker();
        // this.bvhWorker.onmessage = ({ data: { result } }) => {
        //     // console.time('scene::buildBVH::Finish');
        //     if (result == null) {
        //         this._bvh = null;

        //         allocator.deallocateArray(this._nodesBuffer);
        //         allocator.deallocateArray(this._bboxesBuffer);

        //         this._nodesBuffer = null;
        //         this._bboxesBuffer = null;
        //         this._bvhBindGroup = null;

        //         return;
        //     }

        //     this._bvh = new BoundingVolumeHierarchy();
        //     this._bvh.primitives = this._buffer.data;
        //     this._bvh.bboxes = result.bboxes;
        //     this._bvh.nodes = result.nodes;
        //     this._bvh.nodeCount = result.nodeCount;

        //     const nodesSizeBytes = this._bvh.nodeCount * NODE_SIZE_BYTES;
        //     const bboxesSizeBytes = this._bvh.bboxes.length * BOUNDING_BOX_SIZE_BYTES;

        //     if (this._nodesBuffer == null || (this._nodesBuffer != null && this._nodesBuffer.sizeBytes <= nodesSizeBytes)) {
        //         allocator.deallocateArray(this._nodesBuffer);
        //         this._nodesBuffer = allocator.allocateArray(Math.ceil(nodesSizeBytes / allocator.slabSize));
        //     }
        //     if (this._bboxesBuffer == null || (this._nodesBuffer != null && this._bboxesBuffer.sizeBytes <= bboxesSizeBytes)) {
        //         allocator.deallocateArray(this._bboxesBuffer);
        //         this._bboxesBuffer = allocator.allocateArray(Math.ceil(bboxesSizeBytes / allocator.slabSize));
        //     }

        //     this._bvh.toGPUArrays(this._nodesBuffer, this._bboxesBuffer);

        //     this._bvhBindGroup = this.graphicsLibrary.device.createBindGroup({
        //         layout: this.graphicsLibrary.bindGroupLayouts.boundingVolumeHierarchy,
        //         entries: [
        //             {
        //                 binding: 0,
        //                 resource: {
        //                     buffer: this._nodesBuffer.gpuBuffer,
        //                     offset: this._nodesBuffer.data.byteOffset,
        //                     size: this._nodesBuffer.data.byteLength,
        //                 }
        //             },
        //             {
        //                 binding: 1,
        //                 resource: {
        //                     buffer: this._bboxesBuffer.gpuBuffer,
        //                     offset: this._bboxesBuffer.data.byteOffset,
        //                     size: this._bboxesBuffer.data.byteLength,
        //                 }
        //             }
        //         ]
        //     });

        //     // console.timeEnd('scene::buildBVH::Finish');
        // };
        // this.bvhWorker.postMessage({ objectsBuffer: copyOfObjectsBuffer });

        console.timeEnd("scene::buildBVH");
    }

    public addObject<T extends IObject>(objectType: new (id: number, graphicsLibrary: GraphicsLibrary, allocator: Allocator) => T): [T, number] {
        const objectID = this._lastObjectID++;
        const object = new objectType(objectID, this.graphicsLibrary, this._allocator);

        this._objects.push(object);

        this._version++;

        return [object, objectID];
    }

    public addObjectInstanced<T extends IObject>(objectType: new (id: number, graphicsLibrary: GraphicsLibrary, allocator: Allocator, instances: number) => T, instances = 1): [T, number] {
        const objectID = this._lastObjectID++;
        const object = new objectType(objectID, this.graphicsLibrary, this._allocator, instances);

        this._objects.push(object);

        this._version++;

        return [object, objectID];
    }

    public addVolume<T extends Volume>(objectType: new (id: number, graphicsLibrary: GraphicsLibrary, allocator: Allocator) => T): [T, number] {
        const objectID = this._lastObjectID++;
        const object = new objectType(objectID, this.graphicsLibrary, this._allocator);

        this._objects.push(object);

        this._version++;

        return [object, objectID];
    }

    public addDynamicVolume<T extends DynamicVolumeUnit>(objectType: new (id: number, graphicsLibrary: GraphicsLibrary, dynamicVolume: DynamicVolume) => T): [T, number] {
        if (!this._dynamicVolume) {
            const dynamicVolumeID = this._lastObjectID++;
            this._dynamicVolume = new DynamicVolume(dynamicVolumeID, this.graphicsLibrary, this._allocator);
            if (this.colormap) {
                this._dynamicVolume.setColorMapFromBitmap(this.colormap);
            }
            this.objects.push(this._dynamicVolume);
        }

        this._version++;
        return this._dynamicVolume.addVolume(objectType);
    }

    public removeDynamicVolumeByID(volumeID: number) : void {
        if (!this._dynamicVolume) {
            return;
        }

        this._dynamicVolume.removeVolumeByID(volumeID);
        if (this._dynamicVolume.isEmpty()) {
            this.removeObjectByID(this._dynamicVolume.id);
            this._dynamicVolume = null;
        }
    }

    public async setColorMapFromBitmap(bitmap: ImageBitmap) {
        this.colormap = bitmap;
        if (this._dynamicVolume) {
            this._dynamicVolume.setColorMapFromBitmap(bitmap);
        }
    }


    public addMesh<T extends Mesh>(objectType: new (id: number, graphicsLibrary: GraphicsLibrary, allocator: Allocator, trianglesCount: number) => T, trianglesCount = 1): [T, number] {
        const objectID = this._lastObjectID++;
        const object = new objectType(objectID, this.graphicsLibrary, this._allocator, trianglesCount);

        this._objects.push(object);

        this._version++;

        return [object, objectID];
    }


    public clearObjects(): void {
        this._objects.forEach(o => o.allocation ? this._allocator.deallocate([o.allocation]) : {});
        this._objects = [];
    }

    public removeObjectByID(objectID: number): void {
        const objectIndex = this._objects.findIndex((object) => object.id === objectID);
        const object = this._objects[objectIndex];

        if (objectIndex >= 0 && object && this._allocator) {
            if (object.allocation) {
                this._allocator.deallocate([object.allocation]);
            }
            
            this._objects.splice(objectIndex, 1);
        }
    }

    public uploadModified(queue: GPUQueue): void {
        for (const object of this._objects) {
            if (object instanceof ConcreteObject) {
                object.update();
            }
        }

        for (const object of this._objects) {
            if (object instanceof ConcreteObject) {
                if (object.dirtyGPU) {
                    const allocation = object.allocation;

                    if (!allocation) {
                        continue;
                    }

                    queue.writeBuffer(
                        this._allocator.gpuBuffer().inner,
                        allocation.allocationRange.offset,
                        this._allocator.cpuBuffer().inner,
                        allocation.allocationRange.offset,
                        allocation.allocationRange.size
                    );

                    object.setCleanGPU();
                }
            }
        }
    }

    public rayIntersection(ray: Ray): Intersection | null {
        vec3.normalize(ray.direction, ray.direction);
        let closestIntersection: Intersection | null = null;

        for(const object of this._objects){
            if(object instanceof IParametricObject){
                const intersection = object.rayIntersection(ray);
                if(closestIntersection === null){
                    closestIntersection = intersection;
                    continue;
                }

                if(intersection !== null && intersection.t < closestIntersection.t){
                    closestIntersection = intersection;
                }
            }
        }
        return closestIntersection;
    }

    public get version(): number {
        return this._version;
    }

    public get objects(): IObject[] {
        return this._objects;
    }

    // public set useBVH(useBVH: boolean) {
    //     this._useBVH = useBVH;
    // }

    // public get bvh(): BoundingVolumeHierarchy | null {
    //     return this._bvh;
    // }

    public get globalBBox(): BoundingBox | null {
        return this._globalBBox;
    }

    // public get structures(): Array<HighLevelStructure> {
    //     return this._structures;
    // }
}