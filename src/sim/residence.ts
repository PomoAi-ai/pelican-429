import { TILE_SHAPE_DEFINITIONS } from '../config/definition-kit.ts';
import { getResidenceResource, RESIDENCE_SEGMENTS, RESIDENCE_SUN, RESIDENCE_WORLD, type ResidenceResource } from '../config/residence.ts';
import { GRASSY_HEIGHT } from '../config/grassy.ts';
import { TUNING } from '../config/tuning.ts';
import { createBody, type Body } from '../physics/body.ts';
import { definitionColliderSection, moveDefinitionBody, type DefinitionCollider, type DefinitionCollision, type DefinitionPlatform } from '../physics/definition-collision.ts';
import { createSolarPanel, solarTrackingAngle } from '../physics/solar-panel.ts';

export interface ResidencePlacement {
  readonly id: number;
  readonly resourceId: string;
  readonly x: number;
  readonly y: number;
  open?: boolean;
}

export interface ResidenceState {
  readonly placements: ResidencePlacement[];
  nextId: number;
  revision: number;
}

export interface ResidenceResult { readonly ok: boolean; readonly message: string; readonly id?: number }
export type ResidenceBody = Pick<Body, 'x' | 'y' | 'halfWidth' | 'height'>;
const EPS = .0001;
const rectangle = (x: number, y: number, width: number, height: number): DefinitionCollider => ({
  points: [[x, y], [x + width, y], [x + width, y + height], [x, y + height]],
});

function placementSolids(placement: ResidencePlacement, resource: ResidenceResource): DefinitionCollider[] {
  const { x, y } = placement;
  if (resource.kind === 'solid') {
    const shape = TILE_SHAPE_DEFINITIONS.find(item => item.id === resource.shape)!;
    return [{ points: shape.points.map(([px, py]) => [x + px, y + py]) }];
  }
  if (resource.kind === 'door') {
    const left = x + (resource.side === 'left' ? .5 : 0);
    return [rectangle(left, y + 3.5, .5, .5), ...placement.open ? [] : [rectangle(left, y, .5, 3.5)]];
  }
  return [];
}

function touchesBody(solid: DefinitionCollider, body: ResidenceBody): boolean {
  const section = definitionColliderSection(solid, 1, body.y + EPS, body.y + body.height - EPS);
  return section !== null && section[0] < body.x + body.halfWidth - EPS && section[1] > body.x - body.halfWidth + EPS;
}

function occupies(a: ResidencePlacement, ar: ResidenceResource, b: ResidencePlacement, br: ResidenceResource): boolean {
  if (ar.layer === br.layer) return a.x < b.x + br.width - EPS && a.x + ar.width > b.x + EPS
    && a.y < b.y + br.height - EPS && a.y + ar.height > b.y + EPS;
  if (ar.kind === 'furniture' && (br.kind === 'solid' || br.kind === 'door')) return occupies(b, br, a, ar);
  if ((ar.kind === 'solid' || ar.kind === 'door') && br.kind === 'furniture') {
    const footprint = { x: b.x + br.width / 2, y: b.y, halfWidth: br.width / 2, height: br.height };
    // 门保留关闭空间，不能把家具放进暂时开启的能量屏障中。
    return placementSolids({ ...a, open: false }, ar).some(solid => touchesBody(solid, footprint));
  }
  return false;
}

/** 平台坐标表示安装格下沿，顶面为 y + 0.5；实体保持整数世界格。 */
export function checkResidencePlacement(state: ResidenceState, resourceId: string, x: number, y: number,
  body: ResidenceBody | null): ResidenceResult {
  const resource = getResidenceResource(resourceId);
  const step = resource.kind === 'solid' || resource.kind === 'door' || resource.kind === 'wall' || resource.kind === 'glazing' ? 1 : .5;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x / step !== Math.round(x / step) || y / step !== Math.round(y / step)) {
    return { ok: false, message: step === 1 ? '此构件需要对齐整格' : '此构件需要对齐半格' };
  }
  if (x < RESIDENCE_WORLD.minX || x + resource.width > RESIDENCE_WORLD.maxX || y < 1 || y + resource.height > RESIDENCE_WORLD.height) {
    return { ok: false, message: '超出住宅建造范围' };
  }
  const placement: ResidencePlacement = { id: state.nextId, resourceId, x, y, ...resource.kind === 'door' ? { open: false } : {} };
  const solids = placementSolids(placement, resource);
  if (solids.length ? solids.some(solid => solid.points.some(([, py]) => py < RESIDENCE_WORLD.groundTop - EPS)) : y < RESIDENCE_WORLD.groundTop) {
    return { ok: false, message: '不能建入固定地面' };
  }
  if (state.placements.some(item => occupies(placement, resource, item, getResidenceResource(item.resourceId)))) {
    return { ok: false, message: '位置已被构件占用，请先拆除' };
  }
  // 太阳能实体由活动板面提供，建造时仍需为完整转动范围留出人物净空。
  const solar = resource.kind === 'furniture' && resource.furniture === 'solar';
  if (body !== null && (solids.some(solid => touchesBody(solid, body))
    || solar && touchesBody(rectangle(x, y, resource.width, resource.height), body))) {
    return { ok: false, message: '会挡住人物，请先离开该位置' };
  }
  return { ok: true, message: '可以放置' };
}

