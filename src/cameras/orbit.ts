import { Camera, type OrbitCameraConfiguration} from "./shared";
import { mat4,  vec3 } from "gl-matrix";
import { WorldTransformation } from "./worldTransform";

// const TAU = Math.PI * 2.0;
// const PI = Math.PI;

export class OrbitCamera extends Camera {
    worldTransform = new WorldTransformation();    
    private lastX = 0;
    private lastY = 0;
    private mousePressed = false;

    constructor(device: GPUDevice, width: number, height: number, near = 0.01, fieldOfView = 45.0) {
        super(device, width, height, near, fieldOfView);
        this._position = vec3.fromValues(0, 0, 1);
        this.updateCPU();
    }

    public get fieldOfView(): number {
        return this._fieldOfView;
    }

    protected updateCPU(): void {    
        this._version++;
        const cameraPos = vec3.fromValues(0, 0, -4);

        const worldMatrix = this.worldTransform.matrix; 
        const cameraMatrix = mat4.lookAt(mat4.create(), cameraPos, vec3.fromValues(0,0,0), vec3.fromValues(0,1,0));
        mat4.multiply(this._viewMatrix, cameraMatrix, worldMatrix);

        const worldMatrixInv = this.worldTransform.matrixInv; 
        vec3.transformMat4(this._position, cameraPos, worldMatrixInv);

        super.updateCPU(0);
    }

    public get cameraConfiguration(): OrbitCameraConfiguration {
        throw new Error("Method not implemented.");
    }

    ///
    /// Events
    ///
    public onMouseDown(event: MouseEvent): void {
        super.onMouseDown(event);
        this.lastX = event.offsetX;
        this.lastY = event.offsetY;
        this.mousePressed = true;

        this.updateCPU();
    }

    public onMouseMove(event: MouseEvent): void {
        super.onMouseMove(event);

        if (this.mousePressed) {
            const changeX = this.lastX - event.offsetX;
            const changeY = this.lastY - event.offsetY;

            this.worldTransform.rotateDegX(-changeX / 5.0);
            this.worldTransform.rotateDegY(changeY / 5.0);

            this.lastX = event.offsetX;
            this.lastY = event.offsetY;

            this._dirty = true;
        }

        this.updateCPU();
    }

    public onMouseUp(event: MouseEvent): void {
        super.onMouseUp(event);

        this.mousePressed = false;

        this.updateCPU();
    }

    public onMouseEnter(event: MouseEvent): void {
        super.onMouseEnter(event);
    }

    public onMouseLeave(event: MouseEvent): void {
        super.onMouseLeave(event);

        this.mousePressed = false;
    }

    public onWheelEvent(event: WheelEvent): void {
        super.onWheelEvent(event);
        this.worldTransform.scale *= Math.pow(2, -event.deltaY / 1000.0);
        this._dirty = true;

        this.updateCPU();
    }

    public easeOutExp(t: number): number {
        return -Math.pow(2, -10 * t) + 1;
        //return t;
        //return -Mathf.Pow(2, -10 * t) + 1;
        //return c * ( -Math.pow( 2, -10 * t/d ) + 1 ) + b;
    }
}
