import { HOMESTEAD, isDaytime } from '../config/homestead.ts';
import type { ComputeMode, HomesteadBuild, HomesteadPurchase, RobotLevel } from '../config/homestead.ts';
import type { Rect } from '../core/math.ts';
import type { TreeInstance } from '../world/level.ts';
import { SHAPE_FULL } from '../world/tile-shapes.ts';
import { TILE_AIR, TILE_BRANCH, TILE_DIRT, TILE_GRASS, TILE_SAND, TILE_STONE } from '../world/tile-types.ts';
import { createHomestead, createRobot, GAME_HOUR, secondsUntilDawn, stepHomestead } from './homestead-economy.ts';
import type { Homestead, HomesteadRobot } from './homestead-economy.ts';
import { droneRoute, surfaceBelow } from './homestead-terrain.ts';
import type { RouteBlock } from './homestead-terrain.ts';
import type { SimWorld } from './sim-world.ts';

const { drone: DRONE, robots: ROBOTS, work: WORK, builds: BUILDS, shop: SHOP, storage: STORAGE, economy: ECONOMY } = HOMESTEAD;
/** 1 游戏秒对应的现实秒：1 游戏小时 = 60 现实秒。 */
const REAL_PER_GAME_SECOND = 60 / GAME_HOUR;
const NATURAL_TILES: ReadonlySet<number> = new Set([TILE_DIRT, TILE_GRASS, TILE_SAND, TILE_STONE]);
/** 每次框选最多新增的地块标记，防止一拖就挖穿整片地形。 */
const MAX_TILE_MARKS = 64;
/** 闲着的无人机每隔这么多游戏秒重新挑一次任务。 */
const SCAN_SECONDS = 30;
/** 与自由世界出生点安全区（±40 列）一致：设施要放在敌人进不来的范围里。 */
const LAYOUT_REACH = 40;

export type MarkBlock = RouteBlock | 'zone' | 'enemy' | 'level' | 'buried' | 'reach';
export type Mark =
  | { readonly id: number; readonly kind: 'tree'; readonly treeId: number; blocked: MarkBlock | null }
  | { readonly id: number; readonly kind: 'tile'; readonly tx: number; readonly ty: number; blocked: MarkBlock | null };
export interface Site { readonly id: number; readonly kind: HomesteadBuild; readonly x: number; readonly y: number; progress: number; blocked: MarkBlock | null }
type Task = { readonly kind: 'mark'; readonly mark: Mark } | { readonly kind: 'site'; readonly site: Site };

export type DroneStatus = 'docked' | 'charging' | 'flying' | 'working' | 'returning' | 'stalled' | 'retreat' | 'full' | 'blocked';
export interface Drone {
  readonly robot: HomesteadRobot;
  readonly slot: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  /** 当前所在列的地表，逐列检查落差时从这里出发。 */
  surface: number;
  phase: 'docked' | 'outbound' | 'working' | 'returning';
  task: Task | null;
  /** 当前地块的挖掘进度。 */
  work: number;
  cargoWood: number;
  cargoStone: number;
  mustCharge: boolean;
  scanIn: number;
  status: DroneStatus;
}

/** x 为左列，y 为地表顶边。 */
export interface Spot { readonly x: number; readonly y: number; readonly width: number }
export interface HomesteadFacilities {
  /** 小屋占的列与屋顶底边；屋里不能放太阳能板。 */
  readonly home: { readonly x0: number; readonly x1: number; readonly roofY: number };
  readonly dock: Spot;
  readonly depot: Spot;
  readonly workstation: Spot;
  readonly battery: Spot;
  readonly computeTerminal: Spot;
  readonly robotTerminal: Spot;
  /** 太阳能板按瓦片格子放：每块占一格，y 为所在格的行。 */
  readonly panels: Spot[];
  readonly depots: Spot[];
}

export interface Milestones { marked: boolean; unloaded: boolean; built: boolean; night: boolean; settled: boolean }

export interface HomesteadState {
  readonly economy: Homestead;
  readonly drones: Drone[];
  readonly marks: Mark[];
  readonly sites: Site[];
  readonly facilities: HomesteadFacilities;
  wood: number;
  stone: number;
  capacity: number;
  readonly felled: number[];
  readonly mined: [number, number][];
  /** 还有敌人盘踞的区域；不在其中的区域都已清场。 */
  readonly hostile: Set<number>;
  /** 已开砍的树剩余木材。 */
  readonly treeWood: Map<number, number>;
  readonly milestones: Milestones;
  nextId: number;
}

