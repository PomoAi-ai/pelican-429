import * as THREE from 'three';
import { TILE_SHAPE_DEFINITIONS } from '../config/definition-kit.ts';
import type { DefinitionPoint, DefinitionPlatformWidth, DefinitionWindowKind } from '../config/definition-kit.ts';
import type { DefinitionCollider, DefinitionPlatform } from '../physics/definition-collision.ts';
import type { RockTerrainCell } from '../config/rock-terrain.ts';
import { createDefinitionTerrain } from './definition-terrain.ts';
import type { TileTextureData } from './tile-textures.ts';

export interface DefinitionGridCell {
  x: number;
  y: number;
  z: number;
  depth: number;
  role: 'solid' | 'wall';
}

export interface DefinitionKit {
  readonly root: THREE.Group;
  readonly solids: DefinitionCollider[];
  readonly platforms: DefinitionPlatform[];
  solid(shapeId: string, x: number, y: number): void;
  terrain(cells: readonly RockTerrainCell[], textures: TileTextureData): void;
  wall(id: string, x: number, y: number): void;
  window(width: number, height: number, x: number, y: number, kind: DefinitionWindowKind, glass?: boolean, mullion?: boolean): void;
  platform(width: DefinitionPlatformWidth, depth: .5 | .75, top: number, x: number): void;
  door(side: 'left' | 'right', x: number, y: number, openingHeight: 3 | 3.5): void;
  dispose(): void;
}

const rectangle = (w: number, h: number): DefinitionPoint[] => [[0, 0], [w, 0], [w, h], [0, h]];

function shapePath(points: readonly DefinitionPoint[]): THREE.Shape {
  return new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
}

function windowOpening(width: number, height: number, kind: DefinitionWindowKind): THREE.Path {
  const b = .1;
  const path = new THREE.Path();
  if (kind === 'round') {
    path.absellipse(width / 2, height / 2, width / 2 - b, height / 2 - b, 0, Math.PI * 2, true, 0);
  } else if (kind === 'arch') {
    const radius = width / 2 - b;
    path.moveTo(b, b);
    path.lineTo(width - b, b);
    path.lineTo(width - b, height - b - radius);
    path.absarc(width / 2, height - b - radius, radius, 0, Math.PI, false);
    path.closePath();
  } else {
    const c = .5 + b * Math.SQRT2 - b;
    const points: readonly DefinitionPoint[] = kind === 'bevel'
      ? [[c, b], [width - c, b], [width - b, c], [width - b, height - c],
        [width - c, height - b], [c, height - b], [b, height - c], [b, c]]
      : kind === 'broken'
        ? [[.12, .27], [.3, .4], [.22, .6], [.51, .81], [.66, .64], [.87, .51], [.77, .14], [.48, .23]]
          .map(([x, y]) => [x! * width, y! * height] as DefinitionPoint)
        : [[b, b], [width - b, b], [width - b, height - b], [b, height - b]];
    path.setFromPoints(points.map(([x, y]) => new THREE.Vector2(x, y)));
    path.closePath();
  }
  return path;
}

const wallPolygons: Readonly<Record<string, readonly DefinitionPoint[]>> = {
  W0: rectangle(1, 1),
  W3: [[0, .5], [1, .5], [1, 1], [0, 1]],
  W4: rectangle(1, .5),
  W5: rectangle(.5, 1),
  W6: [[.5, 0], [1, 0], [1, 1], [.5, 1]],
  'W7-1': [[0, 0], [1, 0], [0, 1]],
  'W7-2': [[0, 0], [1, 0], [1, 1]],
  'W7-3': [[0, 0], [1, 1], [0, 1]],
  'W7-4': [[1, 0], [1, 1], [0, 1]],
};

