import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DEFINITION_DEPTH, DEFINITION_TILE_DEPTH, TILE_SHAPE_DEFINITIONS, WALL_POLYGONS } from '../../config/definition-kit.ts';
import type { DefinitionDepthMode, DefinitionPoint, DefinitionPlatformWidth, DefinitionWindowKind } from '../../config/definition-kit.ts';
import { createDefinitionDepthOccupancy, type DefinitionDepthPlacement } from '../../world/building-layers.ts';
import type { DefinitionPlatformLine, DefinitionSolid } from '../../sim/definition-world.ts';
import type { RockTerrainCell } from '../../config/rock-terrain.ts';
import { createDefinitionTerrain } from './definition-terrain.ts';
import type { ResidenceMaterial } from '../../config/residence.ts';
import { createNaturalBuildingMaterials } from './building-material.ts';
import type { TileTextureData } from '../tile/tile-textures.ts';
import { createAiCityMaterial } from '../city/ai-city-architecture.ts';

export interface DefinitionGridCell {
  x: number;
  y: number;
  z: number;
  depth: number;
  role: 'solid' | 'wall';
}

export interface DefinitionKit {
  readonly root: THREE.Group;
  /** 玩法数据（布局坐标），由 sim/definition-world 写成格子世界。 */
  readonly solids: DefinitionSolid[];
  readonly platforms: DefinitionPlatformLine[];
  solid(shapeId: string, x: number, y: number, material?: ResidenceMaterial, depthMode?: DefinitionDepthMode, span?: number): void;
  terrain(cells: readonly RockTerrainCell[], textures: TileTextureData): void;
  wall(id: string, x: number, y: number): void;
  window(width: number, height: number, x: number, y: number, kind: DefinitionWindowKind, glass?: boolean, mullion?: boolean): void;
  /** 背后有墙时挂到墙面（深1.5），否则以人物平面居中（深1）；墙要先于平台铺设。 */
  platform(width: DefinitionPlatformWidth, top: number, x: number, material?: 'ceramic' | 'alloy'): void;
  door(side: 'left' | 'right', x: number, y: number, openingHeight: 3 | 3.5): void;
  dispose(): void;
}

const rectangle = (w: number, h: number): DefinitionPoint[] => [[0, 0], [w, 0], [w, h], [0, h]];

/** 一件定义构件的网格模板：几何与材质仍归 kit，offset 相对绘制原点（定义坐标）。实例化绘制用。 */
export interface DefinitionTemplateMesh {
  readonly geometry: THREE.BufferGeometry;
  readonly material: THREE.Material;
  readonly offset: THREE.Vector3;
  readonly castShadow: boolean;
  readonly renderOrder: number;
}

/** 在原点 (x,y) 用 draw 画一件构件并取出新增网格成模板；网格从 kit.root 移走，几何与材质随 kit 释放。 */
export function captureDefinitionTemplate(kit: DefinitionKit, x: number, y: number, draw: () => void): DefinitionTemplateMesh[] {
  const before = kit.root.children.length;
  draw();
  const added = kit.root.children.slice(before);
  for (const child of added) child.removeFromParent();
  return added.map(child => {
    if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) throw new Error('definition-kit: template part must be a single-material mesh');
    return { geometry: child.geometry, material: child.material, offset: child.position.clone().sub(new THREE.Vector3(x, y, 0)),
      castShadow: child.castShadow, renderOrder: child.renderOrder };
  });
}

function shapePath(points: readonly DefinitionPoint[]): THREE.Shape {
  return new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
}

/** 沿真实凸轮廓内收，斜坡和四分砖的面板不会盖住格内空隙。 */
function insetPolygon(points: readonly DefinitionPoint[], inset: number): DefinitionPoint[] {
  const area = points.reduce((sum, [x, y], i) => {
    const next = points[(i + 1) % points.length]!;
    return sum + x * next[1] - next[0] * y;
  }, 0);
  const normals = points.map(([x, y], i) => {
    const next = points[(i + 1) % points.length]!;
    const dx = next[0] - x, dy = next[1] - y;
    const factor = Math.sign(area) / Math.hypot(dx, dy);
    return new THREE.Vector2(-dy * factor, dx * factor);
  });
  return points.map(([x, y], i) => {
    const a = normals[(i + points.length - 1) % points.length]!, b = normals[i]!;
    const distance = inset / (1 + a.dot(b));
    return [x + (a.x + b.x) * distance, y + (a.y + b.y) * distance];
  });
}

