import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BUILDING_KIT } from '../config/building-kit.ts';
import { BLOCK_BACK_Z, BLOCK_FRONT_Z } from './tile-geometry.ts';
import type { BuildingKitKind, BuildingKitVariant, SolarMounting } from '../config/building-kit.ts';

export interface BuildingKitView {
  readonly root: THREE.Group;
  update(time: number, solarAngle?: number): void;
  dispose(): void;
}

/** 游戏设施与资源展示共用同一套几何、材质和局部坐标。 */
export function createBuildingKit(kind: BuildingKitKind, variant: BuildingKitVariant,
  mounting: SolarMounting = 'center'): BuildingKitView {
  const root = new THREE.Group();
  root.name = `building-${kind}-${variant}`;
  const geometries = new Map<string, THREE.BufferGeometry>();
  const materials: THREE.Material[] = [];
  const standard = (color: number, metalness: number, roughness: number, emissive = 0): THREE.MeshStandardMaterial => {
    const material = new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive });
    materials.push(material);
    return material;
  };
  const ivory = standard(0xf2e8d8, 0.22, 0.36);
  const cobalt = standard(0x17458b, 0.5, 0.3);
  const seam = standard(0x182b44, 0.55, 0.4);
  const silver = standard(0x97aaba, 0.8, 0.3);
  const glass = standard(0x092964, 0.6, 0.2);
  const cyan = standard(0x53ddef, 0.15, 0.28, 0x208baf);
  const amber = standard(0xffdf9c, 0.2, 0.4, 0xc08b26);
  const cellLine = standard(0x90b9da, 0.65, 0.26);
  const part = (parent: THREE.Object3D, material: THREE.Material, w: number, h: number, d: number,
    x: number, y: number, z: number, radius = 0.018): THREE.Mesh => {
    const key = `${w},${h},${d},${radius}`;
    let geometry = geometries.get(key);
    if (!geometry) {
      geometry = new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 3, h / 3, d / 3));
      geometries.set(key, geometry);
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const cylinder = (parent: THREE.Object3D, material: THREE.Material, radius: number, depth: number,
    x: number, y: number, z: number): THREE.Mesh => {
    const key = `cylinder,${radius},${depth}`;
    let geometry = geometries.get(key);
    if (!geometry) {
      geometry = new THREE.CylinderGeometry(radius, radius, depth, 16);
      geometries.set(key, geometry);
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const screw = (parent: THREE.Object3D, x: number, y: number, z: number): void => {
    cylinder(parent, seam, 0.014, 0.008, x, y, z);
    part(parent, silver, 0.014, 0.003, 0.004, x, y, z + Math.sign(z) * 0.005, 0.001);
  };

  if (kind === 'block' || kind === 'wall') {
    const cells = kind === 'wall' && variant === 'patch' ? [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]]
      : kind === 'block' && variant === 'row' ? [[0, 0], [1, 0], [2, 0]]
      : kind === 'block' && variant === 'corner' ? [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]] : [[0, 0]];
    const depth = kind === 'block' && variant === 'full-depth' ? BLOCK_FRONT_Z - BLOCK_BACK_Z : BUILDING_KIT[kind].depth;
    const wall = kind === 'wall';
    for (const [x, y] of cells as [number, number][]) {
      const tile = new THREE.Group();
      tile.position.set(x, y, 0);
      root.add(tile);
      // 包边是独立边条，内芯退进封板后面，避免两个外表面共面闪烁。
      part(tile, seam, 0.92, 0.92, depth - 0.08, 0.5, 0.5, 0, 0.014);
      for (const side of [-1, 1]) {
        const edgeZ = side * (depth / 2 - 0.035);
        for (const edge of [0.035, 0.965]) {
          part(tile, cobalt, 0.86, 0.07, 0.07, 0.5, edge, edgeZ, 0.014);
          part(tile, cobalt, 0.07, 0.86, 0.07, edge, 0.5, edgeZ, 0.014);
          for (const other of [0.035, 0.965]) part(tile, cobalt, 0.07, 0.07, 0.07, edge, other, edgeZ, 0.014);
        }
        part(tile, seam, 0.88, 0.88, 0.018, 0.5, 0.5, side * (depth / 2 - 0.04), 0.008);
        part(tile, ivory, 0.852, 0.852, 0.026, 0.5, 0.5, side * (depth / 2 - 0.022), 0.01);
        for (const dx of [0.11, 0.89]) for (const dy of [0.11, 0.89]) screw(tile, dx, dy, side * (depth / 2 - 0.008));
      }
      if (!wall) {
        for (const dx of [0.035, 0.965]) for (const dy of [0.035, 0.965]) {
          part(tile, cobalt, 0.07, 0.07, depth - 0.14, dx, dy, 0, 0.014);
        }
        for (const side of [-1, 1]) {
          part(tile, ivory, 0.852, 0.022, depth - 0.148, 0.5, 0.5 + side * 0.48, 0, 0.009);
          part(tile, ivory, 0.022, 0.852, depth - 0.148, 0.5 + side * 0.48, 0.5, 0, 0.009);
        }
      }
    }
  }

  let membrane: THREE.MeshStandardMaterial | null = null;
  if (kind === 'door') {
    // 横版通行沿 X；门洞和屏障处于 YZ 平面，门柱不会随屏障消失。
    // 零件共用归一化 X 坐标，整体按门厚缩放以保持封板、内槽和屏障对齐。
    root.scale.x = BUILDING_KIT.door.width;
    if (variant === 'lintel-closed' || variant === 'lintel-open') {
      const { height, depth, lintelHeight } = BUILDING_KIT.door;
      root.scale.z = (BLOCK_FRONT_Z - BLOCK_BACK_Z) / depth;
      const y = height + lintelHeight / 2;
      part(root, seam, 0.94, lintelHeight - 0.07, depth - 0.06, 0.5, y - 0.035, 0);
      for (const side of [-1, 1]) {
        part(root, ivory, 0.025, lintelHeight - 0.12, depth - 0.14, 0.5 + side * 0.475, y, 0);
        part(root, cobalt, 1, lintelHeight - 0.07, 0.07, 0.5, y - 0.035, side * (depth / 2 - 0.035));
      }
      part(root, cobalt, 1, 0.07, depth, 0.5, height + lintelHeight - 0.035, 0);
    }
    for (const z of [-0.566, 0.566]) {
      part(root, cobalt, 0.96, 2.7, 0.22, 0.5, 1.5, z, 0.035);
      for (let row = 0; row < 3; row++) {
        const y = 0.64 + row * 0.86;
        part(root, seam, 0.83, 0.82, 0.025, 0.5, y, z + Math.sign(z) * 0.101);
        part(root, ivory, 0.78, 0.77, 0.024, 0.5, y, z + Math.sign(z) * 0.106);
        part(root, seam, 0.16, 0.31, 0.012, 0.5, y, z + Math.sign(z) * 0.123);
        part(root, cyan, 0.072, 0.23, 0.01, 0.5, y, z + Math.sign(z) * 0.129);
        for (const x of [0.18, 0.82]) screw(root, x, y + 0.29, z + Math.sign(z) * 0.124);
      }
      // 内槽包唇遮住能量膜的侧缘。
      for (const x of [0.445, 0.555]) part(root, silver, 0.04, 2.68, 0.038, x, 1.5, z - Math.sign(z) * 0.117, 0.005);
    }
    for (const y of [0.075, 2.895]) {
      const h = y < 1 ? 0.15 : 0.21;
      part(root, seam, 0.85, h - 0.04, 1.25, 0.5, y, 0, 0.012);
      for (const x of [0.0375, 0.9625]) part(root, cobalt, 0.075, h, 1.4, x, y, 0, 0.018);
      for (const side of [-1, 1]) {
        part(root, cobalt, 0.85, h, 0.065, 0.5, y, side * 0.65, 0.014);
        part(root, ivory, 0.78, h - 0.04, 0.016, 0.5, y, side * 0.69, 0.006);
        part(root, ivory, 0.84, 0.014, 1.23, 0.5, y + side * (h / 2 - 0.01), 0, 0.006);
      }
      for (const x of [0.445, 0.555]) part(root, silver, 0.04, 0.052, 0.94, x, y < 1 ? 0.137 : 2.798, 0, 0.006);
    }
    part(root, amber, 0.24, 0.012, 0.3, 0.5, 2.782, 0, 0.005);
    membrane = new THREE.MeshStandardMaterial({ color: 0x37bcf2, emissive: 0x118abc, emissiveIntensity: 0.65,
      transparent: true, opacity: 0.6, roughness: 0.3, metalness: 0.05, depthWrite: false });
    materials.push(membrane);
    const barrier = new THREE.Group();
    barrier.name = 'energy-screen';
    barrier.visible = variant === 'closed' || variant === 'lintel-closed';
    root.add(barrier);
    part(barrier, membrane, 0.024, 2.66, 0.944, 0.5, 1.467, 0, 0.008).castShadow = false;
    const hexagons: number[] = [];
    for (const x of [0.481, 0.519]) for (let row = 0; row < 15; row++) for (let col = 0; col < 4; col++) {
      const y = 0.29 + row * 0.165;
      const z = -0.33 + col * 0.19 + (row % 2) * 0.095;
      if (z + 0.096 > 0.44) continue;
      for (let edge = 0; edge < 6; edge++) {
        for (const angle of [edge * Math.PI / 3, (edge + 1) * Math.PI / 3]) {
          hexagons.push(x, y + Math.cos(angle) * 0.11, z + Math.sin(angle) * 0.11);
        }
      }
    }
    const hexGeometry = new THREE.BufferGeometry();
    hexGeometry.setAttribute('position', new THREE.Float32BufferAttribute(hexagons, 3));
    geometries.set('energy-hexagons', hexGeometry);
    const hexMaterial = new THREE.LineBasicMaterial({ color: 0x8cecff, transparent: true, opacity: 0.5, depthWrite: false });
    materials.push(hexMaterial);
    barrier.add(new THREE.LineSegments(hexGeometry, hexMaterial));
    for (const y of [0.157, 2.777]) part(barrier, cyan, 0.03, 0.014, 0.91, 0.5, y, 0, 0.003);
    for (const z of [-0.459, 0.459]) part(barrier, cyan, 0.03, 2.62, 0.014, 0.5, 1.467, z, 0.003);
  }

  let solarPivot: THREE.Group | null = null;
  if (kind === 'solar') {
    const { depth, tilt, pivotHeight, panelWidth, panelBottom, panelTop } = BUILDING_KIT.solar;
    const centerZ = mounting === 'inner' ? -0.5 : mounting === 'outer' ? 0.5 : 0;
    const footZ = centerZ * 0.6;
    part(root, cobalt, 0.44, 0.075, 0.38, 0.5, 0.0375, footZ, 0.025);
    part(root, ivory, 0.37, 0.035, 0.31, 0.5, 0.0825, footZ, 0.014);
    // 悬挑只移动板面，脚座始终落在中央实体格内。
    const support = part(root, seam, 0.105, Math.hypot(0.15, centerZ - footZ), mounting === 'center' ? 0.19 : 0.12,
      0.5, 0.173, (footZ + centerZ) / 2, 0.012);
    support.rotation.x = Math.atan2(centerZ - footZ, 0.15);
    for (const side of [-1, 1]) {
      const z = centerZ + side * 0.103;
      cylinder(root, ivory, 0.052, 0.033, 0.5, pivotHeight, z);
      cylinder(root, cobalt, 0.036, 0.037, 0.5, pivotHeight, z);
      cylinder(root, silver, 0.016, 0.041, 0.5, pivotHeight, z);
    }
    const panel = new THREE.Group();
    panel.name = 'solar-panel-pivot';
    panel.position.set(0.5, pivotHeight, centerZ);
    panel.rotation.z = variant === 'right' ? -tilt : variant === 'left' ? tilt : 0;
    solarPivot = panel;
    root.add(panel);
    part(panel, ivory, panelWidth, -panelBottom * 2, depth, 0, 0, 0, 0.021);
    part(panel, cobalt, 0.884, 0.016, depth - 0.056, 0, 0.026, 0, 0.009);
    for (let col = 0; col < 4; col++) for (const z of [-0.232, 0.232]) {
      const x = -0.324 + col * 0.216;
      part(panel, glass, 0.208, 0.012, 0.452, x, 0.035, z, 0.008);
      for (const dx of [-0.052, 0.052]) part(panel, cellLine, 0.003, 0.0015, 0.431, x + dx, 0.042, z, 0);
      for (const dz of [-0.1, 0.1]) part(panel, cellLine, 0.192, 0.0015, 0.0015, x, panelTop - 0.00075, z + dz, 0);
    }
    part(root, cyan, 0.055, 0.012, 0.003, 0.5, 0.041, footZ + 0.19, 0.001);
  }

  return {
    root,
    update(time, solarAngle) {
      if (membrane) membrane.emissiveIntensity = 0.6 + Math.sin(time * 1.8) * 0.06;
      if (solarPivot && solarAngle !== undefined) solarPivot.rotation.z = solarAngle;
    },
    dispose() {
      root.removeFromParent();
      for (const geometry of geometries.values()) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}
