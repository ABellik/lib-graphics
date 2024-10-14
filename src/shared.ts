/* eslint-disable @typescript-eslint/no-use-before-define */
import { vec3 } from "gl-matrix";

export class Ray {
    origin: vec3 = vec3.fromValues(0.0, 0.0, 0.0);
    minT = 0.0;
    direction: vec3 = vec3.fromValues(0.0, 0.0, 0.0);
    maxT = Number.MAX_VALUE;

    constructor(origin: vec3, direction: vec3) {
        this.origin = origin;
        this.direction = direction;
    }
}

export type BoundingBox = {
    min: vec3;
    max: vec3;
    center: vec3;
    primitive: number;
}

export function boundingBoxMakeCube(boundingBox: BoundingBox): BoundingBox {
    const max = vec3.sub(vec3.create(), boundingBox.max, boundingBox.center);
    const min = vec3.sub(vec3.create(), boundingBox.min, boundingBox.center);

    const bbSizeLengthsVec3 = vec3.sub(vec3.create(), max, min);
    const bbSizeLengths = [Math.abs(bbSizeLengthsVec3[0]), Math.abs(bbSizeLengthsVec3[1]), Math.abs(bbSizeLengthsVec3[2])];
    const maxLength = Math.max(...bbSizeLengths);

    const cube = boundingBoxEmpty();
    cube.min = vec3.fromValues(-maxLength, -maxLength, -maxLength);
    cube.max = vec3.fromValues(maxLength, maxLength, maxLength);
    cube.min = vec3.add(vec3.create(), cube.min, boundingBox.center);
    cube.max = vec3.add(vec3.create(), cube.max, boundingBox.center);

    boundingBoxCalculateCenter(cube);

    return cube;
}

export function normalizePointsByBoundingBox(boundingBox: BoundingBox, points: Array<vec3>): Array<vec3> {
    // let max = vec3.sub(vec3.create(), boundingBox.max, boundingBox.center);
    // let min = vec3.sub(vec3.create(), boundingBox.min, boundingBox.center);

    const bbSizeLengthsVec3 = vec3.sub(vec3.create(), boundingBox.max, boundingBox.min);
    const bbSizeLengths = [Math.abs(bbSizeLengthsVec3[0]), Math.abs(bbSizeLengthsVec3[1]), Math.abs(bbSizeLengthsVec3[2])];
    const maxLength = (1.0 / (Math.max(...bbSizeLengths) * 0.5));

    let normalizedPoints = points.map(p => vec3.sub(vec3.create(), p, boundingBox.center));
    normalizedPoints = normalizedPoints.map(p => vec3.scale(p, p, maxLength));

    return normalizedPoints;
}

//#region Constructors
export function boundingBoxNew(min: vec3, max: vec3, primitive = 0): BoundingBox {
    return {
        min,
        max,
        center: vec3.scale(vec3.create(), vec3.add(vec3.create(), max, min), 0.5),
        primitive,
    }
}

export function boundingBoxEmpty(): BoundingBox {
    return {
        min: vec3.fromValues(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE),
        max: vec3.fromValues(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE),
        center: vec3.create(),
        primitive: 0,
    }
}

export function boundingBoxFull(): BoundingBox {
    return {
        min: vec3.fromValues(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE),
        max: vec3.fromValues(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE),
        center: vec3.create(),
        primitive: 0,
    }
}

export function boundingBoxClone(boundingBox: BoundingBox): BoundingBox {
    return {
        min: vec3.clone(boundingBox.min),
        max: vec3.clone(boundingBox.max),
        center: vec3.clone(boundingBox.center),
        primitive: boundingBox.primitive,
    }

}

export function boundingBoxFromPoints(points: Array<vec3>): BoundingBox {
    const bb = boundingBoxEmpty();

    for(const p of points) {
        boundingBoxExtendByPoint(bb, p);
    }

    boundingBoxCalculateCenter(bb);

    return bb;
}

