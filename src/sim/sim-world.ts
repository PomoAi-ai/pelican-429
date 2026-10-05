/**
 * 模拟世界：组合地图、实体、事件，按固定 tick 推进。纯逻辑，无 DOM/three/随机数。
 * stepSim 顺序：存 prev → 液体（每 fluid.stepInterval tick 推进一次）→ 意图（鹈鹕控制器/假人/敌方射击；投射物无意图；鹈鹕入/出水推 splash）
 * → 统一生成投射物（projectileFired，sim/weapon-system） → 移动（投射物 stepProjectile，其余 moveAndCollide） → 实体间碰撞（resolveSolids：带 solid 的实体推开/站头上/随动，任务 017） → 鹈鹕骑行结算（撞墙/净空下车，推 mount/dismount） → 鹈鹕状态 → 小鱼（stepFish，威胁=鹈鹕身体中心；不进实体、不参与战斗）
 * → 武器结算（湿计时、张嘴吞、捕鱼、武器事件；任务 018） → 命中（近战 + 投射物；命中数满即移除，水弹/鱼命中记湿）
 * （命中源另含 solid.contactDamage 的接触伤害，默认无实体启用）→ 生命/假人归位 → 清理 → tick++。
 * hitstop 期间只推进计时（tick、hitstopTicks）并缓冲玩家输入，跳过控制器、物理、液体与小鱼，并令 prev=cur（渲染不插值抖动）。
 */
import { validateTuning, TUNING } from '../config/tuning.ts';
import { stepPhotonUltimate, steerPhotonProjectiles } from './photon-system.ts';
import { cancelPlayerTransform, stepPlayerTransform } from './player-transform.ts';
import type { Tuning } from '../config/tuning.ts';
import { EventQueue } from '../core/events.ts';
import type { SimEvent } from '../core/game-events.ts';
import type { Vec2 } from '../core/math.ts';
import type { LevelData } from '../world/level.ts';
import type { TileMap } from '../world/tile-map.ts';
import type { FluidMap } from '../world/fluid-map.ts';
import { stepFluid } from '../world/fluid-sim.ts';
import { TORNADO_RULES, tornadoForce } from '../world/tornado.ts';
import { clamp, overlaps } from '../core/math.ts';
import { submersion } from '../physics/fluid-contact.ts';
import { bodyRect, savePrev } from '../physics/body.ts';
import { moveAndCollide } from '../physics/tile-collision.ts';
import { resolveSolids } from '../physics/entity-collision.ts';
import type { SolidAgent } from '../physics/entity-collision.ts';
import { contactHitSource, meleeHitSource, resolveHits, tickHealth } from '../combat/combat-system.ts';
import type { HitSource } from '../combat/combat-system.ts';
import { cancelPelicanCombat } from '../entities/pelican-weapons.ts';
import { humanOverloadHitSource } from '../entities/human-combat.ts';
import { createDummyEntity, createPelicanEntity } from '../entities/entity.ts';
import { cancelEnemySkill, createEnemyEntity, resolveEnemyLanding, updateEnemy } from '../entities/enemy.ts';
import type { Entity, ProjectileRequest } from '../entities/entity.ts';
import { createFishSchool, stepFish } from '../entities/fish.ts';
import type { FishSchool } from '../entities/fish.ts';
import { projectileHitSource, retireSpentProjectile, stepProjectile } from '../entities/projectile.ts';
import { NEUTRAL_INPUT, bufferPelicanInput, resolvePelicanState, updatePelican } from '../entities/pelican-controller.ts';
import type { PelicanInput } from '../entities/pelican-controller.ts';
import { consumeRideEvents, resolvePelicanRide, solidExtents } from '../entities/pelican-ride.ts';
import { tickDummyReset, updateDummy } from '../entities/training-dummy.ts';
import { applyWetMarks, collectProjectileRequests, resolveWeaponInteractions, spawnProjectiles, steerHumanProjectiles, updateShooters, wetMarks } from './weapon-system.ts';
import { createEnvironment, entityExposed, stepEnvironment } from './environment.ts';
import type { SimEnvironment } from './environment.ts';
import type { PrecipMode, PrecipState, PrecipTuning } from '../config/precip-rules.ts';
import type { WeatherTuning, WindMode } from '../config/weather-rules.ts';

