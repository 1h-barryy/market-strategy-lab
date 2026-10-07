import * as THREE from 'three';
import { palette } from '../../world/shared/palette';
import { BoardMapping, FRAME } from './mapping';

/** Static board: backplate, instanced pegs, instanced bin walls and floor. Rebuilt when n changes. */
export function createBoard(mapping: BoardMapping): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Board';
  const matte = new THREE.MeshStandardMaterial({ color: palette.board, roughness: 0.9, metalness: 0 });
  const pegMaterial = new THREE.MeshStandardMaterial({ color: palette.peg, roughness: 0.7, metalness: 0 });
  const { n, dx } = mapping;

  const height = FRAME.dropHeight - FRAME.binBottom + 1;
  const back = new THREE.Mesh(new THREE.BoxGeometry(FRAME.width + 0.8, height, 0.2), matte);
  back.position.set(0, FRAME.binBottom - 0.5 + height / 2, -0.5);
  back.name = 'Backplate';
  group.add(back);

  const pegCount = (n * (n + 1)) / 2;
  // Spheres read as pegs from any angle; cylinders looked like tilted rods off-axis.
  const pegGeometry = new THREE.SphereGeometry(mapping.pegRadius, 12, 8);
  const pegs = new THREE.InstancedMesh(pegGeometry, pegMaterial, pegCount);
  pegs.name = 'Pegs';
  const matrix = new THREE.Matrix4();
  let i = 0;
  for (let row = 0; row < n; row++) {
    for (let j = 0; j <= row; j++) {
      const { x, y } = mapping.peg(row, j);
      pegs.setMatrixAt(i++, matrix.makeTranslation(x, y, 0));
    }
  }
  group.add(pegs);

  const wallHeight = FRAME.binTop - FRAME.binBottom;
  const walls = new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, wallHeight, 0.6), pegMaterial, n + 2);
  walls.name = 'BinWalls';
  for (let k = 0; k <= n + 1; k++) {
    walls.setMatrixAt(k, matrix.makeTranslation(mapping.binX(k) - dx / 2, FRAME.binBottom + wallHeight / 2, 0));
  }
  group.add(walls);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(FRAME.width + 0.8, 0.15, 0.8), matte);
  floor.position.set(0, FRAME.binBottom - 0.075, 0);
  floor.name = 'Floor';
  group.add(floor);
  return group;
}
