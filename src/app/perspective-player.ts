import { consumeRideEvents, resolvePelicanRide } from '../entities/pelican-ride.ts';
import { createDefinitionRideProbe } from '../physics/definition-ride-probe.ts';
import { HUMAN_BODY_HEIGHT } from '../config/player-form.ts';
import { TUNING } from '../config/tuning.ts';
import { tickHealth } from '../combat/combat-system.ts';
import { EventQueue } from '../core/events.ts';
import type { SimEvent } from '../core/game-events.ts';
import type { Vec2 } from '../core/math.ts';
import { createPelicanEntity, type Entity } from '../entities/entity.ts';
import { updateFlyingRoadster } from '../entities/flying-roadster.ts';
import { humanOverloadHitSource } from '../entities/human-combat.ts';
import { resolvePelicanState, updatePelican, type PelicanInput } from '../entities/pelican-controller.ts';
import { createProjectileEntity, stepProjectile } from '../entities/projectile.ts';
import { savePrev, type Body } from '../physics/body.ts';
import { moveDefinitionBody, standingOnDefinitionPlatform, type DefinitionCollision } from '../physics/definition-collision.ts';
import { COLLISION_EPS } from '../physics/tile-collision.ts';
import { stepSolarPanels, type SolarPanelState } from '../physics/solar-panel.ts';
import { createTileMap } from '../world/tile-map.ts';
import { DEFAULT_TILES } from '../world/tile-types.ts';
import { collectProjectileRequests } from '../sim/weapon-system.ts';