export function placeResidence(state: ResidenceState, resourceId: string, x: number, y: number,
  body: ResidenceBody | null): ResidenceResult {
  const result = checkResidencePlacement(state, resourceId, x, y, body);
  if (!result.ok) return result;
  const resource = getResidenceResource(resourceId);
  const id = state.nextId++;
  state.placements.push({ id, resourceId, x, y, ...resource.kind === 'door' ? { open: false } : {} });
  state.revision++;
  return { ok: true, message: `已放置${resource.label}`, id };
}

export function removeResidence(state: ResidenceState, id: number): ResidenceResult {
  const index = state.placements.findIndex(item => item.id === id);
  if (index === -1) return { ok: false, message: '该构件已不存在' };
  const resource = getResidenceResource(state.placements[index]!.resourceId);
  state.placements.splice(index, 1);
  state.revision++;
  return { ok: true, message: `已拆除${resource.label}`, id };
}

export function toggleResidenceDoor(state: ResidenceState, id: number, body: ResidenceBody): ResidenceResult {
  const placement = state.placements.find(item => item.id === id);
  if (!placement) return { ok: false, message: '该构件已不存在' };
  const resource = getResidenceResource(placement.resourceId);
  if (resource.kind !== 'door') return { ok: false, message: '这不是能量门' };
  if (placement.open && placementSolids({ ...placement, open: false }, resource).some(solid => touchesBody(solid, body))) {
    return { ok: false, message: '人物还在门中，不能关闭' };
  }
  placement.open = !placement.open;
  state.revision++;
  return { ok: true, message: placement.open ? '能量门已开启' : '能量门已关闭', id };
}

export function updateResidenceDoors(state: ResidenceState, body: ResidenceBody): boolean {
  let changed = false;
  for (const placement of state.placements) {
    const resource = getResidenceResource(placement.resourceId);
    if (resource.kind !== 'door') continue;
    const left = placement.x + (resource.side === 'left' ? .5 : 0);
    const gap = Math.max(left - body.x - body.halfWidth, body.x - body.halfWidth - left - .5, 0);
    // 关闭范围大于开启范围，避免人物在感应边缘移动时反复开关。
    const open = body.y < placement.y + 3.5 - EPS && body.y + body.height > placement.y + EPS
      && gap <= (placement.open ? 2.25 : 1.5);
    if (placement.open !== open && toggleResidenceDoor(state, placement.id, body).ok) changed = true;
  }
  return changed;
}

export function buildResidenceCollision(state: ResidenceState): DefinitionCollision {
  const { minX, maxX, width, height, groundTop } = RESIDENCE_WORLD;
  const solids: DefinitionCollider[] = [rectangle(minX - 1, -4, width + 2, groundTop + 4),
    rectangle(minX - 1, groundTop, 1, height), rectangle(maxX, groundTop, 1, height)];
  const platforms: DefinitionPlatform[] = [];
  for (const placement of state.placements) {
    const resource = getResidenceResource(placement.resourceId);
    solids.push(...placementSolids(placement, resource));
    if (resource.kind === 'platform') {
      const left = placement.x + (resource.platformWidth === 'right' ? .5 : 0);
      platforms.push({ left, right: left + (resource.platformWidth === 'full' ? 1 : .5), top: placement.y + .5 });
    } else if (resource.kind === 'furniture' && resource.standTop !== null) {
      platforms.push({ left: placement.x, right: placement.x + resource.width, top: placement.y + resource.standTop });
    }
  }
  return { solids, platforms };
}

