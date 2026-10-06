import type { NpcKind } from '../config/npc.ts';
import { HUMAN_BODY_HEIGHT } from '../config/player-form.ts';
import { createBossEntity } from '../entities/boss.ts';
import { createPelicanEntity } from '../entities/entity.ts';
import { createWandererEntity } from '../entities/wanderer.ts';
import { cancelPelicanCombat } from '../entities/pelican-weapons.ts';
import { resolvePelicanState } from '../entities/pelican-controller.ts';
import { cancelPlayerTransform } from './player-transform.ts';
import { moveAndCollide } from '../physics/tile-collision.ts';
import { BOSS_ARENA_SPAWN } from '../world/boss-arena.ts';
import type { SimWorld } from './sim-world.ts';

export interface BossArenaState {
  phase: 'ready' | 'countdown' | 'fighting' | 'won' | 'lost';
  countdownTicks: number;
  bossId: number | null;
  kind: NpcKind | null;
}

export function initializeBossArena(world: SimWorld): void {
  world.bossArena = { phase: 'ready', countdownTicks: 0, bossId: null, kind: null };
}

function resetArenaPlayer(world: SimWorld): void {
  const player = world.entities.find(entity => entity.id === world.playerId)!;
  // 保留玩家对象引用，HUD 和镜头继续读取同一角色；组件完全重建以清除上一局状态。
  Object.assign(player, createPelicanEntity(player.id, world.spawn, world.tuning));
  delete player.attack;
  delete player.wetTicks;
  delete player.teleport;
  delete player.removed;
  player.pelican!.form = player.pelican!.transformFrom = world.spawnForm;
  if (world.spawnForm === 'human') player.body.height = HUMAN_BODY_HEIGHT;
  moveAndCollide(player.body, world.map, 0);
  world.hitstopTicks = world.respawnTicks = world.blackholeArrivalTicks = world.playerRecoveryTicks = 0;
  Object.assign(world.photon, { cooldownTicks: 0, chargeTicks: 0, buffered: false, activeTicks: 0, volleyIndex: 0, x: 0, y: 0 });
}

export function summonArenaBoss(world: SimWorld, kind: NpcKind): void {
  resetArenaPlayer(world);
  const player = world.entities.find(entity => entity.id === world.playerId)!;
  world.entities.splice(0, world.entities.length, player);
  world.events.drain();
  const boss = createBossEntity(world.nextId++, kind, BOSS_ARENA_SPAWN, world.tuning, world.mobileBosses);
  moveAndCollide(boss.body, world.map, 0);
  world.entities.push(boss);
  Object.assign(world.bossArena!, { phase: 'countdown', countdownTicks: Math.ceil(3 / world.tuning.sim.step), bossId: boss.id, kind });
}

/** 返回 true 时由 stepSim 统一保存插值位置并推进 tick，所有战斗和物理保持冻结。 */
export function stepBossArena(world: SimWorld): boolean {
  const state = world.bossArena!;
  if (state.phase === 'ready' || state.phase === 'won' || state.phase === 'lost') return false;
  if (state.phase === 'countdown') {
    if (--state.countdownTicks === 0) state.phase = 'fighting';
    return true;
  }
  if (state.phase === 'fighting') {
    const player = world.entities.find(entity => entity.id === world.playerId)!;
    const boss = world.entities.find(entity => entity.id === state.bossId)!;
    if (player.health!.hp > 0 && boss.health!.hp > 0) return false;
    state.phase = player.health!.hp <= 0 ? 'lost' : 'won';
    if (state.phase === 'lost') resetArenaPlayer(world);
    else {
      delete player.teleport;
      cancelPlayerTransform(player);
      cancelPelicanCombat(player);
      resolvePelicanState(player);
    }
    // 新 ID 让视图注册表移除战斗形态，以居民组件创建常驻人形。
    const npc = createWandererEntity(world.nextId++, boss.boss!.kind, { x: boss.body.x, y: boss.body.y }, world.tuning, world.level.seed!);
    npc.npc!.fromBoss = true;
    npc.facing = player.body.x >= npc.body.x ? 1 : -1;
    moveAndCollide(npc.body, world.map, 0);
    world.entities.splice(0, world.entities.length, player, npc);
    state.bossId = null;
    world.photon.chargeTicks = world.photon.activeTicks = 0;
    world.photon.buffered = false;
    world.respawnTicks = world.hitstopTicks = 0;
  }
  return false;
}
