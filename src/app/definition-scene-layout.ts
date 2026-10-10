import * as THREE from 'three';
import { createDefinitionLiquid } from '../render/definition-liquid.ts';
import { TILE_SHAPE_DEFINITIONS, WALL_DEFINITIONS } from '../config/definition-kit.ts';
import { ROCK_TERRAIN_SCENES } from '../config/rock-terrain.ts';
import { createDefinitionKit } from '../render/definition-kit.ts';
import { createDefinitionFurniture } from '../render/definition-furniture.ts';
import { generateTileTextures } from '../render/tile-textures.ts';
import type { SolarVariant, SolarMounting } from '../config/building-kit.ts';
import type { BuildingKitView } from '../render/building-kit.ts';
import { createSolarPanel, solarTrackingAngle, type SolarPanelState } from '../physics/solar-panel.ts';
import { caption } from '../render/npc/npc-effects.ts';
import type { DefinitionCollider, DefinitionPlatform } from '../physics/definition-collision.ts';

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
  solarTrial?: SolarPanelState;
  comparison?: {
    fromX: number;
    toX: number;
    fadeFurniture: THREE.Group | null;
  };
}

type Kit = ReturnType<typeof createDefinitionKit>;
type FurnitureKind = Parameters<typeof createDefinitionFurniture>[0];
interface SectionBuilder {
  kit: Kit;
  x: number;
  label(text: string, x: number, y: number, width?: number): void;
  furniture(kind: FurnitureKind, x: number, y: number, depth?: 1 | .5, solarVariant?: SolarVariant, solarMounting?: SolarMounting): THREE.Group;
}

const JOINS = [
  ['A', 'A'], ['B', 'A'], ['F', 'G'], ['H', 'I'], ['D', 'A'], ['A', 'E'],
  ['D', 'E'], ['E', 'D'], ['F', 'B', 'I'], ['J', 'J'], ['J', 'B'],
] as const;

function addShapeGallery({ kit, label }: SectionBuilder): void {
  TILE_SHAPE_DEFINITIONS.forEach((shape, index) => {
    const x = 2 + index % 11 * 3;
    const y = 2 + Math.floor(index / 11) * 4;
    kit.solid(shape.id, x, y);
    label(shape.id, x + .5, y + 1.7, 2);
  });
}