export type { SimEvent, HitEvent, DummyResetEvent, ProjectileFiredEvent, ProjectileImpactEvent } from '../core/game-events.ts';
export { dummyShooting, setDummyShooting } from './weapon-system.ts';
export { setPrecipMode, setPrecipIntensity, setTornado, setTornadoPower, setTornadoCount } from './environment.ts';
export type { SimEnvironment } from './environment.ts';
export type { Entity } from '../entities/entity.ts';

/** 单 tick 输入帧（由 input/action-map 的 consume 产出）。 */
export type InputFrame = PelicanInput;
export { NEUTRAL_INPUT };

export interface SimWorld {
  tick: number;
  hitstopTicks: number;
  /** 致死冷却液触发后的重生等待；等待期间不接收角色输入。 */
  respawnTicks: number;
  readonly photon: { cooldownTicks: number; chargeTicks: number; buffered: boolean; activeTicks: number; volleyIndex: number; x: number; y: number };
  readonly level: LevelData;
  readonly map: TileMap;
  /** = level.fluid（格子水）。 */
  readonly fluid: FluidMap;
  readonly spawn: Vec2;
  readonly entities: Entity[];
  /** 装饰小鱼（独立于 entities，不参与战斗）；由 level.fishSpawns 创建，死鱼移除不重生。 */
  readonly fish: FishSchool;
  readonly events: EventQueue<SimEvent>;
  readonly tuning: Tuning;
  readonly playerId: number;
  nextId: number;
  /** 固定步长环境：共享风场与降水状态。 */
  readonly env: SimEnvironment;
}

export interface SimWorldOptions {
  readonly level: LevelData;
  /** 缺省为 TUNING；创建时校验。 */
  readonly tuning?: Tuning;
  /** 降水调参与初始模式（022；缺省 DEFAULT_PRECIP 与其 mode）。 */
  readonly precip?: PrecipTuning;
  readonly precipMode?: PrecipMode;
  readonly precipState?: PrecipState;
  readonly weather?: WeatherTuning;
  readonly windMode?: WindMode;
}

export function createSimWorld(options: SimWorldOptions): SimWorld {
  const level = (options as SimWorldOptions | undefined)?.level;
  if (!level) throw new Error('createSimWorld: options.level is required (pass generateWorld(...) or a parsed test level)');
  const tuning = options.tuning ?? TUNING;
  validateTuning(tuning);
  let nextId = 1;
  const player = createPelicanEntity(nextId++, level.spawn, tuning);
  if (level.spawnFacing !== undefined) player.facing = level.spawnFacing;
  const entities: Entity[] = [player];
  for (const pos of level.dummies) entities.push(createDummyEntity(nextId++, pos, tuning));
  for (const spawn of level.enemies ?? []) entities.push(createEnemyEntity(nextId++, spawn.kind, spawn, tuning, level.seed ?? 0));
  return {
    tick: 0,
    hitstopTicks: 0,
    respawnTicks: 0,
    photon: { cooldownTicks: 0, chargeTicks: 0, buffered: false, activeTicks: 0, volleyIndex: 0, x: 0, y: 0 },
    level,
    map: level.map,
    fluid: level.fluid,
    spawn: { x: level.spawn.x, y: level.spawn.y },
    entities,
    fish: createFishSchool(level.fishSpawns, level.fluid, tuning.fish),
    events: new EventQueue<SimEvent>(),
    tuning,
    playerId: player.id,
    nextId,
    env: createEnvironment(options.precip, options.precipMode, options.precipState, options.weather ?? tuning.render.weather, options.windMode),
  };
}

