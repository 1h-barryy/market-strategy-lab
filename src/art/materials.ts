import * as THREE from 'three';
import { palette } from '../world/shared/palette';
import { art } from './palette';

/** Matte, non-metallic surface (sandbox `matte`). Environment uses roughness 0.91, structure 0.78. */
export function matte(color: THREE.ColorRepresentation, roughness = 0.78): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

/** Self-lit data material (sandbox `luminous`): emission in the data's own color, picked up by bloom. */
export function luminous(color: THREE.ColorRepresentation, intensity = 2.4): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.6, metalness: 0 });
}

/** Per-instance glow attribute read by `luminousInstanced`. */
export const GLOW_ATTRIBUTE = 'instanceGlow';

/** Adds a per-instance glow attribute (all `initial`) to an instanced mesh's own geometry. */
export function addGlowAttribute(geometry: THREE.BufferGeometry, capacity: number, initial = 0): THREE.InstancedBufferAttribute {
  const attribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(initial), 1);
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute(GLOW_ATTRIBUTE, attribute);
  return attribute;
}

/**
 * `luminous` for instanced meshes whose instances have different colors: the emission takes each
 * instance's color (instanceColor) times its glow attribute, so moving data can glow while landed
 * data stays matte in the same draw call.
 */
export function luminousInstanced(roughness = 0.6): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1, roughness, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float ${GLOW_ATTRIBUTE};\nvarying float vGlow;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvGlow = ${GLOW_ATTRIBUTE};`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor.rgb * vGlow;\n#else\ntotalEmissiveRadiance *= vGlow;\n#endif',
      );
  };
  material.customProgramCacheKey = () => 'luminous-instanced';
  return material;
}

/** Trail material (sandbox trail: vertex colors fading out, not tone mapped, 0.8 opacity). */
export function trailMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false });
}

/** Contact pulse ring material (sandbox: basic, 0.56 opacity while a ball touches a peg). */
export function pulseMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.56, depthWrite: false });
}

/** The instrument's material set (sandbox `materials`). One set per build so disposal stays local. */
export function instrumentMaterials() {
  return {
    ceramic: matte(art.ceramic),
    sage: matte(art.sage),
    graphite: matte(art.graphite),
    feet: matte(art.feet),
    peg: matte(art.peg, 0.64),
    ink: new THREE.MeshBasicMaterial({ color: art.ink, transparent: true, opacity: 0.6 }),
    rear: new THREE.MeshStandardMaterial({ color: art.rearGuide, roughness: 0.76, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }),
    front: new THREE.MeshPhysicalMaterial({ color: art.frontGuard, roughness: 0.48, transparent: true, opacity: 0.075, depthWrite: false, side: THREE.DoubleSide, metalness: 0 }),
    source: luminous(palette.neutral, 1.7),
  };
}

export type InstrumentMaterials = ReturnType<typeof instrumentMaterials>;
