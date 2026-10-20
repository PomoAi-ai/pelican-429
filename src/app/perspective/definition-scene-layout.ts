import * as THREE from 'three';
import { createDefinitionLiquid } from '../../render/building/definition-liquid.ts';
import { DEFINITION_DEPTH, TILE_SHAPE_JOINS, TILE_SHAPE_DEFINITIONS, WALL_DEFINITIONS } from '../../config/definition-kit.ts';
import { ROCK_TERRAIN_SCENES } from '../../config/rock-terrain.ts';
import { createDefinitionKit } from '../../render/building/definition-kit.ts';
import { createDefinitionFurniture, FURNITURE_STAND_TOP, type FurnitureOptions } from '../../render/building/definition-furniture.ts';
import type { WorkstationPlayer } from '../../render/residence/workstation-display-state.ts';
import { FLORA_RULES, FLORA_SPECIES, createFloraGeometries, createFloraMeshes, createWindMaterial, type FloraInstance } from '../../render/flora/flora.ts';
import { SHRUB_KINDS, SHRUB_RULES, createShrubAtlas, createShrubMaterial, createShrubMesh, type ShrubInstance } from '../../render/flora/flora-shrubs.ts';
import { FLORA_LABELS, ROCK_LABELS, SHRUB_LABELS, TREE_LABELS } from '../../render/resource/resource-labels.ts';
import { createTreeView } from '../../render/tree/tree-view.ts';
import { TREE_Z } from '../../render/tree/tree-skeleton.ts';
import { TREE_KINDS } from '../../config/worldgen-rules.ts';
import { planTree } from '../../world/trees.ts';
import { ROCK_KINDS, ROCK_NATIVE, createRockAoGeometry, createRockAoMaterial, createRockParts, type RockKind } from '../../render/decor/rock-geometry.ts';
import { createRockMaterial } from '../../render/decor/rock-material.ts';
import { createDecorBatch, decorMatrix, rockMaxDepth } from '../../render/decor/surface-decor-view.ts';
import { BIG_ROCKS, LANDMARK_ROCKS, MID_ROCKS, ROCK_SALT, SAND_ROCKS, SMALL_ROCKS, landmarkInstance, rockAoInstances, rockGroupFor, scatterRockFor, type DecorEnv, type RockInstance } from '../../render/decor/surface-decor.ts';
import { mulberry32 } from '../../core/rng.ts';
import { climberInstance, createClimberAtlas, createClimberMaterial, createClimberMesh, type ClimberInstance } from '../../render/decor/face-climbers.ts';
import { generateTileTextures } from '../../render/tile/tile-textures.ts';
import { caption } from '../../render/npc/npc-effects.ts';
import type { Vec2 } from '../../core/math.ts';
import { placeDefinitionSolid, removeDefinitionSolid, type DefinitionPlatformLine, type DefinitionSolid, type DefinitionWorldData } from '../../sim/definition-world.ts';
import type { SupportSurface } from '../../world/special-parts.ts';
import type { TileMap } from '../../world/tile-map.ts';
import { createDefinitionDepthTrial, type DefinitionDepthTrial } from './definition-depth-trial.ts';
import { walkDepth, type WalkObstacle } from '../../render/building/walk-depth.ts';
import { t } from '../../config/i18n.ts';

/** 文案（title、description、items）在构建时已按当前语言翻译；切换语言时场景重新挂载并重建。 */
export interface SceneSection {
  id: string;
  title: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
  playerX: number;
  playerY: number;
  items: readonly string[];
  /** 试踩的太阳能板：模拟世界太阳能板列表里的下标。 */
  solarTrial?: number;
  /** 玩家在该分区的世界 Z（未给出时站 Z=0 中线）。 */
  walkZ?: (x: number, y: number) => number;
}

type Kit = ReturnType<typeof createDefinitionKit>;
type FurnitureKind = Parameters<typeof createDefinitionFurniture>[0];
interface SectionBuilder {
  kit: Kit;
  x: number;
  label(text: string | (() => string), x: number, y: number, width?: number): void;
  furniture(kind: FurnitureKind, x: number, y: number, options?: FurnitureOptions): THREE.Group;
  readonly blockers: Blocker[];
  /** 家具、大石顶面（布局坐标）。 */
  readonly stands: SupportSurface[];
  readonly platforms: DefinitionPlatformLine[];
}

// 家具贴格子背面摆放（定义坐标 +Z 朝后沿），前沿离人物中线最近。
const FURNITURE_Z = DEFINITION_DEPTH.tile / 2 - .5;

interface Blocker { readonly box: THREE.Box3; readonly top: number }

/** 家具与树干的让位（walk-depth）；长廊局部 +Z 朝后沿，深度取反成世界 Z，没有落脚面的 top 为 Infinity。 */
function walkAround(blockers: readonly Blocker[]): (x: number, y: number) => number {
  const obstacles: WalkObstacle[] = blockers.map(({ box, top }) => ({ x: box.min.x, y: box.min.y, width: box.max.x - box.min.x, height: box.max.y - box.min.y,
    centerZ: -(box.min.z + box.max.z) / 2, frontZ: -box.min.z, top: Number.isFinite(top) ? top : null }));
  return (x, y) => walkDepth(obstacles, x, y);
}

function addShapeGallery({ kit, label }: SectionBuilder): void {
  TILE_SHAPE_DEFINITIONS.forEach((shape, index) => {
    const x = 2 + index % 11 * 3;
    const y = 2 + Math.floor(index / 11) * 4;
    kit.solid(shape.id, x, y);
    label(shape.id, x + .5, y + 1.7, 2);
  });
}

function addJoinGallery({ kit, label }: SectionBuilder): void {
  TILE_SHAPE_JOINS.forEach((shapes, index) => {
    const x = 2 + index % 6 * 4;
    const y = 2 + Math.floor(index / 6) * 4;
    shapes.forEach((id, offset) => kit.solid(id, x + offset, y));
    label(shapes.join(' + '), x + shapes.length / 2, y + 1.7, 3.5);
  });
}

