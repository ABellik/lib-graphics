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

@group(0) @binding(0) var<uniform> camera: Camera;

struct VertexOutput {
    @builtin(position) Position : vec4<f32>,
    @location(0) textureCoordinates : vec2<f32>,
};
  
@vertex
fn main_vertex(@builtin(vertex_index) vertexIndex : u32) -> VertexOutput {
    let x: u32 = u32(vertexIndex + 1) % u32(2);
    let y: u32 = 1 - (vertexIndex / u32(2));

    let position: vec4<f32> = vec4<f32>(f32(x), f32(y), 0.0, 1.0);
    let texture_coord: vec2<f32> = vec2<f32>(f32(x), f32(y));

    return VertexOutput(camera.projectionView * position, texture_coord);
}  
  

struct FragmentOutput {
    @location(0) color: vec4<f32>,
};

@fragment
fn main_fragment(@builtin(position) Position : vec4<f32>, @location(0) textureCoordinates : vec2<f32>) -> FragmentOutput {
    return FragmentOutput(
        vec4<f32>(1.0, 0.0, 0.0, 1.0)
    );
}
`;