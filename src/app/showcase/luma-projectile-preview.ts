import * as THREE from 'three';
import { PHOTON_ULTIMATE } from '../../config/photon-ultimate.ts';
import { TUNING } from '../../config/tuning.ts';
import { resolveHits, tickHealth } from '../../combat/combat-system.ts';
import type { HitSource } from '../../combat/combat-system.ts';
import { EventQueue } from '../../core/events.ts';
import { createFixedStepper } from '../../core/fixed-step.ts';
import type { SimEvent } from '../../core/game-events.ts';
import { createDummyEntity } from '../../entities/entity.ts';
import type { Entity } from '../../entities/entity.ts';
import { createProjectileEntity, projectileHitSource, retireSpentProjectile, stepProjectile } from '../../entities/projectile.ts';
import { tickDummyReset, updateDummy } from '../../entities/training-dummy.ts';
import { savePrev } from '../../physics/body.ts';
import { moveAndCollide } from '../../physics/tile-collision.ts';
import { createDummyViewFactory } from '../../render/entity-views.ts';
import { createPhotonProjectileViews } from '../../render/photon-projectile-view.ts';
import { createViewRegistry } from '../../render/view-registry.ts';
import { createPhotonVolley, steerPhotonProjectiles } from '../../sim/photon-system.ts';
import { createTileMap } from '../../world/tile-map.ts';
import { DEFAULT_TILES, TILE_STONE } from '../../world/tile-types.ts';

/** 独立光子只装配正式弹体、假人与碰撞，场内没有用于驱动技能的隐藏玩家。 */
export function createLumaProjectilePreview(scene: THREE.Object3D) {
  const root = new THREE.Group();
  root.position.set(-48, -1, 0);
  scene.add(root);
  const map = createTileMap(96, 64, DEFAULT_TILES);
  for (let x = 0; x < map.width; x++) map.set(x, 0, TILE_STONE);
  const projectiles = createPhotonProjectileViews();
  const views = createViewRegistry(root, {
    ...projectiles.factories,
    trainingDummy: createDummyViewFactory({ tuning: TUNING, terrain: map }),
  });
  const events = new EventQueue<SimEvent>();
  const stepper = createFixedStepper({ ...TUNING.sim, maxTicksPerFrame: Math.ceil(TUNING.sim.maxFrameTime / TUNING.sim.step) });
  const entities: Entity[] = [];
  let nextId = 1;
  let tick = 0;
  let active = false;
  let originX = 48;
  let originY = 1;
  let launchAngle = 0;
  let volleyIndex = 0;

  function reset(): void {
    stepper.reset();
    events.drain();
    views.dispose();
    entities.length = 0;
    nextId = 1; tick = 0; volleyIndex = 0; active = false;
    for (const x of [39, 57]) entities.push(createDummyEntity(nextId++, { x, y: 1 }, TUNING));
    views.sync(entities, 0, 0);
  }
  reset();

  return {
    start(x: number, y: number, angle: number) {
      originX = x + 48; originY = y + 1; launchAngle = angle; active = true;
    },
    update(dt: number) {
      if (!active || dt === 0) return;
      const alpha = stepper.advance(dt, () => {
        for (const entity of entities) savePrev(entity.body);
        if (tick < PHOTON_ULTIMATE.activeTicks && tick % PHOTON_ULTIMATE.volleyTicks === 0) {
          for (const request of createPhotonVolley(originX, originY, launchAngle, volleyIndex, 0, 'player')) {
            entities.push(createProjectileEntity(nextId++, request));
          }
          volleyIndex += 2;
        }
        steerPhotonProjectiles(entities);
        const sources: HitSource[] = [];
        for (const entity of entities) {
          if (entity.projectile) {
            stepProjectile(entity, map, TUNING.sim.step, events);
            const source = projectileHitSource(entity);
            if (source) sources.push(source);
          } else {
            updateDummy(entity, TUNING, TUNING.sim.step);
            moveAndCollide(entity.body, map, TUNING.sim.step);
          }
        }
        resolveHits(sources, entities, tick, events, TUNING.combat);
        for (const entity of entities) {
          if (entity.projectile) retireSpentProjectile(entity, events);
          else { tickHealth(entity.health!, tick); tickDummyReset(entity, TUNING, events); }
        }
        for (let i = entities.length - 1; i >= 0; i--) if (entities[i]!.removed) entities.splice(i, 1);
        events.drain();
        tick++;
      });
      views.sync(entities, alpha, dt);
    },
    reset,
    dispose() { views.dispose(); projectiles.dispose(); root.removeFromParent(); },
  };
}
