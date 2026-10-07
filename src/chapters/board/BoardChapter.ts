import * as THREE from 'three';
import { disposeObject } from '../../core/Renderer';
import type { Chapter, ChapterContext } from '../types';

/** Chapter 1 — The Board. Backbone stub: scene and camera only. */
export class BoardChapter implements Chapter {
  readonly id = 'board';
  readonly title = 'Chapter 1 · The Board';
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  private context!: ChapterContext;
  private unsubscribe: Array<() => void> = [];

  async load(context: ChapterContext): Promise<void> {
    this.context = context;
    this.camera.position.set(0, 0, 30);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 2));
  }

  enter(): void {
    this.context.hud.setTitle(this.title);
    this.unsubscribe.push(this.context.renderer.onResize((w, h) => {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }));
  }

  update(): void {}

  exit(): void {
    this.unsubscribe.forEach((off) => off());
    this.unsubscribe = [];
  }

  dispose(): void {
    disposeObject(this.scene);
  }
}