function windowOpening(width: number, height: number, kind: DefinitionWindowKind, b = .1,
  cornerRadius = Math.min(.28, width / 4, height / 4)): THREE.Path {
  const path = new THREE.Path();
  if (kind === 'rounded') {
    const r = cornerRadius;
    path.moveTo(b + r, b);
    path.lineTo(width - b - r, b);
    path.quadraticCurveTo(width - b, b, width - b, b + r);
    path.lineTo(width - b, height - b - r);
    path.quadraticCurveTo(width - b, height - b, width - b - r, height - b);
    path.lineTo(b + r, height - b);
    path.quadraticCurveTo(b, height - b, b, height - b - r);
    path.lineTo(b, b + r);
    path.quadraticCurveTo(b, b, b + r, b);
  } else if (kind === 'round') {
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

// 定义坐标 +Z 指向后沿；装配层决定观察方向。格子占 [TILE_FRONT, WALL_Z]，墙从格子背面向后沿延伸。
const TILE_FRONT = -DEFINITION_DEPTH.tile / 2;
const WALL_Z = DEFINITION_DEPTH.tile / 2;

export function createDefinitionKit({ style = 'definition' }: { style?: 'definition' | 'ai-city' } = {}): DefinitionKit {
  const root = new THREE.Group();
  const solids: DefinitionSolid[] = [];
  const platforms: DefinitionPlatformLine[] = [];
  const terrainViews: ReturnType<typeof createDefinitionTerrain>[] = [];
  root.name = 'definition-kit';
  const grid: DefinitionGridCell[] = [];
  root.userData.definitionGrid = grid;
  const occupancy = createDefinitionDepthOccupancy();
  const wallCells = new Set<string>();
  const floatingCells = new Set<string>();
  const placeWall = (x: number, y: number, width: number, height: number): void => {
    const candidate: DefinitionDepthPlacement = { kind: 'wall', x, y, width, height };
    for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
      const cell = `${x + column},${y + row}`;
      // 平台形态在放置时按已铺的墙决定，事后补墙会留下一块仍然居中的平台。
      if (floatingCells.has(cell)) throw new Error(`墙必须先于平台铺设：${cell}`);
    }
    const conflict = occupancy.place(candidate);
    if (conflict) throw new Error(`背景墙 (${x}, ${y}, ${width}×${height})：${conflict}`);
  };
  const gridCells = (x: number, y: number, width: number, height: number,
    z: number, depth: number, role: DefinitionGridCell['role']): void => {
    if (role === 'wall') placeWall(x, y, width, height);
    for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
      grid.push({ x: x + column, y: y + row, z, depth, role });
      if (role === 'wall') wallCells.add(`${x + column},${y + row}`);
    }
  };
  const geometries = new Map<string, THREE.BufferGeometry>();
  const city = style === 'ai-city';
  const solidMaterial = city ? createAiCityMaterial('ceramic') : new THREE.MeshStandardMaterial({ color: 0xd6dfda, roughness: .8 });
  const alloyMaterial = createAiCityMaterial('alloy');
  const ashlarMaterial = createAiCityMaterial('ashlar');
  let natural: ReturnType<typeof createNaturalBuildingMaterials> | undefined;
  const wallMaterial = city ? createAiCityMaterial('wall') : new THREE.MeshStandardMaterial({ color: 0x719a96, roughness: .85 });
  const frameMaterial = city ? createAiCityMaterial('alloy') : new THREE.MeshStandardMaterial({ color: 0x235373, roughness: .5, metalness: .25 });
  // 单向平台后绘制，用玩家轮廓遮罩让穿越中的角色保持可见。
  const platformMaterial = city ? createAiCityMaterial('alloy') : new THREE.MeshStandardMaterial({ color: 0xd09c52, roughness: .65 });
  const platformTop = createAiCityMaterial('ceramic');
  const platformGlow = createAiCityMaterial('cyan');
  const brassMaterial = createAiCityMaterial('gold');
  const seamMaterial = createAiCityMaterial('dark');
  const signalMaterial = createAiCityMaterial('cyan');
  const platformCeramic = createAiCityMaterial('ceramic');
  const platformMaterials = [platformMaterial, platformTop, platformGlow, platformCeramic];
  const platformSurfaces = new Set<THREE.Material>(platformMaterials);
  for (const material of platformMaterials) Object.assign(material, { transparent: true, depthWrite: false,
    stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilWriteMask: 0 });
  const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x9d6743, roughness: .8 });
  const glassMaterial = city ? createAiCityMaterial('glass') : new THREE.MeshStandardMaterial({ color: 0x8bd2e1, transparent: true, opacity: .27,
    roughness: .18, metalness: .15, depthWrite: false, side: THREE.DoubleSide });
  const materials = [solidMaterial, wallMaterial, frameMaterial, platformMaterial, doorMaterial, glassMaterial,
    alloyMaterial, ashlarMaterial, platformTop, platformGlow, platformCeramic, brassMaterial, seamMaterial, signalMaterial];
  const names = ['definition-solid', 'definition-wall', 'definition-frame', 'definition-platform', 'definition-door', 'definition-glass'];
  names.forEach((name, index) => { materials[index]!.name = name; });

  const mesh = (key: string, create: () => THREE.BufferGeometry, material: THREE.Material,
    x: number, y: number, z: number): void => {
    let geometry = geometries.get(key);
    if (!geometry) {
      geometry = create();
      geometries.set(key, geometry);
    }
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = material !== glassMaterial && !platformSurfaces.has(material);
    if (platformSurfaces.has(material)) object.renderOrder = 2;
    object.receiveShadow = true;
    root.add(object);
  };
  const box = (material: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number): void =>
    mesh(`box:${w}:${h}:${d}`, () => city
      ? new RoundedBoxGeometry(w, h, d, 2, Math.min(.025, w / 4, h / 4, d / 4))
      : new THREE.BoxGeometry(w, h, d), material, x + w / 2, y + h / 2, z + d / 2);
  const extrude = (key: string, shape: THREE.Shape, depth: number, material: THREE.Material,
    x: number, y: number, z: number, rounding = .018): void => {
    const bevel = city && material !== glassMaterial ? Math.min(rounding, depth / 4) : 0;
    // 倒角向轮廓内部收，不越过整数/半整数格的实际碰撞边界。
    mesh(key, () => new THREE.ExtrudeGeometry(shape, { depth: depth - bevel * 2, bevelEnabled: bevel > 0,
      bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 3, steps: 1, curveSegments: city ? 24 : 32 }),
    material, x, y, z + bevel);
  };
  const mullion = (width: number, height: number, x: number, y: number): void => {
    box(frameMaterial, .08, height - .2, .12, x + width / 2 - .04, y + .1, WALL_Z + .02);
    for (const offset of [.1, width / 2 + .04]) {
      box(frameMaterial, width / 2 - .14, .08, .12, x + offset, y + height / 2 - .04, WALL_Z + .02);
    }
  };
  const window = (width: number, height: number, x: number, y: number,
    kind: DefinitionWindowKind, glass = false, bars = false): void => {
    gridCells(x, y, width, height, WALL_Z, DEFINITION_DEPTH.wall, 'wall');
    const corner = city ? Math.min(.48, width * .18, height * .2) : Math.min(.28, width / 4, height / 4);
    const opening = windowOpening(width, height, kind, city ? .22 : .1, corner);
    const shape = shapePath(rectangle(width, height));
    shape.holes.push(city ? windowOpening(width, height, kind, .07, corner) : opening);
    extrude(`window:${kind}:${width}:${height}`, shape, DEFINITION_DEPTH.wall - (city ? .08 : 0),
      city ? wallMaterial : frameMaterial, x, y, WALL_Z + (city ? .08 : 0));
    if (city) {
      const rim = new THREE.Shape(windowOpening(width, height, kind, .055, corner).getPoints(48));
      rim.holes.push(windowOpening(width, height, kind, .2, corner));
      extrude(`window-frame:${kind}:${width}:${height}`, rim, .13, frameMaterial, x, y, WALL_Z + .008, .012);
      const liner = new THREE.Shape(windowOpening(width, height, kind, .195, corner).getPoints(48));
      liner.holes.push(opening);
      extrude(`window-liner:${kind}:${width}:${height}`, liner, .06, brassMaterial, x, y, WALL_Z, .003);
    }
    if (glass) {
      const pane = new THREE.Shape(opening.getPoints(48));
      if (city) mesh(`glass:${kind}:${width}:${height}`, () => new THREE.ShapeGeometry(pane), glassMaterial, x, y, WALL_Z + .145);
      else extrude(`glass:${kind}:${width}:${height}`, pane, .015, glassMaterial, x, y, WALL_Z + .09);
    }
    if (bars) mullion(width, height, x, y);
  };

  return {
    root,
    solids,
    platforms,
    solid(shapeId, x, y, material = 'ceramic', depthMode = 'normal', span = 1) {
      if (depthMode === 'deep') {
        const conflict = occupancy.place({ kind: 'solid', depthMode, x, y, width: span, height: 1 });
        if (conflict) throw new Error(`实体格 (${x}, ${y}, ${shapeId})：${conflict}`);
      }
      const depth = DEFINITION_TILE_DEPTH[depthMode];
      const front = -depth / 2;
      gridCells(x, y, span, 1, front, depth, 'solid');
      // 墙立在格子背面之后；网格只占到 WALL_Z，模型向后延伸过墙厚，否则地板与墙两道倒角之间的槽
      // 会从墙底下透见远处背景，在交界处画出一条亮线。
      const body = Math.max(depth, WALL_Z + DEFINITION_DEPTH.wall - front);
      const definition = TILE_SHAPE_DEFINITIONS.find(({ id }) => id === shapeId)!;
      const points = definition.points.map(([px, py]): DefinitionPoint => [px * span, py]);
      // 跨格的整排方石按格拆成同形态的块（只有横向均匀的 A/B/C 会跨格）。
      for (let column = 0; column < span; column++) {
        solids.push({ points: definition.points.map(([px, py]) => [x + column + px, y + py]), tile: material, deep: depthMode === 'deep' });
      }
      const architectural = material === 'ceramic' || material === 'alloy' || material === 'ashlar';
      // 逐块色差、粗糙度与纹理相位由材质按构件原点生成，同材共用一份材质。
      const surface = !architectural ? (natural ??= createNaturalBuildingMaterials()).get(material)
        : material === 'alloy' ? alloyMaterial : material === 'ashlar' ? ashlarMaterial : solidMaterial;
      if (!architectural || material === 'ashlar') {
        extrude(`solid:${shapeId}:${body}:${span}:${architectural}`, shapePath(points), body, surface, x, y, front, material === 'ashlar' ? .025 : .008);
        return;
      }
      if (!city) {
        extrude(`solid:${shapeId}:${body}`, shapePath(definition.points), body, surface, x, y, front);
        return;
      }
      extrude(`solid:${shapeId}:${body}`, shapePath(definition.points), body - .025,
        surface, x, y, front + .025, .035);
      const service = material === 'alloy' && (shapeId === 'K' || shapeId === 'L');
      const panel = shapePath(insetPolygon(definition.points, .045));
      const left = shapeId === 'L' ? .5 : 0;
      if (service) {
        const slot = shapePath(rectangle(.07, .46).map(([px, py]) => [px + left + .215, py + .27]));
        panel.holes.push(slot);
      }
      extrude(`solid-panel:${shapeId}:${service}:${depth}`, panel, service ? .021 : .025,
        surface, x, y, front + (service ? .004 : 0), .005);
      if (service) {
        box(seamMaterial, .072, .462, .008, x + left + .214, y + .269, front + .018);
        box(signalMaterial, .032, .34, .008, x + left + .234, y + .33, front + .01);
        for (const cy of [.1, .875]) {
          box(brassMaterial, .075, .025, .014, x + left + .075, y + cy, front);
          box(seamMaterial, .025, .018, .008, x + left + .372, y + cy + .003, front);
        }
      }
    },
    terrain(cells, textures) {
      for (const { shape, x, y, layers } of cells) {
        gridCells(x, y, 1, 1, TILE_FRONT, DEFINITION_DEPTH.tile, 'solid');
        const definition = TILE_SHAPE_DEFINITIONS.find(item => item.id === shape)!;
        solids.push({ points: definition.points.map(([px, py]) => [x + px, y + py]), tile: layers[0]!.material, deep: false });
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
      gridCells(x, y, 1, 1, WALL_Z, DEFINITION_DEPTH.wall, 'wall');
      if (id === 'glass') {
        if (city) return mesh('glass:single', () => new THREE.PlaneGeometry(.8, .8), glassMaterial, x + .5, y + .5, WALL_Z + .09);
        return box(glassMaterial, .8, .8, .015, x + .1, y + .1, WALL_Z + .09);
      }
      if (id === 'mullion') return mullion(1, 1, x, y);
      if (id.startsWith('W2-') || id.startsWith('W8-')) {
        const c = .5 + .1 * Math.SQRT2 - .1;
        const points: DefinitionPoint[] = id.startsWith('W8-')
          ? [[0, 0], [1, 0], [1, .1], [c, .1], [.1, c], [.1, 1], [0, 1]]
          : [[0, 0], [1, 0], [1, .1], [.1, .1], [.1, 1], [0, 1]];
        const corner = id.slice(3);
        const transformed = points.map(([px, py]): DefinitionPoint =>
          [corner.endsWith('R') ? 1 - px : px, corner.startsWith('T') ? 1 - py : py]);
        return extrude(`wall:${id}`, shapePath(transformed), DEFINITION_DEPTH.wall, city ? wallMaterial : frameMaterial, x, y, WALL_Z);
      }
      extrude(`wall:${id}`, shapePath(WALL_POLYGONS[id]!), DEFINITION_DEPTH.wall, wallMaterial, x, y, WALL_Z);
    },
    window,
    platform(width, top, x, material = 'alloy') {
      const w = width === 'full' ? 1 : .5;
      const left = x + (width === 'right' ? .5 : 0);
      const cell = `${Math.floor(left + w / 2)},${Math.ceil(top) - 1}`;
      const front = -DEFINITION_DEPTH.platform / 2;
      const hung = wallCells.has(cell);
      if (!hung) floatingCells.add(cell);
      const depth = hung ? WALL_Z - front : DEFINITION_DEPTH.platform;
      gridCells(x, Math.ceil(top) - 1, 1, 1, front, depth, 'solid');
      platforms.push({ left, right: left + w, top, tile: `${material}platform` });
      if (city) {
        box(material === 'ceramic' ? platformCeramic : platformMaterial, w, .165, depth - .01, left, top - .2, front + .01);
        box(material === 'ceramic' ? platformTop : platformMaterial, w - .025, .035, depth - .025, left + .0125, top - .035, front + .0125);
        box(platformGlow, w * .4, .027, .012, left + w * .3, top - .12, front);
      } else box(platformMaterial, w, .2, depth, left, top - .2, front);
    },
    door(side, x, y, openingHeight) {
      gridCells(x, y, 1, 4, TILE_FRONT, DEFINITION_DEPTH.tile, 'solid');
      const left = x + (side === 'left' ? 0 : .5);
      solids.push({ points: rectangle(.5, 4 - openingHeight).map(([px, py]) => [left + px, y + openingHeight + py]), tile: 'ceramic', deep: false });
      // 两根门柱在前后沿，保证沿 X 通行时没有横跨洞口的门槛。
      for (const z of [TILE_FRONT, WALL_Z - .1]) box(doorMaterial, .12, openingHeight, .1, left + (side === 'left' ? 0 : .38), y, z);
      box(doorMaterial, .5, 4 - openingHeight, DEFINITION_DEPTH.tile, left, y + openingHeight, TILE_FRONT);
    },
    dispose() {
      natural?.dispose();
      for (const view of terrainViews) view.dispose();
      for (const geometry of geometries.values()) geometry.dispose();
      for (const material of materials) material.dispose();
      root.clear();
    },
  };
}