export interface HomesteadSnapshot {
  readonly economy: {
    readonly day: number; readonly second: number; readonly panels: number; readonly batteries: number; readonly stored: number;
    readonly gpu: boolean; readonly mode: ComputeMode; readonly tokens: number; readonly pending: number; readonly subsidyPaid: boolean; readonly ultimate: number;
  };
  readonly robots: readonly { readonly level: RobotLevel; readonly battery: number; readonly cargoWood: number; readonly cargoStone: number }[];
  readonly wood: number;
  readonly stone: number;
  readonly capacity: number;
  readonly felled: readonly number[];
  readonly mined: readonly (readonly [number, number])[];
  readonly hostile: readonly number[];
  readonly panels: readonly (readonly [number, number])[];
  readonly depots: readonly number[];
  readonly sites: readonly { readonly kind: HomesteadBuild; readonly x: number; readonly y: number; readonly progress: number }[];
  /** [树 id, 剩余木材]：砍到一半的树读档后不能长回满木材。 */
  readonly treeWood: readonly (readonly [number, number])[];
  readonly marks: readonly ({ readonly kind: 'tree'; readonly treeId: number } | { readonly kind: 'tile'; readonly tx: number; readonly ty: number })[];
  readonly milestones: Milestones;
}

export const zoneOf = (x: number): number => Math.floor(x / HOMESTEAD.zoneWidth);
const topSurface = (world: SimWorld, tx: number): number => surfaceBelow(world.map, world.fluid, tx, world.map.height)!;
const liveEnemies = (world: SimWorld) => world.entities.filter(e => e.enemy && !e.removed && e.health!.hp > 0);

function layoutFacilities(world: SimWorld): HomesteadFacilities {
  const { level } = world;
  const spawnX = Math.floor(level.spawn.x);
  const hut = level.structures.reduce<typeof level.structures[number] | null>((best, s) =>
    best === null || Math.abs(s.x0 - spawnX) < Math.abs(best.x0 - spawnX) ? s : best, null);
  // 设施沿陆侧一字排开，远离渔屋和湖。
  const dir = hut === null ? 1 : -hut.lakeSide;
  let cursor = spawnX + dir * 4;
  // 列的最高地表要在出生点上方几格以内：更高的是山体或浮空块，往下找只会找到洞底。
  const ceiling = Math.floor(level.spawn.y) + 6;
  /** 能放设施的列返回地表；水面、斜坡、半砖和树干旁都不行。 */
  const flat = (tx: number): number | null => {
    if (!world.map.inBounds(tx, 0)) return null;
    const y = topSurface(world, tx);
    if (y > ceiling || world.map.collisionAt(tx, y - 1) !== 'solid' || world.map.shapeAt(tx, y - 1) !== SHAPE_FULL) return null;
    // 只避开树干：按整个树冠宽度避让的话，多数种子在安全区里放不下全部设施。
    return level.trees.some(t => Math.abs(tx - t.x) <= 1) ? null : y;
  };
  const place = (width: number): Spot => {
    for (let start = cursor; Math.abs(start + dir * (width - 1) - spawnX) <= LAYOUT_REACH; start += dir) {
      const x = dir > 0 ? start : start - width + 1;
      const y = flat(x);
      if (y === null || Array.from({ length: width }, (_, i) => flat(x + i)).some(v => v !== y)) continue;
      cursor = start + dir * width;
      return { x, y, width };
    }
    throw new Error(`家园设施放不下：出生点（第 ${spawnX} 列）${dir > 0 ? '右' : '左'}侧 ${LAYOUT_REACH} 列内找不到 ${width} 列等高的实心平地`);
  };
  const home = hut === null ? { x0: spawnX - 2, x1: spawnX + 2, roofY: Math.floor(level.spawn.y) + 3 } : { x0: hut.x0, x1: hut.x1, roofY: hut.roofY };
  const dock = place(2), depot = place(2), workstation = place(2), battery = place(1);
  // 太阳能板按格子放，每块各找一列平地。
  const panels = Array.from({ length: HOMESTEAD.start.panels }, () => place(1));
  return { home, dock, depot, workstation, battery, panels, computeTerminal: place(1), robotTerminal: place(1), depots: [] };
}

function dockPosition(state: HomesteadState, slot: number): { x: number; y: number } {
  const dock = state.facilities.dock;
  return { x: dock.x + 0.5 + (slot % dock.width), y: dock.y + 0.35 };
}

function createDrone(state: HomesteadState, robot: HomesteadRobot): Drone {
  const slot = state.drones.length;
  const { x, y } = dockPosition(state, slot);
  return { robot, slot, x, y, prevX: x, prevY: y, surface: state.facilities.dock.y, phase: 'docked', task: null, work: 0,
    cargoWood: 0, cargoStone: 0, mustCharge: false, scanIn: 0, status: 'docked' };
}

