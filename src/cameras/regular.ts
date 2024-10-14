import { Camera, OrbitCameraConfiguration, toRadian} from "./shared";
import { mat4,  quat,  vec3 } from "gl-matrix";
import { WordTransformation } from "./wordTransform";

// const TAU = Math.PI * 2.0;
// const PI = Math.PI;

export class RegularCamera extends Camera {
    wordTransform = new WordTransformation();    
    private _cameraPosition = vec3.fromValues(0, 0, 0);
    private _cameraOrientation = quat.identity(quat.create());
    readonly _defaultCameraPos = vec3.fromValues(0,0,4);
    readonly _defaultCameraMatrix = mat4.lookAt(mat4.create(), this._defaultCameraPos, vec3.fromValues(0,0,0), vec3.fromValues(0,1,0));

    rotate: "Camera" | "Word" = "Word";

    private lastX = 0;
    private lastY = 0;
    private mousePressed = false;


    constructor(device: GPUDevice, width: number, height: number, near = 0.01, fieldOfView = 45.0) {
        super(device, width, height, near, fieldOfView);
        this.updateCPU();

        this.wordTransform.addEventListener("changed", this.updateCPU.bind(this));
    }

    protected updateCPU(): void {   
        //console.log("orientation:", this._cameraOrientation);
        //console.log("position:", this._cameraPosition);
        
        const worldMatrix = this.wordTransform.matrix; 

        const orientMatrix = mat4.fromQuat(mat4.create(), this._cameraOrientation);
        const cameraMatrix = mat4.translate(mat4.create(), orientMatrix, vec3.negate(vec3.create(), this._cameraPosition));
        mat4.multiply(cameraMatrix, cameraMatrix, this._defaultCameraMatrix);
        
        mat4.multiply(this._viewMatrix, cameraMatrix, worldMatrix);

        const wordMatrixInv = this.wordTransform.matrixInv; 
        vec3.transformMat4(this._position, vec3.add(vec3.create(), this._cameraPosition, this._defaultCameraPos), wordMatrixInv);

        super.updateCPU(0);
    }

    public get cameraConfiguration(): OrbitCameraConfiguration {
        throw new Error("Method not implemented.");
    }

    ///
    /// Events
    ///
    public onMouseDown(event: MouseEvent) {
        super.onMouseDown(event);
        this.lastX = event.offsetX;
        this.lastY = event.offsetY;
        this.mousePressed = true;
    }

    public onMouseMove(event: MouseEvent) {
        super.onMouseMove(event);
        const ROTATION_SPEED = 1 / 5;

        if (this.mousePressed) {
            const changeX = this.lastX - event.offsetX;
            const changeY = this.lastY - event.offsetY;

            if(this.rotate === "Camera"){
                this.rotateCameraDegX(-changeX * ROTATION_SPEED);
                this.rotateCameraDegY(-changeY * ROTATION_SPEED);
            }
            else{
                this.wordTransform.rotateDegX(-changeX * ROTATION_SPEED);
                this.wordTransform.rotateDegY(-changeY * ROTATION_SPEED);
            }

            this.lastX = event.offsetX;
            this.lastY = event.offsetY;

            this.updateCPU();
        }
    }

    public onMouseUp(event: MouseEvent) {
        super.onMouseUp(event);

        this.mousePressed = false;
    }

    public onMouseEnter(event: MouseEvent) {
        super.onMouseEnter(event);
    }

    public onMouseLeave(event: MouseEvent) {
        super.onMouseLeave(event);

        this.mousePressed = false;
    }

    public onWheelEvent(event: WheelEvent) {
        super.onWheelEvent(event);

        this.wordTransform.scale += event.deltaY / 1000.0;
        this.updateCPU();
    }

    zoom(zoomingIn: boolean, zoomingOut: boolean) {
        if (zoomingIn === zoomingOut) {
            return;
        }

        const ZOOMING_SPEED = 1.01;

        if (zoomingIn) {
            this.wordTransform.scale *= ZOOMING_SPEED;
        } else {
            this.wordTransform.scale /= ZOOMING_SPEED;
        }

        this.updateCPU();
    }

    private rotateCameraDegX(angle: number){
        const rot = quat.fromValues(0, Math.sin(0.5 * toRadian(angle)),0, Math.cos(0.5 * toRadian(angle)));
        quat.multiply(this._cameraOrientation, rot, this._cameraOrientation);
        this.updateCPU();
    }

    private rotateCameraDegY(angle: number){
        const rot = quat.fromValues(Math.sin(0.5 * toRadian(angle)), 0, 0, Math.cos(0.5 * toRadian(angle)));
        quat.multiply(this._cameraOrientation, rot, this._cameraOrientation);
        this.updateCPU();
    }

    move(move: vec3){
        vec3.add(this._cameraPosition, this._cameraPosition, 
            vec3.transformQuat(vec3.create(), move, quat.invert(quat.create(), this._cameraOrientation)));
        this.updateCPU();
    }

    rotateCamera(angles: vec3){
        /*if(angles[0] != 0){
            quat.multiply(this._cameraOrientation, this.cameraOrientation, angles[0]);
        }
        if(angles[1] != 0){
            quat.rotateY(this._cameraOrientation, this.cameraOrientation, angles[1]);
        }
        if(angles[2] != 0){
            quat.rotateZ(this._cameraOrientation, this.cameraOrientation, angles[2]);
        }*/

        const rotation = quat.fromEuler(quat.create(), angles[0], angles[1], angles[2]);
        quat.multiply(this._cameraOrientation, rotation, this._cameraOrientation);
        this.updateCPU();
    }

    get cameraPosition(): vec3 {
        return this._cameraPosition;
    }
      
    set cameraPosition(value: vec3) {
        this._cameraPosition = value;
        this.updateCPU();
    }
      
    get cameraOrientation(): quat {
        return this._cameraOrientation;
    }
      
    set cameraOrientation(value: quat) {
        this._cameraOrientation = value;
        this.updateCPU();
    }
}