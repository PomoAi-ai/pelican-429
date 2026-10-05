import * as THREE from 'three';
import type { ResourceOptions } from '../config/resource-showcase.ts';
import { resourceTileColumns } from '../config/resource-showcase.ts';
import type { LevelData } from '../world/level.ts';
import { shapeTopAt } from '../world/tile-shapes.ts';
import { BLOCK_FRONT_Z } from './tile-geometry.ts';

export interface InspectionFrame { x: number; y: number; width: number; height: number }

/** 检视线直接读取碰撞形状；不根据模型外轮廓猜测可站立位置。 */
export function createResourceInspection(level: LevelData, groundY: number, options: ResourceOptions, frame: InspectionFrame,
  groundResource: boolean, treeResource: boolean) {
  const root = new THREE.Group();
  const disposers: Array<() => void> = [];
  const z = BLOCK_FRONT_Z + 0.08;
  const lines = (positions: number[], color: number, opacity: number, overlay: boolean): void => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: !overlay, depthWrite: false });
    const mesh = new THREE.LineSegments(geometry, material);
    if (overlay) mesh.renderOrder = 100;
    root.add(mesh);
    disposers.push(() => { geometry.dispose(); material.dispose(); });
  };
  const columns = options.layout === 'single' || options.layout === 'raised' ? resourceTileColumns(options, level.map.width) : [24];
  const left = options.composition ? Math.floor(frame.x - frame.width / 2) : columns[0]! - 8;
  const right = options.composition ? Math.ceil(frame.x + frame.width / 2) : columns[columns.length - 1]! + 9;
  const bottom = options.composition ? Math.floor(frame.y - frame.height / 2) : groundY - 4;
  const top = options.composition ? Math.ceil(frame.y + frame.height / 2) : groundY + 3;
  if (options.grid && groundResource) {
    const grid: number[] = [];
    for (let x = left; x <= right; x++) grid.push(x, bottom, z, x, top, z);
    for (let y = bottom; y <= top; y++) grid.push(left, y, z, right, y, z);
    lines(grid, 0xd5efeb, 0.3, false);
  }
  if (options.platforms && (treeResource || groundResource)) {
    const standing: number[] = [];
    if (groundResource) {
      for (let x = Math.max(0, left); x < Math.min(level.map.width, right); x++) {
        for (let y = Math.max(0, bottom); y < Math.min(level.map.height - 1, top); y++) {
          if (level.map.collisionAt(x, y) !== 'solid' || level.map.collisionAt(x, y + 1) === 'solid') continue;
          const shape = level.map.shapeAt(x, y);
          standing.push(x, y + shapeTopAt(shape, 0), z, x + 1, y + shapeTopAt(shape, 1), z);
        }
      }
    }
    for (const tree of level.trees) for (const platform of tree.platforms) {
      const l = platform.x0;
      const r = platform.x1 + 1;
      const y = platform.ty + 1;
      standing.push(l, y, z, r, y, z, l, y - 0.17, z, l, y + 0.17, z, r, y - 0.17, z, r, y + 0.17, z);
    }
    lines(standing, 0x00e5ff, 0.95, true);
  }
  return { root, dispose() { root.removeFromParent(); for (const dispose of disposers) dispose(); } };
}