function fellTree(world: SimWorld, state: HomesteadState, tree: TreeInstance): void {
  for (const p of tree.platforms) for (let tx = p.x0; tx <= p.x1; tx++) {
    if (world.map.inBounds(tx, p.ty) && world.map.get(tx, p.ty) === TILE_BRANCH) world.map.set(tx, p.ty, TILE_AIR);
  }
  state.felled.push(tree.id);
  state.treeWood.delete(tree.id);
}

function addSite(state: HomesteadState, kind: HomesteadBuild, x: number, y: number, progress: number): void {
  state.sites.push({ id: state.nextId++, kind, x, y, progress, blocked: null });
}

export function initializeHomestead(world: SimWorld, saved?: HomesteadSnapshot): void {
  const occupied = new Set(liveEnemies(world).map(e => zoneOf(e.body.x)));
  const state: HomesteadState = {
    economy: createHomestead(), drones: [], marks: [], sites: [], facilities: layoutFacilities(world),
    wood: HOMESTEAD.start.wood, stone: 0, capacity: STORAGE.capacity, felled: [], mined: [],
    hostile: occupied, treeWood: new Map(),
    milestones: { marked: false, unloaded: false, built: false, night: false, settled: false }, nextId: 1,
  };
  if (saved) {
    Object.assign(state.economy, saved.economy);
    state.economy.robots.splice(0, state.economy.robots.length, ...saved.robots.map(r => ({ ...createRobot(r.level), battery: r.battery })));
    Object.assign(state, { wood: saved.wood, stone: saved.stone, capacity: saved.capacity });
    Object.assign(state.milestones, saved.milestones);
    const trees = new Map(world.level.trees.map(t => [t.id, t]));
    for (const id of saved.felled) fellTree(world, state, trees.get(id)!);
    for (const [id, wood] of saved.treeWood) state.treeWood.set(id, wood);
    for (const mark of saved.marks) state.marks.push({ ...mark, id: state.nextId++, blocked: null });
    for (const [tx, ty] of saved.mined) {
      world.map.set(tx, ty, TILE_AIR);
      state.mined.push([tx, ty]);
    }
    const hostile = new Set(saved.hostile);
    for (const zone of [...state.hostile]) if (!hostile.has(zone)) state.hostile.delete(zone);
    for (const e of liveEnemies(world)) if (!state.hostile.has(zoneOf(e.body.x))) e.removed = true;
    for (let i = world.entities.length - 1; i >= 0; i--) if (world.entities[i]!.removed) world.entities.splice(i, 1);
    for (const [x, y] of saved.panels) state.facilities.panels.push({ x, y, width: 1 });
    for (const x of saved.depots) state.facilities.depots.push({ x, y: topSurface(world, x), width: BUILDS.depot.width });
    for (const site of saved.sites) addSite(state, site.kind, site.x, site.y, site.progress);
  }
  for (const robot of state.economy.robots) state.drones.push(createDrone(state, robot));
  // 读档时无人机都停在坞里，带着的货下一 tick 卸进仓库。
  if (saved) for (const [i, r] of saved.robots.entries()) Object.assign(state.drones[i]!, { cargoWood: r.cargoWood, cargoStone: r.cargoStone });
  world.homestead = state;
}

export function captureHomestead(state: HomesteadState): HomesteadSnapshot {
  const e = state.economy;
  return {
    economy: { day: e.day, second: e.second, panels: e.panels, batteries: e.batteries, stored: e.stored, gpu: e.gpu, mode: e.mode,
      tokens: e.tokens, pending: e.pending, subsidyPaid: e.subsidyPaid, ultimate: e.ultimate },
    robots: state.drones.map(d => ({ level: d.robot.level, battery: d.robot.battery, cargoWood: d.cargoWood, cargoStone: d.cargoStone })),
    wood: state.wood, stone: state.stone, capacity: state.capacity,
    felled: [...state.felled], mined: state.mined.map(([tx, ty]) => [tx, ty] as const), hostile: [...state.hostile],
    panels: state.facilities.panels.slice(HOMESTEAD.start.panels).map(p => [p.x, p.y] as const), depots: state.facilities.depots.map(d => d.x),
    sites: state.sites.map(s => ({ kind: s.kind, x: s.x, y: s.y, progress: s.progress })),
    treeWood: [...state.treeWood], marks: state.marks.map(m => m.kind === 'tree' ? { kind: m.kind, treeId: m.treeId } : { kind: m.kind, tx: m.tx, ty: m.ty }),
    milestones: { ...state.milestones },
  };
}