/** 定义坐标沿 +Z 指向外延墙；装配层决定观察方向。 */
export function createDefinitionKit(): DefinitionKit {
  const root = new THREE.Group();
  const solids: DefinitionCollider[] = [];
  const platforms: DefinitionPlatform[] = [];
  const terrainViews: ReturnType<typeof createDefinitionTerrain>[] = [];
  root.name = 'definition-kit';
  const grid: DefinitionGridCell[] = [];
  root.userData.definitionGrid = grid;
  const gridCells = (x: number, y: number, width: number, height: number,
    z: number, depth: number, role: DefinitionGridCell['role']): void => {
    for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
      grid.push({ x: x + column, y: y + row, z, depth, role });
    }
  };
  const geometries = new Map<string, THREE.BufferGeometry>();
  const solidMaterial = new THREE.MeshStandardMaterial({ color: 0xd6dfda, roughness: .8 });
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x719a96, roughness: .85 });
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x235373, roughness: .5, metalness: .25 });
  // 单向平台后绘制，用玩家轮廓遮罩让穿越中的角色保持可见；实体深度仍居中。
  const platformMaterial = new THREE.MeshStandardMaterial({ color: 0xd09c52, roughness: .65,
    transparent: true, depthWrite: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc,
    stencilWriteMask: 0 });
  const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x9d6743, roughness: .8 });
  const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x8bd2e1, transparent: true, opacity: .27,
    roughness: .18, metalness: .15, depthWrite: false, side: THREE.DoubleSide });
  const materials = [solidMaterial, wallMaterial, frameMaterial, platformMaterial, doorMaterial, glassMaterial];
  materials.forEach((material, index) => { material.name = ['definition-solid', 'definition-wall', 'definition-frame', 'definition-platform', 'definition-door', 'definition-glass'][index]!; });

  const mesh = (key: string, create: () => THREE.BufferGeometry, material: THREE.Material,
    x: number, y: number, z: number): void => {
    let geometry = geometries.get(key);
    if (!geometry) {
      geometry = create();
      geometries.set(key, geometry);
    }
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = material !== glassMaterial && material !== platformMaterial;
    if (material === platformMaterial) object.renderOrder = 2;
    object.receiveShadow = true;
    root.add(object);
  };
  const box = (material: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): void =>
    mesh(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d), material, x + w / 2, y + h / 2, z + d / 2);
  const extrude = (key: string, shape: THREE.Shape, depth: number, material: THREE.Material,
    x: number, y: number, z: number): void => mesh(key, () => new THREE.ExtrudeGeometry(shape,
    { depth, bevelEnabled: false, steps: 1, curveSegments: 32 }), material, x, y, z);
  const mullion = (width: number, height: number, x: number, y: number): void => {
    box(frameMaterial, .08, height - .2, .12, x + width / 2 - .04, y + .1, .52);
    for (const offset of [.1, width / 2 + .04]) {
      box(frameMaterial, width / 2 - .14, .08, .12, x + offset, y + height / 2 - .04, .52);
    }
  };
  const window = (width: number, height: number, x: number, y: number,
    kind: DefinitionWindowKind, glass = false, bars = false): void => {
    gridCells(x, y, width, height, .5, .2, 'wall');
    const opening = windowOpening(width, height, kind);
    const shape = shapePath(rectangle(width, height));
    shape.holes.push(opening);
    extrude(`window:${kind}:${width}:${height}`, shape, .2, frameMaterial, x, y, .5);
    if (glass) {
      extrude(`glass:${kind}:${width}:${height}`, new THREE.Shape(opening.getPoints(48)), .015, glassMaterial, x, y, .59);
    }
    if (bars) mullion(width, height, x, y);
  };

  return {
    root,
    solids,
    platforms,
    solid(shapeId, x, y) {
      gridCells(x, y, 1, 1, -.5, 1, 'solid');
      const definition = TILE_SHAPE_DEFINITIONS.find(({ id }) => id === shapeId)!;
      solids.push({ points: definition.points.map(([px, py]) => [x + px, y + py]) });
      extrude(`solid:${shapeId}`, shapePath(definition.points), 1, solidMaterial, x, y, -.5);
    },
    terrain(cells, textures) {
      for (const { shape, x, y } of cells) {
        gridCells(x, y, 1, 1, -.5, 1, 'solid');
        const definition = TILE_SHAPE_DEFINITIONS.find(item => item.id === shape)!;
        solids.push({ points: definition.points.map(([px, py]) => [x + px, y + py]) });
      }
      const view = createDefinitionTerrain(cells, textures);
      terrainViews.push(view);
      root.add(view.root);
    },
    wall(id, x, y) {
      if (id === 'W1') return;
      if (id === 'W2') return window(1, 1, x, y, 'rectangle');
      if (id === 'W2-2x2') return window(2, 2, x, y, 'rectangle');
      if (id === 'W2-3x2') return window(3, 2, x, y, 'rectangle');
      if (id === 'W8') return window(2, 2, x, y, 'bevel');
      if (id === 'glass-mullion') return window(2, 2, x, y, 'rectangle', true, true);
      if (id === 'round' || id === 'arch' || id === 'broken') return window(2, 2, x, y, id);
      gridCells(x, y, 1, 1, .5, .2, 'wall');
      if (id === 'glass') return box(glassMaterial, .8, .8, .015, x + .1, y + .1, .59);
      if (id === 'mullion') return mullion(1, 1, x, y);
      if (id.startsWith('W2-') || id.startsWith('W8-')) {
        const c = .5 + .1 * Math.SQRT2 - .1;
        const points: DefinitionPoint[] = id.startsWith('W8-')
          ? [[0, 0], [1, 0], [1, .1], [c, .1], [.1, c], [.1, 1], [0, 1]]
          : [[0, 0], [1, 0], [1, .1], [.1, .1], [.1, 1], [0, 1]];
        const corner = id.slice(3);
        const transformed = points.map(([px, py]): DefinitionPoint =>
          [corner.endsWith('R') ? 1 - px : px, corner.startsWith('T') ? 1 - py : py]);
        return extrude(`wall:${id}`, shapePath(transformed), .2, frameMaterial, x, y, .5);
      }
      extrude(`wall:${id}`, shapePath(wallPolygons[id]!), .2, wallMaterial, x, y, .5);
    },
    window,
    platform(width, depth, top, x) {
      gridCells(x, Math.ceil(top) - 1, 1, 1, -depth / 2, depth, 'solid');
      const w = width === 'full' ? 1 : .5;
      const left = x + (width === 'right' ? .5 : 0);
      platforms.push({ left, right: left + w, top });
      box(platformMaterial, w, .2, depth, x + (width === 'right' ? .5 : 0), top - .2, -depth / 2);
    },
    door(side, x, y, openingHeight) {
      gridCells(x, y, 1, 4, -.5, 1, 'solid');
      const left = x + (side === 'left' ? 0 : .5);
      solids.push({ points: rectangle(.5, 4 - openingHeight).map(([px, py]) => [left + px, y + openingHeight + py]) });
      // 两根门柱在前后沿，保证沿 X 通行时没有横跨洞口的门槛。
      for (const z of [-.5, .4]) box(doorMaterial, .12, openingHeight, .1, left + (side === 'left' ? 0 : .38), y, z);
      box(doorMaterial, .5, 4 - openingHeight, 1, left, y + openingHeight, -.5);
    },
    dispose() {
      for (const view of terrainViews) view.dispose();
      for (const geometry of geometries.values()) geometry.dispose();
      for (const material of materials) material.dispose();
      root.clear();
    },
  };
}
