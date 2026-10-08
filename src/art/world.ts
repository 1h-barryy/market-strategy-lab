import * as THREE from 'three';
import { BOARD_FRAME } from '../world/shared/layout';
import { addMesh, box, contactShadowTexture } from './geometry';
import { matte } from './materials';
import { ART_SCALE as S, art } from './palette';

/**
 * Environment, sky, fog and lighting ported from the sandbox's World (environment pass 03): a
 * stepped garden of matte terraces under the instrument, distant wall fragments, a gradient sky and
 * a soft gallery light rig, with an alternative "luminous dusk" preset.
 *
 * Environment surfaces are matte; warm/cool emission belongs to data only.
 */

/** Height of the floor every chapter stands on (board tray, terrain, table, pile). */
const FLOOR = BOARD_FRAME.binBottom - 0.15;
/** The top terrace sits just under the floor so flat terrain at floor level never z-fights with it. */
const BASE = FLOOR - 0.03;

/** Sandbox coordinates (instrument base at y = 0) → project scene. */
const at = (x: number, y: number, z: number): [number, number, number] => [x * S, BASE + y * S, z * S];
const size = (x: number, y: number, z: number): [number, number, number] => [x * S, y * S, z * S];

type PlanPoint = [number, number];

function terrace(parent: THREE.Object3D, outline: PlanPoint[], top: number, height: number, surface: THREE.Material, edge: THREE.Material, bevel = 0.09): THREE.Mesh {
  const shape = new THREE.Shape();
  outline.forEach(([x, z], i) => (i ? shape.lineTo(x * S, -z * S) : shape.moveTo(x * S, -z * S)));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: (height - bevel * 2) * S,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: bevel * S,
    bevelThickness: bevel * S,
    curveSegments: 1,
  });
  const mesh = addMesh(parent, geometry, [surface, edge]);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = BASE + (top - height + bevel) * S;
  return mesh;
}

/** Vertical gradient sky (screen-space background). */
function horizon(top: string, middle: string, bottom: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 512);
    gradient.addColorStop(0, top);
    gradient.addColorStop(0.14, middle);
    gradient.addColorStop(0.28, bottom);
    gradient.addColorStop(1, bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 8, 512);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export type LightingPreset = 'gallery' | 'dusk';

/**
 * Fog and the key light's shadow box follow the view, in proportion to the camera's distance from
 * what it looks at (the sandbox framed one object at ~18.6 units; chapters here frame 30–150).
 */
const VIEW_RATIOS = { fogNear: 1.4, fogFar: 4.4, shadowHalf: 0.9 } as const;
const KEY_DIRECTION = new THREE.Vector3(-8, 16, 10).normalize();