function addWallGallery({ kit, label }: SectionBuilder): void {
  WALL_DEFINITIONS.forEach((wall, index) => {
    const x = 2 + index % 7 * 4;
    const y = 2 + Math.floor(index / 7) * 4;
    kit.wall(wall.id, x, y);
    label(wall.id, x + 1, y + 2.7, 3.6);
  });

}

function addWallAssembly({ kit, label }: SectionBuilder): void {
  const corners = new Map([['0,0', 'W7-4'], ['7,0', 'W7-3'], ['0,4', 'W7-2'], ['7,4', 'W7-1']]);
  const halves = new Map([['3,3', 'W3'], ['3,1', 'W4'], ['4,3', 'W5'], ['4,1', 'W6']]);
  for (let x = 0; x < 8; x++) {
    kit.solid('A', 1 + x, 0);
    kit.solid('A', 12 + x, 0);
    for (let y = 0; y < 5; y++) {
      const key = `${x},${y}`;
      const inLeftWindow = x >= 1 && x < 3 && y >= 2 && y < 4;
      const inRightWindow = x >= 5 && x < 7 && y >= 2 && y < 4;
      if (!inLeftWindow && !inRightWindow) {
        const id = x === 0 && y === 2 ? 'W1' : x === 7 && y === 2 ? 'W2' : corners.get(key) ?? halves.get(key) ?? 'W0';
        kit.wall(id, 1 + x, 1 + y);
      }
      if (!(x >= 2 && x < 5 && y >= 2 && y < 4)) kit.wall('W0', 12 + x, 1 + y);
    }
  }
  for (const [prefix, x] of [['W2', 2], ['W8', 6]] as const) {
    kit.wall(`${prefix}-BL`, x, 3); kit.wall(`${prefix}-BR`, x + 1, 3);
    kit.wall(`${prefix}-TL`, x, 4); kit.wall(`${prefix}-TR`, x + 1, 4);
  }
  kit.window(3, 2, 14, 3, 'rectangle');
  label(() => t('四向半墙 · 拼窗 · 斜墙装配'), 5, 7, 8);
  label(() => t('34 整墙格 + 3×2 真开口'), 16, 7, 8);
}

function addPlatforms({ kit, label }: SectionBuilder): void {
  const names = { full: '整宽', left: '左半', right: '右半' };
  ([['整砖顶齐', 1], ['半砖顶齐', .5]] as const).forEach(([alignment, top], row) => {
    let column = 0;
    for (const hung of [true, false]) for (const width of ['full', 'left', 'right'] as const) {
      const x = 2 + column * 4;
      const y = 2 + row * 4;
      if (hung) kit.wall('W0', x, y);
      kit.platform(width, y + top, x);
      kit.solid(row === 0 ? 'A' : 'B', x - 1, y);
      label(() => `${t(names[width])} · ${t(hung ? '挂墙深 1.5' : '居中深 1')}`, x + .3, y + 1.65, 3.6);
      column++;
    }
    label(() => t(alignment), 12, 4.65 + row * 4, 6);
  });
}

interface RoomDefinition {
  id: string;
  title: string;
  description: string;
  floors: readonly number[];
  ceilings: readonly number[];
  base: 'A' | 'C';
  roof: 'A' | 'B';
  slab: 'A' | 'B' | 'C';
  halfSides: boolean;
}

export const DEFINITION_ROOMS: readonly RoomDefinition[] = [
  { id: 'room-full', title: '整砖单间', description: '净宽 9 · 净高 5 · 总高 7；左门、2×2 窗与一格吊灯。', floors: [1], ceilings: [6], base: 'A', roof: 'A', slab: 'A', halfSides: false },
  { id: 'room-half', title: '半砖单间', description: 'C 上半砖地板 + B 下半砖屋顶；净宽 9 · 净高 5 · 实体总高 6。', floors: [1], ceilings: [6], base: 'C', roof: 'B', slab: 'A', halfSides: false },
  { id: 'room-classic', title: '整砖两层 · 13 格', description: '底板、楼板和顶板各 1 格；两层净高各 5；2 格通口，平台相对顶高 2 / 4 / 6。', floors: [1, 7], ceilings: [6, 12], base: 'A', roof: 'A', slab: 'A', halfSides: false },
  { id: 'room-slab-full', title: '层间组合 A · 整砖', description: '相对一层地面：A 楼板高 5～6、二层落脚面 6；两层净高 5 / 5，总高 12。', floors: [1, 7], ceilings: [6, 12], base: 'C', roof: 'B', slab: 'A', halfSides: true },
  { id: 'room-slab-upper', title: '层间组合 C · 上半砖', description: '相对一层地面：C 楼板底面 5.5、顶面 6；一层多半格净高，吊灯贴实际底面。', floors: [1, 7], ceilings: [6.5, 12], base: 'C', roof: 'B', slab: 'C', halfSides: true },
  { id: 'room-slab-lower', title: '层间组合 B + H', description: '相对一层地面：门口高 6，H 高段降到 B 楼面 5.5；二层背景墙仍按世界整数格铺设。', floors: [1, 6.5], ceilings: [6, 12], base: 'C', roof: 'B', slab: 'B', halfSides: true },
];

