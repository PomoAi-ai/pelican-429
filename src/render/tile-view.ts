/**
 * 瓦片视图：每个区块若干 InstancedMesh —— 方块（全部 block 形瓦片共用）、斜坡（左低右高 / 左高右低）、半砖、
 * 单向平台薄板、内凹填角，地表花草（flora.ts：每物种一个）、地被、灌木，以及草皮下泥土正面的攀附植被（face-climbers）。
 * 方块/薄板/填角共用 tile-material（世界坐标连续纹理 + 过渡着色）。瓦片 (tx,ty) 的方块中心为 (tx+.5, ty+.5, 0)，
 * 方块 z ∈ [BLOCK_BACK_Z, .5]（顶面向后延伸承接树根），薄板贴顶。
 *
 * 每实例属性（着色器约定见 tile-transitions / tile-material）：
 * - aLayers = (正面底材, 顶, 底) 纹理层；草皮（look.tufts）顶部暴露时顶用草顶层并长花草（flora.planFlora：连续草皮带 +
 *   按群落噪声成片的草丛/野花/蕨/灌木），否则按泥土；花草随风摆（flora.createWindMaterial，setTime 推进）；
 * - aShape：瓦片形状（world/tile-shapes）；斜坡/半砖用截面挤出几何（不圆角、不倒角），过渡按 key 照常计算；
 * - aNbr / aCode / aParam / aScale：左右下上四边的邻居底材层、过渡编码与参数（TILE_TRANSITIONS：blend / fringe / 暴露）；
 * - aRound：四角是否圆角（轮廓 smooth 且两条相邻边都暴露）；
 * - aTop：暴露顶面的平滑地表位移 Hermite 系数（surface-smooth：坡与平地交界大半径过渡、阶梯坡合并为长坡、湖床台阶 S 形）；
 * - aShape 打包（SHAPE_PACK）：形状 + 有机轮廓 + 湖床淤泥（lakes 选项，湖面以下的暴露格）+ 湖岸楔形参考水面 y。
 * 湖床虚拟台阶（上下两整砖差 1 格）：上层朝下层的侧边不算暴露（不倒角/不圆角），台阶角不放填角，由平滑位移画成 S 形。
 * 空气格的内凹角（两条相邻边与对角都是 smooth 整砖）放填角片（tiles-fillet），纹理与装饰带取自地板/天花板格；
 * 斜坡/半砖不算 smooth（否则坡脚空气格会补填角鼓起），但对邻格而言仍是实心方块（上坡端与整砖无缝）。
 * 对方块而言，空气、不渲染瓦片（branch）、薄板都算“空气”；薄板只与薄板相连。
 *
 * update() 两种模式（区块管理见 chunk-streamer）：
 * - 无参：全量模式——构建所有未加载区块，并重建脏区块（及其 8 邻区块：邻接影响边缘格的过渡与填角）。
 * - update(view)：流式模式——已加载的脏区块（及 8 邻）重建；视野内立即构建；余量内按距离限流；超出保留范围卸载。
 */
import * as THREE from 'three';
import type { ResourceOptions } from '../config/resource-showcase.ts';
import type { Rect } from '../core/math.ts';
import { CHUNK_SIZE } from '../world/tile-map.ts';
import type { ChunkCoord, TileMap } from '../world/tile-map.ts';
import { createChunkStreamer } from './chunk-streamer.ts';
import { SHAPE_FULL, SHAPE_HALF, SHAPE_SLOPE_L, SHAPE_SLOPE_R, shapeTopAt } from '../world/tile-shapes.ts';
import type { TileShape as WorldShape } from '../world/tile-shapes.ts';
import { createFloraGeometries, createFloraMeshes, createWindMaterial, planFlora } from './flora.ts';
import type { FloraEnv, FloraGeometries, FloraSite } from './flora.ts';
import { COVER_GROUNDS, createCoverAtlas, createCoverMaterial, createCoverMesh, planCover } from './flora-cover.ts';
import type { CoverGround, CoverSite } from './flora-cover.ts';
import { createShrubAtlas, createShrubMaterial, createShrubMesh, planShrubs } from './flora-shrubs.ts';
import { createClimberAtlas, createClimberMaterial, createClimberMesh, planGroundClimbers } from './face-climbers.ts';
import type { ClimberSite } from './face-climbers.ts';
import { createBlockGeometry, createFilletGeometry, createHalfGeometry, createInnerBlockGeometry, createShapeGeometry, createSlabGeometry } from './tile-geometry.ts';
import { SHAPE_PACK, TILE_INSTANCE_ATTRIBUTES, createTileMaterial } from './tile-material.ts';
import { ZERO_HERMITE, hermiteAt } from './tile-organic.ts';
import type { Hermite } from './tile-organic.ts';
import { createMapSurfaceQuery, surfaceHermite, stepDown, virtualStep } from './surface-smooth.ts';
import type { LakeSpan, SurfaceQuery } from './surface-smooth.ts';
import { generateTileTextures, tileLayerIndex } from './tile-textures.ts';
import type { TileTextureLayer } from './tile-textures.ts';
import {
  EDGE_BLEND,
  EDGE_EXPOSED,
  EDGE_EXPOSED_FRINGE,
  EDGE_SAME,
  TILE_TRANSITIONS,
  cellTransition,
  concaveCorners,
  contourStyle,
  neighbourMask8,
  validateTransitionTable,
} from './tile-transitions.ts';
import type { CellClass, CellTransition, TransitionTable } from './tile-transitions.ts';

