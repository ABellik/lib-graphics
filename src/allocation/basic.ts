import type { Allocation, AllocationRange } from "./shared";
import { Allocator, AllocatorStrategy } from "./shared";

const minimumArraySize = 1048576; // 1MB

function nearestPowerOf2(n: number) {
    if (n <= 1024) {
        return 1024;
    }

    return 1 << 31 - Math.clz32(n);
}

export class BasicAllocator extends Allocator {
    public strategy: AllocatorStrategy = AllocatorStrategy.Basic;

    constructor(device: GPUDevice, initialSize: number = minimumArraySize) {
        super(device, initialSize);
    }

    public allocate(requestedSize: number): Allocation {
        // Conditions for reallocating entire array
        if (this.freeSpace < requestedSize || this.allocationRatio > 0.75) {
            // Do not resize in case defragmentation is enough
            let newSize = 2.0 * Math.max(
                nearestPowerOf2(this._size),
                nearestPowerOf2(this._allocated + requestedSize)
            );

            if ((this._allocated - this._deallocated) + requestedSize < 0.75 * this._size) {
                newSize = this._size;
            }

            newSize = Math.max(minimumArraySize, newSize);

            const newArrayBuffer = new ArrayBuffer(newSize);
            const newGpuBuffer = this._device.createBuffer({
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
                size: newSize,
            });

            let currentOffset = 0;
            const newAllocations = [];
            for (const allocation of this._allocations) {
                allocation.offset = currentOffset;
                allocation.moved = true;

                newAllocations.push(allocation);

                currentOffset += allocation.size;
            }
            
            this._size = newSize;
            this._allocated = newAllocations.map(a => a.size).reduce((a, b) => a + b, 0);
            this._deallocated = 0;

            this._cpuBuffer.inner = newArrayBuffer;
            this._gpuBuffer.inner = newGpuBuffer;

            this._allocations = newAllocations;
        }

        // Round up allocation to alignment of 256 bytes
        const size = requestedSize + (256 - requestedSize % 256);

        const allocationRange: AllocationRange = {
            size,
            offset: this._allocated,
            moved: true,
        };

        this._allocations.push(allocationRange);
        this._allocated += allocationRange.size;

        return {
            cpuBuffer: this._cpuBuffer,
            gpuBuffer: this._gpuBuffer,

            allocationRange: allocationRange,
        }
    }

    public deallocate(allocations: Allocation[] | null = null): void {
        if (allocations === null) {
            this._allocations = [];
            this._gpuBuffer.inner.destroy();
        } else {
            for(const allocation of allocations) {
                const index = this._allocations.findIndex(a => a === allocation.allocationRange);

                this._deallocated += allocation.allocationRange.size;
                this._allocations.splice(index, 1);
            }
        }
    }
}