export function addEntity(world: SimWorld, make: (id: number) => Entity): Entity {
  const e = make(world.nextId++);
  world.entities.push(e);
  return e;
}

export function getEntity(world: SimWorld, id: number): Entity | undefined {
  return world.entities.find((e) => e.id === id);
}

export function getPlayer(world: SimWorld): Entity {
  const p = getEntity(world, world.playerId);
  if (!p) throw new Error(`sim: player entity ${world.playerId} missing`);
  return p;
}

export type With<K extends keyof Entity> = Entity & Required<Pick<Entity, K>>;

/** 按组件筛选实体（miniplex 风格）。 */
export function query<K extends keyof Entity>(world: SimWorld, ...components: K[]): With<K>[] {
  return world.entities.filter((e): e is With<K> => components.every((c) => e[c] !== undefined));
}

/**
 * 调试倒水：世界坐标 (x,y) → 格，从该格起向上逐格 add（每格封顶 255），直到倒完、遇实心或到顶。
 * 返回实际倒入量。越界或 amount 非非负整数即抛。
 */
export function pourFluid(world: SimWorld, x: number, y: number, amount: number): number {
  const f = world.fluid;
  if (!Number.isInteger(amount) || amount < 0) throw new Error(`pourFluid: amount must be a non-negative integer, got ${amount}`);
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || tx < 0 || ty < 0 || tx >= f.width || ty >= f.height) {
    throw new Error(`pourFluid: (${x},${y}) is outside the ${f.width}×${f.height} world`);
  }
  let left = amount;
  for (let cy = ty; left > 0 && cy < f.height; cy++) {
    if (f.solid[cy * f.width + tx] === 1) break;
    left -= f.add(tx, cy, left);
  }
  return amount - left;
}

/** 鹈鹕 inWater 变化时推 splash（位置取水面附近：脚底 + 浸没比例 × 身高）。 */
function pushSplash(world: SimWorld, e: Entity, wasInWater: boolean): void {
  const p = e.pelican;
  if (!p || p.inWater === wasInWater) return;
  const b = e.body;
  world.events.push({ type: 'splash', id: e.id, x: b.x, y: b.y + p.submersion * b.height, entering: p.inWater });
}

/** 鹈鹕身体中心（小鱼的威胁点）；玩家已移除时为 null。 */
function playerCenter(world: SimWorld): Vec2 | null {
  const p = getEntity(world, world.playerId);
  if (!p || p.removed) return null;
  return { x: p.body.x, y: p.body.y + p.body.height / 2 };
}

/** 实体间碰撞：收集未移除、带 solid 的实体（碰撞盒延伸见 solidExtents）后统一解析。 */
function resolveEntityCollisions(world: SimWorld): void {
  const agents: SolidAgent[] = [];
  for (const e of world.entities) {
    if (e.removed || !e.solid || (e.pelican && e.pelican.weapon.dashTicks > 0)) continue;
    const { left, right } = solidExtents(e, world.tuning);
    agents.push({ id: e.id, body: e.body, solid: e.solid, left, right });
  }
  resolveSolids(agents, world.map, world.tuning.collision, world.tuning.sim.step);
}

function resolveCombat(world: SimWorld): void {
  const { entities, events, tuning } = world;
  const sources: HitSource[] = [];
  const targets: Entity[] = [];
  for (const e of entities) {
    if (e.removed) continue;
    targets.push(e);
    const melee = e.enemy?.kind === 'watchWasp' || (e.enemy?.airborne && e.attack?.def.id === 'lineHound-slam') ? null : meleeHitSource(e);
    if (melee) sources.push(melee);
    if (e.pelican) {
      const overload = humanOverloadHitSource(e);
      if (overload) sources.push(overload);
    }
    if (e.solid?.contactDamage) sources.push(contactHitSource(e, e.solid.contactDamage));
    if (e.projectile) {
      const shot = projectileHitSource(e);
      if (shot) sources.push(shot);
    }
  }
  const wet = wetMarks(entities);
  const hitstop = resolveHits(sources, targets, world.tick, events, tuning.combat);
  applyWetMarks(world, wet);
  if (hitstop > 0) world.hitstopTicks = Math.max(world.hitstopTicks, hitstop);
  for (const e of entities) if (e.projectile) retireSpentProjectile(e, events);
}