/** 目标所在列与无人机应当到达的地表；地块要露在最上面才挖得到。 */
function taskTarget(world: SimWorld, task: Task): { col: number; surface: number; y: number } {
  if (task.kind === 'site') return { col: task.site.x, surface: task.site.y, y: task.site.y };
  const mark = task.mark;
  if (mark.kind === 'tile') return { col: mark.tx, surface: mark.ty + 1, y: mark.ty + 1 };
  const tree = world.level.trees.find(t => t.id === mark.treeId)!;
  return { col: tree.x, surface: tree.baseY, y: tree.baseY + 0.4 };
}

const taken = (state: HomesteadState, drone: Drone, task: Task): boolean => state.drones.some(other => other !== drone && other.task !== null
  && (task.kind === 'site' ? other.task.kind === 'site' && other.task.site === task.site : other.task.kind === 'mark' && other.task.mark === task.mark));

function blockOf(world: SimWorld, state: HomesteadState, drone: Drone, task: Task): MarkBlock | null {
  const target = taskTarget(world, task);
  if (state.hostile.has(zoneOf(target.col))) return 'zone';
  if (liveEnemies(world).some(e => Math.abs(e.body.x - target.col) < DRONE.enemyRadius)) return 'enemy';
  if (task.kind === 'mark' && task.mark.kind === 'tile' && world.map.get(task.mark.tx, task.mark.ty) === TILE_STONE && !ROBOTS[drone.robot.level].mineStone) return 'level';
  const route = droneRoute(world.map, world.fluid, Math.floor(drone.x), drone.surface, target.col, ROBOTS[drone.robot.level].liftCap);
  if (!route.ok) return route.reason;
  // 施工只要飞到旁边够得着就行（板可能装在屋顶或台子上）；挖地块必须正好露在最上面。
  if (task.kind === 'site') return Math.abs(route.surface - target.surface) <= ROBOTS[drone.robot.level].liftCap ? null : 'reach';
  return route.surface === target.surface ? null : 'buried';
}

function pickTask(world: SimWorld, state: HomesteadState, drone: Drone): Task | null {
  // 地块被别的方式改掉（例如已经挖空）时，标记作废。
  for (let i = state.marks.length - 1; i >= 0; i--) {
    const mark = state.marks[i]!;
    if (mark.kind === 'tile' && !NATURAL_TILES.has(world.map.get(mark.tx, mark.ty))) state.marks.splice(i, 1);
  }
  const tasks: Task[] = [...state.sites.map(site => ({ kind: 'site', site }) as const), ...state.marks.map(mark => ({ kind: 'mark', mark }) as const)];
  let best: Task | null = null;
  let bestDistance = Infinity;
  for (const task of tasks) {
    if (taken(state, drone, task)) continue;
    const blocked = blockOf(world, state, drone, task);
    if (task.kind === 'site') task.site.blocked = blocked;
    else task.mark.blocked = blocked;
    if (blocked !== null) continue;
    // 建造优先于采集。
    const distance = Math.abs(taskTarget(world, task).col - drone.x) + (task.kind === 'site' ? 0 : 1e6);
    if (distance < bestDistance) {
      best = task;
      bestDistance = distance;
    }
  }
  return best;
}

/** 逐列飞向 targetX；遇到超出落差的列就停在前一列。 */
function fly(world: SimWorld, drone: Drone, targetX: number, seconds: number): 'arrived' | 'moving' | 'blocked' {
  const cap = ROBOTS[drone.robot.level].liftCap;
  const reach = DRONE.flySpeed * REAL_PER_GAME_SECOND * seconds;
  const goal = drone.x + Math.max(-reach, Math.min(reach, targetX - drone.x));
  const dir = Math.sign(goal - drone.x);
  let blocked = false;
  for (let col = Math.floor(drone.x); col !== Math.floor(goal);) {
    const next = col + dir;
    const surface = surfaceBelow(world.map, world.fluid, next, drone.surface + cap);
    if (surface === null || drone.surface - surface > cap) {
      blocked = true;
      break;
    }
    drone.surface = surface;
    col = next;
  }
  drone.x = blocked ? Math.floor(drone.x) + 0.5 : goal;
  const height = drone.surface + DRONE.hover;
  drone.y += (height - drone.y) * Math.min(1, seconds / 20);
  if (blocked) return 'blocked';
  return Math.abs(targetX - drone.x) < 1e-6 ? 'arrived' : 'moving';
}

function finishSite(state: HomesteadState, site: Site): void {
  const spot = { x: site.x, y: site.y, width: BUILDS[site.kind].width };
  if (site.kind === 'solar') {
    state.economy.panels++;
    state.facilities.panels.push(spot);
  } else {
    state.capacity += STORAGE.depotGain;
    state.facilities.depots.push(spot);
  }
  state.sites.splice(state.sites.indexOf(site), 1);
  state.milestones.built = true;
}

