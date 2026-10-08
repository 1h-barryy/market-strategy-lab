import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/** Sandbox bloom: strength, radius, threshold. The threshold is above 1, so only emissive data blooms. */
export const BLOOM = { strength: 0.42, radius: 0.4, threshold: 1.05 } as const;

/** Renderer settings from the sandbox: soft shadows, sRGB output, ACES filmic tone mapping. */
export function configureRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
}

/**
 * The sandbox's post chain: scene → bloom → output (tone mapping + sRGB). One composer for the
 * whole app; the scene and camera are set per frame so every chapter shares it.
 */
export class PostProcessing {
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  readonly bloom: UnrealBloomPass;

  constructor(renderer: THREE.WebGLRenderer) {
    // A multisampled HDR target keeps the canvas's antialiasing, which a plain composer target loses.
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.Camera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM.strength, BLOOM.radius, BLOOM.threshold);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.composer.render();
  }

  dispose(): void {
    this.bloom.dispose();
    this.composer.dispose();
  }
}
