import { cameraStruct, fragmentToRayFunction, rayTracingStructs, sphereToBoundingRectangleFunction } from "../shared";

export const volumeShaderTemplate = (
    name: string,
    typeName: string,
    globals: string,
    getObject: string,
    getBoundingRectangleVertexFunction: string,
    rayIntersectionFunction: string,
    propertyGetters: {
        color: string,
        normal: string,
        ao: string,
    }
) => {
    return /* wgsl */`
${cameraStruct}

@group(0) @binding(0) var<uniform> camera: Camera;
@group(2) @binding(0) var depthTexture: texture_depth_2d;

${rayTracingStructs}

${fragmentToRayFunction}
${sphereToBoundingRectangleFunction}

${globals}

${rayIntersectionFunction}

struct VertexOutput {
    @builtin(position) Position: vec4<f32>,
    @location(0) @interpolate(flat) instanceIndex: u32,
};

@vertex
fn main_vertex(
    @builtin(vertex_index) vertexIndex: u32, 
    @builtin(instance_index) instanceIndex: u32) 
-> VertexOutput {
    ${getObject}
    ${getBoundingRectangleVertexFunction}

    return VertexOutput(
        vec4<f32>(boundingRectangleVertex.xy, 0.5, 1.0),
        instanceIndex,
    );
}

struct FragmentOutput {
    @location(0) color: vec4<f32>,
};

@fragment
fn main_fragment(vertexOuput: VertexOutput) -> FragmentOutput {
    let instanceIndex = vertexOuput.instanceIndex;

    // 1. Get Ray (predefined)
    let ray = fragmentSpaceToRay(vertexOuput.Position);

    // 2. Get Object
    ${getObject}

    // 3. Intersect (given function)
    // var intersection = ray${typeName}Intersection(ray, ${name});

    // if (intersection.t < 0.0) {
    //     discard;
    // }

    // 4. Get values & write them (renderPass asks for and decides!)
    ${propertyGetters.color}

    // if (all(color == vec4<f32>(0.0))) {
    //     discard;
    // }

    return FragmentOutput(
        vec4<f32>(color),
    );
}
`};
