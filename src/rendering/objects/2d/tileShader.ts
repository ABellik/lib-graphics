export const tileShader: string = /* wgsl */ `

struct Camera {
    projection: mat4x4<f32>,
    projectionInverse: mat4x4<f32>,
    view: mat4x4<f32>,
    viewInverse: mat4x4<f32>,
    projectionView: mat4x4<f32>,
    projectionViewInverse: mat4x4<f32>,
    normalMatrix: mat4x4<f32>,
    position: vec4<f32>,
    viewportSize: vec2<f32>,
};

struct Tile {
    model: mat4x4<f32>,
    model_inverse: mat4x4<f32>,
    color: vec4<f32>,
    mirror: f32,
    flip: f32,
    max_value: f32
};

@group(0) @binding(0) var<uniform> camera: Camera;
@group(1) @binding(0) var<uniform> tile: Tile;
@group(1) @binding(1) var texture: texture_2d<f32>;
@group(1) @binding(2) var texSampler: sampler;

struct VertexOutput {
    @builtin(position) Position : vec4<f32>,
    @location(0) textureCoordinates : vec2<f32>,
};
  
@vertex
fn main_vertex(@builtin(vertex_index) vertexIndex : u32) -> VertexOutput {
    var coords: vec2<u32> = vec2<u32>(u32(vertexIndex + 1) % u32(2), 1 - (vertexIndex / u32(2)));

    // Set the positions of the rectangle to be centered at 0,0 with edge size 1
    let position: vec4<f32> = vec4<f32>(f32(coords.x) - 0.5, f32(coords.y) - 0.5, 0.0, 1.0);
    if (tile.mirror == 1.0 && vertexIndex == 0) {
        coords = vec2<u32>(0, 0);
    }

    if (tile.flip == 1.0) {
        coords = vec2<u32>(1 - coords.y, 1 - coords.x);
    }
    let texture_coord: vec2<f32> = vec2<f32>(f32(coords.x), 1.0 - f32(coords.y));

    return VertexOutput(camera.projectionView * tile.model * position, texture_coord);
}  
  

struct FragmentOutput {
    @location(0) color: vec4<f32>,
};

@fragment
fn main_fragment(@builtin(position) Position : vec4<f32>, @location(0) textureCoordinates : vec2<f32>) -> FragmentOutput {
    let value: f32 = textureSample(texture, texSampler, textureCoordinates).r;
    if (value == -1.0) {
        discard;
    }

    var c_from: vec3<f32> = vec3<f32>(0, 0, 0);
    var c_to: vec3<f32> = vec3<f32>(0, 0, 0);
    var t: f32 = 0.0;

    let mval = min(0.1, value);
    if (mval > 0.01) {
        c_from = vec3<f32>(0.0, 0.0, 0.0);
        c_to = vec3<f32>(169.0 / 255.0, 3.0 / 255.0, 22.0 / 255.0);
        t = (mval - 0.01) / (0.1 - 0.01);
    } else {
        if (mval > 0.001) {
            c_from = vec3<f32>(169.0 / 255.0, 3.0 / 255.0, 22.0 / 255.0);
            c_to = vec3<f32>(245.0 / 255.0, 176.0 / 255.0, 54.0 / 255.0);
            t = (mval - 0.001) / (0.01 - 0.001);
        } else {
            c_from = vec3<f32>(245.0 / 255.0, 176.0 / 255.0, 54.0 / 255.0);
            c_to = vec3<f32>(1.0, 1.0, 1.0);
            t = mval;
        }
    }
    return FragmentOutput(
        vec4<f32>(mix(c_from, c_to, 1 - t), 1.0)
    );
}
`;