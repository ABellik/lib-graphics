import { Camera3D, OrbitCamera, SmoothCamera } from "../cameras/index";
import { Scene } from "../scene";
import { GraphicsLibrary } from "..";

export abstract class Viewport {
  protected graphicsLibrary: GraphicsLibrary;

  protected width = 0;
  protected height = 0;

  protected _scene: Scene | null;
  protected _camera: Camera3D | null = null;

  //#region Options
  public clearColor: GPUColorDict = { r: 0.0, g: 0.0, b: 0.0, a: 1.0 };
  //#endregion

  protected _lastFrametime = 0;
  protected _outputTexture: GPUTexture | null = null;

  //#region Dirty Tracking
  // Dirty is set to false at the end of a frame
  // Dirty is set to true when:
  // - resize is called
  // - backgroundColor is modified
  // - outside source calls dirty (for example because camera was modified)
  public dirty = true;

  protected _frameID: number = 0;
  protected _cameraVersionUsed: number = 0;
  protected _sceneVersionUsed: number = 0;
  //#endregion Dirty Tracking

  //#region Modules
  //#endregion Modules

  constructor(
    graphicsLibrary: GraphicsLibrary,
    scene: Scene | null = null,
    camera: Camera3D | null = null) {
    this.graphicsLibrary = graphicsLibrary;

    this._camera = camera ?? new OrbitCamera(this.graphicsLibrary.device, this.width, this.height);
    this._scene = scene ?? graphicsLibrary.createScene();
  }

  public deallocate(): void {
    this._scene?.deallocate();

    this.width = 0;
    this.height = 0;

    this._camera = null;
    this._scene = null;
  }

  public resize(width: number, height: number): void {
    // const devicePixelRatio = window.devicePixelRatio || 1.0;

    this.width = width;
    this.height = height;

    // const size = {
    //   width: this.width,
    //   height: this.height,
    // };

    if (width <= 0 || height <= 0) {
      return;
    }

    if (this._camera) {
      this._camera.width = this.width;
      this._camera.height = this.height;
    }

    this.dirty = true;
  }

  async render(textureView: GPUTextureView, frametime: number): Promise<void> {
    const device = this.graphicsLibrary.device;

    // Compute Delta Time
    const dt = frametime - this._lastFrametime;
    this._lastFrametime = frametime;

    if (this._camera === null || this._scene === null) {
      return;
    }

    if (this._camera instanceof SmoothCamera) {
      this._camera.updateCPU(dt);
    }

    this.dirty = this.dirty
      || this._scene.version > this._sceneVersionUsed
      || this._camera.version > this._cameraVersionUsed;

    if (this.dirty) {
      this._frameID = 0;
    } else {
      this._frameID += 1;
    }

    this._camera.updateGPU(device.queue);
    this._scene.uploadModified(device.queue);

    this._sceneVersionUsed = this._scene.version;
    this._cameraVersionUsed = this._camera.version;

    // Fill in derived viewport
  }

  public set scene(scene: Scene | null) {
    this._scene = scene;
  }

  public get scene(): Scene | null {
    return this._scene;
  }

  public set camera(camera: Camera3D | null) {
    if (camera === this._camera) {
      return;
    }

    if (camera === null) {
      this._camera = null;
      return;
    }

    this._camera = camera;
    this._cameraVersionUsed = 0;
  }

  public get camera(): Camera3D | null {
    return this._camera;
  }
}
