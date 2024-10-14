import { GridTextureSize } from "./signedDistanceGrid";

export const signedDistanceGridFromPoints = () => {
    return /* wgsl */`

fn opSmoothUnion(d1: f32, d2: f32, k: f32) -> f32 {
    //let h = clamp( 0.5 + 0.5*(d2-d1)/k, 0.0, 1.0 );

    let h = max( k - abs(d1 - d2), 0.0 ) / k;
    return min(d1, d2) - h * h * k * (1.0 / 4.0);
    //return mix( d2, d1, h ) - k*h*(1.0-h); 
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
};

@group(0) @binding(0) var<storage, read> points: array<vec4<f32>>;
@group(0) @binding(1) var grid: texture_storage_3d<r32float, write>;
@group(0) @binding(2) var<storage, read> delimiters: array<u32>;
@group(0) @binding(3) var<storage, read> radii: array<f32>;
@group(0) @binding(4) var<uniform> globals: GlobalsStruct;

@compute @workgroup_size(4, 4, 4) fn main(@builtin(global_invocation_id) GlobalInvocationID: vec3<u32>) {
    let positionNDC = (1.0 / ${GridTextureSize}) * vec3<f32>(GlobalInvocationID.xyz % ${GridTextureSize}) + vec3<f32>(1.0 / ${2 * GridTextureSize});
    let p = 2.0 * (positionNDC - vec3<f32>(0.5)); // [-1, 1]

    let begin = GlobalInvocationID.z / ${GridTextureSize};
    let scale = points[delimiters[begin]].w;
    let radius = radii[begin] / scale;
    let smoothing = 0.1;

    var sdf = sdSphere(p, points[delimiters[begin]].xyz, radius) * scale;
    for(var i: u32 = delimiters[begin]; i < delimiters[begin + 1] - 1; i++) {
        let p1 = points[i].xyz;
        let p2 = points[i + 1].xyz;

        let sdf2 = sdCapsule(p, p1, p2, radius) * scale;
        sdf = opSmoothUnion(sdf, sdf2, smoothing);
    }
    var sdFinal = sdSphere(p, points[delimiters[begin + 1] - 1].xyz, radius) * scale;
    sdf = opSmoothUnion(sdf, sdFinal, smoothing);

    textureStore(grid, GlobalInvocationID, vec4<f32>(sdf / scale));   
}
`};

export const signedDistanceGridFromArbitraryPoints = () => {
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

// @group(0) @binding(0) var<uniform> globals: GlobalsStruct;
@group(0) @binding(0) var<storage, read> points: array<vec4<f32>>;
@group(0) @binding(1) var grid: texture_storage_3d<r32float, write>;
@group(0) @binding(2) var<storage, read> delimiters: array<u32>;

@compute @workgroup_size(4, 4, 4) fn main(@builtin(global_invocation_id) GlobalInvocationID: vec3<u32>) {
  let positionNDC = (1.0 / ${GridTextureSize}) * vec3<f32>(GlobalInvocationID.xyz) + vec3<f32>(1.0 / ${2 * GridTextureSize});
  let p = 2.0 * (positionNDC - vec3<f32>(0.5)); // [-1, 1]

  let radius = points[0].w;
  var first = true;
  var sdf = 0.0;
  
  for(var d: u32 = 0; d < arrayLength(&delimiters) - 1; d++) {
    let start = delimiters[d];
    let end = delimiters[d + 1];
    
    if (end - start == 1) {
      let sdf1 = sdSphere(p, points[start].xyz, radius);
      if (first) {
        first = false;
        sdf = sdf1;
      } else {
        sdf = opSmoothUnion(sdf, sdf1, 0.1);
      }
    } else {
      for(var i: u32 = start; i < end - 1; i++) {
        let p1 = points[i].xyz;
        let p2 = points[i + 1].xyz;

        let sdf2 = sdCapsule(p, p1, p2, radius);
        if (first) {
          first = false;
          sdf = sdf2;
        } else {
          sdf = opSmoothUnion(sdf, sdf2, 0.1);
        }
      }
    }
  }

  textureStore(grid, GlobalInvocationID, vec4<f32>(sdf));   
}
`};