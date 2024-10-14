import { mat4, quat, vec3 } from "gl-matrix";
import { toRadian } from "./shared";

export class WordTransformation extends EventTarget {    
    private _rotation = quat.identity(quat.create());
    private _scale = 1.0;

    private _isDirty = true;
    private _matrix = mat4.create();
    private _matrixInv = mat4.create();
    

    public get rotation(): quat{
        return this._rotation;
    }

    public set rotation(value: quat){
        this._rotation = value;
        this._isDirty = true;
    }

    public get scale(): number{
        return this._scale;
    }

    public set scale(value: number){
        this._scale = value;
        this.changed();
    }
    
    public rotateDegX(angle: number){
        const rot = quat.fromValues(0, Math.sin(0.5 * toRadian(angle)),0, Math.cos(0.5 * toRadian(angle)));
        quat.multiply(this._rotation, rot, this._rotation);
        this.changed();
    }

    public rotateDegY(angle: number){
        const rot = quat.fromValues(Math.sin(0.5 * toRadian(angle)), 0, 0, Math.cos(0.5 * toRadian(angle)));
        quat.multiply(this._rotation, rot, this._rotation);
        this.changed();
    }

    private changed(){
        this._isDirty = true;
        this.dispatchEvent(new Event("changed"));
    }

    private updateDirty(){
        if(this._isDirty){
            const rotate = mat4.fromQuat(mat4.create(), this._rotation);
            mat4.scale(this._matrix, rotate, vec3.fromValues(this.scale, this.scale, this.scale));
            
            mat4.invert(this._matrixInv, this._matrix);
        }
        this._isDirty = false;
    }

    get matrix(): mat4{
        this.updateDirty();
        return this._matrix;
    }

    get matrixInv(): mat4{
        this.updateDirty();
        return this._matrixInv;
    }
}