function touchLethalCoolant(world: SimWorld): boolean {
  const coolant = world.level.lethalCoolant;
  if (coolant === undefined) return false;
  const player = getPlayer(world);
  if (!overlaps(bodyRect(player.body), coolant)) return false;
  beginPlayerRespawn(world);
  return true;
}

function beginPlayerRespawn(world: SimWorld): void {
  const player = getPlayer(world);
  player.health!.hp = 0;
  cancelPlayerTransform(player);
  cancelPelicanCombat(player);
  player.body.vx = 0;
  player.body.vy = 0;
  player.pelican!.flightMode = 'none';
  resolvePelicanState(player);
  world.hitstopTicks = 0;
  world.photon.chargeTicks = 0;
  world.photon.activeTicks = 0;
  world.photon.buffered = false;
  world.respawnTicks = 72;
  for (const e of world.entities) {
    if (e.enemy) cancelEnemySkill(e);
    if (e.projectile) e.removed = true;
  }
}

function waitForRespawn(world: SimWorld): void {
  for (const entity of world.entities) savePrev(entity.body);
  for (const fish of world.fish.fish) savePrev(fish.body);
  world.respawnTicks--;
  if (world.respawnTicks === 0) {
    const player = getPlayer(world);
    Object.assign(player, createPelicanEntity(player.id, world.spawn, world.tuning));
    delete player.attack;
    delete player.wetTicks;
    if (world.level.spawnFacing !== undefined) player.facing = world.level.spawnFacing;
    world.photon.cooldownTicks = 0;
    moveAndCollide(player.body, world.map, 0);
  }
}

