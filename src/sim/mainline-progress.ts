import { BOSS_RULES, TIBO_HEAL } from '../config/boss-rules.ts';
import type { EnemyKind } from '../config/enemy-rules.ts';
import type { NpcKind } from '../config/npc.ts';
import { HUMAN_BODY_HEIGHT } from '../config/player-form.ts';
import type { PlayerForm } from '../config/player-form.ts';
import type { Vec2 } from '../core/math.ts';
import { createBossEntity } from '../entities/boss.ts';
import { createEnemyEntity } from '../entities/enemy.ts';
import { createPelicanEntity } from '../entities/entity.ts';
import type { Entity } from '../entities/entity.ts';
import { overlapsSolid } from '../physics/tile-collision.ts';
import type { SimWorld } from './sim-world.ts';

interface ActorProgress extends Vec2 {
  readonly hp: number;
  readonly facing: 1 | -1;
}

export interface PlayerProgress extends ActorProgress {
  readonly form: PlayerForm;
  readonly riding: boolean;
  readonly flightTicks: number;
  readonly water: number;
  readonly fish: number;
  readonly weaponCooldowns: readonly [number, number, number];
  readonly humanCooldowns: readonly [number, number, number];
  readonly photonCooldownTicks: number;
}

export interface EnemyProgress extends ActorProgress {
  readonly kind: EnemyKind;
  readonly home: Readonly<Vec2>;
}

export interface BossProgress extends ActorProgress {
  readonly kind: NpcKind;
  readonly healAvailable: boolean;
}

export interface MainlineProgress {
  /** null 表示死亡等待中：重载沿用阶段复活状态，避免把玩家困在死档。 */
  readonly player: PlayerProgress | null;
  readonly enemies: readonly EnemyProgress[];
  readonly boss: BossProgress | null;
}

function actorProgress(entity: Entity): ActorProgress {
  return { x: entity.body.x, y: entity.body.y, hp: entity.health!.hp, facing: entity.facing };
}

export function captureMainlineProgress(world: SimWorld): MainlineProgress {
  const player = world.entities.find(entity => entity.id === world.playerId)!;
  const p = player.pelican!;
  const alive = world.respawnTicks === 0 && player.health!.hp > 0;
  const boss = world.entities.find(entity => entity.boss && !entity.removed && entity.health!.hp > 0);
  return {
    player: alive ? {
      ...actorProgress(player), form: world.mainline!.revealTicks >= 0 ? 'human' : p.form, riding: p.ride.mode === 'riding' || p.ride.mode === 'mounting',
      flightTicks: p.flightTicks, water: p.weapon.water, fish: p.weapon.fish,
      weaponCooldowns: [...p.weapon.cooldowns], humanCooldowns: [...p.humanCombat.cooldowns],
      photonCooldownTicks: world.photon.cooldownTicks,
    } : null,
    enemies: world.entities.filter(entity => entity.enemy && !entity.removed && entity.health!.hp > 0).map(entity => ({
      ...actorProgress(entity), kind: entity.enemy!.kind, home: { ...entity.enemy!.home },
    })),
    // 存档沿用标准血量尺度，重载与切换操作模式都不会重复缩减。
    boss: boss ? { ...actorProgress(boss), hp: boss.health!.hp * (BOSS_RULES[boss.boss!.kind].maxHp / boss.health!.maxHp), kind: boss.boss!.kind, healAvailable: boss.boss!.healCooldownTicks === 0 } : null,
  };
}

function enemyKey(kind: EnemyKind, home: Readonly<Vec2>): string {
  return `${kind}:${home.x}:${home.y}`;
}

function restoreActor(entity: Entity, saved: ActorProgress): void {
  Object.assign(entity.body, { x: saved.x, y: saved.y, prevX: saved.x, prevY: saved.y });
  entity.health!.hp = saved.hp;
  entity.facing = saved.facing;
}

