import * as THREE from 'three';
import { createLab } from './assets/lab';

export class World {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  private readonly observer: ResizeObserver;
  private readonly core: THREE.Mesh;
  private readonly motion = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(private readonly container: HTMLElement, private readonly onError: () => void) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setClearColor(0x0b121c);
    this.renderer.domElement.setAttribute('aria-label', 'Decorative market core above a graphite test platform; no financial data displayed.');
    this.renderer.domElement.setAttribute('role', 'img');
    container.append(this.renderer.domElement);
    this.camera.position.set(8, 7, 10);
    this.camera.lookAt(0, 0.5, 0);
    this.scene.add(new THREE.HemisphereLight(0xc9e7ff, 0x141b29, 2));
    const key = new THREE.DirectionalLight(0xe4efff, 3);
    key.position.set(3, 7, 4);
    this.scene.add(key);
    const light = new THREE.PointLight(0x4b9cdd, 8, 7);
    light.position.set(0, 2, 0);
    this.scene.add(light);
    const lab = createLab();
    this.scene.add(lab.group);
    this.core = lab.core;
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(container);
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextLost);
    this.motion.addEventListener('change', this.updateAnimation);
    document.addEventListener('visibilitychange', this.updateAnimation);
    this.resize();
    this.updateAnimation();
  }

  private resize = (): void => {
    const { width, height } = this.container.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.render(this.scene, this.camera);
  };

  private updateAnimation = (): void => {
    this.renderer.setAnimationLoop(this.motion.matches || document.hidden ? null : this.animate);
    if (!document.hidden) this.renderer.render(this.scene, this.camera);
  };

  private animate = (time: number): void => {
    this.core.rotation.y = time * 0.00012;
    this.core.scale.setScalar(1 + Math.sin(time * 0.001) * 0.025);
    this.renderer.render(this.scene, this.camera);
  };

  private contextLost = (event: Event): void => {
    event.preventDefault();
    this.dispose();
    this.onError();
  };

  dispose(): void {
    this.renderer.setAnimationLoop(null);
    this.observer.disconnect();
    this.motion.removeEventListener('change', this.updateAnimation);
    document.removeEventListener('visibilitychange', this.updateAnimation);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextLost);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      }
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
