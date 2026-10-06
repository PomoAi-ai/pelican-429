import { MAINLINE_CORE, MAINLINE_COUNTDOWN_SECONDS, MAINLINE_ENEMIES, MAINLINE_REVEAL } from '../config/mainline.ts';
import type { MainlineCheckpoint, MainlinePhase } from '../config/mainline.ts';
import { HUMAN_BODY_HEIGHT, PLAYER_TRANSFORM } from '../config/player-form.ts';
import { createBossEntity } from '../entities/boss.ts';
import { cancelEnemySkill, createEnemyEntity } from '../entities/enemy.ts';
import { createPelicanEntity } from '../entities/entity.ts';
import { createWandererEntity } from '../entities/wanderer.ts';
import { moveAndCollide } from '../physics/tile-collision.ts';
import { NEUTRAL_INPUT } from '../entities/pelican-controller.ts';
import { stepPlayerTransform } from './player-transform.ts';
import type { SimWorld } from './sim-world.ts';

export interface MainlineState {
  phase: MainlinePhase;
  countdownTicks: number;
  revealTicks: number;
  bossId: number | null;
  readonly perimeterIds: number[];
}

export function mainlineTransformUnlocked(world: SimWorld): boolean {
  const phase = world.mainline?.phase;
  return phase === undefined || phase === 'countdown' || phase === 'sam' || phase === 'restored';
}

function spawnBoss(world: SimWorld, kind: 'tibo' | 'sam'): void {
  const boss = createBossEntity(world.nextId++, kind, { x: MAINLINE_CORE.bossX, y: MAINLINE_CORE.y }, world.tuning, world.mobileBosses);
  world.entities.push(boss);
  world.mainline!.bossId = boss.id;
}

function spawnSamResident(world: SimWorld): void {
  const sam = createWandererEntity(world.nextId++, 'sam', { x: MAINLINE_CORE.playerX + 3, y: MAINLINE_CORE.y }, world.tuning, world.level.seed!);
  sam.npc!.fromBoss = true;
  sam.facing = -1;
  moveAndCollide(sam.body, world.map, 0);
  world.entities.push(sam);
}

/** 存档恢复与死亡重生共用阶段出生点；已解锁形态不会被默认鹈鹕初始值覆盖。 */
export function restoreMainlinePlayer(world: SimWorld): void {
  const state = world.mainline!;
  const player = world.entities.find(entity => entity.id === world.playerId)!;
  const unlocked = mainlineTransformUnlocked(world);
  const x = state.phase === 'perimeter' ? 44 : state.phase === 'core' ? 152 : MAINLINE_CORE.playerX;
  Object.assign(world.spawn, { x, y: MAINLINE_CORE.y });
  Object.assign(player, createPelicanEntity(player.id, world.spawn, world.tuning));
  delete player.attack;
  delete player.wetTicks;
  delete player.teleport;
  if (unlocked) {
    player.pelican!.form = player.pelican!.transformFrom = 'human';
    player.body.height = HUMAN_BODY_HEIGHT;
  } else player.pelican!.ride.mode = 'riding';
  moveAndCollide(player.body, world.map, 0);
}

function syncGarrisonHold(world: SimWorld): void {
  const phase = world.mainline!.phase;
  const hold = phase === 'tibo' || phase === 'countdown' || phase === 'sam';
  for (const entity of world.entities) if (entity.enemy) {
    entity.enemy.holdPost = hold;
    // 追进核心的哨蜂若正在出招，起手帧仍会投弹；待命必须同时收招。
    if (hold && entity.attack) cancelEnemySkill(entity);
  }
}

/** 主线显式启用，场景预览和自由世界不受其阶段限制。 */
export function initializeMainline(world: SimWorld, checkpoint: MainlineCheckpoint = { phase: 'perimeter', countdownTicks: 0 }): void {
  world.mainline = { ...checkpoint, revealTicks: -1, bossId: null, perimeterIds: [] };
  for (let i = world.entities.length - 1; i >= 0; i--) {
    const entity = world.entities[i]!;
    if (entity.enemy || entity.boss || entity.projectile || entity.npc) world.entities.splice(i, 1);
  }
  // 楼层驻军与外围任务分开：从任何检查点回来，上层仍可战斗。
  for (const spawn of world.level.enemies ?? []) {
    if (spawn.y > MAINLINE_CORE.y + 4) world.entities.push(createEnemyEntity(world.nextId++, spawn.kind, spawn, world.tuning, world.level.seed ?? 0));
  }
  if (checkpoint.phase === 'perimeter') {
    for (const spawn of MAINLINE_ENEMIES) {
      const entity = createEnemyEntity(world.nextId++, spawn.kind, spawn, world.tuning, world.level.seed ?? 0);
      world.entities.push(entity);
      world.mainline.perimeterIds.push(entity.id);
    }
  } else if (checkpoint.phase === 'tibo' || checkpoint.phase === 'sam') spawnBoss(world, checkpoint.phase);
  else if (checkpoint.phase === 'restored') spawnSamResident(world);
  restoreMainlinePlayer(world);
  syncGarrisonHold(world);
}

