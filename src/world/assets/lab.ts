import * as THREE from 'three';

export function createLab(): { group: THREE.Group; core: THREE.Mesh } {
  const group = new THREE.Group();
  group.name = 'LabRoot';
  const graphite = new THREE.MeshStandardMaterial({ color: 0x202c39, metalness: 0.65, roughness: 0.48 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.9, 0.35, 64), graphite);
  base.name = 'Base';
  group.add(base);
  const dock = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, 0.22, 64), graphite);
  dock.position.y = 0.28;
  dock.name = 'CoreDock';
  group.add(dock);
  const accent = new THREE.MeshBasicMaterial({ color: 0x5d9bc3 });
  for (const radius of [1.25, 3.45]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.012, 8, 100), accent);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.19;
    ring.name = 'PlatformRing';
    group.add(ring);
  }
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.62, 2),
    new THREE.MeshStandardMaterial({ color: 0xa8d9ef, emissive: 0x3179ad, emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.25, flatShading: true }),
  );
  core.name = 'LaunchCore';
  core.position.y = 1.5;
  group.add(core);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.014, 8, 100), accent);
  halo.position.y = 1.5;
  halo.rotation.x = Math.PI / 2.6;
  halo.name = 'CoreHalo';
  group.add(halo);
  return { group, core };
}
