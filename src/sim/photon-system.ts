import { PHOTON_BUG, PHOTON_ULTIMATE, PHOTON_WHEEL } from '../config/photon-ultimate.ts';
import type { Entity, ProjectileRequest } from '../entities/entity.ts';
import { projectileCenter } from '../entities/projectile.ts';
import type { InputFrame, SimWorld } from './sim-world.ts';
import { spawnProjectiles } from './weapon-system.ts';
import { ultimateWaitTicks } from './homestead-economy.ts';

/** 实战与独立预览共用发射方向，先从光子附近窄角冲出，再由追踪器寻敌。 */
export function createPhotonVolley(x: number, y: number, angle: number, index: number, ownerId: number, team: Entity['team']): ProjectileRequest[] {
  const requests: ProjectileRequest[] = [];
  for (let i = 0; i < 2; i++) {
    const launch = angle + (i === 0 ? -0.08 : 0.08) + Math.sin(index * 1.7) * 0.06;
    const side = i === 0 ? -0.18 : 0.18;
    requests.push({
      def: i === 0 ? PHOTON_BUG : PHOTON_WHEEL,
      x: x + Math.cos(angle) * 0.35 - Math.sin(angle) * side,
      y: y + Math.sin(angle) * 0.35 + Math.cos(angle) * side,
      dirX: Math.cos(launch), dirY: Math.sin(launch),
      ownerId, team, level: 1, returned: false,
    });
  }
  return requests;
}

export function stepPhotonUltimate(world: SimWorld, input: InputFrame): void {
  const state = world.photon;
  // 家园模式的大招靠家里电网充能，冷却显示的是充满还要多久。
  const economy = world.homestead?.economy;
  if (economy) state.cooldownTicks = ultimateWaitTicks(economy);
  else if (state.cooldownTicks > 0) state.cooldownTicks--;
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
      state.launchAngle = state.aim === null ? player.facing < 0 ? Math.PI : 0
        : Math.atan2(state.aim.y - state.y, state.aim.x - state.x);
      world.events.push({ type: 'photonUltimateBurst', id: player.id, x: state.x, y: state.y, radius: PHOTON_ULTIMATE.radius });
    }
  }
  if (state.activeTicks > 0) {
    if ((PHOTON_ULTIMATE.activeTicks - state.activeTicks) % PHOTON_ULTIMATE.volleyTicks === 0) {
      spawnProjectiles(world, createPhotonVolley(state.x, state.y, state.launchAngle, state.volleyIndex, player.id, player.team));
      state.volleyIndex += 2;
    }
    state.activeTicks--;
  }
  const pressed = state.buffered || input.skillPressed === 4;
  const aim = state.buffered ? state.aim : input.aim;
  state.buffered = false;
  if (!pressed || player.pelican!.transformTicks >= 0 || state.cooldownTicks > 0 || state.chargeTicks > 0) return;
  if (economy) {
    economy.ultimate = 0;
    state.cooldownTicks = ultimateWaitTicks(economy);
  } else state.cooldownTicks = PHOTON_ULTIMATE.cooldownTicks;
  state.chargeTicks = PHOTON_ULTIMATE.chargeTicks;
  state.volleyIndex = 0;
  state.aim = aim === null ? null : { ...aim };
  state.x = player.body.x;
  state.y = player.body.y + player.body.height + 1.2;
  world.events.push({ type: 'photonUltimateStarted', id: player.id, x: state.x, y: state.y });
}

/** 有限转向速度形成追击弧线，命中仍经过普通投射物碰撞。 */
export function steerPhotonProjectiles(entities: readonly Entity[]): void {
  for (const entity of entities) {
    const p = entity.projectile;
    if (entity.removed || !p || (entity.kind !== 'photonBug' && entity.kind !== 'photonWheel')) continue;
    if (p.def.lifeTicks - p.lifeTicks < PHOTON_ULTIMATE.launchTicks) continue;
    const center = projectileCenter(entity);
    let target = entities.find(e => e.id === p.targetId && !e.removed && e.team === 'enemy' && e.health!.hp > 0);
    if (!target) {
      let nearest: number = PHOTON_ULTIMATE.seekRadius;
      for (const other of entities) {
        if (other.removed || other.team !== 'enemy' || !other.health || other.health.hp <= 0) continue;
        const distance = Math.hypot(other.body.x - center.x, other.body.y + other.body.height / 2 - center.y);
        if (distance < nearest) { target = other; nearest = distance; }
      }
      p.targetId = target?.id;
      if (!target) continue;
    }
    const wanted = Math.atan2(target.body.y + target.body.height / 2 - center.y, target.body.x - center.x);
    const current = Math.atan2(entity.body.vy, entity.body.vx);
    const difference = Math.atan2(Math.sin(wanted - current), Math.cos(wanted - current));
    const turn = Math.min(PHOTON_ULTIMATE.turnRadians, Math.max(-PHOTON_ULTIMATE.turnRadians, difference));
    entity.body.vx = Math.cos(current + turn) * p.def.speed;
    entity.body.vy = Math.sin(current + turn) * p.def.speed;
  }
}