export type TileShape = 'block' | 'slab';

export interface TileLook {
  readonly shape: TileShape;
  /** 侧（正面底材）/顶/底面纹理层。草皮类的侧面底材为 bottom（泥土），草边由过渡规则的装饰带绘制。 */
  readonly side: TileTextureLayer;
  readonly top: TileTextureLayer;
  readonly bottom: TileTextureLayer;
  /** 草皮类：暴露时长草叶；被覆盖时顶按 bottom 层显示。 */
  readonly tufts?: boolean;
}

/** @deprecated 旧名，等同 TileLook。 */
export type TileAppearance = TileLook;

/** 按瓦片 key 定义外观；null 表示不渲染。注册表中每个 key 都必须在此出现。 */
export const TILE_APPEARANCE: Readonly<Record<string, TileLook | null>> = Object.freeze({
  air: null,
  dirt: Object.freeze({ shape: 'block', side: 'dirt', top: 'dirt', bottom: 'dirt' }),
  stone: Object.freeze({ shape: 'block', side: 'stone', top: 'stone', bottom: 'stone' }),
  platform: Object.freeze({ shape: 'slab', side: 'planks', top: 'planks', bottom: 'planks' }),
  grass: Object.freeze({ shape: 'block', side: 'dirt', top: 'grassTop', bottom: 'dirt', tufts: true }),
  sand: Object.freeze({ shape: 'block', side: 'sand', top: 'sand', bottom: 'sand' }),
  // 砂岩（020）：沙漠沙层下的岩层与台地，层理纹理、有机圆角轮廓。
  sandstone: Object.freeze({ shape: 'block', side: 'sandstone', top: 'sandstone', bottom: 'sandstone' }),
  // 树枝/冠顶平台由树视图绘制，瓦片层不渲染。
  branch: null,
  // 渔屋木料：木板纹理方块（轮廓走 TILE_TRANSITIONS 默认 hard，不倒圆角）。
  timber: Object.freeze({ shape: 'block', side: 'planks', top: 'planks', bottom: 'planks' }),
  // 渔屋屋顶：碰撞用斜坡瓦片，视觉由渔屋模型（structure-view）绘制。
  roof: null,
});

export const SLAB_HEIGHT = 0.25;
/** 八格纹理周期下每格 32 像素，游戏与预览使用同一默认档。 */
export const TILE_TEXTURE_SIZE = 256;
/** 首帧之后每帧区块构建/重建的实测耗时预算（毫秒）：与树（4ms 估计）、水面共处一帧，留出渲染余量。 */
const TILE_FRAME_BUDGET_MS = 3;

export interface TileViewOptions {
  /** 512 保留原始纹理生成精度，供近景对照。 */
  readonly textureSize?: 256 | 512;
  /** 视野外预加载的区块圈数（默认 1）。 */
  readonly marginChunks?: number;
  /** 视野外保留的区块圈数，超出即卸载；必须 ≥ marginChunks（默认 2）。 */
  readonly keepChunks?: number;
  /** 流式模式下每帧最多构建的区块数（默认 4；首帧的视野内区块不受限，之后视野内优先）。 */
  readonly maxBuildsPerFrame?: number;
  /** 首帧之后每帧构建/重建的耗时预算（毫秒，默认 TILE_FRAME_BUDGET_MS；重建与构建各至少一个）。 */
  readonly maxBuildMsPerFrame?: number;
  /** 过渡规则表（默认 TILE_TRANSITIONS；创建时校验）。 */
  readonly transitions?: TransitionTable;
  /** 花草环境（近水芦苇、树下蘑菇/蕨；flora.createFloraEnv）；缺省 = 无水无树。 */
  readonly floraEnv?: FloraEnv;
  /** 湖（湖床淤泥色、湖床台阶平滑、湖岸沙楔形）；缺省 = 无湖。须与 ground-profile 的 lakes 一致。 */
  readonly lakes?: readonly LakeSpan[];
  /** 不长花草/地被的空气格（021：有顶的洞穴格；参数为暴露顶面之上的空气格）；缺省 = 无。 */
  readonly bareAir?: (tx: number, ty: number) => boolean;
  /** 不长正面攀附植被的格（浮空岛：由空岛视图自己画）；缺省 = 无。 */
  readonly noClimbers?: (tx: number, ty: number) => boolean;
}

export interface TileView {
  readonly root: THREE.Group;
  /** 构建/重建区块；返回本次构建的区块数。view 缺省为全量模式。 */
  update(view?: Readonly<Rect>): number;
  /** 推进花草风摆时间（秒）。 */
  setTime(time: number): void;
  /** 控制实际生成的植被层；区块重建后保留选择。 */
  setVegetation(mode: ResourceOptions['vegetation']): void;
  readonly loadedChunks: number;
  /** 上次流式 update 后，余量范围内仍未加载的区块数（全量模式恒为 0）。 */
  readonly pendingChunks: number;
  isChunkLoaded(cx: number, cy: number): boolean;
  dispose(): void;
}