/** 复用游戏角色控制器；定义场的非整格轮廓交给同源多边形碰撞。 */
export function createPerspectivePlayer(collision: DefinitionCollision, spawn: Vec2, bounds: { width: number; height: number },
  solarPanels: readonly SolarPanelState[] = [], unlimitedFlight = true,
  forces: { applyForce?: (body: Body, dt: number) => void; airWind?: (body: Body) => number; readonly carriers?: readonly Entity[] } = {}) {
  const controllerMap = createTileMap(Math.ceil(bounds.width), Math.ceil(bounds.height), DEFAULT_TILES);
  // 检视空间没有人工边墙和限高；人物与弹体均由真实定义轮廓处理碰撞。
  const flightMap = { ...controllerMap, height: Infinity, collisionAt: () => 'none' as const };
  const carriers = forces.carriers ?? [];
  const carrierPlatforms = () => carriers.filter(carrier => !carrier.removed).map(({ body }) => ({
    left: body.x - body.halfWidth, right: body.x + body.halfWidth, top: body.y + body.height,
  }));
  const geometry = { solids: collision.solids, platforms: [...collision.platforms, ...carrierPlatforms()] };
  const rideProbe = createDefinitionRideProbe(geometry);
  const create = (position: Vec2) => {
    const entity = createPelicanEntity(1, position, TUNING);
    entity.body.height = HUMAN_BODY_HEIGHT;
    entity.pelican!.form = entity.pelican!.transformFrom = 'human';
    moveDefinitionBody(entity.body, geometry, 0);
    return entity;
  };
  const entity = create(spawn);
  const events = new EventQueue<SimEvent>();
  const projectiles: Entity[] = [];
  const projectileCollision = { solids: collision.solids, platforms: [] };
  let nextId = Math.max(entity.id, ...carriers.map(carrier => carrier.id)) + 1;
  let tick = 0;
  // 承托位移也扫真实轮廓；副本防止载具位移覆盖玩家自己的速度与下穿计时。
  const carryBody = (body: Body, dx: number, dy: number) => {
    const moved = { ...body, vx: dx / TUNING.sim.step, vy: dy / TUNING.sim.step, onGround: false };
    moveDefinitionBody(moved, collision, TUNING.sim.step);
    body.x = moved.x;
    body.y = moved.y;
  };
  return {
    entity,
    events,
    projectiles,
    step(input: PelicanInput): void {
      const body = entity.body;
      const player = entity.pelican!;
      savePrev(body);
      const support = carriers.find(carrier => carrier.id === entity.solid!.supportId && !carrier.removed);
      const dropping = input.downHeld && body.onGround && standingOnDefinitionPlatform(body, geometry);
      if (dropping) player.jumpBufferTicks = 0;
      // 下穿由真实轮廓判断；人形战斗直接使用游戏控制器的输入与冷却。
      updatePelican(entity, {
        ...input, transformPressed: false,
        jumpPressed: input.jumpPressed && !dropping,
      }, flightMap, TUNING, TUNING.sim.step, null, forces.airWind ? forces.airWind(body) : 0, rideProbe);
      if (unlimitedFlight) player.flightTicks = player.flightMaxTicks;
      if (dropping && player.ride.mode !== 'mounting') {
        body.dropThroughTicks = TUNING.player.dropThroughTicks;
        body.onGround = false;
        player.flightNeedsRepress = true;
        player.coyoteTicks = player.jumpBufferTicks = 0;
      }
      forces.applyForce?.(body, TUNING.sim.step);
      for (const carrier of carriers) {
        if (carrier.removed) continue;
        savePrev(carrier.body);
        if (carrier.flyingRoadster) updateFlyingRoadster(carrier, TUNING.sim.step);
      }
      geometry.platforms = [...collision.platforms, ...carrierPlatforms()];
      if (support && body.onGround && body.vy <= 0 && body.dropThroughTicks === 0) {
        carryBody(body, support.body.x - support.body.prevX, support.body.y - support.body.prevY);
      }
      stepSolarPanels(solarPanels, body, TUNING.sim.step);
      const droppingThrough = body.dropThroughTicks > 0;
      moveDefinitionBody(body, geometry, TUNING.sim.step);
      entity.solid!.supportId = null;
      if (!droppingThrough) {
        for (const carrier of carriers) {
          if (carrier.removed) continue;
          const base = carrier.body;
          const top = base.y + base.height;
          if (body.vy > Math.max(base.vy, 0) || body.prevY < base.prevY + base.height - COLLISION_EPS
            || body.y > top + COLLISION_EPS || body.x + body.halfWidth <= base.x - base.halfWidth + COLLISION_EPS
            || body.x - body.halfWidth >= base.x + base.halfWidth - COLLISION_EPS) continue;
          carryBody(body, 0, top - body.y);
          if (Math.abs(body.y - top) <= COLLISION_EPS) {
            body.onGround = true;
            body.vy = 0;
            entity.solid!.supportId = carrier.id;
          }
        }
      }
      resolvePelicanRide(entity, rideProbe, TUNING);
      for (const event of consumeRideEvents(entity)) events.push({ ...event, id: entity.id });
      resolvePelicanState(entity);
      for (const request of collectProjectileRequests(entity)) {
        const shot = createProjectileEntity(nextId++, request);
        projectiles.push(shot);
        events.push({ type: 'projectileFired', kind: shot.projectile!.def.kind, id: shot.id, ownerId: entity.id,
          x: request.x, y: request.y, dirX: request.dirX, dirY: request.dirY, level: request.level, returned: request.returned });
      }
      for (const shot of projectiles) {
        const b = shot.body;
        savePrev(b);
        stepProjectile(shot, flightMap, TUNING.sim.step, events);
        if (shot.removed) continue;
        // 保留正式弹道与寿命，实体碰撞改用定义场的真实半砖/斜坡轮廓。
        b.x = b.prevX; b.y = b.prevY;
        const { vx, vy } = b;
        moveDefinitionBody(b, projectileCollision, TUNING.sim.step);
        if (b.vx !== vx || b.vy !== vy) {
          shot.removed = true;
          events.push({ type: 'projectileImpact', kind: shot.projectile!.def.kind, id: shot.id,
            x: b.x, y: b.y + b.height / 2, vx, vy, reason: 'terrain', level: shot.projectile!.level, returned: false });
        }
      }
      for (let i = projectiles.length - 1; i >= 0; i--) if (projectiles[i]!.removed) projectiles.splice(i, 1);
      if (humanOverloadHitSource(entity)) events.push({ type: 'combatAction', id: entity.id, action: 'server_overload', phase: 'released', x: body.x, y: body.y });
      tickHealth(entity.health!, tick++);
    },
    teleport(x: number, y: number): void {
      Object.assign(entity, create({ x, y }));
      delete entity.attack;
      projectiles.length = 0;
      events.drain();
    },
  };
}