/** initializeMainline 后调用；只恢复持久进度，进行中的出招与弹体从安全的空闲状态重新开始。 */
export function restoreMainlineProgress(world: SimWorld, progress: MainlineProgress): void {
  const enemies = new Map(world.entities.filter(entity => entity.enemy).map(entity => [enemyKey(entity.enemy!.kind, entity.enemy!.home), entity]));
  const restoredEnemies = new Map<number, Entity>();
  for (const saved of progress.enemies) {
    const key = enemyKey(saved.kind, saved.home);
    const original = enemies.get(key);
    if (!original) throw new Error(`主线存档敌人驻点已不存在：${key}`);
    const entity = createEnemyEntity(original.id, saved.kind, saved.home, world.tuning, world.level.seed ?? 0);
    restoreActor(entity, saved);
    restoredEnemies.set(entity.id, entity);
  }
  const player = world.entities.find(entity => entity.id === world.playerId)!;
  const savedPlayer = progress.player;
  let restoredPlayer: Entity | null = null;
  if (savedPlayer !== null) {
    restoredPlayer = createPelicanEntity(player.id, savedPlayer, world.tuning);
    restoreActor(restoredPlayer, savedPlayer);
    const p = restoredPlayer.pelican!;
    p.form = p.transformFrom = savedPlayer.form;
    restoredPlayer.body.height = p.form === 'human' ? HUMAN_BODY_HEIGHT : world.tuning.player.height;
    p.ride.mode = savedPlayer.riding ? 'riding' : 'off';
    p.flightTicks = savedPlayer.flightTicks;
    p.weapon.water = savedPlayer.water;
    p.weapon.fish = savedPlayer.fish;
    p.weapon.cooldowns = [...savedPlayer.weaponCooldowns];
    p.humanCombat.cooldowns = [...savedPlayer.humanCooldowns];
  }
  const boss = world.entities.find(entity => entity.boss);
  let restoredBoss: Entity | null = null;
  if (progress.boss !== null) {
    const saved = progress.boss;
    if (!boss || boss.boss!.kind !== saved.kind) throw new Error(`主线存档 Boss 与阶段不符：${saved.kind} / ${world.mainline!.phase}`);
    restoredBoss = createBossEntity(boss.id, saved.kind, saved, world.tuning, world.mobileBosses);
    restoreActor(restoredBoss, saved);
    restoredBoss.health!.hp = saved.hp * (restoredBoss.health!.maxHp / BOSS_RULES[saved.kind].maxHp);
    // 存档只记冷却是否就绪；未就绪时从完整冷却重新计时，与闪现冷却不入档一致。
    restoredBoss.boss!.healCooldownTicks = saved.healAvailable ? 0 : TIBO_HEAL.cooldownTicks;
  }
  // 存档是外部数据；先核对当前地形，再一次应用，失败时保留完整的阶段初始状态。
  for (const entity of [...restoredEnemies.values(), ...(restoredPlayer ? [restoredPlayer] : []), ...(restoredBoss ? [restoredBoss] : [])]) {
    const b = entity.body;
    if (overlapsSolid({ x: b.x - b.halfWidth, y: b.y, w: b.halfWidth * 2, h: b.height }, world.map)) {
      throw new Error(`主线存档位置与当前地形冲突：${entity.kind} (${b.x}, ${b.y})`);
    }
  }
  for (let i = world.entities.length - 1; i >= 0; i--) {
    const entity = world.entities[i]!;
    if (entity.enemy) {
      const restored = restoredEnemies.get(entity.id);
      if (restored) world.entities[i] = restored;
      else world.entities.splice(i, 1);
    } else if (entity.id === player.id && restoredPlayer) world.entities[i] = restoredPlayer;
    else if (entity.boss && restoredBoss) world.entities[i] = restoredBoss;
  }
  if (savedPlayer !== null) world.photon.cooldownTicks = savedPlayer.photonCooldownTicks;
}
