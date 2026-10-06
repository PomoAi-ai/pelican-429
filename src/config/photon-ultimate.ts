import type { ProjectileDef } from './weapon-rules.ts';

/** 光子宠物大招：只有追踪实体弹造成伤害，背景虫群与光轮只负责演出。 */
export const PHOTON_ULTIMATE = Object.freeze({
  chargeTicks: 27,
  cooldownTicks: 720,
  activeTicks: 180,
  volleyTicks: 12,
  launchTicks: 14,
  seekRadius: 18,
  turnRadians: 0.14,
  radius: 12,
});

const base: ProjectileDef = {
  id: 'photonBug', kind: 'photonBug', trajectory: 'straight', damage: 6, ultimate: true,
  knockback: { x: 2, y: 2 }, hitstun: 5, hitstop: 0,
  radius: 0.25, speed: 15, lift: 0, gravity: 0, lifeTicks: 160, maxHits: 1,
  bounces: 0, restitution: 0, bounceFriction: 0, swallowable: false, stopsInWater: false, wetTicks: 0,
};
export const PHOTON_BUG: ProjectileDef = Object.freeze(base);
export const PHOTON_WHEEL: ProjectileDef = Object.freeze({
  ...base, id: 'photonWheel', kind: 'photonWheel', damage: 9, radius: 0.38, speed: 18,
});
