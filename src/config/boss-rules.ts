import { DEFAULT_PLAYER } from './player-tuning.ts';
import type { NpcKind } from './npc.ts';
import { nonNegative, positive, ticks } from './tuning-checks.ts';
import type { GuardRule } from './tuning.ts';

interface BossRule {
  readonly maxHp: number;
  readonly speed: number;
  readonly basicRange: number;
  readonly rate: number;
  readonly enragedRate: number;
  readonly cooldownTicks: number;
  readonly enragedCooldownTicks: number;
  readonly blinkWindupTicks: number;
  readonly blinkCooldownTicks: number;
  /** 大招独立倍率，给分轮弹幕留出辨认和换位时间。 */
  readonly ultimateSpeed: number;
  readonly guard: GuardRule;
  readonly ultimateHeight: number;
  readonly ultimateWaves: readonly { readonly delay: number; readonly halfWidth: number; readonly damage: number }[];
}

export const BOSS_REBATE = { halfWidth: 3, height: 1.2 } as const;
/** 额度返场回血：50 秒间隔让一场战斗约有一到两次回血，回复量在区间内随机。 */
export const TIBO_HEAL = { cooldownTicks: 3000, minShare: .08, maxShare: .14 } as const;

export const BOSS_RULES: Readonly<Record<NpcKind, BossRule>> = {
  tibo: {
    maxHp: 740, speed: DEFAULT_PLAYER.runSpeed * .9, basicRange: 1.9, rate: 2.2, enragedRate: 2.6, cooldownTicks: 18, enragedCooldownTicks: 10,
    blinkWindupTicks: 28, blinkCooldownTicks: 180, ultimateSpeed: .8,
    guard: { armoredScale: .75, ultimateScale: .7, poise: 24, poiseWindowTicks: 120, staggerImmuneTicks: 180 },
    ultimateHeight: 1.1,
    ultimateWaves: [{ delay: 0, halfWidth: 5, damage: 8 }, { delay: .65, halfWidth: 8, damage: 8 }],
  },
  sam: {
    maxHp: 1050, speed: DEFAULT_PLAYER.runSpeed, basicRange: 10, rate: 2.4, enragedRate: 2.8, cooldownTicks: 15, enragedCooldownTicks: 8,
    blinkWindupTicks: 24, blinkCooldownTicks: 120, ultimateSpeed: .8,
    guard: { armoredScale: .75, ultimateScale: .7, poise: 36, poiseWindowTicks: 120, staggerImmuneTicks: 180 },
    ultimateHeight: 1.3,
    ultimateWaves: [{ delay: 0, halfWidth: 4.5, damage: 6 }, { delay: .6, halfWidth: 7, damage: 6 }, { delay: 1.2, halfWidth: 10, damage: 8 }],
  },
};

export function validateBossRules(): void {
  positive('boss.rebate.halfWidth', BOSS_REBATE.halfWidth);
  positive('boss.rebate.height', BOSS_REBATE.height);
  ticks('boss.tiboHeal.cooldownTicks', TIBO_HEAL.cooldownTicks);
  positive('boss.tiboHeal.minShare', TIBO_HEAL.minShare);
  if (TIBO_HEAL.maxShare < TIBO_HEAL.minShare || TIBO_HEAL.maxShare > 1) throw new Error(`boss.tiboHeal.maxShare 须在 minShare 与 1 之间：${TIBO_HEAL.maxShare}`);
  for (const [kind, rule] of Object.entries(BOSS_RULES)) {
    const path = `boss.${kind}`;
    for (const key of ['maxHp', 'speed', 'basicRange', 'rate', 'enragedRate', 'ultimateHeight', 'ultimateSpeed'] as const) positive(`${path}.${key}`, rule[key]);
    for (const key of ['armoredScale', 'ultimateScale', 'poise'] as const) positive(`${path}.guard.${key}`, rule.guard[key]);
    for (const key of ['poiseWindowTicks', 'staggerImmuneTicks'] as const) ticks(`${path}.guard.${key}`, rule.guard[key], 1);
    for (const key of ['cooldownTicks', 'enragedCooldownTicks', 'blinkWindupTicks', 'blinkCooldownTicks'] as const) ticks(`${path}.${key}`, rule[key]);
    for (const [index, wave] of rule.ultimateWaves.entries()) {
      nonNegative(`${path}.waves.${index}.delay`, wave.delay);
      positive(`${path}.waves.${index}.halfWidth`, wave.halfWidth);
      positive(`${path}.waves.${index}.damage`, wave.damage);
    }
  }
}