type VegetationMeshes = Record<'cover' | 'climbers' | 'flora' | 'shrubs', THREE.InstancedMesh[]>;

function showVegetation(meshes: VegetationMeshes, mode: ResourceOptions['vegetation']): void {
  for (const mesh of [...meshes.cover, ...meshes.climbers]) mesh.visible = mode !== 'ground';
  for (const mesh of meshes.flora) mesh.visible = mode === 'flora' || mode === 'all';
  for (const mesh of meshes.shrubs) mesh.visible = mode === 'all';
}

interface ChunkMeshes {
  readonly vegetation: VegetationMeshes;
  readonly group: THREE.Group;
  readonly meshes: THREE.InstancedMesh[];
  /** 区块私有的几何（共享基础属性的拷贝 + 实例属性），卸载时释放。 */
  readonly geometries: THREE.BufferGeometry[];
}

interface Entry {
  readonly key: string;
  readonly look: TileLook;
  readonly base: number;
  readonly layers: readonly [number, number, number];
  /** 被覆盖时的层（非草皮类同 layers）。 */
  readonly covered: readonly [number, number, number];
  readonly smooth: boolean;
}

export function resolveAppearance(key: string): TileLook | null {
  if (!Object.hasOwn(TILE_APPEARANCE, key)) throw new Error(`tile-view: no appearance defined for tile '${key}'`);
  return TILE_APPEARANCE[key] ?? null;
}

interface Placement {
  readonly key: string;
  readonly tx: number;
  readonly ty: number;
  readonly layers: readonly [number, number, number];
  readonly t: CellTransition;
  /** 有机轮廓（smooth 轮廓的方块/斜坡：暴露边按世界噪声起伏）。 */
  readonly organic: boolean;
  /** 平滑地表位移（暴露顶面；否则全 0）。 */
  readonly top: Hermite;
  /** 湖床淤泥。 */
  readonly mud: boolean;
  /** 湖岸楔形参考水面 y（0 = 无）。 */
  readonly ref: number;
}

interface FilletPlacement {
  readonly key: string;
  /** 角点（世界坐标）与朝向角序（0 左下 1 右下 2 右上 3 左上）。 */
  readonly x: number;
  readonly y: number;
  readonly corner: number;
  readonly layers: readonly [number, number, number];
  /** 地板/天花板朝向本空气格那条边的装饰带（code/layer/depth）。 */
  readonly code: number;
  readonly layer: number;
  readonly depth: number;
}

/** aShape = 形状（0..3）+ ORGANIC_FLAG × 有机 + MUD_FLAG × 湖床 + REF_UNIT × 楔形参考 y（打包进一个属性：WebGL 顶点属性槽上限 16）。 */
export const ORGANIC_FLAG = SHAPE_PACK.ORGANIC;
export const MUD_FLAG = SHAPE_PACK.MUD;
export const REF_UNIT = SHAPE_PACK.REF;
type InstanceAttr = keyof typeof TILE_INSTANCE_ATTRIBUTES;
const INSTANCE_ATTRS = Object.keys(TILE_INSTANCE_ATTRIBUTES) as InstanceAttr[];
const GLSL_SIZE: Readonly<Record<string, number>> = { float: 1, vec2: 2, vec3: 3, vec4: 4 };
const ATTR_SIZE = Object.fromEntries(INSTANCE_ATTRS.map((n) => [n, GLSL_SIZE[TILE_INSTANCE_ATTRIBUTES[n]] as number])) as Readonly<Record<InstanceAttr, number>>;
/** 湖岸楔形：离湖（列）不超过该距离的沙质竖直分界才倾斜。 */
const WEDGE_LAKE_RANGE = 6;
const SAND_LAYER = tileLayerIndex('sand');

/** 方块类实例列表：整砖、内部整砖（只画正面，见 isInnerBlock）、斜坡、半砖（实例都在格心）与薄板。 */
type LayeredKind = 'block' | 'inner' | 'slopeR' | 'slopeL' | 'half' | 'slab';
const LAYERED_KINDS: readonly LayeredKind[] = ['block', 'inner', 'slopeR', 'slopeL', 'half', 'slab'];
const KIND_OF_SHAPE: Readonly<Record<WorldShape, LayeredKind>> = { [SHAPE_FULL]: 'block', [SHAPE_SLOPE_R]: 'slopeR', [SHAPE_SLOPE_L]: 'slopeL', [SHAPE_HALF]: 'half' };
const SHAPE_OF_KIND: Readonly<Record<LayeredKind, WorldShape>> = { block: SHAPE_FULL, inner: SHAPE_FULL, slopeR: SHAPE_SLOPE_R, slopeL: SHAPE_SLOPE_L, half: SHAPE_HALF, slab: SHAPE_FULL };

/** 邻格查询（越界规则见 entryAt）；作为 cellTransition / neighbourMask8 的分类回调。 */
interface CellLookup {
  entryAt(tx: number, ty: number): Entry | undefined;
  blockClass(tx: number, ty: number): CellClass | null;
  slabClass(tx: number, ty: number): CellClass | null;
  smoothSolid(tx: number, ty: number): boolean;
  /** 上方越界、空气、不渲染瓦片（branch）或薄板算暴露。 */
  exposedTop(tx: number, ty: number): boolean;
}

