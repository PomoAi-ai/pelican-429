import * as THREE from 'three';
import { createDefinitionLiquid } from '../render/definition-liquid.ts';
import { PLATFORM_DEFINITIONS } from '../config/definition-kit.ts';
import { ROCK_TERRAIN_SCENES } from '../config/rock-terrain.ts';
import { generateTileTextures } from '../render/tile-textures.ts';
import type { DefinitionCollider, DefinitionPlatform } from '../physics/definition-collision.ts';
import { createDefinitionKit, type DefinitionKit } from '../render/definition-kit.ts';
import { createDefinitionFurniture, type FurnitureKind } from '../render/definition-furniture.ts';
import { addDefinitionRoom, DEFINITION_ROOMS, type SceneSection } from './definition-scene-layout.ts';
import type { SolarVariant } from '../config/building-kit.ts';
import type { BuildingKitView } from '../render/building-kit.ts';
import { createSolarPanel, solarTrackingAngle, type SolarPanelState } from '../physics/solar-panel.ts';
import { createSettlementLandscape } from './settlement-landscape.ts';

interface Placement { kind: string; id: string; x: number; y: number }
interface TownBuilder {
  kit: DefinitionKit;
  furniture(kind: FurnitureKind, x: number, y: number, depth?: 1 | .5, orientation?: SolarVariant): void;
}

const BUILDINGS = [
  { id: 'room-full', x: 4, y: 2, name: '整砖旅舍' },
  { id: 'room-half', x: 20, y: 2, name: '半砖茶室' },
  { id: 'room-classic', x: 36, y: 2, name: '整砖工坊' },
  { id: 'room-slab-full', x: 52, y: 2, name: 'A 楼板书院' },
  { id: 'room-slab-upper', x: 68, y: 2, name: 'C 楼板公馆' },
  { id: 'room-slab-lower', x: 84, y: 2, name: 'B + H 客栈' },
] as const;

const JOINS = [
  ['A', 'A'], ['B', 'A'], ['F', 'G'], ['H', 'I'], ['D', 'A'], ['A', 'E'],
  ['D', 'E'], ['E', 'D'], ['F', 'B', 'I'], ['J', 'J'], ['J', 'B'],
] as const;

function buildStreets({ kit }: TownBuilder): void {
  for (let x = 0; x < 100; x++) {
    kit.solid('A', x, 0);
    // 六种房屋各自保留真实底板；主街与房间地面统一在 Y=3。
    if (!BUILDINGS.some(building => x >= building.x && x < building.x + 11)) kit.solid('A', x, 2);
  }
  // 街基用连续承托和通风拱洞；形态变体在矿洞、桥墩、遗迹中承担各自用途。
  for (let x = 0; x < 100; x += 4) {
    kit.solid('D-U', x, 1); kit.solid('E-U', x + 1, 1);
    kit.solid('A', x + 2, 1); kit.solid('A', x + 3, 1);
  }
}

function buildGalleries({ kit, furniture }: TownBuilder): void {
  // 同样宽的室外竖井连接主街、二层和屋顶，窗墙在后景，不形成挡路柱。
  for (const [index, center] of [17.5, 33.5, 49.5, 65.5, 81.5, 97.5].entries()) {
    for (let step = 0; step < 3; step++) {
      const definition = PLATFORM_DEFINITIONS[index * 3 + step]!;
      const top = 4 + step * 2 + definition.top;
      kit.platform(definition.width, definition.depth, top, center - 1);
      kit.platform('full', definition.depth, top, center);
    }
    for (const top of index === 0 ? [] : [11, 13]) {
      kit.platform('full', .75, top, center - 1);
      kit.platform('full', .75, top, center);
    }
    for (const top of index === 0 ? [9] : [9, 15]) {
      // 旅舍屋檐延长一格承托整排面板，连廊从实体屋檐外开始。
      for (let x = center - 2.5 + (index === 0 ? 1 : 0); x < Math.min(center + 2.5, 100); x++) kit.platform('full', .75, top, x);
    }
  }
  furniture('terminal-compute', 15.5, 3);
  furniture('terminal-robot', 18, 3);
  furniture('dock', 31, 3);
  furniture('battery', 34, 3);
  furniture('depot', 47, 3);
  furniture('table', 63, 3);
  furniture('chair', 66, 3);
  furniture('plant', 79, 3);
  furniture('plant', 95, 3);
  kit.solid('A', 15, 8);
  for (let x = 4; x < 16; x++) furniture('solar', x, 9, 1, x === 4 ? 'left' : x === 15 ? 'right' : 'level');
}

