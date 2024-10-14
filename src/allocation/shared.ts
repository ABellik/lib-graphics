export interface AllocationRange {
    size: number;
    offset: number;

    moved: boolean;
}

export type CPUBufferReference = {
    inner: ArrayBuffer;
}

export type GPUBufferReference = {
    inner: GPUBuffer;
}

export interface Allocation {
    cpuBuffer: CPUBufferReference;
    gpuBuffer: GPUBufferReference;

    allocationRange: AllocationRange;
}

export enum  AllocatorStrategy {
    Basic
}

export abstract class Allocator {
    public abstract strategy: AllocatorStrategy;

    protected _device: GPUDevice;

    protected _cpuBuffer: CPUBufferReference;
    protected _gpuBuffer: GPUBufferReference;

    protected _size: number;

    protected _allocated = 0;
    protected _deallocated = 0;

    protected _allocations: AllocationRange[] = [];

    constructor(device: GPUDevice, initialSize: number) {
        this._size = initialSize;
        this._device = device;

        this._cpuBuffer = { inner: new ArrayBuffer(initialSize) };
        this._gpuBuffer = { inner: this._device.createBuffer({
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
            size: initialSize,
        })};
    }

    public abstract allocate(size: number): Allocation;
    public abstract deallocate(allocations: Allocation[] | null): void;

    public cpuBuffer(): CPUBufferReference {
        return this._cpuBuffer;
    }

    public gpuBuffer(): GPUBufferReference {
        return this._gpuBuffer;
    }

    protected get allocationRatio(): number {
        if (this._allocated === 0 || this._deallocated === 0) {
            return 0;
        }
        
        return this._deallocated / this._allocated;
    }

    protected get freeSpace(): number {
        return Math.max(0, this._cpuBuffer.inner.byteLength - this._allocated);
    }

    protected get freeSpaceRatio(): number {
        return this._allocated / this._cpuBuffer.inner.byteLength;
    }
}