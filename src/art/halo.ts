import * as THREE from 'three';
import { HALO } from './palette';

/**
 * Soft glow around moving data particles, in each particle's own color. The core keeps a modest
 * emission so its hue survives tone mapping; the glow comes from this light shell, which is
 * brightest just outside the core and open in the middle, so it never washes the core out.
 */
function haloMaterial(): THREE.ShaderMaterial {
  // Where the core's silhouette sits on the shell, as the shell's facing ratio: √(1 − (1/scale)²).
  const coreEdge = Math.sqrt(1 - 1 / (HALO.scale * HALO.scale));
  return new THREE.ShaderMaterial({
    uniforms: { strength: { value: HALO.strength }, coreEdge: { value: coreEdge } },
    vertexShader: /* glsl */ `
      varying vec3 vTint;
      varying float vFacing;
      void main() {
        mat4 model = modelMatrix * instanceMatrix;
        vec4 world = model * vec4(position, 1.0);
        vec3 n = normalize(mat3(model) * normal);
        vFacing = abs(dot(n, normalize(cameraPosition - world.xyz)));
        vTint = instanceColor;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float strength;
      uniform float coreEdge;
      varying vec3 vTint;
      varying float vFacing;
      void main() {
        float glow = pow(vFacing, 2.0) * (1.0 - smoothstep(coreEdge - 0.08, coreEdge, vFacing));
        gl_FragColor = vec4(vTint * strength * glow, 1.0);
      }
    `,
    transparent: true,
    // Max, not additive: where balls overlap (they share pegs) the halos don't stack up to white.
    blending: THREE.CustomBlending,
    blendEquation: THREE.MaxEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    depthWrite: false,
  });
}

/** One instanced halo per visible particle, rewritten every frame (begin → add… → end). */
export class ParticleHalos {
  readonly mesh: THREE.InstancedMesh;
  private count = 0;
  private readonly matrix = new THREE.Matrix4();

  constructor(private readonly capacity: number) {
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), haloMaterial(), capacity);
    // Created up front so the shader always has per-instance colors.
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.name = 'ParticleHalos';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  begin(): void {
    this.count = 0;
  }

  /** A halo around a particle of `radius` at `position`. */
  add(position: THREE.Vector3, radius: number, color: THREE.Color): void {
    if (this.count >= this.capacity) return;
    const r = radius * HALO.scale;
    this.mesh.setMatrixAt(this.count, this.matrix.makeScale(r, r, r).setPosition(position));
    this.mesh.setColorAt(this.count++, color);
  }

  end(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
    this.mesh.removeFromParent();
  }
}
