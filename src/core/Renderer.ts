import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { palette } from '../world/shared/palette';

/** One WebGL renderer plus a CSS2D layer for scene-anchored text labels. */
export class Renderer {
  readonly webgl: THREE.WebGLRenderer;
  private readonly labels = new CSS2DRenderer();
  private readonly observer: ResizeObserver;
  private readonly resizeHandlers = new Set<(width: number, height: number) => void>();
  width = 1;
  height = 1;

  constructor(private readonly container: HTMLElement, private readonly onContextLost: () => void) {
    this.webgl = new THREE.WebGLRenderer({ antialias: true });
    this.webgl.setClearColor(palette.background);
    this.webgl.domElement.setAttribute('role', 'img');
    this.webgl.domElement.setAttribute('aria-label', 'Galton board simulation');
    this.labels.domElement.className = 'scene-labels';
    container.append(this.webgl.domElement, this.labels.domElement);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(container);
    this.webgl.domElement.addEventListener('webglcontextlost', this.contextLost);
    this.resize();
  }

  get canvas(): HTMLCanvasElement {
    return this.webgl.domElement;
  }

  onResize(handler: (width: number, height: number) => void): () => void {
    this.resizeHandlers.add(handler);
    handler(this.width, this.height);
    return () => this.resizeHandlers.delete(handler);
  }

  setLoop(callback: ((time: number) => void) | null): void {
    this.webgl.setAnimationLoop(callback);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.webgl.render(scene, camera);
    this.labels.render(scene, camera);
  }

  private resize = (): void => {
    const { width, height } = this.container.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    this.width = width;
    this.height = height;
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.webgl.setSize(width, height);
    this.labels.setSize(width, height);
    for (const handler of this.resizeHandlers) handler(width, height);
  };

  private contextLost = (event: Event): void => {
    event.preventDefault();
    this.dispose();
    this.onContextLost();
  };

  dispose(): void {
    this.setLoop(null);
    this.observer.disconnect();
    this.resizeHandlers.clear();
    this.webgl.domElement.removeEventListener('webglcontextlost', this.contextLost);
    this.webgl.dispose();
    this.webgl.domElement.remove();
    this.labels.domElement.remove();
  }
}

/** Frees the geometries and materials of every mesh, line and point set under `root`. */
export function disposeObject(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points) {
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}
