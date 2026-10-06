import type { Tuning } from '../config/tuning.ts';
import type { ProjectileDef, WeaponTimeline } from '../config/weapon-rules.ts';
import { PELICAN_SKILLS, WING_DASH_ATTACK } from '../config/pelican-skills.ts';
import { startAttack } from '../combat/attacks.ts';
import type { ProjectileKind, WeaponId } from '../core/weapon-ids.ts';
import type { Vec2 } from '../core/math.ts';
import type { FluidQuery } from '../world/fluid-map.ts';
import { waterSpanInColumn } from '../physics/fluid-contact.ts';
import type { Entity, PelicanData, ProjectileRequest } from './entity.ts';
import { scaleProjectileDef } from './projectile.ts';
import { cancelHumanCombat } from './human-combat.ts';

/** 嘴囊里含着的东西：吐出时按其定义生成返还弹。 */
export interface Mouthful {
  /** 被吞之物：投射物种类，或鱼群里的鱼（'fish'）。 */
  readonly source: ProjectileKind | 'fish';
  readonly def: ProjectileDef;
  readonly count: number;
}

export type WeaponBlockReason = 'empty';

/** 由 updateWeapons 写入、stepSim 补上实体 id 推入 world.events 的事件请求。 */
export type WeaponEventRequest =
  | { readonly type: 'weaponBlocked'; readonly weapon: WeaponId; readonly reason: WeaponBlockReason }
  | { readonly type: 'fishCaught'; readonly x: number; readonly y: number; readonly count: number; readonly via: 'mouth' | 'peck' | 'skim' };

export interface WeaponState {
  /** 水量（整数单位）。 */
  water: number;
  /** 鱼（条）。 */
  fish: number;
  /** 本 tick 在掠水（空中贴近水面）。 */
  skimming: boolean;
  /** 连续掠水 tick（满 skimTicksPerFish 兜到一条鱼）。 */
  skimTicks: number;
  /** 当前（或最近一次）吐射时间轴所属武器。 */
  shotWeapon: WeaponId;
  /** 最近一次出手的档位 1..3（非光球恒为 1）。 */
  shotLevel: number;
  /** 张嘴吞判定剩余 tick（> 0 时判定框有效）。 */
  gulpTicks: number;
  /** 嘴囊含物（吞到即有，吐出清空）。 */
  mouthful: Mouthful | null;
  /** 鱼群、突进、吞弹的独立冷却。 */
  cooldowns: [number, number, number];
  bufferedSkill: 0 | 1 | 2 | 3;
  skillBufferTicks: number;
  dashTicks: number;
  dashSide: 1 | -1;
  /** 待 stepSim 消费的事件请求。 */
  events: WeaponEventRequest[];
}

export function createWeaponState(tuning: Tuning): WeaponState {
  const w = tuning.weapons;
  return {
    water: w.water.capacity,
    fish: w.fish.start,
    skimming: false,
    skimTicks: 0,
    shotWeapon: 'water',
    shotLevel: 1,
    gulpTicks: 0,
    mouthful: null,
    cooldowns: [0, 0, 0],
    bufferedSkill: 0,
    skillBufferTicks: 0,
    dashTicks: 0,
    dashSide: 1,
    events: [],
  };
}

/** 武器的吐射时间轴：光球取 attacks.orb，其余取武器表。 */
export function weaponTimeline(tuning: Tuning, id: WeaponId): WeaponTimeline {
  return id === 'orb' ? tuning.attacks.orb : tuning.weapons[id];
}

/** 时间轴总长（windup + hold + close）。 */
export function timelineLength(t: WeaponTimeline): number {
  return t.windupTicks + t.mouthHoldTicks + t.mouthCloseTicks;
}

/** 档位对应的光球定义（1 档 = attacks.orb 本身）。 */
export function orbDefForLevel(tuning: Tuning, level: number): ProjectileDef {
  const o = tuning.weapons.orb;
  const i = level - 1;
  if (!Number.isInteger(level) || i < 0 || i >= o.radiusScale.length) throw new Error(`orbDefForLevel: level must be 1..${o.radiusScale.length}, got ${level}`);
  if (level === 1) return tuning.attacks.orb;
  return scaleProjectileDef(tuning.attacks.orb, {
    damage: o.damageScale[i] as number,
    knockback: o.knockbackScale[i] as number,
    radius: o.radiusScale[i] as number,
    speed: o.speedScale[i] as number,
  });
}