/** 瓦片视图共享依赖（区块构建函数通过它取得材质、几何与邻格查询）。 */
interface TileViewCtx {
  vegetationMode: ResourceOptions['vegetation'];
  readonly map: TileMap;
  readonly table: TransitionTable;
  readonly byId: ReadonlyArray<Entry | undefined>;
  readonly cells: CellLookup;
  readonly material: THREE.Material;
  readonly floraMaterial: THREE.Material;
  readonly baseGeometry: Readonly<Record<LayeredKind | 'fillet', THREE.BufferGeometry>>;
  readonly floraGeometries: FloraGeometries;
  /** 地被层（flora-cover）：图集几何与材质（与花草同一风时间）。 */
  readonly coverAtlas: THREE.BufferGeometry;
  readonly coverMaterial: THREE.Material;
  /** 灌木层（flora-shrubs，比树矮的中间层）：图集与材质；生长点同地被。 */
  readonly shrubAtlas: THREE.BufferGeometry;
  readonly shrubMaterial: THREE.Material;
  /** 正面攀附层（face-climbers 'ground' 套）：图集与材质。 */
  readonly climberAtlas: THREE.BufferGeometry;
  readonly climberMaterial: THREE.Material;
  readonly floraEnv: FloraEnv | undefined;
  readonly lakes: readonly LakeSpan[];
  readonly bareAir: ((tx: number, ty: number) => boolean) | undefined;
  readonly noClimbers: ((tx: number, ty: number) => boolean) | undefined;
  readonly surface: SurfaceQuery;
  readonly root: THREE.Group;
  readonly chunks: Map<number, ChunkMeshes>;
}

/** 一个区块的实例放置清单。 */
interface ChunkPlan {
  readonly lists: Record<LayeredKind, Placement[]>;
  readonly fillets: FilletPlacement[];
  /** 暴露草顶（花草生长点）。 */
  readonly flora: FloraSite[];
  /** 地被生长点（暴露的草/泥/沙顶，湖床除外）。 */
  readonly cover: CoverSite[];
  /** 攀附生长点（暴露草顶，其下泥土正面）。 */
  readonly climbers: ClimberSite[];
}

// 构建期临时对象（同步使用，不跨调用保存）。
const _matrix = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** 注册表 id → 外观条目；注册表里每种瓦片都要有外观定义（缺失即抛），不渲染的瓦片为 undefined。 */
function buildEntries(map: TileMap, table: TransitionTable): Array<Entry | undefined> {
  const byId: Array<Entry | undefined> = [];
  for (const def of map.registry.all()) {
    const look = resolveAppearance(def.key);
    if (look === null) continue;
    const layers = [tileLayerIndex(look.side), tileLayerIndex(look.top), tileLayerIndex(look.bottom)] as const;
    const b = tileLayerIndex(look.bottom);
    byId[def.id] = {
      key: def.key,
      look,
      base: layers[0],
      layers,
      covered: look.tufts ? [layers[0], b, b] : layers,
      smooth: look.shape === 'block' && contourStyle(table, def.key) === 'smooth',
    };
  }
  return byId;
}

function createCellLookup(map: TileMap, byId: ReadonlyArray<Entry | undefined>): CellLookup {
  const entryAt = (tx: number, ty: number): Entry | undefined => {
    // 左右/底部越界按边缘格延伸（世界边缘不倒角）；顶部越界为空气。
    if (ty >= map.height) return undefined;
    const cx = Math.min(map.width - 1, Math.max(0, tx));
    const cy = Math.max(0, ty);
    return byId[map.get(cx, cy)];
  };
  const shapeAt = (tx: number, ty: number): WorldShape => map.shapeAt(Math.min(map.width - 1, Math.max(0, tx)), Math.max(0, ty));
  const blockClass = (tx: number, ty: number): CellClass | null => {
    const e = entryAt(tx, ty);
    return e !== undefined && e.look.shape === 'block' ? e : null;
  };
  const slabClass = (tx: number, ty: number): CellClass | null => {
    const e = entryAt(tx, ty);
    return e !== undefined && e.look.shape === 'slab' ? e : null;
  };
  return {
    entryAt,
    blockClass,
    slabClass,
    // 斜坡/半砖不算 smooth：不参与圆角邻接判定与填角（坡脚不鼓起）。
    smoothSolid: (tx, ty) => entryAt(tx, ty)?.smooth === true && shapeAt(tx, ty) === SHAPE_FULL,
    exposedTop: (tx, ty) => blockClass(tx, ty + 1) === null,
  };
}

const chunkIndex = (map: TileMap, cx: number, cy: number): number => cy * map.chunksX + cx;

function clearChunk(ctx: TileViewCtx, cx: number, cy: number): void {
  const index = chunkIndex(ctx.map, cx, cy);
  const c = ctx.chunks.get(index);
  if (!c) return;
  for (const m of c.meshes) m.dispose();
  for (const g of c.geometries) g.dispose();
  c.group.removeFromParent();
  ctx.chunks.delete(index);
}

