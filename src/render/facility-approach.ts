import * as THREE from 'three';
import { hash01 } from '../core/rng.ts';
import type { FacilityKit } from './facility-kit.ts';
import { createRockParts, ROCK_KINDS } from './rock-geometry.ts';
import { createRockMaterial } from './rock-material.ts';
import { climberInstance, createClimberAtlas, createClimberMaterial, createClimberMesh } from './face-climbers.ts';
import type { ClimberInstance, ClimberVariant } from './face-climbers.ts';
import { BLOCK_BACK_Z, BLOCK_FRONT_Z } from './tile-geometry.ts';
import { FORTRESS_BLACKHOLE, FORTRESS_CHASM, FORTRESS_PLATEAU } from '../config/facility-structure.ts';
import { createFortressCoolant } from './facility-coolant.ts';
import { createFortressBlackhole } from './facility-blackhole.ts';

/** Old stonework gives way to reinforced decks on the same standing surfaces. */
export function createFortressApproach(k: FacilityKit) {
  const root = new THREE.Group();
  root.name = 'fortress-stone-approach';
  k.root.add(root);
  const resources: Array<{ dispose(): void }> = [];
  const time: THREE.IUniform<number> = { value: 0 };
  const stone = createRockMaterial();
  stone.color.set(0x7d9096);
  stone.roughness = 0.94;
  resources.push(stone);
  const parts = createRockParts();
  const selected = ['graniteA', 'graniteB'] as const;
  const geometries = selected.map((kind) => parts[ROCK_KINDS.indexOf(kind)]!);
  for (const geometry of parts) if (!geometries.includes(geometry)) geometry.dispose();
  for (const geometry of geometries) {
    geometry.computeBoundingBox();
    const bounds = geometry.boundingBox!;
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.scale(1 / size.x, 1 / size.y, 1 / size.z);
    resources.push(geometry);
  }
  const matrices: THREE.Matrix4[][] = [[], []];
  const pose = new THREE.Object3D();
  let index = 0;
  const rock = (x: number, y: number, z: number, w: number, h: number, d: number, angle = 0): void => {
    pose.position.set(x, y, z);
    pose.scale.set(w, h, d);
    pose.rotation.set(0, 0, angle);
    pose.updateMatrix();
    matrices[index++ % 2]!.push(pose.matrix.clone());
  };
  const plants: ClimberInstance[] = [];
  const foliage = (variant: ClimberVariant, x: number, y: number, z: number, scale: number): void => {
    const seed = plants.length;
    plants.push(climberInstance(variant, x, y, z, scale, (n) => hash01(seed, n, 429), 0.58, 0.9));
  };
  const graphite = k.material(0x263e48, 0.35);
  const concrete = k.material(0x72868c, 0.08);
  const edge = k.material(0x759da6, 0.5);
  const seamLight = k.material(0x95c8d0, 0.1, 0x577f88);
  seamLight.emissiveIntensity = 0.7;
  seamLight.userData.noPrecip = true;
  const depth = BLOCK_FRONT_Z - BLOCK_BACK_Z;
  const deckZ = (BLOCK_FRONT_Z + BLOCK_BACK_Z) / 2;
  const front = BLOCK_FRONT_Z + 0.08;

  // Repairs start at the cliff edge; the older cliff and moss remain exposed to the left.
  k.box(51, 19.77, deckZ, 6, 0.46, depth, concrete);
  k.box(51, 19.58, 0.76, 6, 0.24, 0.48, graphite);
  k.box(51, 19.92, front, 6, 0.16, 0.12, edge);
  k.box(50.8, 16.9, 0.65, 0.34, 4.4, 0.18, graphite);
  for (const y of [15.1, 18.7]) k.box(50.8, y, 0.78, 0.62, 0.42, 0.14, concrete);
  k.box(53.6, 10.1, 1.25, 0.65, 18.8, 0.5, concrete);
  for (const y of [3, 8, 13, 18]) k.box(53.6, y, 1.54, 0.32, 0.12, 0.1, graphite);
  k.box(51, 19.87, front + 0.08, 5.4, 0.08, 0.06, seamLight);
  for (const x of [39.5, 44.3, 47.5]) foliage('hang2', x, 19.85, BLOCK_FRONT_Z + 0.04, 0.72);
  foliage('hang1', 49.1, 19.78, front + 0.07, 0.48);
  // The flight-only plateau keeps the same overgrown cliff face as the old approach.
  for (const x of [3.5, 8.2, 13.4]) foliage('hang2', x, FORTRESS_PLATEAU.top - 0.15, BLOCK_FRONT_Z + 0.04, 0.72);

  // Masonry, then metal-capped stone, then concrete: the material transition follows the route.
  for (const [left, right, height] of [[29, 33, 7], [41, 47, 3.2], [49, 53, 1.8]] as const) {
    const rows = Math.ceil(height / 1.3);
    const count = Math.ceil((right - left) / 1.9);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < count; col++) {
        const x = left + (col + 0.5) * (right - left) / count;
        rock(x, 20.6 + row * 1.25, -4.1, (right - left) / count - 0.08, 1.2, 1.1,
          row === rows - 1 ? (hash01(col, row, 83) - 0.5) * 0.12 : 0);
      }
    }
    for (let x = left + 0.5; x < right; x += 1.8) foliage('mat1', x, 20 + rows * 1.25, -3.45, left < 48 ? 0.8 : 0.4);
  }
  for (const [x, height] of [[30.6, 11], [50.5, 4.3]] as const) {
    for (let y = 20.6; y < 20 + height; y += 1.2) rock(x, y, -3.2, 1.8, 1.14, 1.5);
    rock(x, 20 + height, -3.2, 2.2, 0.5, 1.9);
    foliage('hang2', x - 0.65, 20 + height, -2.36, x < 32 ? 0.85 : 0.45);
  }
  k.box(51, 22.52, -4.1, 4.2, 0.14, 1.25, edge);
  k.box(50.98, 22.15, -2.33, 0.16, 3.5, 0.16, graphite);
  for (const [left, right] of [[73, 77], [81, 86]] as const) {
    const x = (left + right) / 2;
    k.box(x, 20.9, -3.4, right - left, 1.8, 1, concrete);
    k.box(x, 20.9, -2.84, right - left - 0.35, 1.2, 0.12, graphite);
    k.box(x, 21.84, -3.4, right - left + 0.2, 0.15, 1.2, edge);
    k.box(x, 21.42, -2.74, right - left - 0.6, 0.055, 0.06, seamLight);
  }
  const beacon = k.material(0xc6b189, 0.1, 0xb5a07c);
  beacon.emissiveIntensity = 0.95;
  for (const x of [50.5, 72.5, 85]) {
    if (x > FORTRESS_CHASM.right) {
      k.box(x, 22.3, -3.2, 1.7, 4.6, 1.6, concrete);
      k.box(x, 22.45, -2.34, 1.15, 3.55, 0.14, graphite);
    }
    k.box(x, 24.67, -3.2, 2.1, 0.25, 1.9, graphite);
    k.box(x, 24.34, -2.18, 0.8, 0.4, 0.14, beacon);
    k.box(x + 0.45, 22.2, -2.22, 0.08, 2.8, 0.1, seamLight);
    k.light(x, 24.3, -1.8, 0xd8e6e1, 80, 13);
  }

  const deck = (left: number, right: number, y: number): void => {
    const x = (left + right) / 2;
    const width = right - left;
    k.box(x, y - 0.13, deckZ, width, 0.26, depth, concrete);
    k.box(x, y - 0.5, deckZ, width, 0.48, depth - 0.12, graphite);
    k.box(x, y - 0.15, front, width, 0.14, 0.12, edge);
    k.box(x, y - 0.14, front + 0.08, width - 0.5, 0.055, 0.04, seamLight);
    for (const px of [left + 0.38, right - 0.38]) {
      k.box(px, y - 0.49, front, 0.24, 0.38, 0.12, edge);
      k.box(px, y - 0.08, front + 0.09, 0.12, 0.12, 0.05, k.yellow);
    }
  };
  for (const [left, right, y] of FORTRESS_CHASM.steppingStones) deck(left, right, y);
  const [stoneLeft, stoneRight, stoneY] = FORTRESS_CHASM.steppingStones[0];
  rock((stoneLeft + stoneRight) / 2, stoneY - 0.65, deckZ, stoneRight - stoneLeft - 0.15, 1, depth);
  foliage('hang1', stoneRight - 0.5, stoneY - 0.2, front + 0.04, 0.45);
  deck(FORTRESS_CHASM.right, 88, 20);
  for (const x of [71.4, 79, 86.6]) {
    k.box(x, 11.1, -2.5, 0.55, 16.8, 0.7, graphite);
    k.box(x, 3, -2.5, 1.8, 1, 1.4, concrete);
  }
  k.box(79, 18.8, -2.5, 18, 0.5, 0.7, edge);
  for (const [left, right] of [[71.4, 79], [79, 86.6]] as const) {
    k.beam([left, 5, -2.5], [right, 18.4, -2.5], 0.42, graphite);
    k.beam([left, 18.4, -2.5], [right, 5, -2.5], 0.26, edge);
  }

  geometries.forEach((geometry, kind) => {
    const batch = matrices[kind]!;
    const mesh = new THREE.InstancedMesh(geometry, stone, batch.length);
    batch.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    resources.push(mesh);
  });
  const atlas = createClimberAtlas('ground');
  const leafMaterial = createClimberMaterial(time);
  const leaves = createClimberMesh('ground', plants, atlas, leafMaterial, 'fortress-rock-crevice-plants')!;
  atlas.dispose();
  root.add(leaves);
  resources.push(leaves, leaves.geometry, leafMaterial);
  const blackhole = createFortressBlackhole();
  root.add(blackhole.root);
  k.light(FORTRESS_BLACKHOLE.position.x, 28, -1.4, 0xc8e4ef, 85, 18);
  const coolant = createFortressCoolant(k);
  return {
    update(value: number): void { time.value = value; blackhole.update(value); coolant.update(value); },
    dispose(): void {
      blackhole.dispose();
      coolant.dispose();
      root.removeFromParent();
      for (const resource of resources) resource.dispose();
    },
  };
}