/** 吞下的能量聚合为一颗光球，数量决定体积，累计伤害决定威力。 */
export function returnDef(tuning: Tuning, m: Mouthful): ProjectileDef {
  const orb = orbDefForLevel(tuning, m.count);
  return { ...orb, damage: m.def.damage * tuning.weapons.swallow.returnScale,
    speed: Math.max(orb.speed, tuning.weapons.swallow.returnMinSpeed) };
}

/** 嘴（出弹点）相对脚底中点、朝 +X：骑行用 bike.muzzle，否则 attacks.orb.muzzle。 */
export function mouthMuzzle(p: PelicanData, tuning: Tuning): Readonly<Vec2> {
  return p.ride.mode === 'riding' ? tuning.player.bike.muzzle : tuning.attacks.orb.muzzle;
}

/** 嘴的世界坐标（按当前朝向）。 */
export function mouthPoint(e: Entity, p: PelicanData, tuning: Tuning): Vec2 {
  const m = mouthMuzzle(p, tuning);
  return { x: e.body.x + m.x * e.facing, y: e.body.y + m.y };
}

/** 嘴部吐射和吞弹均不在进行中。 */
export function weaponIdle(p: PelicanData): boolean {
  return p.shotTicks < 0 && p.weapon.gulpTicks === 0;
}

/** 朝向锁定：吐射张嘴段（windup+hold）、突进和张嘴吞时不随移动转身。 */
export function weaponLocksFacing(p: PelicanData, tuning: Tuning): boolean {
  const w = p.weapon;
  if (w.gulpTicks > 0 || w.dashTicks > 0) return true;
  if (p.shotTicks < 0) return false;
  const t = weaponTimeline(tuning, w.shotWeapon);
  return p.shotTicks < t.windupTicks + t.mouthHoldTicks;
}

/** hitstop 期间也锁存一次技能输入。 */
export function bufferSkillInput(p: PelicanData, skill: 0 | 1 | 2 | 3 | 4): void {
  if (skill === 0 || skill === 4) return;
  p.weapon.bufferedSkill = skill;
  p.weapon.skillBufferTicks = PELICAN_SKILLS.bufferTicks + (skill === 1 ? 1 : 0);
}

/** 掠水：空中、未入水，脚底下方 skim.height 格内（身体中线所在列）有水。 */
export function isSkimming(e: Entity, p: PelicanData, fluid: FluidQuery | null, tuning: Tuning): boolean {
  if (!fluid || p.form !== 'pelican' || p.transformTicks >= 0 || p.inWater || e.body.onGround) return false;
  const b = e.body;
  const tx = Math.floor(b.x);
  if (tx < 0 || tx >= fluid.width) return false;
  return waterSpanInColumn(fluid, tx, b.y - tuning.weapons.skim.height, b.y) > 0;
}

/** 资源回复：水（游泳/掠水/陆地）与掠水兜鱼。 */
function refill(e: Entity, p: PelicanData, fluid: FluidQuery | null, tuning: Tuning): void {
  const w = p.weapon;
  const W = tuning.weapons;
  w.skimming = isSkimming(e, p, fluid, tuning);
  const rate = p.inWater ? W.water.refillSwim : w.skimming ? W.water.refillSkim : W.water.refillLand;
  w.water = Math.min(W.water.capacity, w.water + rate);
  if (!w.skimming) {
    w.skimTicks = 0;
    return;
  }
  w.skimTicks++;
  if (w.skimTicks < W.fish.skimTicksPerFish) return;
  w.skimTicks = 0;
  if (w.fish >= W.fish.capacity) return;
  w.fish++;
  const m = mouthPoint(e, p, tuning);
  w.events.push({ type: 'fishCaught', x: m.x, y: m.y, count: w.fish, via: 'skim' });
}

