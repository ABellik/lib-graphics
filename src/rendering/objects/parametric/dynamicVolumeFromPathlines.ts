import { DynamicVolumeTextureSize } from "./dynamicVolume";

export const dynamicVolumeFromPathlines = () => {
    return /* wgsl */`


fn opSmoothUnion(d1: f32, d2: f32, k: f32) -> f32 {
    let h = clamp( 0.5 + 0.5*(d2-d1)/k, 0.0, 1.0 );

    return mix( d2, d1, h ) - k*h*(1.0-h); 
}

fn sdCapsule(p: vec3<f32>, a: vec3<f32>, b: vec3<f32>, r: f32 ) -> f32
{
  let pa = p - a;
  let ba = b - a;

  let h = clamp( dot(pa,ba) / dot(ba,ba), 0.0, 1.0 );

  return length( pa - ba*h ) - r;
}

fn sdSphere(p: vec3<f32>, c: vec3<f32>, s: f32 ) -> f32
{
  return distance(p, c) - s;
}

struct GlobalsStruct {
    radius: f32,
    scale: f32,
    steps: u32,
    sizeOfStep: u32,
};

@group(0) @binding(0) var<uniform> globals: GlobalsStruct;
@group(0) @binding(1) var<storage, read> points: array<vec4<f32>>;

@group(0) @binding(2) var<storage, read_write> lastTimestepGrid: array<array<array<f32, ${DynamicVolumeTextureSize}>, ${DynamicVolumeTextureSize}>, ${DynamicVolumeTextureSize}>;
@group(0) @binding(3) var<storage, read_write> numberTimestepsGrid: array<array<array<f32, ${DynamicVolumeTextureSize}>, ${DynamicVolumeTextureSize}>, ${DynamicVolumeTextureSize}>;

@compute @workgroup_size(4, 4, 4) fn main(@builtin(global_invocation_id) GlobalInvocationID: vec3<u32>) {
    let positionNDC: vec3<f32> = (1.0 / ${DynamicVolumeTextureSize}) * vec3<f32>(GlobalInvocationID.xyz) + vec3<f32>(1.0 / ${2 * DynamicVolumeTextureSize});
    let p = 2.0 * (positionNDC - vec3<f32>(0.5)); // [-1, 1]

    let scale = globals.scale;
    let radius = globals.radius / scale;
    let smoothing = 0.01;

    var lastTimestep: u32 = 0;
    var countTimesteps: u32 = 0;
    // Repeat for every timestep
    for(var step: u32 = 0; step < globals.steps; step++) {
        var sdf = sdSphere(p, points[step * globals.sizeOfStep].xyz, radius) * scale;
        if (globals.sizeOfStep > 1) {
            // Repeat for every point pair inside timestep
            for(var i: u32 = step * globals.sizeOfStep; i < step * globals.sizeOfStep + globals.sizeOfStep - 1; i++) {
                let p1 = points[i].xyz;
                let p2 = points[i + 1].xyz;
        
                let sdf2 = sdCapsule(p, p1, p2, radius) * scale;
                sdf = opSmoothUnion(sdf, sdf2, smoothing);
            }
            var sdFinal = sdSphere(p, points[step * globals.sizeOfStep + globals.sizeOfStep - 1].xyz, radius) * scale;
            sdf = opSmoothUnion(sdf, sdFinal, smoothing);
        }
        
        if (sdf < 0.0) {
            lastTimestep = step;
            countTimesteps += 1;
        }
    }

    lastTimestepGrid[GlobalInvocationID.x][GlobalInvocationID.y][GlobalInvocationID.z] = f32(lastTimestep) / f32(globals.steps);
    numberTimestepsGrid[GlobalInvocationID.x][GlobalInvocationID.y][GlobalInvocationID.z] = f32(countTimesteps) / f32(globals.steps);
}
`};


