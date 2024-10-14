import { cameraStruct, fragmentToRayFunction, rayTracingStructs, sphereToBoundingRectangleFunction } from "../shared";

export const parametricShaderTemplate = (
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
    },
    intersectionCalculation: string
) => {
    return /* wgsl */`
${cameraStruct}

@group(0) @binding(0) var<uniform> camera: Camera;

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
    @builtin(frag_depth) fragmentDepth : f32,
    @location(0) color: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) ao: vec2<f32>,
};

@fragment
fn main_fragment(vertexOuput: VertexOutput) -> FragmentOutput {
    let instanceIndex = vertexOuput.instanceIndex;

    // 1. Get Ray (predefined)
    let ray = fragmentSpaceToRay(vertexOuput.Position);

    // 2. Get Object
    ${getObject}

    // 3. Intersect (given function)
    ${intersectionCalculation}

    if (intersection.t < 0.0) {
        discard;
    }

    var depth: vec4<f32> = camera.projectionView * vec4<f32>(intersection.position, 1.0);
    depth = depth * (1.0 / depth.w);

    // 4. Get values & write them (renderPass asks for and decides!)
    ${propertyGetters.color}
    ${propertyGetters.normal}

    if (all(color == vec4<f32>(0.0))) {
        discard;
    }

    ${propertyGetters.ao}

    return FragmentOutput(
        depth.z,
        vec4<f32>(color.rgb, 1.0),
        vec4<f32>(normal.rgb, 1.0),
        ao
    );
}
`};