/** 睡觉打折降低的是采集速率，木材和石料仍按整块产出；施工不打折。 */
function work(world: SimWorld, state: HomesteadState, drone: Drone, hours: number, yieldFactor: number): void {
  const task = drone.task!;
  const rule = ROBOTS[drone.robot.level];
  const speed = drone.robot.compute * rule.speedPerCompute;
  if (task.kind === 'site') {
    task.site.progress += speed * hours;
    if (task.site.progress >= BUILDS[task.site.kind].work) {
      finishSite(state, task.site);
      drone.task = null;
    }
    return;
  }
  const mark = task.mark;
  const room = rule.carry - drone.cargoWood - drone.cargoStone;
  if (mark.kind === 'tree') {
    // 木材按整块计：进度攒满 1 才砍下一块。
    drone.work += speed * WORK.chopRate * hours * yieldFactor;
    let remaining = state.treeWood.get(mark.treeId)!;
    let space = room;
    while (drone.work >= 1 && remaining > 0 && space > 0) {
      drone.work -= 1;
      drone.cargoWood++;
      remaining--;
      space--;
    }
    state.treeWood.set(mark.treeId, remaining);
    if (remaining === 0) {
      drone.work = 0;
      fellTree(world, state, world.level.trees.find(t => t.id === mark.treeId)!);
      state.marks.splice(state.marks.indexOf(mark), 1);
      drone.task = null;
    } else if (space === 0) {
      drone.work = 0;
      drone.phase = 'returning';
    }
    return;
  }
  drone.work += speed * hours * yieldFactor / WORK.digWork;
  if (drone.work < 1) return;
  drone.work = 0;
  if (world.map.get(mark.tx, mark.ty) === TILE_STONE) drone.cargoStone++;
  world.map.set(mark.tx, mark.ty, TILE_AIR);
  state.mined.push([mark.tx, mark.ty]);
  state.marks.splice(state.marks.indexOf(mark), 1);
  drone.task = null;
  // 无人机就悬在这一列：挖穿后脚下地表变低，不刷新的话同列下一格会被误判为 buried。第 0 行不能标记，下面总还有地面。
  drone.surface = surfaceBelow(world.map, world.fluid, mark.tx, mark.ty + 1)!;
}

function unload(state: HomesteadState, drone: Drone): void {
  const wood = Math.min(drone.cargoWood, Math.max(0, state.capacity - state.wood));
  const stone = Math.min(drone.cargoStone, Math.max(0, state.capacity - state.stone));
  if (wood > 0) state.milestones.unloaded = true;
  state.wood += wood;
  state.stone += stone;
  drone.cargoWood -= wood;
  drone.cargoStone -= stone;
}

function stepDrone(world: SimWorld, state: HomesteadState, drone: Drone, seconds: number, yieldFactor: number): void {
  drone.prevX = drone.x;
  drone.prevY = drone.y;
  const hours = seconds / GAME_HOUR;
  const robot = drone.robot;
  const cargo = drone.cargoWood + drone.cargoStone;
  if (drone.phase === 'docked') {
    unload(state, drone);
    if (robot.battery < DRONE.departBattery) drone.mustCharge = true;
    if (drone.mustCharge && robot.battery >= 1) drone.mustCharge = false;
    drone.scanIn -= seconds;
    // 已出坞的机器人先占最低算力，剩下的不够就留在坞里，免得飞出去就停在野外。
    const e = state.economy;
    const spare = e.computeTotal - e.robots.reduce((sum, r) => sum + (r.active ? ROBOTS[r.level].minCompute : 0), 0);
    const computed = spare >= ROBOTS[robot.level].minCompute;
    const ready = computed && !drone.mustCharge && drone.cargoWood + drone.cargoStone === 0 && drone.scanIn <= 0;
    if (ready) drone.scanIn = SCAN_SECONDS;
    const task = ready ? pickTask(world, state, drone) : null;
    if (task !== null) {
      // 下一段经济结算才会分到算力，所以本 tick 只出发不动。
      drone.task = task;
      drone.phase = 'outbound';
      drone.status = 'flying';
      robot.charging = false;
      robot.active = true;
      return;
    }
    robot.charging = robot.battery < 1;
    drone.status = drone.cargoWood + drone.cargoStone > 0 ? 'full' : robot.charging ? 'charging'
      : !computed && state.marks.length + state.sites.length > 0 ? 'stalled' : 'docked';
    return;
  }
  robot.battery = Math.max(0, robot.battery - hours / DRONE.workHours);
  if (drone.phase !== 'returning') {
    const threatened = liveEnemies(world).some(e => Math.hypot(e.body.x - drone.x, e.body.y - drone.y) < DRONE.enemyRadius);
    if (threatened || robot.battery <= DRONE.returnBattery) {
      drone.phase = 'returning';
      drone.status = threatened ? 'retreat' : 'returning';
      if (drone.task?.kind === 'mark' && threatened) drone.task.mark.blocked = 'enemy';
      drone.task = null;
    }
  }
  // 没分到算力就停工；返航只靠飞、不需要算力，所以低电量照样回坞，不会在野外耗到 0。
  if (robot.compute === 0 && drone.phase !== 'returning') {
    drone.status = 'stalled';
    return;
  }
  if (drone.phase === 'returning') {
    const home = dockPosition(state, drone.slot);
    const result = fly(world, drone, home.x, seconds);
    if (result === 'moving') {
      if (drone.status !== 'retreat') drone.status = 'returning';
      return;
    }
    // 返航路线被挖断或堵死时直接召回：无人机没有生命值，不能困在野外。
    // ponytail: 直接瞬移回坞；需要表现时改成升空绕行的动画。
    if (result === 'blocked') Object.assign(drone, home);
    drone.phase = 'docked';
    drone.task = null;
    drone.surface = state.facilities.dock.y;
    robot.active = false;
    unload(state, drone);
    return;
  }
  if (drone.task === null) {
    // 一项做完：货还没装满就就近接着干，否则回家卸货。
    drone.task = cargo < ROBOTS[robot.level].carry ? pickTask(world, state, drone) : null;
    if (drone.task === null) {
      drone.phase = 'returning';
      drone.status = 'returning';
      return;
    }
    drone.phase = 'outbound';
  }
  const target = taskTarget(world, drone.task);
  if (drone.phase === 'outbound') {
    const result = fly(world, drone, target.col + 0.5, seconds);
    if (result === 'blocked') {
      if (drone.task.kind === 'mark') drone.task.mark.blocked = 'cliff';
      drone.task = null;
      drone.phase = 'returning';
      drone.status = 'blocked';
      return;
    }
    drone.status = 'flying';
    if (result === 'moving') return;
    drone.phase = 'working';
  }
  drone.status = 'working';
  drone.y += (target.y + DRONE.hover - drone.y) * Math.min(1, seconds / 20);
  work(world, state, drone, hours, yieldFactor);
  if (drone.task === null && drone.phase === 'working') drone.phase = 'outbound';
}