function addJoinGallery({ kit, label }: SectionBuilder): void {
  JOINS.forEach((shapes, index) => {
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
  label('四向半墙 · 拼窗 · 斜墙装配', 5, 7, 8);
  label('34 整墙格 + 3×2 真开口', 16, 7, 8);
}

function addPlatforms({ kit, label }: SectionBuilder): void {
  const names = { full: '整宽', left: '左半', right: '右半' };
  const alignments = [['整砖顶齐', 1], ['半砖顶齐', .5], ['墙底对齐候选', .2]] as const;
  alignments.forEach(([alignment, top], row) => {
    let column = 0;
    for (const depth of [.75, .5] as const) for (const width of ['full', 'left', 'right'] as const) {
      const x = 2 + column * 4;
      const y = 2 + row * 4;
      kit.wall('W0', x, y);
      kit.platform(width, depth, y + top, x);
      if (row < 2) kit.solid(row === 0 ? 'A' : 'B', x - 1, y);
      label(`${names[width]} · 深 ${depth}`, x + .3, y + 1.65, 3.6);
      column++;
    }
    label(alignment, 12, 4.65 + row * 4, 6);
  });
}

export interface RoomDefinition {
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
  for (let x = 0; x < 11; x++) {
    kit.solid(room.base, x, 0);
    kit.solid(room.roof, x, roofY);
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
    for (const top of [3, 5, room.floors[1]!]) for (const x of [4, 5]) kit.platform('full', .5, top, x);
  }
}

const FURNITURE: readonly [FurnitureKind, string, number][] = [
  ['bed', '01 床 · 3×1', 3], ['pendant', '02 吊灯 · 1×1', 1],
  ['workstation', '03 算力工作站 · 2×2', 2], ['depot', '04 储物仓 · 2×2', 2],
  ['dock', '05 机器人坞 · 3×2', 3], ['battery', '06 蓄电池柜 · 1×2', 1],
  ['terminal-compute', '07A 算力组件商 · 1×2', 1], ['terminal-robot', '07B 机器人技师 · 1×2', 1],
  ['solar', '08 太阳能板 · 1×0.5', 1], ['table', '09 普通桌 · 3×2', 3],
  ['chair', '10 椅子 · 1×2', 1], ['shelf', '11 置物架 · 2×2', 2], ['plant', '12 盆栽 · 1×2', 1],
];

function addFurnitureGallery({ kit, furniture, label }: SectionBuilder, depth: 1 | .5 = 1): void {
  FURNITURE.forEach(([kind, name, width], index) => {
    const x = 1 + index % 7 * 4;
    const floor = 1 + Math.floor(index / 7) * 5;
    for (let dx = 0; dx < width; dx++) kit.solid('A', x + dx, floor - 1);
    if (kind === 'pendant') {
      kit.solid('A', x, floor + 3);
      furniture(kind, x, floor + 2, depth);
    } else furniture(kind, x, floor, depth);
    label(kind === 'solar' ? `${name} · 深1` : name, x + width / 2, floor + 3.8, 3.8);
  });
}

/** 分区直接复用共享构件，选择目录时只显示当前独立场景。 */
export function createDefinitionSceneLayout() {
  const root = new THREE.Group();
  root.name = 'definition-scene';
  const sections: SceneSection[] = [];
  const disposers: Array<() => void> = [];
  const solarPanels: SolarPanelState[] = [];
  const updates: Array<{ update: BuildingKitView['update']; panel: SolarPanelState }> = [];
  const groups = new Map<string, THREE.Group>();
  const solids: DefinitionCollider[] = [];
  const platforms: DefinitionPlatform[] = [];
  let nextX = 0;
  function section(id: string, title: string, description: string, width: number, height: number,
    items: readonly string[], build: (builder: SectionBuilder) => void, playerX = 1, playerY = 0): void {
    const x = nextX;
    nextX += width + 6;
    const group = new THREE.Group();
    groups.set(id, group);
    root.add(group);
    const kit = createDefinitionKit();
    kit.root.position.x = x;
    group.add(kit.root);
    disposers.push(() => kit.dispose());
    const label = (text: string, localX: number, y: number, labelWidth = 4): void => {
      const sprite = caption(text, '#f4e7c4', labelWidth, true);
      sprite.position.set(x + localX, y, -.8);
      group.add(sprite);
      disposers.push(() => { sprite.material.map!.dispose(); sprite.material.dispose(); sprite.removeFromParent(); });
    };
    const furniture = (kind: FurnitureKind, localX: number, y: number, depth: 1 | .5 = 1, solarVariant: SolarVariant = 'level', solarMounting: SolarMounting = 'center'): THREE.Group => {
      const view = createDefinitionFurniture(kind, depth, solarVariant, solarMounting);
      view.root.position.set(x + localX, y, 0);
      if (kind !== 'solar') view.root.scale.z *= -1;
      group.add(view.root);
      disposers.push(() => view.dispose());
      if (kind === 'solar') {
        const panel = createSolarPanel(x + localX + .5, y, 0);
        solarPanels.push(panel);
        solids.push(panel.collider);
        updates.push({ update: view.update!, panel });
      }
      return view.root;
    };
    if (playerY === 0) for (let tile = 0; tile < width; tile++) kit.solid('A', tile, -1);
    build({ kit, x, label, furniture });
    solids.push(...kit.solids.map(solid => ({ points: solid.points.map(([px, py]) => [px + x, py] as const) })));
    platforms.push(...kit.platforms.map(platform => ({ ...platform, left: platform.left + x, right: platform.right + x })));
    if (!id.startsWith('furniture-') && id !== 'solar' && id !== 'liquids') label(title, width / 2, height + .8, Math.min(width * .55, 9));
    sections.push({ id, title, description, x, y: 0, width, height: height + 2, playerX: x + playerX, playerY, items });
  }
  const comparisons = [
    { id: 'furniture-half', title: 'A 后半格床 · 中线站位', depth: .5,
      description: '候选：床靠墙占后半深0.5；人物固定砖块中线，不为家具前移或压薄。左右拖动，结合俯视检查真实重叠。' },
    { id: 'furniture-beside', title: 'B 满深床 · 侧边交互候选', depth: 1,
      description: '候选：床深1，保留侧边交互方案的比较；人物统一站在地面中线，可左右检查，不自动移到床边。' },
    { id: 'furniture-on-top', title: 'C 满深床 · 床面高度比较', depth: 1,
      description: '候选：比较床面高度与人物的关系；人物保持相同地面站位，不因床面高度自动抬升。' },
    { id: 'furniture-overlap', title: 'D 满深床 · 直接穿模', depth: 1,
      description: '反例：床深1，人物仍在中间平面。左右拖动会直接穿过床体，保留真实遮挡，用来观察关闭碰撞仍有穿模的问题。' },
    { id: 'furniture-blockers', title: 'E 左右设施 · 占用比较', depth: 1,
      description: '候选：左储物仓、右工作站占满深1；人物仍站在砖块中线，统一左右范围检查占用，阻挡规则尚未定稿。' },
    { id: 'furniture-fade', title: 'F 满深床 · 穿过时淡化', depth: 1,
      description: '显示策略候选：人物横向包围与床重叠时，床淡化到20%；离开恢复。几何仍相交，没有新增真实通道，俯视能看出差别。' },
  ] as const;
  for (const example of comparisons) {
    let fadeFurniture: THREE.Group | null = null;
    section(example.id, example.title, example.description, 9, 6,
      ['净高5剖开房间', `家具深${example.depth}`, '原高3.1侧身人物', '1格地面与半格深度线', '候选摆法，未改玩法'], ({ kit, furniture }) => {
        for (let x = 0; x < 9; x++) {
          kit.solid('A', x, 0);
          for (let y = 1; y < 6; y++) kit.wall('W0', x, y);
        }
        if (example.id === 'furniture-blockers') {
          furniture('depot', 1, 1); furniture('workstation', 6, 1);
        } else {
          const bed = furniture('bed', 3, 1, example.depth);
          if (example.id === 'furniture-fade') fadeFurniture = bed;
        }
        // 地面量尺与通道分界均来自实际世界坐标，不靠示意放大深度。
        const points: THREE.Vector3[] = [];
        for (const z of [-.5, 0, .5]) points.push(new THREE.Vector3(0, 1.012, z), new THREE.Vector3(9, 1.012, z));
        for (let x = 0; x <= 9; x++) points.push(new THREE.Vector3(x, 1.012, -.5), new THREE.Vector3(x, 1.012, .5));
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0xcc8438 });
        kit.root.add(new THREE.LineSegments(geometry, material));
        disposers.push(() => { geometry.dispose(); material.dispose(); });
        const floorGeometry = new THREE.PlaneGeometry(9, .5);
        for (const [z, color] of [[-.25, 0x70b789], [.25, 0x71aaca]] as const) {
          const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .28, depthWrite: false, side: THREE.DoubleSide });
          const guide = new THREE.Mesh(floorGeometry, material);
          guide.rotation.x = -Math.PI / 2; guide.position.set(4.5, 1.006, z);
          kit.root.add(guide);
          disposers.push(() => material.dispose());
        }
        disposers.push(() => floorGeometry.dispose());
      }, 4.5, 1);
    const added = sections[sections.length - 1]!;
    added.comparison = { fromX: added.x + 1, toX: added.x + 8, fadeFurniture };
  }
  for (const room of DEFINITION_ROOMS) section(room.id, room.title, room.description, 11,
    room.ceilings[room.ceilings.length - 1]! + 1,
    ['净宽9', '净洞3 + 一体门楣1', '2×2真窗口', '吊灯1×1', '满深家具', ...(room.floors.length === 2 ? ['2格通口', '居中单向平台'] : [])],
    builder => addDefinitionRoom(builder, room), room.floors.length === 1 ? 5 : 9.25, 1);
  section('shapes', '全部 33 种实体轮廓', '整砖、四向半砖、四角四分之一砖、整坡、半坡、尖顶与高段的全部已画方向；统一深1。', 35, 13,
    TILE_SHAPE_DEFINITIONS.map(shape => `${shape.id} ${shape.label}`), addShapeGallery);
  section('joins', '全部 11 组明确拼接', '所有模块按整数格与同一Z前后沿拼合；连续坡、台阶与尖顶坡谷分别保留。', 26, 9,
    JOINS.map(shapes => shapes.join(' + ')), addJoinGallery);
  section('walls', '墙窗全形态 · 25 + 3', '完整墙、真开口、四角模块、四向半墙与斜墙、玻璃窗棂，以及圆窗、拱窗和破损。', 30, 18,
    WALL_DEFINITIONS.map(wall => `${wall.id} ${wall.label}`), addWallGallery);
  section('wall-assembly', '墙体完整装配与跨格开窗', '两面8×5墙：左边复现完整装配，右边为34个整墙格与一个3×2外围窗框，洞后不留墙。', 22, 9,
    ['8×5墙窗装配', '四向半墙', '四向斜墙', '四块矩形拼窗', '四块斜角拼窗', '34墙格 + 3×2开口'], addWallAssembly, .5);
  section('platforms', '全部 18 组平台组合', '3种X占格 × 2种深度 × 3种高度对齐；全部以Z=0居中。厚0.2与墙底对齐保留为示例。', 26, 14,
    (['整宽', '左半', '右半']).flatMap(width => [.75, .5].flatMap(depth => ['整砖顶齐', '半砖顶齐', '墙底对齐候选'].map(top => `${width} · 深${depth} · ${top}`))), addPlatforms, .5);
  section('furniture', '全部 12 类家具 · 13 件', '包括原选做桌、椅、架、盆栽；两种交易终端分别展示。深度统一1，放置包围不当作实体碰撞。', 30, 12,
    FURNITURE.map(([, name]) => name), addFurnitureGallery, .5);
  section('furniture-half-gallery', '家具 · 半格深候选', '普通家具保留宽高，比较半格深版本；太阳能板始终深1，半格指高0.5。', 30, 12,
    FURNITURE.map(([kind, name]) => `${name} · 深${kind === 'solar' ? 1 : .5}`), builder => addFurnitureGallery(builder, .5), .5);
  section('doors', '左右门与屋顶太阳能', '门净洞3 + 一体上沿1；左右镜像安装，外侧半格安装范围与内侧留空分别保留。', 14, 8,
    ['左门', '右门', '净洞3', '一体门楣1', '4块屋顶太阳能'], ({ kit, furniture, label }) => {
      for (let x = 0; x < 14; x++) kit.solid('A', x, 0);
      kit.door('left', 1, 1, 3); kit.door('right', 5, 1, 3);
      for (let x = 8; x < 12; x++) { kit.solid('A', x, 3); furniture('solar', x, 4, 1, x === 8 ? 'left' : x === 11 ? 'right' : 'level'); }
      label('左门', 2, 5.8, 3); label('右门', 6, 5.8, 3);
      label('开局四板 · 深1', 10, 5.8, 4);
    }, 3, 1);
  const solarRowStart = solarPanels.length;
  section('solar', '一整排太阳能 · 踩踏与追光', '12块半格高面板在连续整砖顶逐格排开，每块宽1、高0.5、深1，居中安装。沿整排左右走动，脚下板面随受力倾转；离开的面板逐渐恢复追光。', 16, 6,
    ['连续12格 · 每格一块整板', '整砖顶面 · 同高居中安装', '每块独立受力与恢复追光'], ({ kit, furniture, label }) => {
      kit.solid('B', 1, 0);
      for (let x = 2; x < 14; x++) {
        kit.solid('A', x, 0);
        furniture('solar', x, 1, 1, 'level', 'center');
      }
      kit.solid('B', 14, 0);
      label('连续12格 · 独立踩踏与追光', 8, 4.6, 6);
    }, .5);
  sections[sections.length - 1]!.solarTrial = solarPanels[solarRowStart + 5]!;
  const liquid = createDefinitionLiquid();
  disposers.push(() => liquid.dispose());
  section('liquids', '液体 · 水位与透明度',
    '三池净宽各4格，从左到右为约0.5 / 2 / 3格水深；清澈、翡翠、深蓝均是水的色板。复用游戏水面波动，当前只做展示，未接游泳、溢流或流动模拟。',
    liquid.width, liquid.height, ['浅水约0.5格', '翡翠水深2格', '深蓝水深3格', '水体前后包围1格', '背景墙厚0.2', '真实游戏水材质'],
    ({ kit, x }) => {
      liquid.root.position.x = x;
      kit.root.parent!.add(liquid.root);
      solids.push(...liquid.solids.map(solid => ({ points: solid.points.map(([px, py]) => [px + x, py] as const) })));
    }, liquid.playerX, liquid.playerY);
  const terrainTextures = generateTileTextures(256);
  for (const scene of ROCK_TERRAIN_SCENES) {
    section(scene.id, scene.title, scene.description, scene.width, scene.height, scene.items,
      ({ kit }) => kit.terrain(scene.cells, terrainTextures), scene.playerX, scene.playerY);
  }
  return {
    root, sections, collision: { solids, platforms }, solarPanels,
    setSunDirection(sun: { x: number; y: number }): void {
      const angle = solarTrackingAngle(sun);
      for (const panel of solarPanels) panel.sunAngle = angle;
    },
    update(time: number): void { for (const { update, panel } of updates) update(time, panel.angle); if (groups.get('liquids')!.visible) liquid.update(time); },
    showSection(id: string): void { for (const [key, group] of groups) group.visible = key === id; },
    dispose(): void { for (const dispose of disposers.reverse()) dispose(); root.removeFromParent(); root.clear(); },
  };
}