/** 入口被改建时重新选真实落脚点，避免读取存档后把人物放进新建实体。 */
export function findSafeResidenceSpawn(state: ResidenceState, preferredX?: number): { x: number; y: number } {
  const geometry = buildResidenceCollision(state);
  const solar = state.placements.filter(item => item.resourceId === 'solar').map(item =>
    createSolarPanel(item.x + .5, item.y, solarTrackingAngle(RESIDENCE_SUN)).collider);
  const collision = { solids: [...geometry.solids, ...solar], platforms: geometry.platforms };
  const { minX, maxX, width, height, groundTop, spawn } = RESIDENCE_WORLD;
  const entrance = state.placements.filter(item => item.resourceId === 'door-left' || item.resourceId === 'door-right')
    .sort((a, b) => a.y - b.y)[0];
  const spawnX = preferredX ?? (entrance ? entrance.x + (entrance.resourceId === 'door-left' ? -2 : 2) : spawn.x);
  const halfWidth = TUNING.player.halfWidth;
  const columns: number[] = [];
  for (let distance = 0; distance < width; distance += .5) {
    for (const x of distance === 0 ? [spawnX] : [spawnX - distance, spawnX + distance]) {
      if (x >= minX + halfWidth && x <= maxX - halfWidth) columns.push(x);
    }
  }
  // 大院区按人物所在列索引候选物，封死的存档也不必逐格扫描整张地图。
  const local = Array.from({ length: width }, (): { solids: DefinitionCollider[]; platforms: DefinitionPlatform[] } => ({ solids: [], platforms: [] }));
  for (const solid of collision.solids) {
    const xs = solid.points.map(point => point[0]);
    const left = Math.max(0, Math.floor(Math.min(...xs) - halfWidth - minX));
    const right = Math.min(width - 1, Math.floor(Math.max(...xs) + halfWidth - minX));
    for (let x = left; x <= right; x++) local[x]!.solids.push(solid);
  }
  for (const platform of collision.platforms) {
    const left = Math.max(0, Math.floor(platform.left - halfWidth - minX));
    const right = Math.min(width - 1, Math.floor(platform.right + halfWidth - minX));
    for (let x = left; x <= right; x++) local[x]!.platforms.push(platform);
  }
  const supported = (x: number, y: number, drop: number): { x: number; y: number } | null => {
    const nearby = local[Math.floor(x - minX)]!;
    const body = createBody({ x, y, halfWidth, height: GRASSY_HEIGHT, vy: -1 });
    if (nearby.solids.some(solid => touchesBody(solid, body))) return null;
    moveDefinitionBody(body, nearby, drop);
    return body.onGround && !nearby.solids.some(solid => touchesBody(solid, body)) ? { x: body.x, y: body.y } : null;
  };
  for (const x of columns) {
    const point = supported(x, groundTop, 0);
    if (point) return point;
  }
  const maxFoot = height - GRASSY_HEIGHT;
  for (let y = groundTop + .5; y < maxFoot + .5; y += .5) {
    for (const x of columns) {
      const point = supported(x, Math.min(y, maxFoot), .5);
      if (point) return point;
    }
  }
  throw new Error('住宅没有安全入口：请保留至少一处有支撑、净高 3.1 格的站立空间。原存档不会被清空。');
}