function instanceGeometry(ctx: TileViewCtx, kind: LayeredKind | 'fillet', count: number, geometries: THREE.BufferGeometry[]) {
  const geometry = ctx.baseGeometry[kind].clone();
  const data = Object.fromEntries(INSTANCE_ATTRS.map((name) => [name, new Float32Array(count * ATTR_SIZE[name])])) as Record<InstanceAttr, Float32Array>;
  for (const name of INSTANCE_ATTRS) geometry.setAttribute(name, new THREE.InstancedBufferAttribute(data[name], ATTR_SIZE[name]));
  geometries.push(geometry);
  return { geometry, data };
}

function layeredMesh(ctx: TileViewCtx, kind: LayeredKind, list: readonly Placement[], name: string, geometries: THREE.BufferGeometry[]): THREE.InstancedMesh {
  const { geometry, data } = instanceGeometry(ctx, kind, list.length, geometries);
  const mesh = new THREE.InstancedMesh(geometry, ctx.material, list.length);
  const yOffset = kind === 'slab' ? 1 - SLAB_HEIGHT / 2 : 0.5;
  const shapeCode = SHAPE_OF_KIND[kind];
  list.forEach((p, i) => {
    data.aLayers.set(p.layers, 3 * i);
    data.aNbr.set(p.t.nbr, 4 * i);
    data.aCode.set(p.t.code, 4 * i);
    data.aParam.set(p.t.param, 4 * i);
    data.aScale.set(p.t.scale, 4 * i);
    data.aRound.set(p.t.round, 4 * i);
    data.aTop.set(p.top, 4 * i);
    data.aShape[i] = shapeCode + (p.organic ? ORGANIC_FLAG : 0) + (p.mud ? MUD_FLAG : 0) + REF_UNIT * p.ref;
    _matrix.makeTranslation(p.tx + 0.5, p.ty + yOffset, 0);
    mesh.setMatrixAt(i, _matrix);
  });
  mesh.name = name;
  mesh.userData.tileKeys = list.map((p) => p.key);
  // 内部方块只有朝前的正面；阴影 pass 画背面（three 对 FrontSide 材质的默认 shadowSide），它不产生任何深度，省掉这次绘制。
  mesh.castShadow = kind !== 'inner';
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * 内部方块：整砖、四边都不暴露、无圆角、顶面无平滑位移，且 8 邻都是整形状的方块（越界按 entryAt 规则：左右/底延伸、顶为空气）。
 * 此时完整几何的侧壁/背面被邻格体积完全挡住（邻格朝本格的角也不内缩：其相邻两边都不暴露），正面不变形 → 只画正面四边形。
 */
function isInnerBlock(ctx: TileViewCtx, tx: number, ty: number, t: CellTransition, top: Hermite): boolean {
  if (top !== ZERO_HERMITE) return false;
  for (let e = 0; e < 4; e++) if ((t.code[e] as number) >= EDGE_EXPOSED || t.round[e] !== 0) return false;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const e = ctx.cells.entryAt(tx + dx, ty + dy);
      if (e === undefined || e.look.shape !== 'block') return false;
      if (ctx.map.shapeAt(Math.min(ctx.map.width - 1, Math.max(0, tx + dx)), Math.max(0, ty + dy)) !== SHAPE_FULL) return false;
    }
  }
  return true;
}

