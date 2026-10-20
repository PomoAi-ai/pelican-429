/**
 * 块视图：按区块把定义构件实例化——建筑材料与建筑平台的块，以及瓦片视图画不了的多块格、新形态格（自然材料也在此画）。
 * 每种（材质、形态、深度、拼宽 / 平台宽、顶高、是否挂墙）先用定义构件画一次取模板，区块内同模板网格合成一个 InstancedMesh。
 * 平台挂墙随墙层变化，墙层增删也让所在区块重建。材质标 noLightMap，由城区光场着色（light-field-city）接入。
 */
import * as THREE from 'three';
import type { Rect } from '../../core/math.ts';
import type { DefinitionDepthMode, DefinitionPlatformWidth } from '../../config/definition-kit.ts';
import { RESIDENCE_MATERIALS, RESIDENCE_PLATFORM_TILES, RESIDENCE_RESOURCES, residenceTileKey, type ResidenceMaterial } from '../../config/residence.ts';
import { CHUNK_SIZE, type TileMap, type TilePiece } from '../../world/tile-map.ts';
import { PIECE_SHAPE_IDS, PLATFORM_VARIANTS } from '../../world/tile-shapes.ts';
import { TILE_PAVING } from '../../world/tile-types.ts';
import { captureDefinitionTemplate, createDefinitionKit, type DefinitionKit, type DefinitionTemplateMesh } from '../building/definition-kit.ts';
import { createChunkStreamer } from './chunk-streamer.ts';
import { TILE_APPEARANCE } from './tile-view.ts';

/** 模板绘制的原点：实体、悬空平台、挂墙平台（先铺墙）、墙各占一条，互不触发定义构件的深度互斥。 */
const LANE = { solid: 0, platform: 2, hung: 4, wall: 8 } as const;

/** 定义构件模板库：按键懒建，材质一律标 noLightMap（城区光场着色）。 */
export function createDefinitionTemplates() {
  const kit: DefinitionKit = createDefinitionKit({ style: 'ai-city' });
  kit.wall('W0', LANE.hung, 0);
  kit.root.clear();
  const templates = new Map<string, DefinitionTemplateMesh[]>();
  const get = (key: string, x: number, draw: () => void): DefinitionTemplateMesh[] => {
    let template = templates.get(key);
    if (!template) {
      template = captureDefinitionTemplate(kit, x, 0, draw);
      for (const mesh of template) mesh.material.userData.noLightMap = true;
      templates.set(key, template);
    }
    return template;
  };
  return {
    solid: (shape: string, material: ResidenceMaterial, depth: DefinitionDepthMode, span: number) =>
      get(`solid:${shape}:${material}:${depth}:${span}`, LANE.solid, () => kit.solid(shape, LANE.solid, 0, material, depth, span)),
    platform: (width: DefinitionPlatformWidth, top: number, material: 'ceramic' | 'alloy', hung: boolean) => {
      const x = hung ? LANE.hung : LANE.platform;
      return get(`platform:${width}:${top}:${material}:${hung}`, x, () => kit.platform(width, top, x, material));
    },
    wall: (wallId: string) => get(`wall:${wallId}`, LANE.wall, () => kit.wall(wallId, LANE.wall, 0)),
    window: (width: number, height: number) =>
      get(`window:${width}:${height}`, LANE.wall, () => kit.window(width, height, LANE.wall, 0, 'rounded', true)),
    dispose: () => kit.dispose(),
  };
}
export type DefinitionTemplates = ReturnType<typeof createDefinitionTemplates>;

/** 收集 (模板, x, y) 后按“几何 + 材质”合成 InstancedMesh。 */
export function createTemplateBatch() {
  const groups = new Map<string, { mesh: DefinitionTemplateMesh; at: number[] }>();
  return {
    add(template: readonly DefinitionTemplateMesh[], x: number, y: number): void {
      for (const mesh of template) {
        const key = `${mesh.geometry.uuid}:${mesh.material.uuid}`;
        let group = groups.get(key);
        if (!group) groups.set(key, group = { mesh, at: [] });
        group.at.push(x + mesh.offset.x, y + mesh.offset.y, mesh.offset.z);
      }
    },
    build(group: THREE.Group): THREE.InstancedMesh[] {
      const matrix = new THREE.Matrix4();
      const out: THREE.InstancedMesh[] = [];
      for (const { mesh, at } of groups.values()) {
        const instances = new THREE.InstancedMesh(mesh.geometry, mesh.material, at.length / 3);
        for (let i = 0; i < at.length; i += 3) instances.setMatrixAt(i / 3, matrix.makeTranslation(at[i]!, at[i + 1]!, at[i + 2]!));
        instances.castShadow = mesh.castShadow;
        instances.receiveShadow = true;
        instances.renderOrder = mesh.renderOrder;
        instances.computeBoundingSphere();
        group.add(instances);
        out.push(instances);
      }
      return out;
    },
  };
}

/** 块视图负责的格：建筑材料或建筑平台，或瓦片视图画不了的格。 */
const BUILDING_KEYS = new Set([
  ...(Object.keys(RESIDENCE_MATERIALS) as ResidenceMaterial[]).filter(key => TILE_APPEARANCE[key] === null),
  ...RESIDENCE_RESOURCES.flatMap(resource => resource.kind === 'platform' ? [residenceTileKey(resource)] : []),
]);