export function stepSim(world: SimWorld, input: InputFrame): void {
  const { tuning, map, entities, fluid } = world;
  const dt = tuning.sim.step;

  if (world.respawnTicks > 0) {
    waitForRespawn(world);
    world.tick++;
    return;
  }
  if (touchLethalCoolant(world)) {
    world.tick++;
    return;
  }

  if (world.hitstopTicks > 0) {
    if (input.skillPressed === 4 && getPlayer(world).pelican!.transformTicks < 0) world.photon.buffered = true;
    for (const f of world.fish.fish) savePrev(f.body);
    for (const e of entities) {
      savePrev(e.body);
      if (e.pelican && e.id === world.playerId) bufferPelicanInput(e, input, tuning);
    }
    world.hitstopTicks--;
    world.tick++;
    return;
  }

  for (const e of entities) savePrev(e.body);
  for (const f of world.fish.fish) savePrev(f.body);
  stepPlayerTransform(world, input);
  // 变身输入已由模拟层消费；控制器仍在 hitstop 分支中负责锁存它。
  const playerInput = { ...input, transformPressed: false };
  stepEnvironment(world);

  const interval = tuning.fluid.stepInterval;
  if (world.tick % interval === 0) stepFluid(fluid, tuning.fluid, (world.tick / interval) | 0);

  for (const e of entities) {
    if (e.removed) continue;
    if (e.pelican) {
      const wasInWater = e.pelican.inWater;
      const wind = world.env.wind;
      const airWind = entityExposed(map, e) ? wind.sway(e.body.x) * tuning.player.airWindSpeed * Math.max(0, wind.state.scale - 1) : 0;
      updatePelican(e, e.id === world.playerId ? playerInput : NEUTRAL_INPUT, map, tuning, dt, fluid, airWind);
      pushSplash(world, e, wasInWater);
    } else if (e.dummy) updateDummy(e, tuning, dt, fluid);
    else if (e.enemy) {
      const player = getPlayer(world);
      updateEnemy(e, player.health!.hp > 0 ? { x: player.body.x, y: player.body.y + player.body.height / 2 } : null, map, tuning);
    }
    const tornadoes = world.env.tornadoes;
    if (tornadoes.length > 0 && (e.pelican || e.dummy) && entityExposed(map, e) && submersion(e.body, fluid) < tuning.player.swim.enterDepth) {
      // 控制器先完成重力与输入，再叠加外力，避免气流被角色移动逻辑覆盖。
      const b = e.body;
      const force = { x: 0, y: 0 };
      for (const tornado of tornadoes) {
        const current = tornadoForce(tornado, b.x, b.y + b.height * 0.5);
        force.x += current.x;
        force.y += current.y;
      }
      const maxSpeed = TORNADO_RULES.maxSpeed * Math.sqrt(world.env.tornadoPower);
      if (force.y > 0) {
        b.vx = clamp(b.vx + force.x * dt, -maxSpeed, maxSpeed);
        b.vy = Math.min(b.vy + force.y * dt, maxSpeed);
        if (e.pelican && e.pelican.flightMaxTicks > 0) {
          const ceiling = map.height - tuning.player.flight.ceilingMargin - b.height;
          b.vy = Math.min(b.vy, Math.max(0, (ceiling - b.y) / dt));
        }
        if (b.vy > 0) b.onGround = false;
      }
    }
  }
  updateShooters(world);
  const requests: ProjectileRequest[] = [];
  for (const e of entities) {
    if (!e.removed) requests.push(...collectProjectileRequests(e));
  }
  spawnProjectiles(world, requests);
  steerHumanProjectiles(world);
  stepPhotonUltimate(world, input);
  steerPhotonProjectiles(world);

  for (const e of entities) {
    if (e.removed) continue;
    if (e.projectile) stepProjectile(e, map, dt, world.events, fluid);
    else {
      moveAndCollide(e.body, map, dt);
      if (e.pelican && e.pelican.weapon.dashTicks > 0 && e.body.wallContact !== 0) {
        e.pelican.weapon.dashTicks = 0;
        e.attack = undefined;
      }
    }
  }
  if (touchLethalCoolant(world)) {
    world.tick++;
    return;
  }
  resolveEntityCollisions(world);
  for (const e of entities) if (e.enemy && !e.removed) resolveEnemyLanding(e);

  for (const e of entities) {
    if (!e.pelican || e.removed) continue;
    resolvePelicanRide(e, map, tuning);
    for (const req of consumeRideEvents(e)) world.events.push({ ...req, id: e.id });
    resolvePelicanState(e);
  }

  stepFish(world.fish, map, fluid, playerCenter(world), world.tick, tuning.fish, dt, tuning.physics);

  resolveWeaponInteractions(world);
  resolveCombat(world);
  const player = getPlayer(world);
  if (player.health!.hp <= 0) {
    cancelPlayerTransform(player);
    cancelPelicanCombat(player);
    resolvePelicanState(player);
    if (world.level.enemies) beginPlayerRespawn(world);
  } else if (player.pelican!.form === 'human' && player.health!.hitstunTicks > 0) {
    cancelPelicanCombat(player);
    resolvePelicanState(player);
  }

  for (const e of entities) {
    if (e.health) tickHealth(e.health, world.tick);
    if (e.dummy) tickDummyReset(e, tuning, world.events);
    if (e.enemy && (e.health!.hp <= 0 || e.health!.hitstunTicks > 0)) {
      cancelEnemySkill(e);
      if (e.health!.hp <= 0) e.removed = true;
    }
  }

  for (let i = entities.length - 1; i >= 0; i--) if (entities[i]?.removed) entities.splice(i, 1);

  world.tick++;
}