/** 每个模拟 tick 推进 1 游戏秒；睡觉时用大步长和打折系数估算。 */
export function stepHomesteadWorld(world: SimWorld, seconds: number, yieldFactor = 1): void {
  const state = world.homestead!;
  const occupied = new Set(liveEnemies(world).map(e => zoneOf(e.body.x)));
  for (const zone of [...state.hostile]) if (!occupied.has(zone)) state.hostile.delete(zone);
  const wasDay = isDaytime(state.economy.second);
  const settled = state.economy.lastSettlement;
  stepHomestead(state.economy, seconds, yieldFactor);
  if (wasDay && !isDaytime(state.economy.second)) state.milestones.night = true;
  if (state.economy.lastSettlement !== settled) state.milestones.settled = true;
  for (const drone of state.drones) stepDrone(world, state, drone, seconds, yieldFactor);
}

export function canSleep(world: SimWorld): boolean {
  const state = world.homestead!;
  const player = world.entities.find(e => e.id === world.playerId)!;
  const { x0, x1 } = state.facilities.home;
  return !isDaytime(state.economy.second) && player.body.x >= x0 - 1.5 && player.body.x <= x1 + 2.5;
}

/** 睡到天亮：跳过的时段按粗步长和七成收益估算，醒来回满生命。 */
export function sleepHomestead(world: SimWorld): void {
  const state = world.homestead!;
  const step = ECONOMY.sleepStepMinutes * 60;
  for (let left = secondsUntilDawn(state.economy.second); left > 0; left -= step) stepHomesteadWorld(world, Math.min(step, left), ECONOMY.sleepYield);
  for (const drone of state.drones) {
    drone.prevX = drone.x;
    drone.prevY = drone.y;
  }
  const player = world.entities.find(e => e.id === world.playerId)!;
  player.health!.hp = player.health!.maxHp;
}

/** 落地设施（坞、仓库、工作站等）占的列，以及它们在地面上方占的行数。 */
const FACILITY_ROWS = 2;
const groundSpots = (state: HomesteadState): Spot[] => {
  const f = state.facilities;
  return [f.dock, f.depot, f.workstation, f.battery, f.computeTerminal, f.robotTerminal, ...f.depots,
    ...state.sites.filter(s => s.kind === 'depot').map(s => ({ x: s.x, y: s.y, width: BUILDS.depot.width }))];
};
const panelCells = (state: HomesteadState): { x: number; y: number }[] =>
  [...state.facilities.panels, ...state.sites.filter(s => s.kind === 'solar')];

