import { createTileRideProbe } from '../physics/ride-probe.ts';
import { createFreeWorldWeather } from '../world/free-world-weather.ts';
import { HUMAN_BODY_HEIGHT } from '../config/player-form.ts';
import type { PlayerForm } from '../config/player-form.ts';
import { stepFreeWorldNpcs } from './free-world-npcs.ts';
import { stepBossArena } from './boss-arena.ts';
import type { BossArenaState } from './boss-arena.ts';
/**
 * 模拟世界：组合地图、实体、事件，按固定 tick 推进。纯逻辑，无 DOM/three/随机数。
 * stepSim 顺序：存 prev → 液体（每 fluid.stepInterval tick 推进一次）→ 意图（鹈鹕控制器/假人/敌方射击；投射物无意图；鹈鹕入/出水推 splash）
 * → 统一生成投射物（projectileFired，sim/weapon-system） → 移动（投射物 stepProjectile，其余 moveAndCollide） → 实体间碰撞（resolveSolids：带 solid 的实体推开/站头上/随动，任务 017） → 鹈鹕骑行结算（撞墙/净空下车，推 mount/dismount） → 鹈鹕状态 → 小鱼（stepFish，威胁=鹈鹕身体中心；不进实体、不参与战斗）
 * → 武器结算（湿计时、张嘴吞、捕鱼、武器事件；任务 018） → 命中（近战 + 投射物；命中数满即移除，水弹/鱼命中记湿）
 * （命中源另含 solid.contactDamage 的接触伤害，默认无实体启用）→ 生命/假人归位 → 清理 → tick++。
 * hitstop 期间只推进计时（tick、hitstopTicks）并缓冲玩家输入，跳过控制器、物理、液体与小鱼，并令 prev=cur（渲染不插值抖动）。
 */
import { ENEMY_RULES } from '../config/enemy-rules.ts';
import { HOMESTEAD, isDaytime } from '../config/homestead.ts';
import { cancelBossSkill, setBossDifficulty, updateBoss } from '../entities/boss.ts';
import { mainlineTransformUnlocked, restoreMainlinePlayer, stepMainline, stepMainlineReveal } from './mainline.ts';
import type { MainlineState } from './mainline.ts';
import { stepHomesteadWorld } from './homestead.ts';
import type { HomesteadState } from './homestead.ts';
import { jumpVelocity, validateTuning, TUNING } from '../config/tuning.ts';
import { stepPhotonUltimate, steerPhotonProjectiles } from './photon-system.ts';
import { cancelPlayerTransform, stepPlayerTransform } from './player-transform.ts';
import { stepPlayerTeleport } from './player-teleport.ts';
import { teleportLocksMovement } from '../entities/teleport.ts';
import type { Tuning } from '../config/tuning.ts';
import { EventQueue } from '../core/events.ts';
import { hash01, hashU32 } from '../core/rng.ts';
import type { SimEvent } from '../core/game-events.ts';
import type { Vec2 } from '../core/math.ts';
import type { LevelData } from '../world/level.ts';
import type { TileMap } from '../world/tile-map.ts';
import type { FluidMap } from '../world/fluid-map.ts';
import { stepFluid } from '../world/fluid-sim.ts';
import { TORNADO_RULES, tornadoForce } from '../world/tornado.ts';
import { clamp, overlaps, rectCenter, rectIntersection } from '../core/math.ts';
import { submersion } from '../physics/fluid-contact.ts';
import { bodyRect, savePrev } from '../physics/body.ts';
import { displaceBody, moveAndCollide } from '../physics/tile-collision.ts';
import { hasLineOfSight } from '../physics/line-of-sight.ts';
import { resolveSolids } from '../physics/entity-collision.ts';
import type { SolidAgent } from '../physics/entity-collision.ts';
import { applyHit, contactHitSource, emitDamageImmune, meleeHitSource, resolveHits, tickHealth } from '../combat/combat-system.ts';
import type { HitSource } from '../combat/combat-system.ts';
import { cancelPelicanCombat } from '../entities/pelican-weapons.ts';
import { humanOverloadHitSource } from '../entities/human-combat.ts';
import { createDummyEntity, createPelicanEntity } from '../entities/entity.ts';
import { createHealthPack, updateHealthPack } from '../entities/health-pack.ts';
import { cancelEnemySkill, createEnemyEntity, resolveEnemyLanding, returnEnemyToPatrol, updateEnemy } from '../entities/enemy.ts';
import { enemyTouchesSafeZone } from '../entities/enemy-navigation.ts';
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
import { stepPlayerBreath } from './player-breath.ts';
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
  mobileBosses: boolean;
  bossArena?: BossArenaState;
  mainline?: MainlineState;
  /** 家园概念版本：经济、无人机与标记；只在 homestead 模式启用。 */
  homestead?: HomesteadState;
  tick: number;
  hitstopTicks: number;
  /** 玩家死亡后的重生等待；等待期间不接收角色输入。 */
  respawnTicks: number;
  /** 首次从黑洞出现时固定身体；只消耗可见游戏开始后的模拟时间。 */
  blackholeArrivalTicks: number;
  /** 连续脱战的 tick 数，每满一秒结算自然回血。 */
  playerRecoveryTicks: number;
  readonly photon: { cooldownTicks: number; chargeTicks: number; buffered: boolean; activeTicks: number; volleyIndex: number; x: number; y: number; aim: Vec2 | null; launchAngle: number };
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
  readonly spawnForm: PlayerForm;
  nextId: number;
  /** 固定步长环境：共享风场与降水状态。 */
  readonly env: SimEnvironment;
}

