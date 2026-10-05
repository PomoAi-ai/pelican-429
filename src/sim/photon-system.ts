import { PHOTON_BUG, PHOTON_ULTIMATE, PHOTON_WHEEL } from '../config/photon-ultimate.ts';
import type { Entity, ProjectileRequest } from '../entities/entity.ts';
import { projectileCenter } from '../entities/projectile.ts';
import type { InputFrame, SimWorld } from './sim-world.ts';
import { spawnProjectiles } from './weapon-system.ts';

function targets(world: SimWorld): Entity[] {
  const { x, y } = world.photon;
  return world.entities.filter((e) => !e.removed && e.team === 'enemy' && e.health && e.health.hp > 0
    && Math.hypot(e.body.x - x, e.body.y + e.body.height / 2 - y) <= PHOTON_ULTIMATE.radius);
}

/** 分批从空中散开的不同位置派出真实攻击弹，其余漫天群体由渲染层表现。 */
function volley(world: SimWorld, player: Entity): void {
  const state = world.photon;
  const enemies = targets(world);
  if (enemies.length === 0) return;
  const requests: ProjectileRequest[] = [];
  for (let i = 0; i < 2; i++) {
    const index = state.volleyIndex++;
    const angle = index * 2.399963229728653;
    const target = enemies[index % enemies.length]!;
    requests.push({
      def: index % 2 === 0 ? PHOTON_BUG : PHOTON_WHEEL,
      x: state.x + Math.cos(angle) * (1.5 + index % 3),
      y: state.y + 1.2 + Math.sin(angle) * 1.4,
      dirX: Math.cos(angle), dirY: Math.sin(angle),
      ownerId: player.id, team: player.team, level: 1, returned: false, targetId: target.id,
    });
  }
  spawnProjectiles(world, requests);
}

export function stepPhotonUltimate(world: SimWorld, input: InputFrame): void {
  const state = world.photon;
  if (state.cooldownTicks > 0) state.cooldownTicks--;
  const player = world.entities.find((e) => e.id === world.playerId)!;
  if (player.removed || player.health!.hp <= 0) {
    state.chargeTicks = 0;
    state.activeTicks = 0;
    state.buffered = false;
    return;
  }
  if (state.chargeTicks > 0) {
    state.x = player.body.x;
    state.y = player.body.y + player.body.height + 1.2;
    if (--state.chargeTicks === 0) {
      state.activeTicks = PHOTON_ULTIMATE.activeTicks;
      world.events.push({ type: 'photonUltimateBurst', id: player.id, x: state.x, y: state.y, radius: PHOTON_ULTIMATE.radius });
    }
  }
  if (state.activeTicks > 0) {
    if ((PHOTON_ULTIMATE.activeTicks - state.activeTicks) % PHOTON_ULTIMATE.volleyTicks === 0) volley(world, player);
    state.activeTicks--;
  }
  const pressed = state.buffered || input.skillPressed === 4;
  state.buffered = false;
  if (!pressed || player.pelican!.transformTicks >= 0 || state.cooldownTicks > 0 || state.chargeTicks > 0) return;
  state.cooldownTicks = PHOTON_ULTIMATE.cooldownTicks;
  state.chargeTicks = PHOTON_ULTIMATE.chargeTicks;
  state.volleyIndex = 0;
  state.x = player.body.x;
  state.y = player.body.y + player.body.height + 1.2;
  world.events.push({ type: 'photonUltimateStarted', id: player.id, x: state.x, y: state.y });
}

/** 有限转向速度形成追击弧线，命中仍经过普通投射物碰撞。 */
export function steerPhotonProjectiles(world: SimWorld): void {
  for (const entity of world.entities) {
    const p = entity.projectile;
    if (entity.removed || !p || p.targetId === undefined || (entity.kind !== 'photonBug' && entity.kind !== 'photonWheel')) continue;
    let target = world.entities.find((e) => e.id === p.targetId && !e.removed && e.health!.hp > 0);
    if (!target) {
      const center = projectileCenter(entity);
      target = targets(world).sort((a, b) => Math.hypot(a.body.x - center.x, a.body.y - center.y)
        - Math.hypot(b.body.x - center.x, b.body.y - center.y))[0];
      if (!target) continue;
      p.targetId = target.id;
    }
    const center = projectileCenter(entity);
    const wanted = Math.atan2(target.body.y + target.body.height / 2 - center.y, target.body.x - center.x);
    const current = Math.atan2(entity.body.vy, entity.body.vx);
    const difference = Math.atan2(Math.sin(wanted - current), Math.cos(wanted - current));
    const turn = Math.min(0.16, Math.max(-0.16, difference));
    entity.body.vx = Math.cos(current + turn) * p.def.speed;
    entity.body.vy = Math.sin(current + turn) * p.def.speed;
  }
}
