import { HOMESTEAD } from '../config/homestead.ts';
import type { RobotLevel } from '../config/homestead.ts';
import type { HomesteadSnapshot } from '../sim/homestead.ts';
import type { LevelData } from '../world/level.ts';

const key = (seed: number): string => `pelican-homestead:${seed}`;

export function clearHomesteadSave(storage: Pick<Storage, 'removeItem'>, seed: number): void {
  storage.removeItem(key(seed));
}

export function saveHomestead(storage: Pick<Storage, 'setItem'>, seed: number, snapshot: HomesteadSnapshot): void {
  storage.setItem(key(seed), JSON.stringify({ version: 2, ...snapshot }));
}

/** localStorage 是外部输入：校验一次，之后模拟层按快照类型恢复。 */
export function loadHomesteadSave(storage: Pick<Storage, 'getItem'>, seed: number, level: Pick<LevelData, 'map' | 'trees'>): HomesteadSnapshot | undefined {
  const raw = storage.getItem(key(seed));
  if (raw === null) return undefined;
  const data: unknown = JSON.parse(raw);
  const invalid = (what: string): never => { throw new Error(`家园存档无效：${what}。可在网址后加 &reset=1 重新开始。`); };
  const record = (v: unknown, what: string): Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : invalid(what);
  const num = (v: unknown, what: string, min = 0, max = Number.MAX_SAFE_INTEGER): void => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) invalid(what);
  };
  const int = (v: unknown, what: string, min = 0, max = Number.MAX_SAFE_INTEGER): void => {
    if (!Number.isSafeInteger(v) || (v as number) < min || (v as number) > max) invalid(what);
  };
  const bool = (v: unknown, what: string): void => { if (typeof v !== 'boolean') invalid(what); };
  const list = (v: unknown, what: string): unknown[] => Array.isArray(v) ? v : invalid(what);

  const save = record(data, '格式');
  if (save.version !== 2) invalid('版本');
  const e = record(save.economy, 'economy');
  int(e.day, 'economy.day', 1);
  int(e.second, 'economy.second', 0, 24 * 3600 - 1);
  int(e.panels, 'economy.panels', 0, 256);
  int(e.batteries, 'economy.batteries', 0, 256);
  num(e.stored, 'economy.stored', 0, (e.batteries as number) * HOMESTEAD.power.batteryCapacity);
  bool(e.gpu, 'economy.gpu');
  if (e.mode !== 'production' && e.mode !== 'tokens') invalid('economy.mode');
  num(e.tokens, 'economy.tokens');
  num(e.pending, 'economy.pending');
  bool(e.subsidyPaid, 'economy.subsidyPaid');
  num(e.ultimate, 'economy.ultimate', 0, 1);
  const robots = list(save.robots, 'robots');
  if (robots.length < 1 || robots.length > HOMESTEAD.shop.maxRobots) invalid('robots 数量');
  for (const [i, value] of robots.entries()) {
    const robot = record(value, `robots.${i}`);
    if (robot.level !== 1 && robot.level !== 2) invalid(`robots.${i}.level`);
    num(robot.battery, `robots.${i}.battery`, 0, 1);
    const { carry } = HOMESTEAD.robots[robot.level as RobotLevel];
    int(robot.cargoWood, `robots.${i}.cargoWood`, 0, carry);
    int(robot.cargoStone, `robots.${i}.cargoStone`, 0, carry - (robot.cargoWood as number));
  }
  num(save.capacity, 'capacity', 1);
  num(save.wood, 'wood', 0, save.capacity as number);
  num(save.stone, 'stone', 0, save.capacity as number);
  const trees = new Set(level.trees.map(t => t.id));
  const felled = list(save.felled, 'felled');
  for (const id of felled) if (!trees.has(id as number)) invalid(`felled ${String(id)}`);
  if (new Set(felled).size !== felled.length) invalid('felled 重复');
  const standing = new Set([...trees].filter(id => !felled.includes(id)));
  // 有标记的树必须有剩余木材记录，模拟层按它砍。
  const chopped = new Set<unknown>();
  for (const entry of list(save.treeWood, 'treeWood')) {
    const pair = list(entry, 'treeWood');
    if (pair.length !== 2 || !standing.has(pair[0] as number)) invalid(`treeWood ${String(pair[0])}`);
    int(pair[1], `treeWood ${String(pair[0])}`, 1, HOMESTEAD.work.treeWood);
    chopped.add(pair[0]);
  }
  for (const [i, value] of list(save.marks, 'marks').entries()) {
    const mark = record(value, `marks.${i}`);
    if (mark.kind === 'tree') {
      if (!chopped.has(mark.treeId)) invalid(`marks.${i}.treeId`);
    } else if (mark.kind === 'tile') {
      int(mark.tx, `marks.${i}.tx`, 0, level.map.width - 1);
      int(mark.ty, `marks.${i}.ty`, 1, level.map.height - 1);
    } else invalid(`marks.${i}.kind`);
  }
  for (const tile of list(save.mined, 'mined')) {
    const pair = list(tile, 'mined');
    int(pair[0], 'mined.x', 0, level.map.width - 1);
    int(pair[1], 'mined.y', 0, level.map.height - 1);
  }
  for (const zone of list(save.hostile, 'hostile')) int(zone, 'hostile');
  for (const cell of list(save.panels, 'panels')) {
    const pair = list(cell, 'panels');
    int(pair[0], 'panels.x', 0, level.map.width - 1);
    int(pair[1], 'panels.y', 1, level.map.height - 1);
  }
  for (const x of list(save.depots, 'depots')) int(x, 'depots', 0, level.map.width - 1);
  for (const [i, value] of list(save.sites, 'sites').entries()) {
    const site = record(value, `sites.${i}`);
    if (site.kind !== 'solar' && site.kind !== 'depot') invalid(`sites.${i}.kind`);
    int(site.x, `sites.${i}.x`, 0, level.map.width - 1);
    int(site.y, `sites.${i}.y`, 1, level.map.height - 1);
    num(site.progress, `sites.${i}.progress`);
  }
  const m = record(save.milestones, 'milestones');
  for (const name of ['marked', 'unloaded', 'built', 'night', 'settled']) bool(m[name], `milestones.${name}`);
  return save as unknown as HomesteadSnapshot;
}
