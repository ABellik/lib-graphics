import { vec2, vec3, vec4 } from "gl-matrix"
import { Camera } from "./cameras/shared"
import { Ray } from "./shared"

const isValidHex = (hex: string) => /^#([A-Fa-f0-9]{3,4}){1,2}$/.test(hex)

const getChunksFromString = (st: string, chunkSize: number) => st.match(new RegExp(`.{${chunkSize}}`, "g"))

const convertHexUnitTo256 = (hexStr: string) => parseInt(hexStr.repeat(2 / hexStr.length), 16)

export function hexToRGBA(hex: string, alpha: number | null = null): GPUColorDict {
    if (!isValidHex(hex)) { 
        throw new Error("Invalid HEX") 
    }
    const chunkSize = Math.floor((hex.length - 1) / 3);
    const hexArr = getChunksFromString(hex.slice(1), chunkSize);

    if (!hexArr) {
        throw new Error("Invalid HEX") 
    }

    const [r, g, b, a] = hexArr.map(convertHexUnitTo256);

    return {
        r, g, b, a: alpha ?? (a ?? 255)
    }
}

export function hexToRGBAUnit(hex: string, alpha: number): GPUColorDict {
    const color = hexToRGBA(hex, alpha)
    return {
        r: color.r / 255.0,
        g: color.g / 255.0,
        b: color.b / 255.0,
        a: alpha,
    }
}

/// screenSpacePosition should contain values between 0 and 1
export function screenSpaceToRay(screenSpacePosition: vec2, camera: Camera): Ray {

    const normalizedSpacePosition = vec4.fromValues(
      (screenSpacePosition[0]) * 2.0 - 1.0,
      (1.0 - (screenSpacePosition[1])) * 2.0 - 1.0,
      0.0,
      1.0
    );

    const viewSpacePosition = vec4.transformMat4(vec4.create(), normalizedSpacePosition, camera.projectionMatrixInverse);
    viewSpacePosition[2] = -1.0;
    viewSpacePosition[3] = 1.0;

    const worldSpacePosition = vec4.transformMat4(vec4.create(), viewSpacePosition, camera.viewMatrixInverse);

    const rayDirection = vec4.sub(vec4.create(), worldSpacePosition, vec4.fromValues(
      camera.position[0],
      camera.position[1],
      camera.position[2],
      1.0
    ));
    vec4.normalize(rayDirection, rayDirection);

    return new Ray(
      camera.position,
      vec3.fromValues(rayDirection[0], rayDirection[1], rayDirection[2])
    );
  }