export interface SimWorldOptions {
  readonly level: LevelData;
  readonly playerForm?: PlayerForm;
  /** 缺省为 TUNING；创建时校验。 */
  readonly tuning?: Tuning;
  /** 降水调参与初始模式（022；缺省 DEFAULT_PRECIP 与其 mode）。 */
  readonly precip?: PrecipTuning;
  readonly precipMode?: PrecipMode;
  readonly freeWorldWeather?: { readonly level: LevelData; readonly ground: Int16Array };
  readonly precipState?: PrecipState;
  readonly weather?: WeatherTuning;
  readonly windMode?: WindMode;
}

function createPlayer(id: number, position: Vec2, tuning: Tuning, form: PlayerForm): Entity {
  const player = createPelicanEntity(id, position, tuning);
  player.pelican!.form = player.pelican!.transformFrom = form;
  player.body.height = form === 'human' ? HUMAN_BODY_HEIGHT : tuning.player.height;
  return player;
}

export function setMobileBossDifficulty(world: SimWorld, mobile: boolean): void {
  if (world.mobileBosses === mobile) return;
  world.mobileBosses = mobile;
  for (const entity of world.entities) if (entity.boss) setBossDifficulty(entity, mobile);
}

export function createSimWorld(options: SimWorldOptions): SimWorld {
  const level = (options as SimWorldOptions | undefined)?.level;
  if (!level) throw new Error('createSimWorld: options.level is required (pass generateWorld(...) or a parsed test level)');
  const tuning = options.tuning ?? TUNING;
  validateTuning(tuning);
  let nextId = 1;
  const spawnForm = options.playerForm ?? 'pelican';
  const player = createPlayer(nextId++, level.spawn, tuning, spawnForm);
  if (level.spawnFacing !== undefined) player.facing = level.spawnFacing;
  const entities: Entity[] = [player];
  for (const pos of level.dummies) entities.push(createDummyEntity(nextId++, pos, tuning));
  for (const spawn of level.enemies ?? []) entities.push(createEnemyEntity(nextId++, spawn.kind, spawn, tuning, level.seed ?? 0));
  const env = createEnvironment(options.precip, options.precipMode, options.precipState, options.weather ?? tuning.render.weather, options.windMode);
  if (options.freeWorldWeather) {
    env.localWeather = createFreeWorldWeather(options.freeWorldWeather.level, options.freeWorldWeather.ground, env.rules);
    if (env.mode === 'auto') env.precip = env.localWeather(player.body.x, player.body.y, 0).precip;
  }
  return {
    mobileBosses: false,
    tick: 0,
    hitstopTicks: 0,
    respawnTicks: 0,
    blackholeArrivalTicks: 0,
    playerRecoveryTicks: 0,
    photon: { cooldownTicks: 0, chargeTicks: 0, buffered: false, activeTicks: 0, volleyIndex: 0, x: 0, y: 0, aim: null, launchAngle: 0 },
    level,
    map: level.map,
    fluid: level.fluid,
    spawn: { x: level.spawn.x, y: level.spawn.y },
    entities,
    fish: createFishSchool(level.fishSpawns, level.fluid, tuning.fish),
    events: new EventQueue<SimEvent>(),
    tuning,
    playerId: player.id,
    spawnForm,
    nextId,
    env,
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

/** 装配层仅在黑洞新开场调用，保留地面出生点供死亡重生使用。 */
export function beginBlackholeArrival(world: SimWorld): void {
  const player = getPlayer(world);
  const center = world.level.blackhole!;
  Object.assign(player.body, { x: center.x, y: center.y - player.body.height / 2, vx: 0, vy: 0, onGround: false });
  player.pelican!.coyoteTicks = 0;
  savePrev(player.body);
  world.blackholeArrivalTicks = Math.ceil(1 / world.tuning.sim.step);
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
    if (e.removed || !e.solid || (e.pelican && (e.pelican.weapon.dashTicks > 0 || teleportLocksMovement(e)))) continue;
    const { left, right } = solidExtents(e, world.tuning);
    agents.push({ id: e.id, body: e.body, solid: e.solid, left, right });
  }
  resolveSolids(agents, world.map, world.tuning.collision, world.tuning.sim.step);
  for (const e of world.entities) {
    if (!e.enemy || e.removed || !enemyTouchesSafeZone(e.body, world.level)) continue;
    const previous = { ...e.body, x: e.body.prevX, y: e.body.prevY };
    if (!enemyTouchesSafeZone(previous, world.level)) {
      // 只撤销本 tick 被其他实体推过边界的位移，不改变驻地或玩家位置。
      e.body.x = previous.x;
      e.body.y = previous.y;
      e.body.vx = 0;
      e.body.vy = 0;
    }
    returnEnemyToPatrol(e);
  }
}

function resolveDroneStomp(world: SimWorld): void {
  const player = getPlayer(world);
  const b = player.body;
  if (player.health!.hp <= 0 || b.vy >= 0) return;
  let target: Entity | undefined;
  let firstTime = Infinity;
  for (const e of world.entities) {
    if (e.kind !== 'watchWasp' || e.removed || e.health!.hp <= 0 || e.health!.invulnTicks > 0) continue;
    const drone = e.body;
    const before = b.prevY - (drone.prevY + drone.height);
    const after = b.y - (drone.y + drone.height);
    if (before < 0 || after > 0 || before <= after) continue;
    // 使用相对运动的交点，避免快速下落或无人机横移时漏判、误判。
    const time = before / (before - after);
    const playerX = b.prevX + (b.x - b.prevX) * time;
    const droneX = drone.prevX + (drone.x - drone.prevX) * time;
    if (Math.abs(playerX - droneX) >= b.halfWidth + drone.halfWidth || time >= firstTime) continue;
    target = e;
    firstTime = time;
  }
  if (!target) return;
  const { tuning } = world;
  const hit = tuning.attacks.stomp;
  applyHit(target, player.facing, hit, world.tick, tuning.combat);
  displaceBody(b, world.map, 0, target.body.y + target.body.height - b.y);
  b.vy = jumpVelocity(tuning.physics.gravity, tuning.player.jumpHeight);
  b.onGround = false;
  player.solid!.supportId = null;
  player.pelican!.jumping = false;
  player.pelican!.flightMode = 'none';
  player.pelican!.flownThisAir = false;
  world.events.push({ type: 'hit', attackerId: player.id, sourceId: player.id, targetId: target.id, damage: hit.damage, x: b.x, y: b.y });
  world.hitstopTicks = Math.max(world.hitstopTicks, hit.hitstop);
}

/** 家园模式的夜晚：野外敌人更凶。主线和普通自由世界没有 homestead，不受影响。 */
function homesteadNight(world: SimWorld): boolean {
  return world.homestead !== undefined && !isDaytime(world.homestead.economy.second);
}

function resolveCombat(world: SimWorld): void {
  const { entities, events, tuning } = world;
  const player = getPlayer(world);
  const playerHurtbox = bodyRect(player.body);
  const sources: HitSource[] = [];
  const targets: Entity[] = [];
  for (const e of entities) {
    if (e.removed) continue;
    if (!(e.pelican && e.pelican.weapon.dashTicks > 0) && (e.id !== world.playerId || !enemyTouchesSafeZone(e.body, world.level))) targets.push(e);
    const melee = e.enemy?.kind === 'watchWasp' || (e.enemy?.airborne && e.attack?.def.id === 'lineHound-slam') ? null : meleeHitSource(e);
    if (melee) {
      if (!e.enemy) sources.push(melee);
      else {
        const hitArea = rectIntersection(melee.box, playerHurtbox);
        if (hitArea) {
          const hitPoint = rectCenter(hitArea);
          // 低扫按实际命中高度遮挡，不能从双方身体中心的高处越过矮墙。
          if (hasLineOfSight(world.map, { x: e.body.x, y: hitPoint.y }, hitPoint)) sources.push(melee);
        }
      }
    }
    if (e.pelican) {
      const overload = humanOverloadHitSource(e);
      if (overload) {
        sources.push(overload);
        events.push({ type: 'combatAction', id: e.id, action: 'server_overload', phase: 'released', x: e.body.x, y: e.body.y });
      }
    }
    if (e.solid?.contactDamage) sources.push(contactHitSource(e, e.solid.contactDamage));
    if (e.projectile) {
      const shot = projectileHitSource(e);
      if (shot) sources.push(shot);
    }
  }
  if (homesteadNight(world)) {
    // 近战、炸弹、铝热剂都经过这里；hitIds 保持原引用，命中去重不受影响。
    for (const [i, src] of sources.entries()) if (src.team === 'enemy') sources[i] = { ...src, def: { ...src.def, damage: src.def.damage * HOMESTEAD.night.damage } };
  }
  const wet = wetMarks(entities);
  const hitstop = resolveHits(sources, targets, world.tick, events, tuning.combat);
  applyWetMarks(world, wet);
  if (hitstop > 0) world.hitstopTicks = Math.max(world.hitstopTicks, hitstop);
  for (const e of entities) if (e.projectile) retireSpentProjectile(e, events);
}

function applyEnvironmentalDamage(world: SimWorld): boolean {
  const player = getPlayer(world);
  const health = player.health!;
  if (health.hp <= 0) {
    health.overloadInvulnTicks = 0;
    return false;
  }
  let damage = stepPlayerBreath(player, world.fluid, world.tuning.sim.step);
  const coolant = world.level.lethalCoolant;
  if (coolant !== undefined && overlaps(bodyRect(player.body), coolant)) damage += 30 * world.tuning.sim.step;
  if (damage === 0) return false;
  if (player.pelican!.weapon.dashTicks > 0 || health.overloadInvulnTicks > 0) {
    emitDamageImmune(player, world.tick, world.events);
    return false;
  }
  // 普通受击无敌帧不免疫环境伤害；技能免伤也不会停止上面的耗氧计时。
  health.hp = Math.max(0, health.hp - damage);
  health.flashTicks = world.tuning.combat.hitFlashTicks;
  if (health.hp === 0) {
    beginPlayerRespawn(world);
    return true;
  }
  return false;
}

function beginPlayerRespawn(world: SimWorld): void {
  const player = getPlayer(world);
  player.health!.hp = 0;
  delete player.teleport;
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
  world.playerRecoveryTicks = 0;
  for (const e of world.entities) {
    if (e.enemy) cancelEnemySkill(e);
    if (e.boss) cancelBossSkill(e);
    if (e.projectile) e.removed = true;
  }
}

function waitForRespawn(world: SimWorld): void {
  for (const entity of world.entities) savePrev(entity.body);
  for (const fish of world.fish.fish) savePrev(fish.body);
  world.respawnTicks--;
  if (world.respawnTicks === 0) {
    const player = getPlayer(world);
    Object.assign(player, createPlayer(player.id, world.spawn, world.tuning, world.spawnForm));
    delete player.attack;
    delete player.wetTicks;
    delete player.teleport;
    if (world.level.spawnFacing !== undefined) player.facing = world.level.spawnFacing;
    world.photon.cooldownTicks = 0;
    moveAndCollide(player.body, world.map, 0);
    if (world.mainline) restoreMainlinePlayer(world);
  }
}

function recoverPlayerHealth(world: SimWorld, player: Entity, hpBefore: number): void {
  const h = player.health!;
  const p = player.pelican!;
  const attacking = player.attack !== undefined || p.humanCombat.action !== null || p.shotTicks >= 0
    || p.weapon.dashTicks > 0 || p.weapon.gulpTicks > 0
    || world.photon.chargeTicks > 0 || world.photon.activeTicks > 0;
  const fighting = world.entities.some(e => !e.removed && (
    (e.projectile !== undefined && e.projectile.ownerId === player.id)
    || (e.health !== undefined && e.health.hp > 0 && (
      e.boss !== undefined || (e.enemy !== undefined && (e.enemy.engaged || e.attack !== undefined))
    ))
  ));
  if (h.hp <= 0 || h.hp >= h.maxHp || h.hp < hpBefore || h.lastHitTick === world.tick
    || h.hitstunTicks > 0 || attacking || fighting) {
    world.playerRecoveryTicks = 0;
    return;
  }
  if (++world.playerRecoveryTicks >= Math.ceil(1 / world.tuning.sim.step)) {
    h.hp = Math.min(h.maxHp, h.hp + 0.7);
    world.playerRecoveryTicks = 0;
  }
}

function dropHealthPack(world: SimWorld, position: Vec2, healAmount: number, maxHp: number): void {
  let nearbyHealing = 0;
  for (const entity of world.entities) {
    if (!entity.healthPack || entity.removed) continue;
    if (Math.hypot(entity.body.x - position.x, entity.body.y - position.y) > 20) continue;
    nearbyHealing += entity.healthPack.healAmount;
    if (nearbyHealing >= maxHp * 2) return;
  }
  world.entities.push(createHealthPack(world.nextId++, position, healAmount));
}

export function stepSim(world: SimWorld, input: InputFrame): void {
  const { tuning, map, entities, fluid } = world;
  const rideProbe = createTileRideProbe(map);
  const dt = tuning.sim.step;
  if (world.bossArena && stepBossArena(world)) {
    for (const entity of entities) savePrev(entity.body);
    for (const fish of world.fish.fish) savePrev(fish.body);
    world.tick++;
    return;
  }
  if (stepMainlineReveal(world)) {
    for (const entity of entities) savePrev(entity.body);
    for (const fish of world.fish.fish) savePrev(fish.body);
    world.tick++;
    return;
  }
  if (world.blackholeArrivalTicks > 0) {
    for (const entity of entities) savePrev(entity.body);
    for (const fish of world.fish.fish) savePrev(fish.body);
    world.blackholeArrivalTicks--;
    world.tick++;
    return;
  }
  if (!mainlineTransformUnlocked(world)) {
    if (input.transformPressed) world.events.push({ type: 'transformBlocked', id: world.playerId, reason: 'story' });
    input = { ...input, transformPressed: false };
    getPlayer(world).pelican!.transformBuffered = false;
  }

  if (world.respawnTicks > 0) {
    waitForRespawn(world);
    world.tick++;
    return;
  }
  if (world.hitstopTicks > 0) {
    world.playerRecoveryTicks = 0;
    if (applyEnvironmentalDamage(world)) {
      world.tick++;
      return;
    }
    const player = getPlayer(world);
    // 动作随停帧冻结，但动作结束后的两秒余效仍按模拟时间消退。
    if (player.pelican!.humanCombat.action !== 'server_overload' && player.health!.overloadInvulnTicks > 0) {
      player.health!.overloadInvulnTicks--;
    }
    if (input.skillPressed === 4 && getPlayer(world).pelican!.transformTicks < 0 && !teleportLocksMovement(getPlayer(world))) {
      world.photon.buffered = true;
      if (world.photon.chargeTicks === 0) world.photon.aim = input.aim === null ? null : { ...input.aim };
    }
    for (const f of world.fish.fish) savePrev(f.body);
    for (const e of entities) {
      savePrev(e.body);
      if (e.pelican && e.id === world.playerId && !teleportLocksMovement(e)) bufferPelicanInput(e, input, tuning);
    }
    world.hitstopTicks--;
    world.tick++;
    return;
  }
  const playerHpBefore = getPlayer(world).health!.hp;

  for (const e of entities) savePrev(e.body);
  for (const f of world.fish.fish) savePrev(f.body);
  stepFreeWorldNpcs(world);
  stepPlayerTeleport(world);
  if (teleportLocksMovement(getPlayer(world))) input = NEUTRAL_INPUT;
  stepPlayerTransform(world, input);
  // 变身输入已由模拟层消费；控制器仍在 hitstop 分支中负责锁存它。
  const playerInput = { ...input, transformPressed: false };
  stepEnvironment(world);

  const interval = tuning.fluid.stepInterval;
  if (world.tick % interval === 0) stepFluid(fluid, tuning.fluid, (world.tick / interval) | 0);

  for (const e of entities) {
    if (e.removed) continue;
    if (e.pelican) {
      if (teleportLocksMovement(e)) continue;
      const wasInWater = e.pelican.inWater;
      const wind = world.env.wind;
      const airWind = entityExposed(map, e) ? wind.sway(e.body.x) * tuning.player.airWindSpeed * Math.max(0, wind.state.scale - 1) : 0;
      updatePelican(e, e.id === world.playerId ? playerInput : NEUTRAL_INPUT, map, tuning, dt, fluid, airWind, rideProbe);
      pushSplash(world, e, wasInWater);
    } else if (e.boss) {
      const player = getPlayer(world);
      updateBoss(e, player.health!.hp > 0 ? { x: player.body.x, y: player.body.y + player.body.height / 2 } : null, map, fluid, tuning);
    } else if (e.dummy) updateDummy(e, tuning, dt, fluid);
    else if (e.healthPack) updateHealthPack(e, tuning, fluid);
    else if (e.enemy) {
      const player = getPlayer(world);
      const oldAttack = e.attack;
      const oldElapsed = e.attack?.elapsed;
      updateEnemy(e, player.health!.hp > 0 ? { x: player.body.x, y: player.body.y + player.body.height / 2, vx: player.body.vx, vy: player.body.vy } : null, world.level, tuning, homesteadNight(world) ? HOMESTEAD.night.speed : 1);
      if (e.attack) {
        const skill = ENEMY_RULES[e.enemy.kind].skills[e.enemy.skill!];
        if (e.attack !== oldAttack) world.events.push({ type: 'combatAction', id: e.id, action: skill.id, phase: 'started', x: e.body.x, y: e.body.y });
        if (skill.mode !== 'slam' && skill.mode !== 'bomb' && skill.mode !== 'thermite' && e.attack.elapsed === skill.startup && oldElapsed !== skill.startup) {
          world.events.push({ type: 'combatAction', id: e.id, action: skill.id, phase: 'released', x: e.body.x, y: e.body.y });
        }
      }
    }
    if (e.id === world.playerId && world.level.blackhole) {
      const b = e.body;
      const dx = world.level.blackhole.x - b.x;
      const dy = world.level.blackhole.y - (b.y + b.height / 2);
      const radius = Math.min(Math.hypot(dx, dy) / 9, 1);
      // Wendland 在边界平滑归零；中心柔化避免奇点，吸力低于空气操控和飞行加速度。
      const force = 40 * (1 - radius) ** 4 * (1 + 4 * radius) / Math.sqrt(dx * dx + dy * dy + 1);
      b.vx += dx * force * dt;
      b.vy += dy * force * dt;
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
  steerPhotonProjectiles(world.entities);

  for (const e of entities) {
    if (e.removed) continue;
    if (e.projectile) {
      if (e.team === 'enemy' && enemyTouchesSafeZone(e.body, world.level)) e.removed = true;
      else {
        stepProjectile(e, map, dt, world.events, fluid);
        if (e.team === 'enemy' && enemyTouchesSafeZone(e.body, world.level)) e.removed = true;
      }
    }
    else {
      if (e.pelican && teleportLocksMovement(e)) continue;
      moveAndCollide(e.body, map, dt);
      if (e.pelican && e.pelican.weapon.dashTicks > 0 && e.body.wallContact !== 0) {
        e.pelican.weapon.dashTicks = 0;
        e.attack = undefined;
      }
    }
  }
  if (applyEnvironmentalDamage(world)) {
    world.tick++;
    return;
  }
  resolveEntityCollisions(world);
  resolveDroneStomp(world);
  for (const e of entities) {
    if (!e.enemy || e.removed) continue;
    const wasAirborne = e.enemy.airborne;
    resolveEnemyLanding(e);
    if (wasAirborne && !e.enemy.airborne && e.attack && ENEMY_RULES[e.enemy.kind].skills[e.enemy.skill!].mode === 'slam') {
      world.events.push({ type: 'combatAction', id: e.id, action: e.attack.def.id, phase: 'released', x: e.body.x, y: e.body.y });
    }
  }

  for (const e of entities) {
    if (!e.pelican || e.removed || teleportLocksMovement(e)) continue;
    resolvePelicanRide(e, rideProbe, tuning);
    for (const req of consumeRideEvents(e)) world.events.push({ ...req, id: e.id });
    resolvePelicanState(e);
  }

  stepFish(world.fish, map, fluid, playerCenter(world), world.tick, tuning.fish, dt, tuning.physics);

  resolveWeaponInteractions(world);
  resolveCombat(world);
  if (world.bossArena?.phase === 'fighting') stepBossArena(world);
  const player = getPlayer(world);
  if (player.health!.hp <= 0) {
    delete player.teleport;
    cancelPlayerTransform(player);
    cancelPelicanCombat(player);
    resolvePelicanState(player);
    if (world.level.enemies) beginPlayerRespawn(world);
  } else if (player.pelican!.form === 'human' && player.health!.hitstunTicks > 0) {
    cancelPelicanCombat(player);
    resolvePelicanState(player);
  }

  recoverPlayerHealth(world, player, playerHpBefore);
  const health = player.health!;
  for (const e of entities) {
    if (health.hp <= 0 || health.hp >= health.maxHp) break;
    if (!e.healthPack || e.removed || !overlaps(bodyRect(player.body), bodyRect(e.body))) continue;
    const amount = Math.min(e.healthPack.healAmount, health.maxHp - health.hp);
    health.hp += amount;
    e.removed = true;
    world.events.push({ type: 'heal', id: player.id, amount, x: player.body.x, y: player.body.y + player.body.height });
  }

  for (const e of entities) {
    if (e.health) tickHealth(e.health, world.tick);
    if (e.dummy) tickDummyReset(e, tuning, world.events);
    if (e.enemy && (e.health!.hp <= 0 || e.health!.hitstunTicks > 0)) {
      if (e.attack || e.health!.hp <= 0) cancelEnemySkill(e);
      if (e.health!.hp <= 0) e.removed = true;
    }
    if (e.boss) {
      if (e.health!.lastHitTick === world.tick && hash01(e.id, world.tick, world.level.seed ?? 0) < 1 / 3) {
        const healAmount = 10 + hashU32(e.id, world.tick, (world.level.seed ?? 0) ^ 0x632be5ab) % 21;
        dropHealthPack(world, e.body, healAmount, health.maxHp);
      }
      if (e.health!.hp <= 0) e.removed = true;
    }
  }

  for (let i = entities.length - 1; i >= 0; i--) {
    const e = entities[i]!;
    if (!e.removed) continue;
    if (e.enemy && e.health!.hp <= 0 && hash01(e.id, 1, world.level.seed ?? 0) < 0.45) {
      const healAmount = 10 + hashU32(e.id, 0, world.level.seed ?? 0) % 21;
      dropHealthPack(world, e.body, healAmount, health.maxHp);
    }
    entities.splice(i, 1);
  }
  if (world.mainline) stepMainline(world);
  // 1 个模拟 tick = 1 游戏秒。
  if (world.homestead) stepHomesteadWorld(world, 1);

  world.tick++;
}