export function boundingCubeFromPoints(points: Array<vec3>): BoundingBox {
    const bb = boundingBoxFromPoints(points);

    return boundingBoxMakeCube(bb);
}
//#endregion

export function boundingBoxCalculateCenter(boundingBox: BoundingBox): void {
    boundingBox.center = vec3.scale(vec3.create(), vec3.add(vec3.create(), boundingBox.max, boundingBox.min), 0.5);
}

export function boundingBoxExtendByBox(boundingBox: BoundingBox, extendBy: BoundingBox): BoundingBox {
    boundingBox.min = vec3.min(boundingBox.min, boundingBox.min, extendBy.min);
    boundingBox.max = vec3.max(boundingBox.max, boundingBox.max, extendBy.max);

    boundingBoxCalculateCenter(boundingBox);

    return boundingBox;
}

export function boundingBoxExtendByPoint(boundingBox: BoundingBox, extendBy: vec3): BoundingBox {
    boundingBox.min = vec3.min(boundingBox.min, boundingBox.min, extendBy);
    boundingBox.max = vec3.max(boundingBox.max, boundingBox.max, extendBy);

    boundingBoxCalculateCenter(boundingBox);

    return boundingBox;
}

export function boundingBoxDiagonal(boundingBox: BoundingBox): vec3 {
    return vec3.subtract(vec3.create(), boundingBox.max, boundingBox.min);
}

export function boundingBoxHalfArea(boundingBox: BoundingBox): number {
    const d = boundingBoxDiagonal(boundingBox);

    return (d[0] + d[1]) * d[2] + d[0] * d[1];
}

export function boundingBoxLargestAxis(boundingBox: BoundingBox): number {
    const d = boundingBoxDiagonal(boundingBox);

    let axis = 0;

    if (d[0] < d[1]) {
        axis = 1;
    }
    if (d[axis] < d[2]) {
        axis = 2;
    }

    return axis;
}

export function boundingBoxIntersects(boundingBox: BoundingBox, ray: Ray): boolean {
    let tmin, tmax, tymin, tymax, tzmin, tzmax;

    const invdirx = ray.direction[0];
    const invdiry = ray.direction[1];
    const invdirz = ray.direction[2];

    const origin = ray.origin;

    if (invdirx >= 0) {

        tmin = (boundingBox.min[0] - origin[0]) * invdirx;
        tmax = (boundingBox.max[0] - origin[0]) * invdirx;

    } else {

        tmin = (boundingBox.max[0] - origin[0]) * invdirx;
        tmax = (boundingBox.min[0] - origin[0]) * invdirx;

    }

    if (invdiry >= 0) {

        tymin = (boundingBox.min[1] - origin[1]) * invdiry;
        tymax = (boundingBox.max[1] - origin[1]) * invdiry;

    } else {

        tymin = (boundingBox.max[1] - origin[1]) * invdiry;
        tymax = (boundingBox.min[1] - origin[1]) * invdiry;

    }

    if ((tmin > tymax) || (tymin > tmax)) {
        return false;
    }

    // These lines also handle the case where tmin or tmax is NaN
    // (result of 0 * Infinity). x !== x returns true if x is NaN

    if (tymin > tmin || tmin !== tmin) {
        tmin = tymin;
    }

    if (tymax < tmax || tmax !== tmax) {
        tmax = tymax;
    }

    if (invdirz >= 0) {

        tzmin = (boundingBox.min[2] - origin[2]) * invdirz;
        tzmax = (boundingBox.max[2] - origin[2]) * invdirz;

    } else {

        tzmin = (boundingBox.max[2] - origin[2]) * invdirz;
        tzmax = (boundingBox.min[2] - origin[2]) * invdirz;

    }

    if ((tmin > tzmax) || (tzmin > tmax)) {
        return false;
    }

    if (tzmin > tmin || tmin !== tmin) {
        tmin = tzmin;
    }

    if (tzmax < tmax || tmax !== tmax) {
        tmax = tzmax;
    }

    //return point closest to the ray (positive side)

    if (tmax < 0) {
        return false;
    }

    return true;
}
