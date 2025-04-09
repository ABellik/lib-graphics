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
};

@group(0) @binding(0) var<uniform> camera: Camera;
@group(1) @binding(0) var<uniform> tile: Tile;

struct VertexOutput {
    @builtin(position) Position : vec4<f32>,
    @location(0) textureCoordinates : vec2<f32>,
};
  
@vertex
fn main_vertex(@builtin(vertex_index) vertexIndex : u32) -> VertexOutput {
    let x: u32 = u32(vertexIndex + 1) % u32(2);
    let y: u32 = 1 - (vertexIndex / u32(2));

    // Set the positions of the rectangle to be centered at 0,0 with edge size 1
    let position: vec4<f32> = vec4<f32>(f32(x) - 0.5, f32(y) - 0.5, 0.0, 1.0);
    let texture_coord: vec2<f32> = vec2<f32>(f32(x), f32(y));

    return VertexOutput(camera.projectionView * tile.model * position, texture_coord);
}  
  

struct FragmentOutput {
    @location(0) color: vec4<f32>,
};

@fragment
fn main_fragment(@builtin(position) Position : vec4<f32>, @location(0) textureCoordinates : vec2<f32>) -> FragmentOutput {
    let color = tile.color;
    return FragmentOutput(
        color
    );
}
`;