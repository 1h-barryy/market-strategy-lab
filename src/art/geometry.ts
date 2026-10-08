import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { art } from './palette';

/** Mesh that casts and receives shadows (sandbox `addMesh`). */
export function addMesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Rounded box (sandbox `box`): soft bevels on every solid. */
export function roundedBox(size: readonly [number, number, number], bevel = 0.035): THREE.BufferGeometry {
  return new RoundedBoxGeometry(size[0], size[1], size[2], 2, Math.min(bevel, ...size.map((n) => n / 3)));
}

export function box(parent: THREE.Object3D, size: readonly [number, number, number], position: readonly [number, number, number], material: THREE.Material, bevel = 0.035): THREE.Mesh {
  return addMesh(parent, roundedBox(size, bevel), material, ...position);
}

/** Cylinder between two points (sandbox `rod`). */
export function rod(parent: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material): THREE.Mesh {
  const d = new THREE.Vector3().subVectors(b, a);
  const mesh = addMesh(parent, new THREE.CylinderGeometry(radius, radius, d.length(), 10), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return mesh;
}

/** Text printed on a physical surface (sandbox `label`): canvas texture on a plane, no external fonts. */
export function printedLabel(parent: THREE.Object3D, text: string, x: number, y: number, z: number, width: number, height: number, color: string = art.labelInk): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable for printed labels.');
  ctx.font = '500 94px monospace';
  canvas.width = Math.ceil(ctx.measureText(text).width + 22);
  ctx.font = '500 94px monospace';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, 65);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false });
  const mesh = addMesh(parent, new THREE.PlaneGeometry(width, height), material, x, y, z);
  mesh.castShadow = mesh.receiveShadow = false;
  return mesh;
}

/** Soft radial contact-shadow texture (sandbox World: broad ambient grounding). */
export function contactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    gradient.addColorStop(0, 'rgba(28,30,37,.44)');
    gradient.addColorStop(0.42, 'rgba(28,30,37,.20)');
    gradient.addColorStop(1, 'rgba(28,30,37,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(canvas);
}