const ASHLAR_PAIRS = new Set(['A', 'B', 'C']);
const samePiece = (a: TilePiece, b: TilePiece): boolean => a.id === b.id && a.shape === b.shape && a.deep === b.deep;

export interface PieceView {
  readonly root: THREE.Group;
  /** 按镜头流式构建区块；返回本次构建的区块数（有新网格时调用方重新接入光照）。 */
  update(view: Readonly<Rect>): number;
  dispose(): void;
}

export function createPieceView(map: TileMap): PieceView {
  const root = new THREE.Group();
  root.name = 'pieces';
  // 定义坐标 +Z 指向后沿。
  root.scale.z = -1;
  const templates = createDefinitionTemplates();
  const drawn = new Set(map.registry.all().filter(def => BUILDING_KEYS.has(def.key)).map(def => def.id));
  const chunks = new Map<number, { group: THREE.Group; meshes: THREE.InstancedMesh[] }>();
  const keyOf = (cx: number, cy: number): number => cy * map.chunksX + cx;

  const material = (key: string): ResidenceMaterial => {
    if (!Object.hasOwn(RESIDENCE_MATERIALS, key)) throw new Error(`piece-view: no definition material for tile '${key}'`);
    return key as ResidenceMaterial;
  };
  const clear = (cx: number, cy: number): void => {
    const chunk = chunks.get(keyOf(cx, cy));
    if (!chunk) return;
    for (const mesh of chunk.meshes) mesh.dispose();
    chunk.group.removeFromParent();
    chunks.delete(keyOf(cx, cy));
  };
  const build = (cx: number, cy: number): void => {
    clear(cx, cy);
    const batch = createTemplateBatch();
    const x0 = cx * CHUNK_SIZE, y0 = cy * CHUNK_SIZE;
    const x1 = Math.min(map.width, x0 + CHUNK_SIZE), y1 = Math.min(map.height, y0 + CHUNK_SIZE);
    for (let ty = y0; ty < y1; ty++) {
      let paired: TilePiece | null = null;
      for (let tx = x0; tx < x1; tx++) {
        const pieces = map.pieces(tx, ty);
        if (pieces.length === 0 || map.plain(tx, ty) && !drawn.has(pieces[0]!.id)) { paired = null; continue; }
        const mate: TilePiece | null = paired;
        paired = null;
        for (const piece of pieces) {
          // 交通中心街面板由交通中心模型的前庭铺装绘制。
          if (mate && samePiece(mate, piece) || piece.id === TILE_PAVING) continue;
          const def = map.registry.byId(piece.id);
          if (def.collision === 'oneWay') {
            const platformMaterial = RESIDENCE_PLATFORM_TILES[def.key];
            if (!platformMaterial) throw new Error(`piece-view: no definition platform for tile '${def.key}' at (${tx},${ty})`);
            const { width, top } = PLATFORM_VARIANTS[piece.shape]!;
            batch.add(templates.platform(width, top, platformMaterial, map.building.wallAt(tx, ty) !== null), tx, ty);
            continue;
          }
          const shape = PIECE_SHAPE_IDS[piece.shape]!;
          // 方石整砖、半砖在偶数列与右邻同块合成两格宽的一块（与住宅视图相同的拼缝）。
          const pair = def.key === 'ashlar' && ASHLAR_PAIRS.has(shape) && tx % 2 === 0 && tx + 1 < x1
            && map.pieces(tx + 1, ty).some(other => samePiece(other, piece));
          if (pair) paired = piece;
          batch.add(templates.solid(shape, material(def.key), piece.deep ? 'deep' : 'normal', pair ? 2 : 1), tx, ty);
        }
      }
    }
    const group = new THREE.Group();
    group.name = `pieces-${cx}-${cy}`;
    chunks.set(keyOf(cx, cy), { group, meshes: batch.build(group) });
    root.add(group);
  };
  const streamer = createChunkStreamer({
    label: 'piece-view', chunksX: map.chunksX, chunksY: map.chunksY, margin: 1, keep: 2, maxBuilds: 4, budgetMs: 3, build, clear,
  });
  const dirty = new Set<number>();
  const mark = (x0: number, y0: number, x1: number, y1: number): void => {
    for (let cy = Math.max(0, Math.floor(y0 / CHUNK_SIZE)); cy <= Math.min(map.chunksY - 1, Math.floor((y1 - 1) / CHUNK_SIZE)); cy++) {
      for (let cx = Math.max(0, Math.floor(x0 / CHUNK_SIZE)); cx <= Math.min(map.chunksX - 1, Math.floor((x1 - 1) / CHUNK_SIZE)); cx++) dirty.add(keyOf(cx, cy));
    }
  };
  const unsubscribe = [
    map.onMaskChange((tx, ty) => mark(tx, ty, tx + 1, ty + 1)),
    map.onChange((tx, ty) => mark(tx, ty, tx + 1, ty + 1)),
    map.building.onChange(mark),
  ];
  return {
    root,
    update(view) {
      const list = [...dirty].map(k => ({ cx: k % map.chunksX, cy: Math.floor(k / map.chunksX) }));
      dirty.clear();
      return streamer.update(view, list);
    },
    dispose() {
      for (const off of unsubscribe) off();
      streamer.clearAll();
      templates.dispose();
      root.removeFromParent();
    },
  };
}