export function createResidence(): ResidenceState {
  const state: ResidenceState = { placements: [], nextId: 1, revision: 0 };
  const add = (resourceId: string, x: number, y: number): void => {
    const result = placeResidence(state, resourceId, x, y, null);
    if (!result.ok) throw new Error(`住宅初始布局 ${resourceId} (${x}, ${y})：${result.message}`);
  };
  for (let x = 50; x <= 68; x++) {
    add('alloy-C', x, 1);
    add(x === 50 ? 'alloy-N' : x === 68 ? 'ceramic-M' : 'ceramic-B', x, 13);
    if (x > 50 && x < 68 && (x < 58 || x >= 60)) add('ceramic-C', x, 7);
  }
  const windows = [[53, 4], [63, 4], [53, 10], [63, 10]] as const;
  for (let y = 2; y < 13; y++) {
    if (y === 6 || y === 7 || y === 12) {
      add('alloy-L', 50, y);
      add('ceramic-K', 68, y);
    }
    for (let x = 51; x < 68; x++) {
      const opening = windows.some(([wx, wy]) => x >= wx && x < wx + 3 && y >= wy && y < wy + 2);
      if (!opening) add('wall', x, y);
    }
  }
  for (const y of [2, 8]) {
    add('door-left', 50, y);
    add('door-right', 68, y);
  }
  for (const [x, y] of windows) add('glazing-landscape', x, y);
  for (const y of [3.5, 5.5, 7.5]) for (const x of [58, 59]) add('platform-full', x, y);
  // 两格长的入口半砖踏步与室内齐平；楼上门外有同高落脚台。
  for (const x of [48, 49, 69, 70]) {
    add('ceramic-C', x, 1);
    add('platform-full', x, 7.5);
  }
  add('bed', 52, 8); add('shelf', 65, 8); add('plant', 56, 8); add('plant', 67, 8);
  add('workstation', 64, 2); add('chair-right', 62.5, 2); add('plant', 67, 2);
  add('depot', 52, 2); add('battery', 54, 2); add('terminal-compute', 55.5, 2);
  add('pendant', 53, 6.5); add('pendant', 64, 6.5);
  add('pendant', 53, 12); add('pendant', 64, 12);
  for (const x of [57, 58, 59, 60, 61, 62]) add('solar', x, 13.5);
  for (const x of [51, 53, 65]) add('planter', x, 13.5);
  add('railing', 63, 13.5);
  add('energy-column', 44.5, 1.5); add('planter', 46, 1.5); add('planter', 72, 1.5);
  for (const [x, y] of [[51, 5.5], [67, 5.5], [51, 11.5], [67, 11.5]]) add('wall-light', x!, y!);
  for (let x = 51; x < 68; x++) {
    if (x < 58 || x >= 60) add('trim-straight', x, 7.5);
    add('trim-straight', x, 13);
  }
  // 园廊与服务庭院是实际可走的构件，远景装饰不承担碰撞。
  for (let x = 28; x < 40; x++) add('ceramic-C', x, 1);
  for (const x of [28, 30, 36, 38]) add('planter', x, 2);
  add('table', 33, 2); add('chair-right', 31.5, 2); add('chair-left', 35, 2);
  for (const x of [25, 41, 76, 101, 116]) add('bollard-light', x, 1.5);
  for (let x = 82; x <= 95; x++) {
    add('alloy-C', x, 1);
    add(x === 82 ? 'ceramic-N' : x === 95 ? 'ceramic-M' : 'ceramic-B', x, 7);
    for (let y = 2; y < 7; y++) {
      if (x === 82 && y >= 6) add('alloy-L', x, y);
      else if (x === 95 && y >= 6) add('ceramic-K', x, y);
      if (x > 82 && x < 95 && !(x >= 87 && x < 90 && y >= 4 && y < 6)) add('wall', x, y);
    }
  }
  add('door-left', 82, 2); add('door-right', 95, 2); add('glazing-landscape', 87, 4);
  for (const x of [80, 81, 96, 97]) add('ceramic-C', x, 1);
  add('dock', 84, 2); add('battery', 88, 2); add('terminal-robot', 90, 2);
  add('workstation', 92, 2); add('plant', 94, 2);
  for (const x of [84, 85, 86, 87]) add('solar', x, 7.5);
  add('planter', 91, 7.5); add('railing', 93, 7.5);
  add('pendant', 88, 6);
  // 主院区保持原坐标，两侧分段共用真实平台、休息处和能源设备。
  for (const { index, x } of RESIDENCE_SEGMENTS) {
    if (index === 0) continue;
    for (let offset = 26; offset < 40; offset++) add('ceramic-C', x + offset, 1);
    add('table', x + 32, 2); add('chair-right', x + 30.5, 2); add('chair-left', x + 34.5, 2);
    add('chair', x + 37, 2); add('planter', x + 26, 2); add('planter', x + 38, 2);
    add('energy-column', x + 76, 1.5); add('battery', x + 78, 1.5);
    add('plant', x + 80, 1.5);
    for (const offset of [12, 48, 88, 116]) add('bollard-light', x + offset, 1.5);
    for (let level = 0; level < 3; level++) for (let dx = 0; dx < 2; dx++) add('platform-full', x + 100 + level * 2 + dx, 3.5 + level * 2);
  }
  state.revision = 0;
  return state;
}
