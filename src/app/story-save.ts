import { MAINLINE_PHASES, MAINLINE_COUNTDOWN_SECONDS } from '../config/mainline.ts';
import type { MainlineCheckpoint } from '../config/mainline.ts';
import { TUNING } from '../config/tuning.ts';
import { ENEMY_RULES } from '../config/enemy-rules.ts';
import { BOSS_RULES } from '../config/boss-rules.ts';
import { FACILITY_SCENES } from '../config/facility-scenes.ts';
import type { MainlineProgress } from '../sim/mainline-progress.ts';
import { STORY_SAVE_KEY } from '../config/story-save.ts';

export interface StorySave {
  version: 3;
  checkpoint: MainlineCheckpoint;
  destination: 'fortress' | 'free';
  progress?: MainlineProgress;
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const counter = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const amount = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
// 地图顶端允许继续飞行；上界只保证碰撞遍历的整数步进仍然精确。
const position = (value: Record<string, unknown>): boolean => amount(value.x, FACILITY_SCENES.fortress.width) && amount(value.y, Number.MAX_SAFE_INTEGER / 2);
const actor = (value: unknown, maxHp: number): value is Record<string, unknown> => record(value) && position(value)
  && amount(value.hp, maxHp) && value.hp > 0 && (value.facing === -1 || value.facing === 1);
const PREVIOUS_BOSS_HP = { tibo: 3700, sam: 5250 } as const;
const cooldowns = (value: unknown): boolean => Array.isArray(value) && value.length === 3 && value.every(counter);

/** localStorage 是外部输入；校验一次后模拟层按快照类型恢复。 */
function readProgress(value: unknown, checkpoint: MainlineCheckpoint, version: 2 | 3): MainlineProgress {
  const invalid = (): never => { throw new Error('主线进度数据无效 / Invalid story progress'); };
  if (!record(value) || !Array.isArray(value.enemies)) return invalid();
  const p = value.player;
  if (p !== null && (!actor(p, TUNING.player.maxHp) || (p.form !== 'pelican' && p.form !== 'human')
    || typeof p.riding !== 'boolean' || !counter(p.flightTicks) || p.flightTicks > TUNING.player.flight.maxTicks
    || !counter(p.water) || p.water > TUNING.weapons.water.capacity || !counter(p.fish) || p.fish > TUNING.weapons.fish.capacity
    || !cooldowns(p.weaponCooldowns) || !cooldowns(p.humanCooldowns) || !counter(p.photonCooldownTicks)
    || (['perimeter', 'core', 'tibo'].includes(checkpoint.phase) && p.form !== 'pelican'))) return invalid();
  const keys = new Set<string>();
  for (const enemy of value.enemies) {
    if (!record(enemy) || typeof enemy.kind !== 'string' || !Object.hasOwn(ENEMY_RULES, enemy.kind)
      || !actor(enemy, ENEMY_RULES[enemy.kind as keyof typeof ENEMY_RULES].maxHp) || !record(enemy.home) || !position(enemy.home)) return invalid();
    const key = `${enemy.kind}:${enemy.home.x}:${enemy.home.y}`;
    if (keys.has(key)) return invalid();
    keys.add(key);
  }
  const boss = value.boss;
  if (boss !== null && (!record(boss) || (boss.kind !== 'tibo' && boss.kind !== 'sam')
    || boss.kind !== checkpoint.phase || !actor(boss, version === 2 ? PREVIOUS_BOSS_HP[boss.kind] : BOSS_RULES[boss.kind].maxHp) || typeof boss.healAvailable !== 'boolean')) return invalid();
  if (p !== null && (checkpoint.phase === 'tibo' || checkpoint.phase === 'sam') && boss === null) return invalid();
  const progress = value as unknown as MainlineProgress;
  // 旧存档按血量比例迁移；新版本保存后不再重复缩减。
  if (version === 2 && progress.boss !== null) {
    const boss = progress.boss;
    return { ...progress, boss: { ...boss, hp: boss.hp * BOSS_RULES[boss.kind].maxHp / PREVIOUS_BOSS_HP[boss.kind] } };
  }
  return progress;
}

/** 沿用原阶段记录；旧存档没有 progress 时仍从检查点继续。 */
export function loadStorySave(storage: Pick<Storage, 'getItem'>): StorySave | null {
  const raw = storage.getItem(STORY_SAVE_KEY);
  if (raw === null) return null;
  const data: unknown = JSON.parse(raw);
  if (typeof data !== 'object' || data === null) throw new Error('主线存档格式无效 / Invalid story save');
  const save = data as Partial<Omit<StorySave, 'version'>> & { version?: number };
  const cp = save.checkpoint;
  if ((save.version !== 2 && save.version !== 3) || !cp || !MAINLINE_PHASES.includes(cp.phase)
    || !Number.isInteger(cp.countdownTicks) || cp.countdownTicks < 0
    || cp.countdownTicks > Math.round(MAINLINE_COUNTDOWN_SECONDS / TUNING.sim.step)
    || (cp.phase !== 'countdown' && cp.countdownTicks !== 0)
    || (save.destination !== 'fortress' && save.destination !== 'free')
    || (save.destination === 'free' && cp.phase !== 'restored')) {
    throw new Error('主线存档版本或检查点无效 / Invalid story save version or checkpoint');
  }
  if (save.progress !== undefined && save.destination !== 'fortress') throw new Error('自由世界选择不能携带堡垒快照 / Invalid story progress destination');
  return { version: 3, checkpoint: { phase: cp.phase, countdownTicks: cp.countdownTicks }, destination: save.destination,
    ...(save.progress === undefined ? {} : { progress: readProgress(save.progress, cp, save.version) }) };
}

export function saveStory(storage: Pick<Storage, 'setItem'>, checkpoint: MainlineCheckpoint, destination: StorySave['destination'], progress?: MainlineProgress): void {
  storage.setItem(STORY_SAVE_KEY, JSON.stringify({ version: 3, checkpoint, destination, ...(progress === undefined ? {} : { progress }) } satisfies StorySave));
}
