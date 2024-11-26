import { Camera, ProjectionType } from "./shared";
import { mat4, vec3 } from "gl-matrix";
import { WorldTransformation } from "./worldTransform";

const projectionWebGPUFromVR = mat4.fromValues(
    1, 0, 0, 0,
    0, -1, 0, 0,
    0, 0, -0.5, 0,
    0, 0, 0.5, 1
);

// Converts a projection matrix from OpenGL-style Z range [-1, 1] to D3D-style Z range [0, 1]
function projectionMatrixWebGPUFromWebGL(m: mat4): mat4 {
    const result = mat4.clone(m);
    mat4.mul(result, projectionWebGPUFromVR, result);
    return result;
}

export class VRCamera extends Camera {
    _worldTransform: WorldTransformation;

    constructor(device: GPUDevice, wordTransform: WorldTransformation) {
        super(device, 0, 0);

        this._projectionType = ProjectionType.Custom;
        
        this._worldTransform = wordTransform;
        this.updateCPU(0);
    }

    public update(projectionMatrix: mat4, cameraMatrix: mat4, position: DOMPointReadOnly): void {
        console.assert(position.w === 1);
        this._version++;
        this._projectionMatrix = projectionMatrixWebGPUFromWebGL(projectionMatrix);

        const INITIAL_CAMERA_POS = vec3.fromValues(0, 0, 4);
        const INITIAL_CAMERA_POS_MAT = mat4.translate(mat4.create(), 
            mat4.identity(mat4.create()), vec3.negate(vec3.create(), INITIAL_CAMERA_POS));

        const worldMatrix = this._worldTransform.matrix;
        const movedWorldMatrix = mat4.mul(mat4.create(), INITIAL_CAMERA_POS_MAT, worldMatrix);
        
        const cameraPos = vec3.fromValues(position.x, position.y, position.z);
        //vec3.add(cameraPos, cameraPos, INITIAL_CAMERA_POS);

        mat4.mul(this._viewMatrix, cameraMatrix, movedWorldMatrix);
        vec3.transformMat4(this._position, cameraPos, mat4.invert(mat4.create(), movedWorldMatrix));
        
        super.updateCPU(0);
    }
}