export class WorldArt {
  readonly group = new THREE.Group();
  private readonly hemi: THREE.HemisphereLight;
  private readonly key: THREE.DirectionalLight;
  private readonly fill: THREE.DirectionalLight;
  private readonly rim: THREE.DirectionalLight;
  private readonly mauveBounce: THREE.PointLight;
  private readonly sageBounce: THREE.PointLight;
  private readonly groundMaterial: THREE.MeshStandardMaterial;
  private readonly skies: Record<LightingPreset, THREE.CanvasTexture>;
  private readonly fog = new THREE.Fog(0x9fada4, 26, 82);
  private preset: LightingPreset = 'gallery';
  private readonly ray = new THREE.Ray();
  private readonly focus = new THREE.Vector3();
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -FLOOR);

  constructor(private readonly scene: THREE.Scene, private readonly renderer: THREE.WebGLRenderer) {
    this.group.name = 'Environment';
    scene.add(this.group);
    const environment = this.group;
    const ceramic = matte(art.ceramic, 0.91);
    const ceramicEdge = matte(art.ceramicEdge, 0.91);
    const sage = matte(art.sage, 0.91);
    const sageEdge = matte(art.sageEdge, 0.91);
    const lavender = matte(art.lavender, 0.91);
    const lavenderEdge = matte(art.lavenderEdge, 0.91);
    const mauve = matte(art.mauve, 0.91);
    const mauveEdge = matte(art.mauveEdge, 0.91);
    this.groundMaterial = matte(0x929d8e, 0.91);
    const ground = addMesh(environment, new THREE.PlaneGeometry(2400, 2400), this.groundMaterial, 0, BASE - 1.43 * S, 0);
    ground.rotation.x = -Math.PI / 2;
    ground.castShadow = false;

    // Three continuous levels; the top one meets the board's tray.
    terrace(environment, [[-6.35, 1.2], [-5.35, 2.3], [4.95, 2.3], [6.05, 1.1], [5.9, -2.0], [4.75, -2.95], [-4.9, -2.95], [-6.35, -1.55]], -0.005, 0.35, ceramic, ceramicEdge, 0.075);
    terrace(environment, [[-8.75, 2.65], [-7.35, 3.7], [6.1, 3.7], [7.95, 2.25], [7.6, -4.9], [5.75, -6.25], [-6.6, -6.25], [-8.75, -4.15]], -0.355, 0.45, sage, sageEdge, 0.11);
    terrace(environment, [[-10.4, 3.4], [-8.45, 4.95], [7.4, 4.95], [10.35, 2.45], [10.35, -10.9], [7.65, -13.45], [-6.25, -13.45], [-9.7, -11.25], [-10.4, -4.4]], -0.805, 0.625, lavender, lavenderEdge, 0.13);

    // The designed route along the east edge of the rear site.
    const path = [
      { x: 2.6, z: -3.35, y: -0.1, angle: -0.14 },
      { x: 2.95, z: -4.3, y: -0.22, angle: -0.28 },
      { x: 3.5, z: -5.25, y: -0.32, angle: -0.33 },
      { x: 4.05, z: -6.35, y: -0.47, angle: -0.22 },
      { x: 4.35, z: -7.53, y: -0.61, angle: -0.1 },
      { x: 4.47, z: -8.75, y: -0.72, angle: 0 },
      { x: 4.47, z: -10.02, y: -0.72, angle: 0 },
      { x: 4.47, z: -11.29, y: -0.72, angle: 0 },
    ];
    path.forEach(({ x, z, y, angle }, i) => {
      const bottom = i < 3 ? -0.405 : -0.855;
      const stone = box(environment, size(1.5, y - bottom, 1.05), at(x, (y + bottom) / 2, z), i % 3 === 1 ? mauve : ceramic, 0.055 * S);
      stone.rotation.y = angle;
    });

    // Low retaining architecture and a sitting ledge.
    box(environment, size(0.52, 0.53, 4.15), at(-9.0, -0.57, -7.5), mauve, 0.1 * S);
    box(environment, size(0.62, 0.09, 4.24), at(-9.0, -0.26, -7.5), ceramic, 0.035 * S);
    box(environment, size(2.5, 0.44, 0.8), at(7.85, -0.62, -3.75), mauveEdge, 0.1 * S);
    box(environment, size(2.65, 0.13, 0.92), at(7.85, -0.335, -3.75), ceramic, 0.045 * S);

    // Distant grounded wall fragments at the margins of the rear site.
    box(environment, size(5.4, 1.85, 0.62), at(-19.9, -0.505, -22.15), mauve, 0.13 * S);
    box(environment, size(0.62, 1.1, 2.65), at(-22.28, -0.88, -20.76), ceramic, 0.11 * S);
    box(environment, size(1.9, 0.48, 1.8), at(-18.1, -1.19, -20.58), sage, 0.09 * S);
    box(environment, size(0.63, 2.15, 4.3), at(13.95, -0.355, -20.0), ceramic, 0.13 * S);
    box(environment, size(3.75, 0.91, 0.62), at(12.37, -0.975, -21.83), lavender, 0.12 * S);
    box(environment, size(2.75, 0.4, 1.55), at(11.4, -1.23, -18.95), mauve, 0.08 * S);

    // Broad ambient grounding under the instrument and the wall fragments.
    const shadowTexture = contactShadowTexture();
    const contact = (x: number, z: number, width: number, depth: number, opacity: number, y = 0.003): void => {
      const material = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity, depthWrite: false });
      const shadow = addMesh(environment, new THREE.PlaneGeometry(width * S, depth * S), material, ...at(x, y, z));
      shadow.rotation.x = -Math.PI / 2;
      shadow.castShadow = shadow.receiveShadow = false;
    };
    contact(0, -0.1, 10.6, 4.0, 0.68);
    contact(-19.9, -21, 8.3, 6.0, 0.7, -1.418);
    contact(12.4, -20, 7.5, 7.0, 0.7, -1.418);

    this.skies = { gallery: horizon('#647680', '#879993', '#9fada4'), dusk: horizon('#29233b', '#555069', '#69667a') };

    this.hemi = new THREE.HemisphereLight(0xf0ece3, 0x685e76, 1.22);
    this.key = new THREE.DirectionalLight(0xffecd7, 2.1);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.normalBias = 0.028 * S;
    this.key.shadow.bias = -0.00012;
    this.key.shadow.radius = 3;
    this.fill = new THREE.DirectionalLight(0xe0e9d9, 0.7);
    this.fill.position.set(9, 8, 2);
    this.rim = new THREE.DirectionalLight(0xd2c3df, 1.25);
    this.rim.position.set(4, 9, -9);
    // Point lights keep their sandbox look at 1.3× the distance: range × S, intensity × S².
    this.mauveBounce = new THREE.PointLight(0xdfcddd, 10 * S * S, 22 * S, 2);
    this.mauveBounce.position.set(...at(-7, 5, -5));
    this.sageBounce = new THREE.PointLight(0xb9d0c4, 8 * S * S, 22 * S, 2);
    this.sageBounce.position.set(...at(8, 5, -7));
    scene.add(this.hemi, this.key, this.key.target, this.fill, this.rim, this.mauveBounce, this.sageBounce);
    scene.fog = this.fog;
    this.setLighting(lightingFromUrl());
  }

  get lighting(): LightingPreset {
    return this.preset;
  }

  /** The sandbox's two atmospheres. Visual only. */
  setLighting(preset: LightingPreset): void {
    const dusk = preset === 'dusk';
    this.preset = preset;
    this.scene.background = this.skies[preset];
    this.fog.color.set(dusk ? 0x69667a : 0x9fada4);
    this.groundMaterial.color.set(dusk ? 0x757788 : 0x929d8e);
    this.hemi.color.set(dusk ? 0xbab1cf : 0xf0ece3);
    this.hemi.groundColor.set(dusk ? 0x50435f : 0x685e76);
    this.hemi.intensity = dusk ? 0.85 : 1.05;
    this.key.intensity = dusk ? 1.45 : 2.1;
    this.key.color.set(dusk ? 0xf0d8dc : 0xffecd7);
    this.fill.intensity = dusk ? 0.95 : 0.7;
    this.fill.color.set(dusk ? 0xc4b8e3 : 0xe0e9d9);
    this.rim.intensity = dusk ? 1.9 : 1.25;
    this.rim.color.set(dusk ? 0xc8ded1 : 0xd2c3df);
    this.mauveBounce.intensity = (dusk ? 28 : 10) * S * S;
    this.sageBounce.intensity = (dusk ? 25 : 8) * S * S;
    this.renderer.toneMappingExposure = dusk ? 0.92 : 0.98;
  }

  /** Keeps fog and the shadow box in proportion to the current view. Call once per frame. */
  update(camera: THREE.Camera): void {
    camera.getWorldPosition(this.ray.origin);
    camera.getWorldDirection(this.ray.direction);
    // What the camera looks at: where its view meets the floor, or (looking level) the point on its
    // view line nearest the board.
    if (!this.ray.intersectPlane(this.floorPlane, this.focus) || this.focus.distanceTo(this.ray.origin) > 600) {
      this.ray.closestPointToPoint(new THREE.Vector3(0, FLOOR, 0), this.focus);
    }
    const distance = Math.max(10, this.focus.distanceTo(this.ray.origin));
    this.fog.near = distance * VIEW_RATIOS.fogNear;
    this.fog.far = distance * VIEW_RATIOS.fogFar;

    const half = distance * VIEW_RATIOS.shadowHalf;
    const shadow = this.key.shadow.camera;
    if (shadow.right !== half) {
      shadow.left = shadow.bottom = -half;
      shadow.right = shadow.top = half;
      shadow.near = 0.5;
      shadow.far = half * 5;
      shadow.updateProjectionMatrix();
    }
    this.key.target.position.copy(this.focus);
    this.key.position.copy(this.focus).addScaledVector(KEY_DIRECTION, half * 2.5);
  }

  dispose(): void {
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          (material as THREE.MeshBasicMaterial).map?.dispose();
          material.dispose();
        }
      }
    });
    Object.values(this.skies).forEach((texture) => texture.dispose());
    this.key.shadow.dispose();
    this.scene.remove(this.group, this.hemi, this.key, this.key.target, this.fill, this.rim, this.mauveBounce, this.sageBounce);
    if (this.scene.fog === this.fog) this.scene.fog = null;
    if (this.scene.background && Object.values(this.skies).includes(this.scene.background as THREE.CanvasTexture)) this.scene.background = null;
  }
}

/** `?light=dusk` selects the sandbox's alternative atmosphere; the default is its soft gallery. */
function lightingFromUrl(): LightingPreset {
  try {
    return new URLSearchParams(window.location.search).get('light') === 'dusk' ? 'dusk' : 'gallery';
  } catch {
    return 'gallery';
  }
}