/** 连通的湖桥、矿道与空岛；主路顶面不因摆放样例而出现挡头障碍。 */
function buildExpeditionRoutes({ kit, furniture }: TownBuilder): void {
  for (let x = 100; x < 240; x++) {
    if (x < 118 || x >= 124 && x < 168) kit.platform('full', .75, 3, x);
    else { kit.solid('A', x, 2); kit.solid('A', x, 0); }
  }
  // 地面桥下留出可走的矿道，两端竖井可下穿、逐层跳回街面。
  for (let x = 124; x < 168; x++) kit.solid('A', x, -8);
  for (const x of [124, 167]) for (let y = -7; y < 3; y++) kit.solid('A', x, y);
  for (const x of [126, 161]) for (const top of [-5, -3, -1, 1]) {
    kit.platform('full', .5, top, x); kit.platform('full', .5, top, x + 1);
  }
  for (let x = 128; x < 161; x++) for (let y = -7; y < -2; y++) kit.wall('W0', x, y);
  const textures = generateTileTextures(128);
  for (const [id, dx, dy] of [['rock-soil', 127, -2], ['rock-ore', 144, -2], ['rock-island', 200, 14]] as const) {
    const scene = ROCK_TERRAIN_SCENES.find(scene => scene.id === id)!;
    kit.terrain(scene.cells.map(cell => ({ ...cell, x: cell.x + dx, y: cell.y + dy })), textures);
  }
  // 岩肩把地层接入两端井壁，整坡和倒坡形成洞口而非独立陈列块。
  for (const [x, shape] of [[128, 'D-U'], [140, 'E-U'], [141, 'D-U'], [142, 'A'], [143, 'A'], [153, 'A'], [154, 'E-U']] as const) kit.solid(shape, x, -2);
  for (const [x, shape] of [[131, 'F-180'], [132, 'G-180'], [137, 'H-180'], [138, 'I-180'], [146, 'J-180']] as const) kit.solid(shape, x, -3);
  furniture('pendant', 130, -3, .5); furniture('pendant', 150, -3, .5);
  furniture('terminal-robot', 157, -7, .5);
  // 岸桥的11种接缝实际连接上方桥面与下方桥座。
  JOINS.forEach((ids, index) => ids.forEach((id, offset) => kit.solid(id, 170 + index * 6 + offset, 1)));
  // 天空支线与遗迹屋顶双向连接；两条梯路之间保留空岛底部空气。
  for (const x of [198, 213]) for (const top of [5, 7, 9, 11, 13, 15, 17, 19, 21]) {
    kit.platform('full', .5, top, x); kit.platform('full', .5, top, x + 1);
  }
  for (let x = 198; x < 202; x++) kit.platform('full', .75, 21, x);
  for (let x = 210; x < 215; x++) kit.platform('full', .75, 21, x);
  furniture('table', 203, 21, .5); furniture('chair', 205, 21, .5); furniture('plant', 207, 21, .5);
}