export function mainlineCheckpoint(world: SimWorld): MainlineCheckpoint {
  const { phase, countdownTicks, bossId } = world.mainline!;
  // 同归于尽时阶段推进会等待复活，但存档不能把已击败的 Boss 再生出来。
  if ((phase === 'tibo' || phase === 'sam') && !world.entities.some(entity => entity.id === bossId)) {
    return { phase: phase === 'tibo' ? 'countdown' : 'restored', countdownTicks: phase === 'tibo' ? Math.round(MAINLINE_COUNTDOWN_SECONDS / world.tuning.sim.step) : 0 };
  }
  return { phase, countdownTicks };
}

/** 只由固定步长模拟推进，因此菜单暂停与页面停止模拟时不会消耗抵达倒计时。 */
export function stepMainline(world: SimWorld): void {
  const state = world.mainline!;
  const player = world.entities.find(entity => entity.id === world.playerId)!;
  syncGarrisonHold(world);
  if (world.respawnTicks > 0 || player.health!.hp <= 0) return;
  if (state.phase === 'perimeter') {
    if (!world.entities.some(entity => state.perimeterIds.includes(entity.id))) state.phase = 'core';
  } else if (state.phase === 'core') {
    if (player.body.x >= MAINLINE_CORE.triggerX && Math.abs(player.body.y - MAINLINE_CORE.y) < 3) {
      state.phase = 'tibo';
      spawnBoss(world, 'tibo');
      syncGarrisonHold(world);
    }
  } else if (state.phase === 'tibo' || state.phase === 'sam') {
    if (!world.entities.some(entity => entity.id === state.bossId)) {
      state.bossId = null;
      state.phase = state.phase === 'tibo' ? 'countdown' : 'restored';
      state.countdownTicks = state.phase === 'countdown' ? Math.round(MAINLINE_COUNTDOWN_SECONDS / world.tuning.sim.step) : 0;
      for (let i = world.entities.length - 1; i >= 0; i--) if (world.entities[i]!.projectile) world.entities.splice(i, 1);
      restoreMainlinePlayer(world);
      if (state.phase === 'countdown') {
        state.revealTicks = 0;
        player.pelican!.form = player.pelican!.transformFrom = 'pelican';
        player.body.height = world.tuning.player.height;
      }
      if (state.phase === 'restored') spawnSamResident(world);
      world.hitstopTicks = 0;
    }
  } else if (state.phase === 'countdown') {
    state.countdownTicks--;
    if (state.countdownTicks <= 0) {
      state.countdownTicks = 0;
      state.phase = 'sam';
      spawnBoss(world, 'sam');
    }
  }
}

/** 演出复用普通变身流程；镜头到位前不消费变身输入或战斗时间。 */
export function stepMainlineReveal(world: SimWorld): boolean {
  const state = world.mainline;
  if (!state || state.revealTicks < 0) return false;
  const zoomTicks = Math.round(MAINLINE_REVEAL.zoomSeconds / world.tuning.sim.step);
  const endTicks = zoomTicks + PLAYER_TRANSFORM.durationTicks + 1
    + Math.round((MAINLINE_REVEAL.holdSeconds + MAINLINE_REVEAL.returnSeconds) / world.tuning.sim.step);
  if (state.revealTicks >= zoomTicks && state.revealTicks <= zoomTicks + PLAYER_TRANSFORM.durationTicks) {
    stepPlayerTransform(world, { ...NEUTRAL_INPUT, transformPressed: state.revealTicks === zoomTicks });
  }
  state.revealTicks++;
  if (state.revealTicks >= endTicks) state.revealTicks = -1;
  return true;
}