export function addDefinitionRoom({ kit, furniture }: { kit: Kit; furniture(kind: FurnitureKind, x: number, y: number): void }, room: RoomDefinition, throughDoors = false): void {
  const roofY = room.ceilings[room.ceilings.length - 1]!;
  // 半砖侧墙只占格内一半宽，屋顶拐角取侧墙与屋顶的交集，否则屋顶板会伸出墙外半格。底板两端接地面，保持整格宽。
  const corners = { A: ['L', 'K'], B: ['N', 'M'] } as const;
  for (let x = 0; x < 11; x++) {
    kit.solid(room.base, x, 0);
    kit.solid(room.halfSides && (x === 0 || x === 10) ? corners[room.roof][x === 0 ? 0 : 1] : room.roof, x, roofY);
    if (room.floors.length === 2 && (x < 4 || x >= 6)) {
      const shape = room.halfSides && x === 0 ? 'L' : room.halfSides && x === 10 ? 'K'
        : room.slab === 'B' && x === 1 ? 'H' : room.slab;
      kit.solid(shape, x, 6);
    }
  }
  for (let y = 1; y < roofY; y++) {
    const doorCell = y < 5 || room.floors.length === 2 && y >= 7 && y < 11;
    if (!doorCell && !(room.floors.length === 2 && y === 6)) kit.solid(room.halfSides ? 'L' : 'A', 0, y);
    if (!(room.floors.length === 2 && y === 6) && !(throughDoors && doorCell)) kit.solid(room.halfSides ? 'K' : 'A', 10, y);
    for (let x = 1; x < 10; x++) {
      const windowCell = x >= 7 && x < 9 && (y >= 3 && y < 5 || room.floors.length === 2 && y >= 9 && y < 11);
      if (!windowCell) kit.wall('W0', x, y);
    }
  }
  room.floors.forEach((floor, index) => {
    const doorY = index === 0 ? 1 : 7;
    kit.door('left', room.halfSides ? .5 : 0, doorY, throughDoors ? 3.5 : 3);
    if (throughDoors) kit.door('right', 10, doorY, 3.5);
    kit.window(2, 2, 7, index === 0 ? 3 : 9, 'rectangle', true);
    furniture('pendant', 2.5, room.ceilings[index]! - 1);
    const besideRamp = room.slab === 'B' && index === 1;
    furniture(index === 0 && room.floors.length === 2 ? 'table' : 'bed', besideRamp ? 6 : 1, floor);
    furniture(index === 0 ? 'workstation' : 'shelf', besideRamp ? 2 : 6.5, floor);
  });
  if (room.floors.length === 2) {
    for (const top of [3, 5, room.floors[1]!]) for (const x of [4, 5]) kit.platform('full', top, x);
  }
}

const FURNITURE: readonly (readonly [FurnitureKind, string, number, FurnitureOptions?])[] = [
  ['bed', '01 床 · 3×1', 3], ['pendant', '02 吊灯 · 1×1', 1],
  ['workstation', '03 算力工作站 · 2×3', 2], ['depot', '04 储物仓 · 2×2', 2],
  ['dock', '05 机器人坞 · 3×2', 3], ['battery', '06 蓄电池柜 · 1×2', 1],
  ['terminal-compute', '07A 算力组件商 · 1×2', 1], ['terminal-robot', '07B 机器人技师 · 1×2', 1],
  ['solar', '08A 太阳能板 · 深2', 1, { solarDepth: 2 }], ['solar', '08B 太阳能板 · 深3 外延', 1, { solarDepth: 3 }],
  ['table', '09 普通桌 · 2×2', 2],
  ['chair', '10A 椅子 · 朝前', 1, { chairFacing: 'front' }], ['chair', '10B 椅子 · 朝左', 1, { chairFacing: 'left' }],
  ['chair', '10C 椅子 · 朝右', 1, { chairFacing: 'right' }],
  ['shelf', '11 置物架 · 2×2', 2], ['plant', '12 盆栽 · 1×2', 1],
];

// 间隔3格：人物离家具1格才开始让位，件与件之间能回到中线。
const FURNITURE_GAP = 3;
// 长廊挂墙平台上的家具间隔2格；树种之间留6格，树冠不互相遮挡。
const CORRIDOR_GAP = 2;
// 灌木整丛后置在人物身体区之后，根中心在格子内 Z=−0.6（定义坐标 +Z 朝后沿）。
const SHRUB_ROOT_Z = .6;
const CORRIDOR_TREE_GAP = 8;
/** 长廊岩石按游戏四档分区；岩脚与石缝草随中石、大石成组出现。 */
const ROCK_TIERS: readonly (readonly [string, readonly RockKind[]])[] = [
  ['地面碎石 · 直接踩过', [...SMALL_ROCKS]],
  ['中石成组 · 经过让位', [...MID_ROCKS]],
  ['大石成组 · 让位 · 顶面可站', [...BIG_ROCKS]],
  ['景观岩 · 占背景墙层 · 该处不修墙', [...LANDMARK_ROCKS]],
];
/** 每件岩石占的列数：组宽含附石，大石最宽 3.5，岩壁约 4.6。 */
const rockSlot = (kind: RockKind): number => SMALL_ROCKS.has(kind) ? 2 : MID_ROCKS.has(kind) ? 4 : BIG_ROCKS.has(kind) ? 6 : kind === 'hoodoo' ? 4 : 7;
const FURNITURE_GALLERY_WIDTH = FURNITURE.reduce((x, [, , width]) => x + width + FURNITURE_GAP, 1);

/** 全部家具沿分区地表排成一行，可以连续走过。 */
function addFurnitureGallery({ kit, furniture, label }: SectionBuilder): void {
  let x = 2;
  for (const [kind, name, width, options] of FURNITURE) {
    if (kind === 'pendant') {
      kit.solid('A', x, 3);
      furniture(kind, x, 2);
    } else furniture(kind, x, 0, options);
    label(() => t(name), x + width / 2, 4.8, 3.8);
    x += width + FURNITURE_GAP;
  }
}