/** 墙型在完整立面中装配，四角窗不再作为孤立零件散落街边。 */
function buildPublicSpaces({ kit, furniture }: TownBuilder): void {
  const facade = (left: number, width: number, openings: readonly { x: number; y: number; w: number; h: number; id: string }[]): void => {
    for (let x = left; x < left + width; x++) for (let y = 3; y < 8; y++) {
      if (!openings.some(hole => x >= hole.x && x < hole.x + hole.w && y >= hole.y && y < hole.y + hole.h)) kit.wall('W0', x, y);
    }
    for (const hole of openings) kit.wall(hole.id, hole.x, hole.y);
    for (let x = left; x < left + width; x++) kit.solid('B', x, 8);
  };
  facade(170, 15, [
    { x: 171, y: 4, w: 2, h: 2, id: 'round' }, { x: 175, y: 4, w: 3, h: 2, id: 'W2-3x2' },
    { x: 180, y: 4, w: 2, h: 2, id: 'glass-mullion' }, { x: 183, y: 5, w: 1, h: 1, id: 'W2' },
  ]);
  facade(188, 10, [{ x: 189, y: 4, w: 2, h: 2, id: 'arch' }, { x: 193, y: 4, w: 2, h: 2, id: 'broken' }]);
  facade(218, 20, [
    { x: 219, y: 4, w: 2, h: 2, id: 'W2-2x2' }, { x: 223, y: 4, w: 2, h: 2, id: 'W8' },
    { x: 227, y: 4, w: 2, h: 2, id: 'W1' }, { x: 231, y: 4, w: 2, h: 2, id: 'W1' },
    { x: 235, y: 4, w: 1, h: 1, id: 'glass' }, { x: 236, y: 4, w: 1, h: 1, id: 'mullion' },
  ]);
  for (const [prefix, x] of [['W2', 227], ['W8', 231]] as const) {
    kit.wall(`${prefix}-BL`, x, 4); kit.wall(`${prefix}-BR`, x + 1, 4);
    kit.wall(`${prefix}-TL`, x, 5); kit.wall(`${prefix}-TR`, x + 1, 5);
  }
  // 半墙作为庭院矮栏与柱边，斜墙拼成完整的两段山墙。
  for (const [id, x, y] of [['W3', 186, 3], ['W4', 186, 3], ['W5', 185, 3], ['W6', 187, 3],
    ['W7-1', 189, 9], ['W7-2', 188, 9], ['W7-3', 194, 9], ['W7-4', 195, 9]] as const) kit.wall(id, x, y);
  // 遗迹柱脚、檐角与左右破损岩肩使用小轮廓，主街下方和头顶保持净空。
  for (const [x, id, y] of [[188, 'M', 8.5], [189, 'N', 8.5], [194, 'O', 8], [195, 'P', 8]] as const) kit.solid(id, x, y);
  for (const [index, shape] of ['F', 'G', 'H', 'I', 'J'].entries()) {
    const y = 9 + index;
    kit.solid(`${shape}-90`, 188, y); kit.solid('L', 189, y);
    kit.solid('K', 194, y); kit.solid(`${shape}-270`, 195, y);
  }
  for (let x = 188; x < 196; x++) kit.solid('C', x, 13.5);
  // 满深物件集中到有独立进出的屋顶服务间，半深物件继续服务主街。
  for (let x = 170; x < 185; x++) kit.solid('A', x, 13);
  furniture('bed', 170, 8.5, 1); furniture('workstation', 175, 8.5, 1);
  furniture('shelf', 178, 8.5, 1); furniture('plant', 181, 8.5, 1); furniture('pendant', 177, 12, 1);
  furniture('table', 218, 8.5, 1); furniture('chair', 221, 8.5, 1); furniture('depot', 223, 8.5, 1);
  furniture('dock', 226, 8.5, 1); furniture('battery', 230, 8.5, 1);
  furniture('terminal-compute', 232, 8.5, 1); furniture('terminal-robot', 235, 8.5, 1);
  for (const x of [168, 216, 238]) for (const top of [5, 7, 8.5]) {
    kit.platform('full', .75, top, x); kit.platform('full', .75, top, x + 1);
  }
  kit.door('left', 170, 8.5, 3.5); kit.door('right', 184, 8.5, 3.5);
}

