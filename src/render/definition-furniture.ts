import * as THREE from 'three';
import type { SolarMounting, SolarVariant } from '../config/building-kit.ts';
import { createBuildingKit, type BuildingKitView } from './building-kit.ts';

export type FurnitureKind = 'bed' | 'pendant' | 'workstation' | 'depot' | 'dock' | 'battery'
  | 'terminal-compute' | 'terminal-robot' | 'solar' | 'table' | 'chair' | 'shelf' | 'plant';

export interface FurnitureView {
  readonly root: THREE.Group;
  update?: BuildingKitView['update'];
  dispose(): void;
}

/** 左下角为 XY 锚点；深1占 Z=[-0.5, 0.5]，深0.5后靠占 Z=[-0.5, 0]。 */
export function createDefinitionFurniture(kind: FurnitureKind, depth: 1 | 0.5 = 1,
  solarVariant: SolarVariant = 'level', solarMounting: SolarMounting = 'center'): FurnitureView {
  if (kind === 'solar') return createBuildingKit('solar', solarVariant, solarMounting);
  const root = new THREE.Group();
  root.name = `furniture-${kind}`;
  const box = new THREE.BoxGeometry(1, 1, 1);
  const sphere = new THREE.SphereGeometry(1, 12, 8);
  const materials: THREE.Material[] = [];
  const material = (color: number, emissive = 0): THREE.MeshStandardMaterial => {
    const value = new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.5, metalness: 0.22 });
    materials.push(value);
    return value;
  };
  const ivory = material(0xe7e0cf);
  const metal = material(0x274c77);
  const dark = material(0x182c3b);
  const wood = material(0x9a704b);
  const accent = material(kind === 'terminal-robot' ? 0xe6a346 : 0x5bc9d7);
  const glow = material(kind === 'terminal-robot' ? 0x754c14 : 0x163d50,
    kind === 'terminal-robot' ? 0xffb544 : 0x46d3ef);
  const part = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z = 0,
    geometry: THREE.BufferGeometry = box): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, m);
    mesh.scale.set(w, h, d * depth);
    mesh.position.set(x, y, z * depth + (depth - 1) / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };
  const legs = (width: number, height: number): void => {
    for (const x of [0.12, width - 0.12]) for (const z of [-0.38, 0.38]) part(metal, 0.14, height, 0.14, x, height / 2, z);
  };
  const cabinet = (width: number): void => {
    part(dark, width, 0.14, 1, width / 2, 0.07);
    part(ivory, width - 0.08, 1.72, 0.9, width / 2, 1, -0.03);
    part(metal, width, 0.14, 1, width / 2, 1.93);
    for (const x of [0.08, width - 0.08]) part(metal, 0.16, 1.72, 1, x, 1);
  };

  if (kind === 'bed') {
    legs(3, 0.35);
    part(wood, 3, 0.2, 1, 1.5, 0.4);
    part(ivory, 2.7, 0.28, 0.94, 1.55, 0.64);
    part(metal, 0.14, 0.8, 1, 0.07, 0.6);
    part(metal, 0.12, 0.52, 1, 2.94, 0.4);
    part(accent, 1.72, 0.08, 0.95, 1.91, 0.81);
    part(ivory, 0.55, 0.16, 0.72, 0.57, 0.86);
  } else if (kind === 'pendant') {
    part(metal, 0.28, 0.08, 0.28, 0.5, 0.96);
    part(dark, 0.06, 0.54, 0.06, 0.5, 0.65);
    part(metal, 0.65, 0.12, 0.65, 0.5, 0.4);
    part(ivory, 1, 0.18, 1, 0.5, 0.25);
    part(glow, 0.88, 0.16, 0.88, 0.5, 0.08);
  } else if (kind === 'workstation') {
    legs(2, 0.85);
    part(ivory, 2, 0.14, 1, 1, 0.92);
    part(metal, 0.64, 0.76, 0.8, 1.57, 0.46);
    for (const y of [0.35, 0.5, 0.65]) part(dark, 0.4, 0.055, 0.025, 1.57, y, 0.415);
    part(metal, 0.14, 0.31, 0.14, 1, 1.12, -0.2);
    part(dark, 1.56, 0.72, 0.14, 1, 1.64, -0.2);
    part(glow, 1.4, 0.54, 0.025, 1, 1.65, -0.115).name = 'workstation-screen';
    part(accent, 0.85, 0.04, 0.26, 0.78, 1.01, 0.27);
    for (const y of [1.54, 1.66, 1.78]) part(ivory, 0.62, 0.025, 0.01, 0.73, y, -0.096);
  } else if (kind === 'depot') {
    cabinet(2);
    for (const x of [0.56, 1.44]) {
      part(wood, 0.78, 1.56, 0.055, x, 1, 0.448);
      part(dark, 0.04, 0.32, 0.03, x + (x < 1 ? 0.25 : -0.25), 1, 0.485);
      for (const y of [0.45, 1.55]) part(metal, 0.78, 0.07, 0.025, x, y, 0.48);
    }
  } else if (kind === 'dock') {
    part(dark, 3, 0.16, 1, 1.5, 0.08);
    for (const x of [0.1, 2.9]) part(metal, 0.2, 1.7, 0.2, x, 0.99, -0.36);
    part(ivory, 3, 0.18, 0.44, 1.5, 1.91, -0.28);
    for (const x of [0.78, 2.22]) {
      part(accent, 0.96, 0.02, 0.7, x, 0.17);
      part(dark, 0.7, 0.03, 0.46, x, 0.195);
      part(glow, 0.15, 0.12, 0.035, x, 1.91, -0.045);
      part(metal, 0.22, 0.5, 0.15, x, 0.43, -0.38);
    }
  } else if (kind === 'battery') {
    cabinet(1);
    part(dark, 0.62, 1.5, 0.025, 0.5, 1, 0.435);
    const charge = part(material(0x43d18b, 0x269851), 0.38, 1.4, 0.025, 0.5, 1, 0.465);
    charge.name = 'battery-charge';
    for (const y of [0.58, 0.86, 1.14, 1.42]) part(dark, 0.44, 0.025, 0.02, 0.5, y, 0.485);
  } else if (kind === 'terminal-compute' || kind === 'terminal-robot') {
    part(metal, 1, 0.12, 1, 0.5, 0.06);
    part(ivory, 0.48, 1.05, 0.42, 0.5, 0.645, -0.1);
    part(metal, 1, 0.85, 0.22, 0.5, 1.575, -0.1);
    part(glow, 0.82, 0.66, 0.035, 0.5, 1.575, 0.0275);
    part(accent, 0.82, 0.07, 0.72, 0.5, 1.13, 0.08);
    if (kind === 'terminal-compute') {
      part(ivory, 0.26, 0.26, 0.025, 0.5, 1.61, 0.06);
      for (const x of [0.3, 0.7]) for (const y of [1.52, 1.61, 1.7]) part(ivory, 0.11, 0.025, 0.025, x, y, 0.06);
    } else {
      part(ivory, 0.48, 0.29, 0.025, 0.5, 1.6, 0.06);
      for (const x of [0.38, 0.62]) part(dark, 0.075, 0.075, 0.025, x, 1.62, 0.085);
      part(ivory, 0.035, 0.12, 0.025, 0.5, 1.8, 0.06);
    }
  } else if (kind === 'table') {
    legs(3, 1.06);
    part(wood, 3, 0.14, 1, 1.5, 1.13);
    part(metal, 2.78, 0.15, 0.7, 1.5, 0.94);
  } else if (kind === 'chair') {
    legs(1, 0.56);
    part(wood, 1, 0.14, 1, 0.5, 0.63);
    for (const x of [0.1, 0.9]) part(metal, 0.12, 1.3, 0.12, x, 1.35, -0.4);
    part(wood, 1, 0.64, 0.16, 0.5, 1.65, -0.4);
  } else if (kind === 'shelf') {
    for (const x of [0.08, 1.92]) part(metal, 0.16, 2, 1, x, 1);
    for (const y of [0.07, 0.69, 1.31, 1.93]) part(wood, 1.68, 0.14, 1, 1, y);
    for (const x of [0.43, 0.95]) part(ivory, 0.38, 0.38, 0.62, x, 0.33, 0.06);
    for (const x of [0.36, 0.53, 0.7, 0.87]) part(accent, 0.12, 0.4, 0.5, x, 0.96);
    part(wood, 0.6, 0.3, 0.64, 1.36, 1.53);
  } else if (kind === 'plant') {
    part(ivory, 0.7, 0.48, 0.7, 0.5, 0.24);
    part(metal, 0.8, 0.1, 0.8, 0.5, 0.49);
    part(wood, 0.08, 1.4, 0.08, 0.5, 1.24);
    const leaf = material(0x518f66);
    for (const [x, y, z, sx, sy, sz] of [
      [0.28, 0.95, 0, 0.28, 0.19, 0.36], [0.7, 1.25, 0, 0.3, 0.22, 0.4],
      [0.32, 1.55, 0.05, 0.3, 0.23, 0.4], [0.55, 1.78, 0, 0.23, 0.22, 0.3],
    ] as const) part(leaf, sx, sy, sz, x, y, z, sphere);
  }
  return { root, dispose() {
    root.removeFromParent();
    box.dispose();
    sphere.dispose();
    for (const value of materials) value.dispose();
  } };
}
