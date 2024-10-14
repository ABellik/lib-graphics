import { OrbitCamera } from "./orbit";
import { RegularCamera } from "./regular";
import { SmoothCamera } from "./smooth";
import { VRCamera } from "./vrCamera";

export * from "./regular";
export * from "./shared";
export * from "./orbit";
export * from "./ortho_2d";
export * from "./smooth";
export * from "./vrCamera";
export * from "./wordTransform";

export type Camera3D = OrbitCamera | SmoothCamera | RegularCamera | VRCamera;