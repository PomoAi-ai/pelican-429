import type { AttackTuning } from './tuning.ts';

/** 碰撞不包含发梢和装备轮廓，为三格门洞保留通行余量。 */
export const HUMAN_BODY_HEIGHT = 2.8;

export type PlayerForm = 'pelican' | 'human';

export const PLAYER_TRANSFORM = Object.freeze({ durationTicks: 42, swapTick: 21 });

export const PLAYER_BREATH = Object.freeze({ seconds: 15, refillSeconds: 3, damagePerSecond: 20 });

/** 键盘首击的命中窗与主角动作同步，后摇回到背负姿势。 */
export const HUMAN_MELEE_ATTACK: AttackTuning = Object.freeze({
  id: 'keyboardSmash', damage: 14, knockback: { x: 9, y: 6 }, hitstun: 18, hitstop: 4,
  startup: 8, active: 5, recovery: 11,
  hitbox: { x: 0.35, y: 0.8, w: 1.9, h: 1.6 }, moveFactor: 0.85, bufferWindow: 6,
});
