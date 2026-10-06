import * as THREE from 'three';
import { meleeHitSource, resolveHits, tickHealth } from '../../combat/combat-system.ts';
import type { HitSource } from '../../combat/combat-system.ts';
import { npcAction } from '../../config/npc.ts';
import type { NpcKind } from '../../config/npc.ts';
import { jumpVelocity, TUNING } from '../../config/tuning.ts';
import { EventQueue } from '../../core/events.ts';
import type { SimEvent } from '../../core/game-events.ts';
import { createBossEntity, updateBoss } from '../../entities/boss.ts';
import { createDummyEntity } from '../../entities/entity.ts';
import type { Entity } from '../../entities/entity.ts';
import { createProjectileEntity, projectileHitSource, retireSpentProjectile, stepProjectile } from '../../entities/projectile.ts';
import { tickDummyReset, updateDummy } from '../../entities/training-dummy.ts';
import { savePrev } from '../../physics/body.ts';
import { moveAndCollide } from '../../physics/tile-collision.ts';
import { createFluidMap } from '../../world/fluid-map.ts';
import { createTileMap } from '../../world/tile-map.ts';
import { DEFAULT_TILES, TILE_STONE } from '../../world/tile-types.ts';
import { createDummyViewFactory } from '../entity-views.ts';
import { createProjectileViews } from '../projectile-views.ts';
import { createViewRegistry } from '../view-registry.ts';

/** 展示只装配场地与靶子，出招、弹道和伤害全部运行游戏逻辑。 */
export function createNpcUltimateTargets(kind: NpcKind, showTargets: boolean) {
  const root = new THREE.Group();
  root.position.set(-32, -1, 0);
  const map = createTileMap(64, 32, DEFAULT_TILES);
  for (let x = 0; x < map.width; x++) map.set(x, 0, TILE_STONE);
  const fluid = createFluidMap(map);
  const projectiles = createProjectileViews();
  const views = createViewRegistry(root, {
    ...projectiles.factories,
    trainingDummy: createDummyViewFactory({ tuning: TUNING, terrain: map }),
  });
  const events = new EventQueue<SimEvent>();
  const action = npcAction(kind, 'ultimate');
  const step = TUNING.sim.step;
  let boss = createBossEntity(0, kind, { x: 32, y: 1 }, TUNING);
  const entities: Entity[] = [];
  let tick = 0;
  let nextId = 3;
  let previousFacing: -1 | 1 = 1;
  let previousDodge = false;

  function reset(facing: -1 | 1, dodge: boolean): void {
    views.dispose();
    entities.length = 0;
    events.drain();
    tick = 0;
    nextId = 3;
    previousFacing = facing;
    previousDodge = dodge;
    boss = createBossEntity(0, kind, { x: 32, y: 1 }, TUNING);
    boss.facing = facing;
    boss.boss!.action = 'ultimate';
    boss.boss!.actionRate = 1;
    for (const side of [facing, -facing]) {
      const target = createDummyEntity(entities.length + 1, { x: 32 + side * 4.2, y: 1 }, TUNING);
      target.team = 'player';
      entities.push(target);
    }
    const target = entities[0]!;
    boss.boss!.aim = { x: target.body.x, y: target.body.y + target.body.height / 2 };
  }
  reset(1, false);

  return {
    root,
    sample(seconds: number, facing: -1 | 1, dodge: boolean): void {
      const targetTick = Math.floor(seconds / step + 1e-8);
      if (targetTick < tick || facing !== previousFacing || dodge !== previousDodge) reset(facing, dodge);
      const elapsed = (targetTick - tick) * step;
      while (tick < targetTick) {
        savePrev(boss.body);
        for (const entity of entities) savePrev(entity.body);
        const target = entities[0]!;
        if (dodge && tick === Math.floor((action.release - .2) / step)) target.body.vy = jumpVelocity(TUNING.physics.gravity, TUNING.player.jumpHeight);
        if (tick * step < action.seconds) {
          updateBoss(boss, { x: target.body.x, y: target.body.y + target.body.height / 2 }, map, fluid, TUNING);
          moveAndCollide(boss.body, map, step);
          for (const request of boss.boss!.shotRequests) entities.push(createProjectileEntity(nextId++, request));
          boss.boss!.shotRequests = [];
        }
        const sources: HitSource[] = [];
        const wave = meleeHitSource(boss);
        if (wave) sources.push(wave);
        for (const entity of entities) {
          if (entity.projectile) {
            stepProjectile(entity, map, step, events);
            const source = projectileHitSource(entity);
            if (source) sources.push(source);
          } else {
            updateDummy(entity, TUNING, step);
            moveAndCollide(entity.body, map, step);
          }
        }
        resolveHits(sources, entities, tick, events, TUNING.combat);
        for (const entity of entities) {
          if (entity.projectile) retireSpentProjectile(entity, events);
          else { tickHealth(entity.health!, tick); tickDummyReset(entity, TUNING, events); }
        }
        for (let index = entities.length - 1; index >= 0; index--) if (entities[index]!.removed) entities.splice(index, 1);
        events.drain();
        tick++;
      }
      views.sync(entities, 1, elapsed);
      for (const entity of entities) if (entity.dummy) views.get(entity.id)!.object.visible = showTargets;
    },
    dispose(): void { views.dispose(); projectiles.dispose(); fluid.dispose(); root.removeFromParent(); },
  };
}