/** 分区直接复用共享构件，选择目录时只显示当前独立场景。 */
export function createDefinitionSceneLayout(selectedId: string) {
  const root = new THREE.Group();
  root.name = 'definition-scene';
  const sections: SceneSection[] = [];
  const disposers: Array<() => void> = [];
  const solar: Vec2[] = [];
  const updates: Array<(time: number, player: WorkstationPlayer | null, solarAngle: (index: number) => number) => void> = [];
  const groups = new Map<string, THREE.Group>();
  const solids: DefinitionSolid[] = [];
  const platforms: DefinitionPlatformLine[] = [];
  const stands: SupportSurface[] = [];
  let tileDepthTrial: DefinitionDepthTrial | null = null;
  let nextX = 0;
  function section(id: string, title: string, description: string, width: number, height: number,
    items: readonly string[], build: (builder: SectionBuilder) => void, playerX = 1, playerY = 0, ground = 0): void {
    if (id !== selectedId) return;
    const x = nextX + ground;
    nextX += width + ground * 2 + 6;
    const group = new THREE.Group();
    groups.set(id, group);
    root.add(group);
    const kit = createDefinitionKit(id === 'tile-depth' ? { style: 'ai-city' } : {});
    kit.root.position.x = x;
    group.add(kit.root);
    disposers.push(() => kit.dispose());
    const label = (text: string | (() => string), localX: number, y: number, labelWidth = 4): void => {
      const sprite = caption(text, '#f4e7c4', labelWidth, true);
      sprite.position.set(x + localX, y, -.8);
      group.add(sprite);
      disposers.push(() => { sprite.material.map!.dispose(); sprite.material.dispose(); sprite.removeFromParent(); });
    };
    const blockers: Blocker[] = [];
    const furniture = (kind: FurnitureKind, localX: number, y: number, options: FurnitureOptions = {}): THREE.Group => {
      const view = createDefinitionFurniture(kind, options);
      // 太阳能与吊灯不挡人物行走，以人物平面居中；其余家具不论放在砖上还是平台上都贴格子背面。
      const centered = kind === 'solar' || kind === 'pendant';
      view.root.position.set(x + localX, y, centered ? 0 : FURNITURE_Z);
      if (!centered) view.root.scale.z *= -1;
      group.add(view.root);
      disposers.push(() => view.dispose());
      if (kind !== 'solar' && kind !== 'pendant') {
        const box = new THREE.Box3().setFromObject(view.root);
        const stand = FURNITURE_STAND_TOP[kind];
        const top = stand === undefined ? box.max.y : y + stand;
        blockers.push({ box, top });
        // 家具落脚面只承托，可以跳上去站立；盆栽叶冠不算落脚面。
        if (kind !== 'plant') stands.push({ left: box.min.x, right: box.max.x, top });
      }
      if (kind === 'solar') {
        const index = solar.push({ x: x + localX + .5, y }) - 1;
        updates.push((time, _player, solarAngle) => view.update!(time, solarAngle(index), null));
      } else if (view.update) updates.push((time, player) => view.update!(time, undefined, player));
      return view.root;
    };
    if (playerY === 0) for (let tile = 0; tile < width; tile++) kit.solid('A', tile, -1);
    // 地平面与分区内的落脚面齐平，并垫在整个分区下方，两侧各留 ground 格可以走进走出。
    for (let tile = -ground; tile < width + ground; tile++) {
      if (ground) kit.solid('A', tile, playerY - 2);
      if (tile < 0 || tile >= width) kit.solid('A', tile, playerY - 1);
    }
    build({ kit, x, label, furniture, blockers, stands, platforms });
    solids.push(...kit.solids.map(solid => ({ ...solid, points: solid.points.map(([px, py]) => [px + x, py] as const) })));
    platforms.push(...kit.platforms.map(platform => ({ ...platform, left: platform.left + x, right: platform.right + x })));
    if (id !== 'solar' && id !== 'liquids') label(() => t(title), width / 2, height + .8, Math.min(width * .55, 9));
    sections.push({ id, title: t(title), description, x: x - ground, y: 0, width: width + ground * 2, height: height + 2, playerX: x + playerX, playerY, items,
      ...(blockers.length ? { walkZ: walkAround(blockers) } : {}) });
  }
  // 长廊依次为：室内段（地面家具 + 拉通的挂墙平台放全部家具）→ 花草与灌木 → 树木 → 岩石 → 水池，全部复用游戏资源。
  const corridorLiquid = createDefinitionLiquid();
  disposers.push(() => corridorLiquid.dispose());
  const indoor = FURNITURE.reduce((end, [, , width]) => end + width + CORRIDOR_GAP, 2);
  const floraStart = indoor + 3;
  const treeStart = floraStart + FLORA_SPECIES.length * 2 + 3;
  const rockStart = treeStart + TREE_KINDS.length * CORRIDOR_TREE_GAP;
  const rockSpan = ROCK_TIERS.reduce((end, [, kinds]) => end + kinds.reduce((sum, kind) => sum + rockSlot(kind), 0), 0);
  const waterStart = rockStart + rockSpan + 2;
  const corridorWidth = waterStart + corridorLiquid.width + 3;
  let corridorTrees: { update(time: number): void } | undefined;
  section('depth-walk', '长廊全建筑展示',
    t('格子深2（Z=−1～+1），墙厚0.2紧贴格子背面；前沿+1～+1.5、后沿−1.5～−1在格子之外。室内段地面摆床、盆栽、桌椅（椅子朝左朝右朝向桌子）、置物架，上方两排平台各拉通{indoor}格并放入全部家具：下排背后有墙，挂墙深1.5（深3太阳能板会伸进后沿撞墙，空出这一格）；上排高过墙顶，居中深1。室外依次为{flora}种花草与{shrub}种灌木、{tree}种树木、{rock}种岩石和三个水池；花草根长在格子顶面上、铺满整格，前后棱一排叶片伸进前沿、后沿；灌木后置在格子内；树木冠团用满深度、约占Z −1.5～+0.3，树冠平台可站立；岩石按游戏四档：碎石散在整格可直接踩过，中石、大石按游戏规则成组（半埋主石、附石、碎石、岩脚、石缝草）且经过时让位、大石顶面可站，景观岩占背景墙那一层，正面贴格子背面，所在列不修背景墙。玩家平时走Z=0，离家具1格开始让到镜头侧，家具落脚面可站立。地面橙线依次为前沿边界、格子正面、中线、格子背面、后沿边界。')
      .replace('{indoor}', String(indoor)).replace('{flora}', String(FLORA_SPECIES.length)).replace('{shrub}', String(SHRUB_KINDS.length))
      .replace('{tree}', String(TREE_KINDS.length)).replace('{rock}', String(ROCK_KINDS.length)),
    corridorWidth, 15, [...['格子深2 · 前沿与后沿各0.5', '墙0.2紧贴格子背面', '地面家具 · 床长3、桌宽2', '挂墙平台拉通 · 放全部家具', '居中平台拉通 · 放全部家具', '椅子朝前 / 朝左 / 朝右'].map(item => t(item)),
      t('花草{flora}种 · 灌木{shrub}种').replace('{flora}', String(FLORA_SPECIES.length)).replace('{shrub}', String(SHRUB_KINDS.length)),
      t('树木{n}种').replace('{n}', String(TREE_KINDS.length)), t('岩石{n}种').replace('{n}', String(ROCK_KINDS.length)), t('水池 浅 / 中 / 深'), t('中线行走，过家具前让')],
    ({ kit, x, furniture, label, blockers, stands, platforms }) => {
      const { tile, reserve } = DEFINITION_DEPTH;
      for (let column = 0; column < corridorWidth; column++) {
        if (column < waterStart || column >= waterStart + corridorLiquid.width) kit.solid('A', column, 0);
      }
      for (let column = 0; column < indoor; column++) for (let y = 1; y < 8; y++) kit.wall('W0', column, y);
      for (const [kind, column, chairFacing] of [['bed', 3], ['plant', 9], ['bed', 13], ['chair', 19, 'right'], ['table', 20], ['chair', 22, 'left'], ['bed', 27], ['shelf', 35]] as const) {
        furniture(kind, column, 1, chairFacing ? { chairFacing } : {});
      }
      // 墙先铺好：顶5的一排背后有墙，自动挂墙；顶11的一排高过墙顶，自动居中。两排都比下一层人物头顶高，上下家具互不让位。
      const furnishRow = (top: number, hung: boolean): void => {
        for (let column = 0; column < indoor; column++) kit.platform('full', top, column);
        let column = 2;
        for (const [kind, , width, options] of FURNITURE) {
          if (kind === 'pendant') {
            kit.solid('A', column, top + 3);
            furniture(kind, column, top + 2);
          } else if (!hung || options?.solarDepth !== 3) furniture(kind, column, top, options);
          column += width + CORRIDOR_GAP;
        }
      };
      furnishRow(5, true);
      furnishRow(11, false);
      label(() => t('室内 · 地面家具、挂墙平台与居中平台上的全部家具'), indoor / 2, 14.8, 14);

      const flowers: FloraInstance[] = [];
      const shrubs: ShrubInstance[] = [];
      const rocks: RockInstance[] = [];
      const rockParts = createRockParts();
      const rng = mulberry32(0x5eed2d);
      const flowerTint = (rule: (typeof FLORA_RULES)[keyof typeof FLORA_RULES], i: number): number =>
        rule.palette.length ? rule.palette[i % rule.palette.length]! : 0xffffff;
      // 草皮是整格地被（几何深1.5），每列铺两条覆盖格子顶面 Z=[−1,+1]，与游戏一样按列铺满室外地面。
      for (let column = floraStart; column < waterStart; column++) {
        for (const z of [0, tile / 4]) {
          flowers.push({ species: 'turf', x: x + column + .5, y: 1, z, yaw: 0, tilt: 0, sx: rng() < .5 ? -1 : 1,
            sy: 1, shear: 0, tint: flowerTint(FLORA_RULES.turf, column) });
        }
      }
      label(() => t('草皮 · 铺满室外地面'), floraStart + 2, 3.2, 3);
      // 单株花草的根都长在格子顶面上；株体最宽±0.21，靠前后棱的一排叶片自然伸进前沿、后沿，根不出格。
      const plants = FLORA_SPECIES.filter(species => species !== 'turf' && species !== 'vine');
      plants.forEach((species, index) => {
        const rule = FLORA_RULES[species];
        const left = floraStart + index * 2;
        for (let i = 0; i < 24; i++) {
          const size = rule.size[0] + (rule.size[1] - rule.size[0]) * rng();
          const z = i % 3 === 0 ? (i % 2 ? 1 : -1) * (tile / 2 - .05 - rng() * .1) : (rng() - .5) * (tile - .2);
          flowers.push({ species, x: x + left + .1 + rng() * 1.8, y: 1, z,
            yaw: rng() * Math.PI * 2, tilt: 0, sx: size, sy: size, shear: 0, tint: flowerTint(rule, i) });
        }
        label(() => t(FLORA_LABELS[species]), left + 1, 2.4, 1.8);
      });
      // 垂藤与游戏一样长在台阶外沿：根在台阶顶棱上，翻过棱角向下垂挂。
      const step = floraStart + plants.length * 2 + 1;
      for (let column = step; column < step + 2; column++) kit.solid('A', column, 1);
      for (const [edge, yaw] of [[step, Math.PI], [step + 2, 0]] as const) {
        for (let i = 0; i < 6; i++) {
          const rule = FLORA_RULES.vine;
          flowers.push({ species: 'vine', x: x + edge, y: 2, z: -tile / 2 + .15 + i * (tile - .3) / 5, yaw, tilt: 0,
            sx: 1, sy: rule.size[0] + (rule.size[1] - rule.size[0]) * rng(), shear: 0, tint: flowerTint(rule, i) });
        }
      }
      label(() => t(FLORA_LABELS.vine), step + 1, 3.4, 2);
      // 台阶上方悬空两格，前后上棱挂游戏的三种垂藤（长1.5 / 2.2 / 3），底面内部再生一排垂藤；下方留出人物通行高度。
      const hangTop = 7;
      for (let column = step; column < step + 2; column++) kit.solid('A', column, hangTop - 1);
      const hanging: ClimberInstance[] = [];
      const underside: ClimberInstance[] = [];
      const hang = ['hang0', 'hang1', 'hang2'] as const;
      for (let i = 0; i < 6; i++) hanging.push(climberInstance(hang[i % 3]!, x + step + .17 + i * .33, hangTop - .02, tile / 2 + .01, 1, () => rng(), .5, 1));
      for (let i = 0; i < 6; i++) underside.push(climberInstance('bottomVine0', x + step + .33 + (i % 3) * .67, hangTop - 1.012, i < 3 ? -.5 : .5, 1, () => rng(), .5, 1));
      label(() => t('悬空格 · 前后棱垂藤 1.5 / 2.2 / 3 · 底面垂藤'), step + 1, hangTop + .8, 3.4);
      SHRUB_KINDS.forEach((kind, index) => {
        const rule = SHRUB_RULES[kind];
        const center = floraStart + 1.5 + index * 3;
        shrubs.push({ kind, x: x + center, y: 1, z: SHRUB_ROOT_Z, yaw: rng() * Math.PI, height: (rule.height[0] + rule.height[1]) / 2, tint: rule.palette[0]! });
        label(() => t(SHRUB_LABELS[kind]), center, 4.4, 2.4);
      });
      label(() => t('花草 {flora} 种（根在格子顶面）· 灌木 {shrub} 种（格子内后置）').replace('{flora}', String(FLORA_SPECIES.length)).replace('{shrub}', String(SHRUB_KINDS.length)), floraStart + FLORA_SPECIES.length, 6.2, 12);
      // 树木整株后置，与游戏同一套树种生成；树干列取整数格。
      const planned = TREE_KINDS.map((kind, index) =>
        planTree(kind, x + treeStart + 2 + index * CORRIDOR_TREE_GAP, 1, mulberry32(0x7a11 + index), index));
      // 树冠平台与游戏同一规则：平台行 ty 的整格顶面单向可站。
      for (const tree of planned) for (const pad of tree.platforms) platforms.push({ left: pad.x0, right: pad.x1 + 1, top: pad.ty + 1, tile: 'branch' });
      // 树干和家具一样让位：按树干外皮（主干中心 TREE_Z ± 半径）让到前沿 +0.5；树干没有落脚面，站在树冠上不算脚下。
      for (const tree of planned) blockers.push({ top: Infinity, box: new THREE.Box3(
        new THREE.Vector3(tree.x + .5 - tree.trunkRadius, tree.baseY, -(TREE_Z + tree.trunkRadius)),
        new THREE.Vector3(tree.x + .5 + tree.trunkRadius, tree.baseY + tree.trunkHeight, -(TREE_Z - tree.trunkRadius))) });
      const trees = createTreeView(planned);
      trees.root.scale.z = -1;
      kit.root.parent!.add(trees.root);
      const treeView = { x: x + treeStart - 4, y: -4, w: TREE_KINDS.length * CORRIDOR_TREE_GAP + 8, h: 24 };
      corridorTrees = { update: time => { trees.update(treeView, time); } };
      corridorTrees.update(0);
      disposers.push(() => trees.dispose());
      TREE_KINDS.forEach((kind, index) => label(() => t(TREE_LABELS[kind]), treeStart + 2.5 + index * CORRIDOR_TREE_GAP, 1.9, 2));
      label(() => t('树木 {n} 种 · 冠深约1.8 · 树冠可站').replace('{n}', String(TREE_KINDS.length)), treeStart + TREE_KINDS.length * CORRIDOR_TREE_GAP / 2, 11.2, 8);
      // 岩石按游戏四档展示，直接调用游戏的生成函数：碎石散落可踩过；中石、大石成组（主石半埋 + 附石 + 碎石 + 岩脚 + 石缝草），
      // 经过时和家具一样让位，大石顶面可站；景观岩在后层，人物从前面走过。平地环境只给出地表高度与沙地列，生境按草地。
      const sandy = new Set<number>();
      const env: DecorEnv = { width: x + corridorWidth + 8, ground: c => sandy.has(c) ? 'sand' : 'grass', surfaceY: () => 1,
        relief: () => 0, foot: () => false, waterDistance: () => Infinity, shade: () => 0, edge: () => 0,
        desert: c => sandy.has(c) ? 1 : 0, blocked: () => false, trunkDistance: () => Infinity };
      const rockBounds = rockParts.map(part => { part.computeBoundingBox(); return part.boundingBox!; });
      const matrix = new THREE.Matrix4();
      // 景观岩不可站立，占背景墙那一层：正面贴格子背面 Z=−1，体量向后伸，所占的列不能再修背景墙。
      const inWallSlot = (rock: RockInstance): RockInstance => ({ ...rock,
        z: -tile / 2 - rockBounds[ROCK_KINDS.indexOf(rock.kind)]!.max.z * Math.min(rock.width / ROCK_NATIVE[rock.kind].width, rockMaxDepth(rock.kind)) });
      let rockColumn = rockStart;
      for (const [tier, kinds] of ROCK_TIERS) {
        const tierStart = rockColumn;
        for (const kind of kinds) {
          const slot = rockSlot(kind);
          if (SAND_ROCKS.has(kind)) for (let column = rockColumn; column < rockColumn + slot; column++) sandy.add(x + column);
          const column = x + rockColumn + Math.floor(slot / 2);
          const group = SMALL_ROCKS.has(kind) ? [scatterRockFor(env, column, kind)]
            : LANDMARK_ROCKS.has(kind) ? [inWallSlot(landmarkInstance(env, kind, column, ROCK_SALT))] : rockGroupFor(env, column, kind);
          // 游戏 z 以镜头侧为正，长廊局部 +Z 朝后沿，翻转后与实际渲染位置一致。
          const flipped = group.map(rock => ({ ...rock, z: -rock.z }));
          rocks.push(...flipped);
          const main = flipped[0]!;
          const box = rockBounds[ROCK_KINDS.indexOf(kind)]!.clone()
            .applyMatrix4(decorMatrix(main, ROCK_NATIVE[kind].width, rockMaxDepth(kind), matrix));
          if (MID_ROCKS.has(kind) || BIG_ROCKS.has(kind)) {
            const standable = BIG_ROCKS.has(kind);
            blockers.push({ box, top: standable ? box.max.y : Infinity });
            if (standable) stands.push({ left: main.x - main.width * .3, right: main.x + main.width * .3, top: box.max.y });
          }
          label(() => t(ROCK_LABELS[kind]), rockColumn + slot / 2, Math.max(2, box.max.y + .6), 2);
          rockColumn += slot;
        }
        label(() => t(tier), (tierStart + rockColumn) / 2, 7.2, 5);
      }
      corridorLiquid.root.position.x = x + waterStart;
      kit.root.parent!.add(corridorLiquid.root);
      solids.push(...corridorLiquid.solids.map(solid => ({ ...solid, points: solid.points.map(([px, py]) => [px + x + waterStart, py] as const) })));
      label(() => t('水池 · 浅 / 中 / 深'), waterStart + corridorLiquid.width / 2, 6.2, 6);

      const points: THREE.Vector3[] = [];
      for (const z of [-tile / 2 - reserve, -tile / 2, 0, tile / 2, tile / 2 + reserve]) points.push(new THREE.Vector3(0, 1.012, z), new THREE.Vector3(waterStart, 1.012, z));
      const time = { value: 0 };
      const geometries = createFloraGeometries();
      const floraMaterial = createWindMaterial(time);
      const floraMeshes = createFloraMeshes(flowers, geometries, floraMaterial, 'depth-walk');
      const atlas = createShrubAtlas();
      const shrubMaterial = createShrubMaterial(time);
      const shrubMesh = createShrubMesh(shrubs, atlas, shrubMaterial, 'depth-walk')!;
      const rockMaterial = createRockMaterial();
      const rockBatch = createDecorBatch(ROCK_KINDS, rockParts, rockMaterial, 'depth-walk-rocks', kind => ROCK_NATIVE[kind].width, rockMaxDepth, rocks.length);
      rockBatch.add(rocks);
      for (const part of rockParts) part.dispose();
      // 主石接地暗晕与游戏同一套。
      const aoGeometry = createRockAoGeometry();
      const aoMaterial = createRockAoMaterial();
      const aoBatch = createDecorBatch(['ao'] as const, [aoGeometry], aoMaterial, 'depth-walk-rock-ao', () => 1, () => 1.6, rocks.length);
      aoGeometry.dispose();
      aoBatch.mesh.receiveShadow = false;
      aoBatch.add(rockAoInstances(env, rocks));
      // 垂藤复用游戏攀附资源：局部 +Z 是瓦片正面，整组翻到定义坐标（+Z 朝后沿）；后棱那组再转半圈贴到背面。
      const climberMaterial = createClimberMaterial(time);
      const hangAtlas = createClimberAtlas('ground');
      const bottomAtlas = createClimberAtlas('attachment');
      const climbers = new THREE.Group();
      climbers.scale.z = -1;
      const back = createClimberMesh('ground', hanging, hangAtlas, climberMaterial, 'depth-walk-vines-back')!;
      back.rotation.y = Math.PI;
      back.position.x = 2 * (x + step + 1);
      climbers.add(createClimberMesh('ground', hanging, hangAtlas, climberMaterial, 'depth-walk-vines-front')!, back,
        createClimberMesh('attachment', underside, bottomAtlas, climberMaterial, 'depth-walk-vines-under')!);
      kit.root.parent!.add(...floraMeshes, shrubMesh, rockBatch.mesh, aoBatch.mesh, climbers);
      disposers.push(() => {
        for (const mesh of floraMeshes) mesh.dispose();
        for (const geometry of Object.values(geometries)) geometry.dispose();
        floraMaterial.dispose();
        shrubMesh.geometry.dispose(); shrubMesh.dispose(); atlas.dispose(); shrubMaterial.dispose();
        rockBatch.dispose(); rockMaterial.dispose(); aoBatch.dispose(); aoMaterial.dispose();
        for (const mesh of climbers.children as THREE.BatchedMesh[]) mesh.dispose();
        climbers.removeFromParent(); hangAtlas.dispose(); bottomAtlas.dispose(); climberMaterial.dispose();
      });
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ color: 0xcc8438 });
      kit.root.add(new THREE.LineSegments(geometry, material));
      disposers.push(() => { geometry.dispose(); material.dispose(); });
    }, Math.floor(corridorWidth / 2) + .5, 1);
  for (const room of DEFINITION_ROOMS) section(room.id, room.title, t('白色混凝土块与背景墙。{description}').replace('{description}', t(room.description)), 11,
    room.ceilings[room.ceilings.length - 1]! + 1,
    ['白色混凝土', '净宽9', '净洞3 + 一体门楣1', '2×2真窗口', '吊灯1×1', '满深家具', ...(room.floors.length === 2 ? ['2格通口', '挂墙单向平台'] : [])].map(item => t(item)),
    builder => addDefinitionRoom(builder, room), -3, 1, 6);
  section('tile-depth', '普通与加深格 · 深2 / 深3', t('暖白陶瓷复用同一形状与材质。加深格前后各扩0.5，中心不变；同格禁背景墙，半砖同样按完整格位判断。'), 16, 8,
    ['普通深2：前后−1～+1', '加深深3：前后−1.5～+1.5', '两格拼接：仍是两个宽1的格子', '2×2四格组合：基础格网不变，不代表新增大石头',
      '加深格与背景墙双向互斥；上方和相邻格允许', '右下试放区：放普通/加深格、放墙、拆除后重试'].map(item => t(item)),
    ({ kit, x, label }) => {
      for (const offset of [1, 3]) { kit.wall('W0', offset, 5); kit.solid(offset === 1 ? 'A' : 'C', offset, 5); }
      label(() => t('普通 A / C · 深2 · 可共墙'), 2.5, 7, 4.7);
      for (const offset of [6, 8]) kit.solid(offset === 6 ? 'A' : 'C', offset, 5, 'ceramic', 'deep');
      label(() => t('加深 A / C · 深3 · 禁同格墙'), 7.5, 7, 4.7);
      for (const offset of [12, 13]) kit.solid('C', offset, 5, 'ceramic', 'deep');
      label(() => t('两格拼接 · 宽1 + 宽1'), 13, 7, 4.2);
      for (const row of [1, 2]) for (const offset of [1, 2]) kit.solid('A', offset, row, 'ceramic', 'deep');
      label(() => t('2×2组合 · 仍占四格'), 2, 3.8, 4.2);
      kit.solid('C', 6, 1);
      kit.solid('C', 7, 1, 'ceramic', 'deep');
      kit.wall('W0', 7, 2);
      label(() => t('普通接加深 · 上方允许墙'), 7, 3.8, 4.7);
      tileDepthTrial = createDefinitionDepthTrial(x + 12, 1);
      kit.root.parent!.add(tileDepthTrial.root);
      disposers.push(tileDepthTrial.dispose);
      label(() => t('试放区 · 操作右侧面板'), 13, 3.8, 4.2);
    }, .5);
  section('shapes', '全部 33 种实体轮廓', t('整砖、四向半砖、四角四分之一砖、整坡、半坡、尖顶与高段的全部已画方向；统一深2。'), 35, 13,
    TILE_SHAPE_DEFINITIONS.map(shape => `${shape.id} ${t(shape.label)}`), addShapeGallery);
  section('joins', '全部 11 组明确拼接', t('所有模块按整数格与同一Z前后沿拼合；连续坡、台阶与尖顶坡谷分别保留。'), 26, 9,
    TILE_SHAPE_JOINS.map(shapes => shapes.join(' + ')), addJoinGallery);
  section('walls', '墙窗全形态 · 25 + 3', t('完整墙、真开口、四角模块、四向半墙与斜墙、玻璃窗棂，以及圆窗、拱窗和破损。'), 30, 18,
    WALL_DEFINITIONS.map(wall => `${wall.id} ${t(wall.label)}`), addWallGallery);
  section('wall-assembly', '墙体完整装配与跨格开窗', t('两面8×5墙：左边复现完整装配，右边为34个整墙格与一个3×2外围窗框，洞后不留墙。'), 22, 9,
    ['8×5墙窗装配', '四向半墙', '四向斜墙', '四块矩形拼窗', '四块斜角拼窗', '34墙格 + 3×2开口'].map(item => t(item)), addWallAssembly, .5);
  section('platforms', '全部 12 组平台组合', t('3种X占格 × 2种形态 × 2种高度对齐。背后有墙自动挂到墙面，深1.5（Z=−1～+0.5）；没有墙以Z=0居中，深1（Z=−0.5～+0.5）；两种前沿都在+0.5。板厚0.2为示例。'), 26, 10,
    ['挂墙', '居中'].flatMap(form => ['整宽', '左半', '右半'].flatMap(width => ['整砖顶齐', '半砖顶齐'].map(top => `${t(width)} · ${t(form)} · ${t(top)}`))), addPlatforms, .5);
  section('furniture', '全部 12 类家具 · 16 件', t('包括原选做桌、椅、架、盆栽；两种交易终端分别展示；太阳能板居中，正式两种：深2与格子同深，深3外延到前后沿；椅子朝前、朝左、朝右三个方向。家具深1贴格子背面，顶面可站立（椅子站座面、工作站站桌面），人物经过时向镜头侧让出；吊灯居中，不挡行走。'), FURNITURE_GALLERY_WIDTH, 6,
    FURNITURE.map(([, name]) => t(name)), addFurnitureGallery, .5);
  section('doors', '左右门与屋顶太阳能', t('门净洞3 + 一体上沿1；左右镜像安装，外侧半格安装范围与内侧留空分别保留。'), 14, 8,
    ['左门', '右门', '净洞3', '一体门楣1', '4块屋顶太阳能'].map(item => t(item)), ({ kit, furniture, label }) => {
      for (let x = 0; x < 14; x++) kit.solid('A', x, 0);
      kit.door('left', 1, 1, 3); kit.door('right', 5, 1, 3);
      for (let x = 8; x < 12; x++) { kit.solid('A', x, 3); furniture('solar', x, 4, { solarVariant: x === 8 ? 'left' : x === 11 ? 'right' : 'level' }); }
      label(() => t('左门'), 2, 5.8, 3); label(() => t('右门'), 6, 5.8, 3);
      label(() => t('开局四板 · 深2'), 10, 5.8, 4);
    }, 3, 1);
  const solarRowStart = solar.length;
  section('solar', '一整排太阳能 · 踩踏与追光', t('12块半格高面板在连续整砖顶逐格排开，每块宽1、高0.5、深2，居中安装。沿整排左右走动，脚下板面随受力倾转；离开的面板逐渐恢复追光。'), 16, 6,
    ['连续12格 · 每格一块整板', '整砖顶面 · 同高居中安装', '每块独立受力与恢复追光'].map(item => t(item)), ({ kit, furniture, label }) => {
      kit.solid('B', 1, 0);
      for (let x = 2; x < 14; x++) {
        kit.solid('A', x, 0);
        furniture('solar', x, 1);
      }
      kit.solid('B', 14, 0);
      label(() => t('连续12格 · 独立踩踏与追光'), 8, 4.6, 6);
    }, .5);
  if (selectedId === 'solar') sections[0]!.solarTrial = solarRowStart + 5;
  const liquid = createDefinitionLiquid();
  disposers.push(() => liquid.dispose());
  section('liquids', '液体 · 水位与透明度',
    t('三池净宽各4格，从左到右为约0.5 / 2 / 3格水深；清澈、翡翠、深蓝均是水的色板。复用游戏水面波动，当前只做展示，未接游泳、溢流或流动模拟。'),
    liquid.width, liquid.height, ['浅水约0.5格', '翡翠水深2格', '深蓝水深3格', '水体前后包围1格', '背景墙厚0.2', '真实游戏水材质'].map(item => t(item)),
    ({ kit, x }) => {
      liquid.root.position.x = x;
      kit.root.parent!.add(liquid.root);
      solids.push(...liquid.solids.map(solid => ({ ...solid, points: solid.points.map(([px, py]) => [px + x, py] as const) })));
    }, liquid.playerX, liquid.playerY);
  const terrainTextures = generateTileTextures(256);
  for (const scene of ROCK_TERRAIN_SCENES) {
    section(scene.id, scene.title, t(scene.description), scene.width, scene.height, scene.items.map(item => t(item)),
      ({ kit }) => kit.terrain(scene.cells, terrainTextures), scene.playerX, scene.playerY);
  }
  const data: DefinitionWorldData = { solids, platforms, stands, solar };
  let trialPlaced: readonly DefinitionSolid[] = [];
  return {
    root, sections, data, tileDepthTrial,
    /** 试放区的砖块随面板操作换掉；在两次模拟步进之间调用。 */
    syncDepthTrial(map: TileMap, offset: Vec2): void {
      for (const solid of trialPlaced) removeDefinitionSolid(map, solid, offset);
      trialPlaced = tileDepthTrial ? tileDepthTrial.solids : [];
      for (const solid of trialPlaced) placeDefinitionSolid(map, solid, offset);
    },
    update(time: number, player: WorkstationPlayer | null, solarAngle: (index: number) => number): void {
      for (const update of updates) update(time, player, solarAngle);
      if (selectedId === 'liquids') liquid.update(time);
      if (selectedId === 'depth-walk') {
        corridorLiquid.update(time);
        corridorTrees!.update(time);
      }
    },
    showSection(id: string): void { for (const [key, group] of groups) group.visible = key === id; },
    dispose(): void { for (const dispose of disposers.reverse()) dispose(); root.removeFromParent(); root.clear(); },
  };
}
