import { VolumeTextureSize } from "./volume";

export const volumeFromPathlines = () => {
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
};

@group(0) @binding(0) var<uniform> globals: GlobalsStruct;
@group(0) @binding(1) var<storage, read> points: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> delimiters: array<u32>;
@group(0) @binding(3) var<storage, read> timestep_counts: array<u32>; // Amount of timesteps
@group(0) @binding(4) var<storage, read> point_counts: array<u32>; // Amount of points inside a timestep
@group(0) @binding(5) var<storage, read> radii: array<f32>; // Amount of points inside a timestep

@group(0) @binding(7) var<storage, read_write> arrayGrid: array<array<array<array<vec2<f32>, ${VolumeTextureSize}>, ${VolumeTextureSize}>, ${VolumeTextureSize}>>;

@compute @workgroup_size(4, 4, 4) fn main(@builtin(global_invocation_id) GlobalInvocationID: vec3<u32>) {
    let positionNDC = (1.0 / ${VolumeTextureSize}) * vec3<f32>(GlobalInvocationID.xyz % ${VolumeTextureSize}) + vec3<f32>(1.0 / ${2 * VolumeTextureSize});

    let p = 2.0 * (positionNDC - vec3<f32>(0.5)); // [-1, 1]

    let objectId = GlobalInvocationID.z / ${VolumeTextureSize};

    let timestepCount = timestep_counts[objectId];
    let pointCount = point_counts[objectId];
    let radius = radii[objectId] * globals.scale;

    var finalValue = 0.0;
    var lastTimestep: u32 = 0;
    var countTimesteps: u32 = 0;
    var lastSdf: f32 = 1.0;
    // Repeat for every timestep
    for(var step: u32 = 0; step < timestepCount; step++) {
        let factor = (1.0 / f32(timestepCount)) * f32(step);
        let invFactor = 1.0 - factor;

        var sdf = 1.0;
        if (pointCount > 1) {
            // Repeat for every point pair inside timestep
            for(var i: u32 = step * pointCount; i < step * pointCount + pointCount - 1; i++) {
                let p1 = points[delimiters[objectId] + i].xyz * globals.scale;
                let p2 = points[delimiters[objectId] + i + 1].xyz * globals.scale;
        
                let sdf2 = sdCapsule(p, p1, p2, radius);
                sdf = opSmoothUnion(sdf, sdf2, 0.1);
            }
        } else {
            let p1 = points[delimiters[objectId] + step].xyz * globals.scale;
            let sdf2 = sdSphere(p, p1, radius);
            sdf = opSmoothUnion(sdf, sdf2, 0.1);
        }

        if (sdf < 0.0) {
            lastTimestep = step;
            countTimesteps += 1;
        }

        if (sdf < 0.0 && lastSdf > 0.0) {
            finalValue = factor;
        }
        
        lastSdf = min(lastSdf, sdf);
    }

    arrayGrid[objectId][GlobalInvocationID.x][GlobalInvocationID.y][GlobalInvocationID.z % ${VolumeTextureSize}] = vec2<f32>(f32(lastTimestep) / f32(timestepCount), f32(countTimesteps) / f32(timestepCount));
}
`};