/** 只保护小屋两侧、落地设施脚下和太阳能板下面那一格，其余地块照样能挖。 */
const protectedTile = (state: HomesteadState, tx: number, ty: number): boolean => {
  const { home } = state.facilities;
  return (tx >= home.x0 - 1 && tx <= home.x1 + 1) || groundSpots(state).some(s => tx >= s.x && tx < s.x + s.width)
    || panelCells(state).some(c => c.x === tx && c.y - 1 === ty);
};

/** 框选标记：框里有树就只标树，否则标自然地块；返回新增的标记数。 */
export function markArea(world: SimWorld, area: Rect): number {
  const state = world.homestead!;
  const before = state.marks.length;
  const felled = new Set(state.felled);
  const marked = new Set(state.marks.flatMap(m => m.kind === 'tree' ? [m.treeId] : []));
  const standing = world.level.trees.filter(t => !felled.has(t.id));
  const trees = standing.filter(t => t.x + 1 + t.canopyHalfWidth > area.x && t.x - t.canopyHalfWidth < area.x + area.w
    && t.baseY + t.trunkHeight + t.canopyHeight > area.y && t.baseY < area.y + area.h);
  for (const tree of trees) {
    if (marked.has(tree.id)) continue;
    state.marks.push({ id: state.nextId++, kind: 'tree', treeId: tree.id, blocked: null });
    if (!state.treeWood.has(tree.id)) state.treeWood.set(tree.id, WORK.treeWood);
  }
  if (trees.length === 0) {
    const tiles = new Set(state.marks.flatMap(m => m.kind === 'tile' ? [`${m.tx},${m.ty}`] : []));
    // 树根下那格托着整棵树，挖掉会留下悬空的树。
    for (const t of standing) tiles.add(`${t.x},${t.baseY - 1}`);
    let added = 0;
    // 第 0 行是地图底：挖穿后这一列下面就没有地面了。
    for (let ty = Math.floor(area.y + area.h); ty >= Math.max(1, Math.floor(area.y)) && added < MAX_TILE_MARKS; ty--) {
      for (let tx = Math.floor(area.x); tx <= Math.floor(area.x + area.w) && added < MAX_TILE_MARKS; tx++) {
        if (!world.map.inBounds(tx, ty) || !NATURAL_TILES.has(world.map.get(tx, ty)) || protectedTile(state, tx, ty) || tiles.has(`${tx},${ty}`)) continue;
        state.marks.push({ id: state.nextId++, kind: 'tile', tx, ty, blocked: null });
        added++;
      }
    }
  }
  if (state.marks.length > before) state.milestones.marked = true;
  return state.marks.length - before;
}

/** 取消框里的标记和施工轮廓，施工轮廓退还材料；返回取消的总数。 */
export function cancelArea(world: SimWorld, area: Rect): number {
  const state = world.homestead!;
  const inside = (x: number, y: number): boolean => x >= area.x - 0.5 && x <= area.x + area.w + 0.5 && y >= area.y - 0.5 && y <= area.y + area.h + 0.5;
  const before = state.marks.length + state.sites.length;
  for (let i = state.marks.length - 1; i >= 0; i--) {
    const mark = state.marks[i]!;
    const target = taskTarget(world, { kind: 'mark', mark });
    if (!inside(target.col + 0.5, mark.kind === 'tile' ? mark.ty + 0.5 : target.y)) continue;
    state.marks.splice(i, 1);
    for (const drone of state.drones) if (drone.task?.kind === 'mark' && drone.task.mark === mark) drone.task = null;
  }
  for (let i = state.sites.length - 1; i >= 0; i--) {
    const site = state.sites[i]!;
    const rule = BUILDS[site.kind];
    if (!inside(site.x + rule.width / 2, site.y + 0.5)) continue;
    state.sites.splice(i, 1);
    // 库存不能超过容量（卸货和存档校验都按这个上限）。
    state.wood = Math.min(state.capacity, state.wood + rule.wood);
    state.stone = Math.min(state.capacity, state.stone + rule.stone);
    for (const drone of state.drones) if (drone.task?.kind === 'site' && drone.task.site === site) drone.task = null;
  }
  return before - state.marks.length - state.sites.length;
}

export type BuildResult = 'ok' | 'materials' | 'zone' | 'uneven' | 'occupied';