/** 发射请求：当前时间轴所属武器在 windup 结束时调用。 */
function emit(e: Entity, p: PelicanData, tuning: Tuning): void {
  const w = p.weapon;
  let def: ProjectileDef;
  let returned = false;
  if (w.shotWeapon === 'water') def = tuning.weapons.water.projectile;
  else if (w.shotWeapon === 'fish') def = tuning.weapons.fish.projectile;
  else if (w.shotWeapon === 'orb') def = orbDefForLevel(tuning, w.shotLevel);
  else {
    if (!w.mouthful) throw new Error(`pelican-weapons: entity ${e.id} spits with an empty pouch`);
    def = returnDef(tuning, w.mouthful);
    returned = true;
    w.mouthful = null;
  }
  const muzzle = mouthMuzzle(p, tuning);
  const request: ProjectileRequest = {
    def,
    x: e.body.x + muzzle.x * p.shotSide,
    y: e.body.y + muzzle.y,
    dirX: p.shotDir.x,
    dirY: p.shotDir.y,
    ownerId: e.id,
    team: e.team,
    level: w.shotLevel,
    returned,
  };
  if (w.shotWeapon === 'fish') {
    const aim = Math.atan2(p.shotDir.y, Math.abs(p.shotDir.x));
    for (let i = 0; i < PELICAN_SKILLS.fishCount; i++) {
      const angle = aim + 0.15 + i * 0.095;
      p.shotRequests.push({ ...request, def: { ...def, speed: def.speed * (0.75 + i * 0.09) },
        dirX: Math.cos(angle) * p.shotSide, dirY: Math.sin(angle) });
    }
  } else p.shotRequests.push(request);
}

/** 按瞄准点定出手侧与方向（非攻击中/非高速骑行时朝向鼠标所在侧），并转身。 */
function aimShot(e: Entity, p: PelicanData, aim: Vec2 | null, lockSide: boolean, tuning: Tuning): void {
  const b = e.body;
  let side: 1 | -1 = e.facing;
  if (!e.attack && aim !== null && !lockSide) side = aim.x > b.x ? 1 : aim.x < b.x ? -1 : e.facing;
  let dir: Vec2 = { x: side, y: 0 };
  if (aim !== null) {
    const muzzle = mouthMuzzle(p, tuning);
    const dx = aim.x - (b.x + muzzle.x * side);
    const dy = aim.y - (b.y + muzzle.y);
    const len = Math.hypot(dx, dy);
    if (len >= MIN_AIM_LENGTH) dir = { x: dx / len, y: dy / len };
  }
  if (!e.attack) e.facing = side;
  p.shotSide = side;
  p.shotDir = dir;
}

const MIN_AIM_LENGTH = 1e-3;

/** 开始吐射时间轴（windup 为 0 时当 tick 发射）。 */
function startTimeline(e: Entity, p: PelicanData, weapon: WeaponId, tuning: Tuning): void {
  const t = weaponTimeline(tuning, weapon);
  p.weapon.shotWeapon = weapon;
  p.shotTicks = 0;
  if (weapon === 'water') p.shootCooldownTicks = t.cooldownTicks;
  if (t.windupTicks === 0) emit(e, p, tuning);
}

function block(p: PelicanData, weapon: WeaponId, reason: WeaponBlockReason): void {
  p.weapon.events.push({ type: 'weaponBlocked', weapon, reason });
}

export interface WeaponInput {
  readonly shootHeld: boolean;
  readonly skill1Held: boolean;
  readonly aim: Vec2 | null;
}

/** 吞窗结束或再次施放时反吐；空口只合嘴。 */
function finishGulp(e: Entity, p: PelicanData, tuning: Tuning): void {
  p.weapon.gulpTicks = 0;
  if (!p.weapon.mouthful) return;
  p.weapon.shotLevel = p.weapon.mouthful.count;
  startTimeline(e, p, 'swallow', tuning);
}

/** 死亡或中断战斗时同时撤销伤害判定、嘴部动作与未消费的输入。 */
export function cancelPelicanCombat(e: Entity): void {
  const p = e.pelican!;
  cancelHumanCombat(e);
  e.attack = undefined;
  p.attackBufferTicks = 0;
  p.attackBufferFacing = 0;
  p.shootBufferTicks = 0;
  p.shootAim = null;
  p.shotTicks = -1;
  p.shotRequests = [];
  const w = p.weapon;
  w.gulpTicks = w.dashTicks = w.bufferedSkill = w.skillBufferTicks = 0;
  w.mouthful = null;
  w.events = [];
}