/** 主街、屋顶、地下矿道与空岛属于同一个世界，目录仅负责定位。 */
export function createDefinitionSettlementLayout() {
  const root = new THREE.Group();
  root.name = 'definition-settlement';
  const placements: Placement[] = [];
  const disposers: Array<() => void> = [];
  const solarPanels: SolarPanelState[] = [];
  const updates: Array<{ update: BuildingKitView['update']; panel: SolarPanelState }> = [];
  const sources: Array<{ kit: DefinitionKit; x: number; y: number }> = [];
  function builder(offsetX = 0, offsetY = 0): TownBuilder {
    const source = createDefinitionKit();
    sources.push({ kit: source, x: offsetX, y: offsetY });
    source.root.position.set(offsetX, offsetY, 0);
    root.add(source.root);
    disposers.push(() => source.dispose());
    const record = (kind: string, id: string, x: number, y: number): void => {
      placements.push({ kind, id, x: x + offsetX, y: y + offsetY });
    };
    const kit: DefinitionKit = {
      ...source,
      solid(id, x, y) { source.solid(id, x, y); record('实体', id, x, y); },
      terrain(cells, textures) {
        source.terrain(cells, textures);
        for (const cell of cells) record('地层', `${cell.material}${cell.ore ? '含矿' : ''} ${cell.shape}`, cell.x, cell.y);
      },
      wall(id, x, y) { source.wall(id, x, y); record('墙窗', id, x, y); },
      window(width, height, x, y, kind, glass, mullion) {
        source.window(width, height, x, y, kind, glass, mullion);
        record('窗口', `${width}×${height} ${kind}`, x, y);
      },
      platform(width, depth, top, x) {
        source.platform(width, depth, top, x);
        record('平台', `${width} / 深${depth} / 顶${Number((top % 1).toFixed(1)) || 1}`, x, top);
      },
      door(side, x, y, openingHeight) { source.door(side, x, y, openingHeight); record('门', side, x, y); },
    };
    return {
      kit,
      furniture(kind, x, y, depth = .5, orientation = 'level') {
        const view = createDefinitionFurniture(kind, depth, orientation);
        view.root.position.set(offsetX + x, offsetY + y, 0);
        if (kind !== 'solar') view.root.scale.z *= -1;
        root.add(view.root);
        disposers.push(() => view.dispose());
        if (kind === 'solar') {
          const panel = createSolarPanel(offsetX + x + .5, offsetY + y, 0);
          solarPanels.push(panel);
          updates.push({ update: view.update!, panel });
        }
        record('家具', `${kind === 'solar' ? `${kind}-${orientation}` : kind} · 深${depth}`, x, y);
      },
    };
  }
  const town = builder();
  buildStreets(town);
  for (const building of BUILDINGS) {
    const room = DEFINITION_ROOMS.find(room => room.id === building.id)!;
    const roomBuilder = builder(building.x, building.y);
    const furnishings: Partial<Record<FurnitureKind, FurnitureKind>> = building.id === 'room-half'
      ? { bed: 'table', workstation: 'chair' } : building.id === 'room-classic'
        ? { table: 'workstation', workstation: 'dock' } : building.id === 'room-slab-full'
          ? { bed: 'shelf', workstation: 'shelf' } : building.id === 'room-slab-upper'
            ? { workstation: 'plant' } : {};
    addDefinitionRoom({ kit: roomBuilder.kit, furniture: (kind, x, y) => roomBuilder.furniture(furnishings[kind] ?? kind, x, y) }, room, true);
    placements.push({ kind: '房屋', id: `${building.name} · ${room.title}`, x: building.x, y: building.y });
  }
  buildGalleries(town);
  buildExpeditionRoutes(town);
  buildPublicSpaces(town);
  JOINS.forEach((ids, index) => placements.push({ kind: '桥墩拼接', id: ids.join('+'), x: 170 + index * 6, y: 1 }));
  const landmarks = BUILDINGS.map((building, index) => ({
    id: building.id, title: building.name,
    description: `${['住宿与屋顶能源区', '茶室与街边休息点', '设备工坊与机器人维护区', '两层书架与阅读空间', '绿植居住庭院', '通往湖岸的旅客休息点'][index]}。半深家具靠后，人物保持砖块中线；室内外平台连接二层与屋顶，沿主街可骑行前往湖岸、矿道和遗迹。`,
    x: index * 16, y: 0, width: 20, height: 18,
    playerX: building.x + 9.2, playerY: 3,
  }));
  const sections: SceneSection[] = landmarks.map(landmark => {
    const visible = placements.filter(item => item.x >= landmark.x && item.x < landmark.x + landmark.width && item.y >= landmark.y && item.y < landmark.y + landmark.height);
    const unique = new Map<string, Placement>();
    for (const placement of visible) unique.set(`${placement.kind} ${placement.id}`, placement);
    return { ...landmark, items: [...unique.values()].map(item => `${item.kind} ${item.id} · (${item.x}, ${item.y})`) };
  });
  sections.push({
    id: 'solar', title: '旅舍屋顶 · 整排太阳能',
    description: '整砖旅舍屋顶连续铺12块太阳能板，宽1、高0.5、深1；从右侧室外平台可以登顶，沿面板走动会逐块受力，离开后恢复追光。',
    x: 2, y: 1, width: 20, height: 13, playerX: 16.5, playerY: 9,
    solarTrial: solarPanels[5]!,
    items: ['12块连续面板 · 居中安装', '真实屋顶支撑 · 右侧平台连接主街', '室内家具靠后半格 · 原宽高'],
  });
  const liquid = createDefinitionLiquid();
  liquid.root.position.set(100, -2, 0);
  root.add(liquid.root);
  disposers.push(() => liquid.dispose());
  sections.push({
    id: 'liquids', title: '湖岸 · 三水栈桥',
    description: '浅水花园、蓄水池与深水岸被连续栈桥连在一起，骑行可以直接过桥，也能下穿桥面观察水深。水面会波动，游泳与流动玩法尚未接入。',
    x: 99, y: -2, width: liquid.width + 2, height: liquid.height + 3,
    playerX: 102, playerY: 3,
    items: ['净宽各4格 · 浅水/翡翠水/深蓝水', '桥面与主街同高3 · 可双向骑行', '深1水体与剖面 · 池壁不挡路'],
  });
  for (const landmark of [
    { id: 'rock-soil', title: '土岩台地 · 矿道西井', x: 124, y: -8, width: 20, height: 14, playerX: 126.5, playerY: 3,
      description: '主街下方的土岩层构成矿道顶盖；从西井按 S 下行，沿地下通道向矿层前进，再从任一竖井跳回街面。', items: ['土中岩层 · 土石不重叠', '地下路面Y=-7', '双向竖井每段高差2', '地面骑行路线跨越井口'] },
    { id: 'rock-ore', title: '含矿洞厅 · 地下回路', x: 140, y: -8, width: 28, height: 14, playerX: 151, playerY: -7,
      description: '含矿围岩位于洞厅上方，灯与机器人终端标示通路；向左可到土岩西井，向右可从东井返回岸边。矿脉是宿主岩格的属性，目前可观察，尚不能采矿。', items: ['20岩格中5格含矿', '倒坡岩肩构成洞顶', '不叠加矿物碰撞', '两端出口与地面相连'] },
    { id: 'harbor', title: '海岸驿站 · 服务屋顶', x: 168, y: 0, width: 20, height: 17, playerX: 176, playerY: 3,
      description: '长窗与圆窗围成候船驿站；屋顶有独立卧铺和工作区，两侧梯路供走跳进出。满深家具位于支路空间，贯通主街保持畅通。', items: ['圆窗/长窗/玻璃窗棂完整立面', '满深床/工作站/书架/盆栽/吊灯', '上下两条路线 · 侧梯连通'] },
    { id: 'ruins', title: '遗迹庭院 · 观景门楼', x: 188, y: 0, width: 30, height: 18, playerX: 196.5, playerY: 3,
      description: '拱窗、破窗、半墙与岩肩组成遗迹门楼，小轮廓用作柱脚和檐角。主路穿过庭院，左右梯路通向上空观景岛。', items: ['斜墙山墙与完整拱窗/破窗', '四分砖柱脚与旋转轮廓岩肩', '地面与天空两条探索路线'] },
    { id: 'rock-island', title: '空岛花园 · 高处回路', x: 196, y: 12, width: 22, height: 14, playerX: 202.5, playerY: 21,
      description: '岛顶茶桌与绿植形成高处休息点，底岩由岛体向下收尖。左右都有连续平台梯，可从遗迹上来、从另一边返回，岛下保留真实空气。', items: ['空岛底岩 · 深1', '倒坡与倒尖顶连接岛体', '两端梯路 · 无需无限飞行也可到达', '岛顶半深桌椅与绿植'] },
    { id: 'arcade', title: '窗廊 · 屋顶设备间', x: 216, y: 0, width: 24, height: 15, playerX: 228, playerY: 3,
      description: '矩形与斜角四块窗在完整墙面中拼成真洞；屋顶设备间布置仓储、机器人坞与两类终端。两端平台与主街连通，适合比较整深设施的占用。', items: ['两组四角窗 · 洞后不补墙', '半墙/单独玻璃/窗棂', '满深桌椅/仓储/机器人坞/电池/两类终端'] },
  ]) {
    sections.push({ ...landmark, items: [...landmark.items, ...placements.filter(item => item.x >= landmark.x && item.x < landmark.x + landmark.width && item.y >= landmark.y && item.y < landmark.y + landmark.height).map(item => `${item.kind} ${item.id} · (${item.x}, ${item.y})`)] });
  }
  const landscape = createSettlementLandscape();
  root.add(landscape.root);
  disposers.push(landscape.dispose);
  const solids: DefinitionCollider[] = sources.flatMap(({ kit, x, y }) => kit.solids.map(solid => ({
    points: solid.points.map(([px, py]) => [px + x, py + y] as const),
  })));
  solids.push(...solarPanels.map(panel => panel.collider));
  solids.push(...liquid.solids.map(solid => ({ points: solid.points.map(([x, y]) => [x + 100, y - 2] as const) })));
  const platforms: DefinitionPlatform[] = sources.flatMap(({ kit, x, y }) => kit.platforms.map(platform => ({
    left: platform.left + x, right: platform.right + x, top: platform.top + y,
  })));
  return { root, sections, collision: { solids, platforms }, solarPanels,
    setSunDirection(sun: { x: number; y: number }): void {
      const angle = solarTrackingAngle(sun);
      for (const panel of solarPanels) panel.sunAngle = angle;
    },
    update(time: number): void { for (const { update, panel } of updates) update(time, panel.angle); liquid.update(time); landscape.update(time); },
    dispose(): void { for (const dispose of disposers.reverse()) dispose(); root.removeFromParent(); root.clear(); } };
}