/** 检查仓库扩容能否放在 x 附近：需要两列等高的实地。放置预览和实际放置共用。 */
export function checkDepot(world: SimWorld, x: number): { readonly result: BuildResult; readonly left: number; readonly y: number } {
  const state = world.homestead!;
  const rule = BUILDS.depot;
  const left = Math.round(x - rule.width / 2);
  const columns = Array.from({ length: rule.width }, (_, i) => left + i);
  const inside = columns.every(tx => tx >= 0 && tx < world.map.width);
  const surfaces = inside ? columns.map(tx => topSurface(world, tx)) : [0];
  const y = surfaces[0]!;
  if (!inside || columns.some(tx => state.hostile.has(zoneOf(tx)))) return { result: 'zone', left, y };
  const solid = columns.every((tx, i) => world.map.collisionAt(tx, surfaces[i]! - 1) === 'solid');
  if (!solid || surfaces.some(s => s !== y)) return { result: 'uneven', left, y };
  const { home } = state.facilities;
  const spots = [...groundSpots(state), ...panelCells(state).map(c => ({ x: c.x, width: 1 })), { x: home.x0, width: home.x1 - home.x0 + 1 }];
  if (spots.some(s => left < s.x + s.width && s.x < left + rule.width)) return { result: 'occupied', left, y };
  if (state.wood < rule.wood || state.stone < rule.stone) return { result: 'materials', left, y };
  return { result: 'ok', left, y };
}

/** 放置仓库扩容轮廓：材料当场扣除，由无人机施工。 */
export function placeDepot(world: SimWorld, x: number): BuildResult {
  const state = world.homestead!;
  const check = checkDepot(world, x);
  if (check.result !== 'ok') return check.result;
  state.wood -= BUILDS.depot.wood;
  state.stone -= BUILDS.depot.stone;
  addSite(state, 'depot', check.left, check.y, 0);
  return 'ok';
}

/** 太阳能板占一个空格，下面一格必须是实心砖（地面、屋顶、台子都行），小屋里和设施上不能放。 */
export function checkSolar(world: SimWorld, tx: number, ty: number): BuildResult {
  const state = world.homestead!;
  const { map, fluid } = world;
  if (!map.inBounds(tx, ty) || !map.inBounds(tx, ty - 1) || state.hostile.has(zoneOf(tx))) return 'zone';
  if (map.collisionAt(tx, ty) !== 'none' || fluid.amountAt(tx, ty) > 0 || map.collisionAt(tx, ty - 1) !== 'solid') return 'uneven';
  const { home } = state.facilities;
  const inHut = tx >= home.x0 && tx <= home.x1 && ty < home.roofY;
  const onFacility = groundSpots(state).some(s => tx >= s.x && tx < s.x + s.width && ty >= s.y && ty < s.y + FACILITY_ROWS);
  if (inHut || onFacility || panelCells(state).some(c => c.x === tx && c.y === ty)) return 'occupied';
  if (state.wood < BUILDS.solar.wood) return 'materials';
  return 'ok';
}

/** 点一格或拖框铺太阳能板：框里能放的格子都放上轮廓，木材按格扣。 */
export function placeSolar(world: SimWorld, area: Rect): { readonly placed: number; readonly reason: Exclude<BuildResult, 'ok'> | null } {
  const state = world.homestead!;
  let placed = 0;
  let reason: Exclude<BuildResult, 'ok'> | null = null;
  for (let ty = Math.floor(area.y); ty <= Math.floor(area.y + area.h); ty++) {
    for (let tx = Math.floor(area.x); tx <= Math.floor(area.x + area.w); tx++) {
      const result = checkSolar(world, tx, ty);
      if (result !== 'ok') {
        reason ??= result;
        continue;
      }
      state.wood -= BUILDS.solar.wood;
      addSite(state, 'solar', tx, ty, 0);
      placed++;
    }
  }
  return { placed, reason: placed > 0 ? null : reason };
}

export type PurchaseResult = 'ok' | 'tokens' | 'wood' | 'owned' | 'slots' | 'noLv1';

export function purchase(world: SimWorld, item: HomesteadPurchase): PurchaseResult {
  const state = world.homestead!;
  const e = state.economy;
  const pay = (price: number): PurchaseResult => {
    if (e.tokens < price) return 'tokens';
    e.tokens -= price;
    return 'ok';
  };
  if (item === 'gpu') {
    if (e.gpu) return 'owned';
    const result = pay(SHOP.gpu);
    if (result === 'ok') e.gpu = true;
    return result;
  }
  if (item === 'battery') {
    const result = pay(SHOP.battery);
    if (result === 'ok') e.batteries++;
    return result;
  }
  if (item === 'lv2') {
    const robot = e.robots.find(r => r.level === 1);
    if (!robot) return 'noLv1';
    const result = pay(SHOP.lv2);
    if (result === 'ok') robot.level = 2;
    return result;
  }
  if (e.robots.length >= SHOP.maxRobots) return 'slots';
  if (state.wood < SHOP.robotWood) return 'wood';
  state.wood -= SHOP.robotWood;
  const robot = createRobot(1);
  e.robots.push(robot);
  state.drones.push(createDrone(state, robot));
  return 'ok';
}