function filletMesh(ctx: TileViewCtx, list: readonly FilletPlacement[], name: string, geometries: THREE.BufferGeometry[]): THREE.InstancedMesh {
  const { geometry, data } = instanceGeometry(ctx, 'fillet', list.length, geometries);
  const mesh = new THREE.InstancedMesh(geometry, ctx.material, list.length);
  list.forEach((f, i) => {
    data.aLayers.set(f.layers, 3 * i);
    data.aNbr.set([f.layer, -1, -1, -1], 4 * i);
    data.aCode.set([f.code, 0, 0, 0], 4 * i);
    data.aParam.set([f.depth, 0, 0, 0], 4 * i);
    // 填角只出现在 smooth 整砖之间：随两侧有机轮廓位移；aScale.x 传角序（着色器据此取地板/墙的位移方向）。
    data.aScale.set([f.corner, 0, 0, 0], 4 * i);
    data.aShape[i] = ORGANIC_FLAG;
    // 角序 0..3 → 绕 z 旋转 0 / 90° / 180° / −90°（左下朝向的填角转到对应角）。
    _quat.setFromAxisAngle(Z_AXIS, [0, 0.5, 1, -0.5][f.corner]! * Math.PI);
    mesh.setMatrixAt(i, _matrix.compose(_pos.set(f.x, f.y, 0), _quat, _scl.set(1, 1, 1)));
  });
  mesh.name = name;
  mesh.userData.tileKeys = list.map((f) => f.key);
  mesh.userData.corners = list.map((f) => f.corner);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** 空气格 (tx,ty) 的内凹角填角（地板/天花板格决定纹理与草边）。 */
function collectFillets(ctx: TileViewCtx, tx: number, ty: number, out: FilletPlacement[]): void {
  const { cells, table } = ctx;
  const corners = concaveCorners(neighbourMask8(cells.smoothSolid, tx, ty));
  if (corners === 0) return;
  for (let c = 0; c < 4; c++) {
    if ((corners & (1 << c)) === 0) continue;
    const floor = c < 2;
    // 湖床虚拟台阶的台阶角由平滑位移画成 S 形，不放填角。
    if (floor && virtualStep(ctx.surface, tx, ty - 1, c === 0 ? -1 : 1)) continue;
    const oy = floor ? ty - 1 : ty + 1;
    const owner = cells.entryAt(tx, oy) as Entry;
    const exposedEdge = floor ? 3 : 2; // 地板的上边 / 天花板的下边朝向本格
    const ownerT = cellTransition(table, owner, cells.blockClass, tx, oy, false);
    const own = ownerT.code[exposedEdge] === EDGE_EXPOSED_FRINGE;
    const layers = cells.exposedTop(tx, oy) ? owner.layers : owner.covered;
    out.push({
      key: owner.key,
      x: tx + (c === 1 || c === 2 ? 1 : 0),
      y: ty + (c >= 2 ? 1 : 0),
      corner: c,
      layers,
      code: own ? EDGE_EXPOSED_FRINGE : 0,
      layer: own ? (ownerT.nbr[exposedEdge] as number) : -1,
      depth: own ? (ownerT.param[exposedEdge] as number) : 0,
    });
  }
}

/**
 * 虚拟台阶（湖床 1 格 / 半格 .5）的高侧格：朝低侧暴露的侧边改为不暴露、该侧两角不圆角 ——
 * 低侧的平滑隆起与本格下压的顶边在台阶处相接，草皮连续翻过台阶，不露出硬切的侧壁与小圆角。
 */
function coverSteps(ctx: TileViewCtx, entry: Entry, tx: number, ty: number, t: CellTransition): void {
  for (const dir of [-1, 1] as const) {
    const e = dir < 0 ? 0 : 1;
    if ((t.code[e] as number) < EDGE_EXPOSED || !stepDown(ctx.surface, tx, ty, dir)) continue;
    t.code[e] = EDGE_SAME;
    t.nbr[e] = entry.base;
    t.param[e] = 0;
    t.scale[e] = 0;
    for (const c of dir < 0 ? [0, 3] : [1, 2]) t.round[c] = 0;
  }
}

/** 湖岸楔形参考水面：本格有沙质竖直 blend 边且离湖不远时取最近湖的水面 y，否则 0。 */
function wedgeRef(ctx: TileViewCtx, entry: Entry, tx: number, t: CellTransition): number {
  if (ctx.lakes.length === 0) return 0;
  let sandy = false;
  for (const e of [0, 1]) if (t.code[e] === EDGE_BLEND && (entry.base === SAND_LAYER || t.nbr[e] === SAND_LAYER)) sandy = true;
  if (!sandy) return 0;
  let best = Infinity;
  let level = 0;
  for (const l of ctx.lakes) {
    const d = tx < l.x0 ? l.x0 - tx : tx > l.x1 ? tx - l.x1 : 0;
    if (d < best) {
      best = d;
      level = l.level;
    }
  }
  return best <= WEDGE_LAKE_RANGE && level >= 1 ? Math.round(level) : 0;
}

/** 攀附只爬到草皮下这么多行（浅表）。 */
const CLIMB_ROWS = 4;

/**
 * 暴露草顶 (tx,ty) 下的攀附生长点：向下数连续的草/泥土整砖（≤ CLIMB_ROWS 行，遇石头/沙/空洞即止），
 * 以及这些行里左右邻格为空（台阶、悬崖、外凸边）的行数。
 */
function climberSite(ctx: TileViewCtx, tx: number, ty: number, shape: WorldShape, top: Hermite): ClimberSite {
  const { map, byId, cells } = ctx;
  let bottom = ty;
  let sideL = 0;
  let sideR = 0;
  for (let r = ty; r > ty - CLIMB_ROWS && r >= 0; r--) {
    const key = byId[map.get(tx, r)]?.key;
    if (key !== 'grass' && key !== 'dirt') break;
    if (r < ty && map.shapeAt(tx, r) !== SHAPE_FULL) break;
    bottom = r;
    if (cells.blockClass(tx - 1, r) === null) sideL++;
    if (cells.blockClass(tx + 1, r) === null) sideR++;
  }
  return { tx, ty, top: ty + shapeTopAt(shape, 0.5) + hermiteAt(top, 0.5), bottom, sideL, sideR };
}

/** 扫描区块内各格：方块/斜坡/半砖/薄板放置、空气格填角、暴露草顶（花草生长点）。 */
function planChunk(ctx: TileViewCtx, cx: number, cy: number): ChunkPlan {
  const { map, byId, cells, table } = ctx;
  const x0 = cx * CHUNK_SIZE;
  const y0 = cy * CHUNK_SIZE;
  const x1 = Math.min(map.width, x0 + CHUNK_SIZE);
  const y1 = Math.min(map.height, y0 + CHUNK_SIZE);
  const lists: Record<LayeredKind, Placement[]> = { block: [], inner: [], slopeR: [], slopeL: [], half: [], slab: [] };
  const fillets: FilletPlacement[] = [];
  const flora: FloraSite[] = [];
  const cover: CoverSite[] = [];
  const climbers: ClimberSite[] = [];
  for (let ty = y0; ty < y1; ty++) {
    for (let tx = x0; tx < x1; tx++) {
      const id = map.get(tx, ty);
      const entry = byId[id];
      if (entry === undefined || entry.look.shape !== 'block') {
        // 不可见瓦片（空气/branch）跳过；未知 id 已由 TileMap.set 拒绝，这里再兜底校验。
        if (entry === undefined && !map.registry.has(id)) throw new Error(`tile-view: unknown tile id ${id} at (${tx},${ty})`);
        collectFillets(ctx, tx, ty, fillets);
        if (entry === undefined) continue;
      }
      const exposed = cells.exposedTop(tx, ty);
      const layers = exposed ? entry.layers : entry.covered;
      if (entry.look.shape === 'slab') {
        lists.slab.push({ key: entry.key, tx, ty, layers, t: cellTransition(table, entry, cells.slabClass, tx, ty, false), organic: false, top: ZERO_HERMITE, mud: false, ref: 0 });
        continue;
      }
      const shape = map.shapeAt(tx, ty);
      const full = shape === SHAPE_FULL;
      // 半砖（1 格宽凸起）与整砖一样按暴露边圆角（轮廓几何同一套浮雕）；斜坡不圆角。
      const t = cellTransition(table, entry, cells.blockClass, tx, ty, (full || shape === SHAPE_HALF) && entry.smooth);
      if ((full || shape === SHAPE_HALF) && entry.smooth) coverSteps(ctx, entry, tx, ty, t);
      const top = entry.smooth && exposed ? surfaceHermite(ctx.surface, tx, ty) : ZERO_HERMITE;
      const mud = entry.smooth && ctx.surface.lakeBed(tx, ty) && t.code.some((c) => c >= EDGE_EXPOSED);
      const kind = full && isInnerBlock(ctx, tx, ty, t, top) ? 'inner' : KIND_OF_SHAPE[shape];
      lists[kind].push({ key: entry.key, tx, ty, layers, t, organic: entry.smooth, top, mud, ref: wedgeRef(ctx, entry, tx, t) });
      const bare = exposed && ctx.bareAir !== undefined && ty + 1 < map.height && ctx.bareAir(tx, ty + 1);
      if (entry.look.tufts && exposed && !bare) flora.push({ tx, ty, shape, roundL: t.round[3] === 1, roundR: t.round[2] === 1, organic: entry.smooth, top });
      if (exposed && !bare && (COVER_GROUNDS as readonly string[]).includes(entry.key) && !ctx.surface.lakeBed(tx, ty)) {
        cover.push({ tx, ty, shape, roundL: t.round[3] === 1, roundR: t.round[2] === 1, organic: entry.smooth, top, ground: entry.key as CoverGround });
      }
      // 薄板（栈桥/屋内平台）之下的草顶算暴露，但它在结构下方，不长攀附。
      const underSlab = ty + 1 < map.height && byId[map.get(tx, ty + 1)]?.look.shape === 'slab';
      const climbable = entry.key === 'grass' && exposed && !bare && !underSlab && !ctx.surface.lakeBed(tx, ty);
      if (climbable && !(ctx.noClimbers !== undefined && ctx.noClimbers(tx, ty))) climbers.push(climberSite(ctx, tx, ty, shape, top));
    }
  }
  return { lists, fillets, flora, cover, climbers };
}

function buildChunk(ctx: TileViewCtx, cx: number, cy: number): void {
  clearChunk(ctx, cx, cy);
  const plan = planChunk(ctx, cx, cy);
  const group = new THREE.Group();
  group.name = `tile-chunk-${cx}-${cy}`;
  const meshes: THREE.InstancedMesh[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  for (const kind of LAYERED_KINDS) {
    if (plan.lists[kind].length === 0) continue;
    meshes.push(layeredMesh(ctx, kind, plan.lists[kind], `tiles-${kind}-${cx}-${cy}`, geometries));
  }
  if (plan.fillets.length > 0) meshes.push(filletMesh(ctx, plan.fillets, `tiles-fillet-${cx}-${cy}`, geometries));
  const vegetation: VegetationMeshes = { cover: [], climbers: [], flora: [], shrubs: [] };
  if (plan.flora.length > 0) {
    vegetation.flora.push(...createFloraMeshes(planFlora(plan.flora, ctx.floraEnv), ctx.floraGeometries, ctx.floraMaterial, `${cx}-${cy}`));
    meshes.push(...vegetation.flora);
  }
  const coverMesh = plan.cover.length > 0 ? createCoverMesh(planCover(plan.cover, ctx.floraEnv), ctx.coverAtlas, ctx.coverMaterial, `${cx}-${cy}`) : null;
  if (coverMesh) {
    geometries.push(coverMesh.geometry);
    meshes.push(coverMesh); vegetation.cover.push(coverMesh);
  }
  const shrubMesh = plan.cover.length > 0 ? createShrubMesh(planShrubs(plan.cover, ctx.floraEnv), ctx.shrubAtlas, ctx.shrubMaterial, `${cx}-${cy}`) : null;
  if (shrubMesh) {
    geometries.push(shrubMesh.geometry);
    meshes.push(shrubMesh); vegetation.shrubs.push(shrubMesh);
  }
  const climberMesh = createClimberMesh('ground', planGroundClimbers(plan.climbers), ctx.climberAtlas, ctx.climberMaterial, `tiles-climb-${cx}-${cy}`);
  if (climberMesh) {
    geometries.push(climberMesh.geometry);
    meshes.push(climberMesh); vegetation.climbers.push(climberMesh);
  }
  showVegetation(vegetation, ctx.vegetationMode);
  for (const m of meshes) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    group.add(m);
  }
  ctx.root.add(group);
  ctx.chunks.set(chunkIndex(ctx.map, cx, cy), { group, meshes, geometries, vegetation });
}

/** 脏区块及其 8 邻区块（边缘格的过渡、草皮暴露、填角都取决于相邻区块的格）。 */
function dirtyWithNeighbours(map: TileMap, dirty: readonly ChunkCoord[]): ChunkCoord[] {
  const keys = new Set<number>();
  const all: ChunkCoord[] = [];
  const add = (cx: number, cy: number): void => {
    if (cx < 0 || cy < 0 || cx >= map.chunksX || cy >= map.chunksY) return;
    const k = chunkIndex(map, cx, cy);
    if (keys.has(k)) return;
    keys.add(k);
    all.push({ cx, cy });
  };
  for (const c of dirty) add(c.cx, c.cy);
  for (const c of dirty) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) add(c.cx + dx, c.cy + dy);
  return all;
}

