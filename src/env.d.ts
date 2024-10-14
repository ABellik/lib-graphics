/// <reference types="vite/client" />
/// <reference types="@webgpu/types" />
declare module "restructure";

declare module "*?raw" {
  const content: string;
  export default content;
}