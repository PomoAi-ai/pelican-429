import type { AttackTuning } from './tuning.ts';

/** 第一章技能：秒数由固定 60 Hz 模拟换算。 */
export const PELICAN_SKILLS = Object.freeze({
  fishCooldownTicks: 36,
  fishCount: 7,
  dashCooldownTicks: 180,
  dashTicks: 22,
  dashSpeed: 23,
  swallowCooldownTicks: 300,
  swallowCapacity: 3,
  bufferTicks: 12,
});

export const WING_DASH_ATTACK: AttackTuning = Object.freeze({
  id: 'wingDash', damage: 18, knockback: { x: 12, y: 11 }, hitstun: 22, hitstop: 2,
  startup: 0, active: PELICAN_SKILLS.dashTicks, recovery: 8,
  hitbox: { x: -0.7, y: 0.2, w: 3.4, h: 2.8 }, moveFactor: 1, bufferWindow: 8,
});