export function createTileView(map: TileMap, options: TileViewOptions = {}): TileView {
  const table = options.transitions ?? TILE_TRANSITIONS;
  validateTransitionTable(table);
  // 启动即校验：注册表里每种瓦片都要有外观定义（缺失即抛）。
  const byId = buildEntries(map, table);
  const cells = createCellLookup(map, byId);
  const lakes = options.lakes ?? [];
  lakes.forEach((l, i) => {
    if (!(Number.isFinite(l.x0) && Number.isFinite(l.x1) && Number.isFinite(l.level) && l.x0 <= l.x1)) throw new Error(`tile-view: invalid lake ${i} (${l.x0}..${l.x1} @ ${l.level})`);
  });
  const surface = createMapSurfaceQuery(map, (id) => byId[id]?.smooth === true, (tx, ty) => cells.blockClass(tx, ty + 1) !== null, lakes);
  const root = new THREE.Group();
  root.name = 'tiles';
  const windTime: THREE.IUniform<number> = { value: 0 };
  const floraMaterial = createWindMaterial(windTime);
  const coverMaterial = createCoverMaterial(windTime);
  const shrubMaterial = createShrubMaterial(windTime);
  const climberMaterial = createClimberMaterial(windTime);
  const ctx: TileViewCtx = {
    vegetationMode: 'all',
    map,
    table,
    byId,
    cells,
    material: createTileMaterial(generateTileTextures(options.textureSize ?? TILE_TEXTURE_SIZE)),
    floraMaterial,
    baseGeometry: {
      block: createBlockGeometry(),
      inner: createInnerBlockGeometry(),
      slopeR: createShapeGeometry(SHAPE_SLOPE_R),
      slopeL: createShapeGeometry(SHAPE_SLOPE_L),
      half: createHalfGeometry(),
      slab: createSlabGeometry(SLAB_HEIGHT),
      fillet: createFilletGeometry(),
    },
    floraGeometries: createFloraGeometries(),
    coverAtlas: createCoverAtlas(),
    coverMaterial,
    shrubAtlas: createShrubAtlas(),
    shrubMaterial,
    climberAtlas: createClimberAtlas('ground'),
    climberMaterial,
    floraEnv: options.floraEnv,
    lakes,
    bareAir: options.bareAir,
    noClimbers: options.noClimbers,
    surface,
    root,
    chunks: new Map(),
  };

  const streamer = createChunkStreamer({
    label: 'tile-view',
    chunksX: map.chunksX,
    chunksY: map.chunksY,
    margin: options.marginChunks ?? 1,
    keep: options.keepChunks ?? 2,
    maxBuilds: options.maxBuildsPerFrame ?? 4,
    budgetMs: options.maxBuildMsPerFrame ?? TILE_FRAME_BUDGET_MS,
    build: (cx, cy) => buildChunk(ctx, cx, cy),
    clear: (cx, cy) => clearChunk(ctx, cx, cy),
  });

  return {
    root,
    update(view) {
      return streamer.update(view, dirtyWithNeighbours(map, map.takeDirtyChunks()));
    },
    setTime(time) {
      if (!Number.isFinite(time)) throw new Error(`tile-view: invalid time ${time}`);
      windTime.value = time;
    },
    setVegetation(mode) {
      ctx.vegetationMode = mode;
      for (const chunk of ctx.chunks.values()) showVegetation(chunk.vegetation, mode);
    },
    get loadedChunks() {
      return streamer.loaded;
    },
    get pendingChunks() {
      return streamer.pending;
    },
    isChunkLoaded(cx, cy) {
      return streamer.isLoaded(cx, cy);
    },
    dispose() {
      streamer.clearAll();
      for (const g of Object.values(ctx.baseGeometry)) g.dispose();
      for (const g of Object.values(ctx.floraGeometries)) g.dispose();
      ctx.material.dispose();
      floraMaterial.dispose();
      coverMaterial.dispose();
      ctx.coverAtlas.dispose();
      shrubMaterial.dispose();
      ctx.shrubAtlas.dispose();
      climberMaterial.dispose();
      ctx.climberAtlas.dispose();
      root.removeFromParent();
    },
  };
}