/** 固定吐水普攻与三个身体技能共用嘴部时间轴，冷却各自独立。 */
export function updateWeapons(e: Entity, p: PelicanData, input: WeaponInput, fluid: FluidQuery | null, lockSide: boolean, tuning: Tuning): void {
  const w = p.weapon;
  const W = tuning.weapons;
  if (e.health!.hp <= 0) {
    cancelPelicanCombat(e);
    return;
  }
  refill(e, p, fluid, tuning);
  for (let i = 0; i < 3; i++) w.cooldowns[i] = Math.max(0, w.cooldowns[i]! - 1);
  if (w.dashTicks > 0) w.dashTicks--;
  if (p.shootCooldownTicks > 0) p.shootCooldownTicks--;
  if (p.form !== 'pelican' || p.transformTicks >= 0) return;
  if (p.shotTicks >= 0) {
    p.shotTicks++;
    const t = weaponTimeline(tuning, w.shotWeapon);
    if (p.shotTicks === t.windupTicks) emit(e, p, tuning);
    if (p.shotTicks >= timelineLength(t)) p.shotTicks = -1;
  }
  if (w.gulpTicks > 0) {
    w.gulpTicks--;
    if (w.gulpTicks === 0 || w.bufferedSkill === 3) {
      w.bufferedSkill = 0;
      w.skillBufferTicks = 0;
      aimShot(e, p, input.aim, lockSide, tuning);
      finishGulp(e, p, tuning);
    }
  }
  if (e.health!.hitstunTicks > 0) {
    if (w.skillBufferTicks > 0 && --w.skillBufferTicks === 0) w.bufferedSkill = 0;
    return;
  }
  const skill = w.bufferedSkill || (input.skill1Held ? 1 : 0);
  if (skill > 0 && w.cooldowns[skill - 1] === 0 && weaponIdle(p) && w.dashTicks === 0 && !e.attack) {
    w.bufferedSkill = 0;
    w.skillBufferTicks = 0;
    aimShot(e, p, input.aim, lockSide, tuning);
    if (skill === 1) {
      w.cooldowns[0] = PELICAN_SKILLS.fishCooldownTicks;
      w.shotLevel = 1;
      startTimeline(e, p, 'fish', tuning);
    } else if (skill === 2) {
      w.cooldowns[1] = PELICAN_SKILLS.dashCooldownTicks;
      w.dashTicks = PELICAN_SKILLS.dashTicks;
      w.dashSide = p.shotSide;
      e.attack = startAttack(WING_DASH_ATTACK);
    } else {
      w.cooldowns[2] = PELICAN_SKILLS.swallowCooldownTicks;
      w.gulpTicks = W.swallow.gulpTicks;
      w.mouthful = null;
    }
    return;
  }
  if (w.skillBufferTicks > 0 && --w.skillBufferTicks === 0) w.bufferedSkill = 0;
  const pressed = p.shootBufferTicks > 0;
  if (!(pressed || input.shootHeld) || p.shootCooldownTicks > 0 || !weaponIdle(p) || w.dashTicks > 0) return;
  const free = p.inWater && W.water.swimFree;
  if (!free && w.water < W.water.cost) {
    if (pressed) block(p, 'water', 'empty');
    p.shootBufferTicks = 0;
    return;
  }
  if (!free) w.water -= W.water.cost;
  aimShot(e, p, pressed ? p.shootAim : input.aim, lockSide, tuning);
  p.shootBufferTicks = 0;
  p.shootAim = null;
  w.shotLevel = 1;
  startTimeline(e, p, 'water', tuning);
}

/** 吞入后继续保持吸收窗口；最多三颗，伤害累积为一次反吐。 */
export function takeMouthful(p: PelicanData, m: Omit<Mouthful, 'count'>): void {
  const previous = p.weapon.mouthful;
  const count = (previous?.count ?? 0) + 1;
  p.weapon.mouthful = { source: m.source, count,
    def: { ...m.def, damage: m.def.damage + (previous?.def.damage ?? 0) } };
  if (count === PELICAN_SKILLS.swallowCapacity) p.weapon.gulpTicks = 1;
}

/** 取走待推的武器事件（取后清空）。 */
export function consumeWeaponEvents(p: PelicanData): WeaponEventRequest[] {
  const out = p.weapon.events;
  p.weapon.events = [];
  return out;
}
