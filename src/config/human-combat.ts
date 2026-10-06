import type { HitDefTuning } from './tuning.ts';
import type { ProjectileDef } from './weapon-rules.ts';

export const HUMAN_SKILLS = {
  codex_attack: { ticks: 42, release: 9, interval: 3, count: 7, cooldown: 42 },
  bug_attack: { ticks: 120, release: 44, interval: 2, count: 12, cooldown: 180 },
  server_overload: { ticks: 192, release: 140, interval: 1, count: 1, cooldown: 360 },
} as const;
export type HumanSkill = keyof typeof HUMAN_SKILLS;

export const HUMAN_OVERLOAD_POST_INVULN_TICKS = 120;

export const HUMAN_CODEX_SHOT: ProjectileDef = Object.freeze({
  id: 'codexShot', kind: 'codexShot', trajectory: 'straight',
  damage: 3, knockback: { x: 3, y: 1.5 }, hitstun: 9, hitstop: 1,
  radius: 0.24, speed: 20, lift: 0, gravity: 0, lifeTicks: 54,
  maxHits: 1, bounces: 0, restitution: 0, bounceFriction: 0,
  swallowable: false, stopsInWater: false, wetTicks: 0,
});

export const HUMAN_BUG_SHOT: ProjectileDef = Object.freeze({
  ...HUMAN_CODEX_SHOT, id: 'bugShot', kind: 'bugShot',
  damage: 4, knockback: { x: 1.5, y: 1 }, hitstun: 5, hitstop: 0,
  radius: 0.21, speed: 13, lifeTicks: 120,
});

export const HUMAN_BUG_GUIDANCE = Object.freeze({ launchTicks: 14, seekRadius: 18, turnRadians: 0.12 });

export const HUMAN_OVERLOAD: HitDefTuning = Object.freeze({
  id: 'serverOverload', damage: 48, knockback: { x: 11, y: 10 }, hitstun: 30, hitstop: 6,
});
