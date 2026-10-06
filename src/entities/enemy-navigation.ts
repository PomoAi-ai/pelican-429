import type { Tuning } from '../config/tuning.ts';
import { overlaps } from '../core/math.ts';
import { applyGravity, bodyRect, type Body } from '../physics/body.ts';
import { waterSpanInColumn } from '../physics/fluid-contact.ts';
import { moveAndCollide, terrainHeightAt } from '../physics/tile-collision.ts';
import type { LevelData } from '../world/level.ts';

export type EnemyTerrain = Pick<LevelData, 'map' | 'fluid' | 'lethalCoolant' | 'safeZones'>;

export function enemyTouchesSafeZone(body: Body, terrain: EnemyTerrain): boolean {
  return terrain.safeZones !== undefined && terrain.safeZones.some(zone => overlaps(bodyRect(body), zone));
}

function enemyBodyIsDry(body: Body, terrain: EnemyTerrain): boolean {
  if (enemyTouchesSafeZone(body, terrain)) return false;
  if (terrain.lethalCoolant !== undefined && overlaps(bodyRect(body), terrain.lethalCoolant)) return false;
  for (let x = Math.floor(body.x - body.halfWidth); x < Math.ceil(body.x + body.halfWidth); x++) {
    if (waterSpanInColumn(terrain.fluid, x, body.y, body.y + body.height) > 0) return false;
  }
  return true;
}

/** 使用真实积分和碰撞预测这次动作；只预测短动作，不搜索整张地图。 */
export function enemyLandingIsSafe(body: Body, terrain: EnemyTerrain, tuning: Tuning,
  vx: number, jumpSpeed: number, activeTicks: number, dropThroughTicks: number): boolean {
  const probe = { ...body, vx, vy: jumpSpeed, onGround: false, dropThroughTicks };
  const maxDrop = dropThroughTicks > 0 ? 8 : 2;
  for (let tick = 0; tick < 120; tick++) {
    if (tick > 0) applyGravity(probe, tuning.physics.gravity, tuning.physics.maxFallSpeed, tuning.sim.step);
    probe.vx = tick < activeTicks ? vx : 0;
    moveAndCollide(probe, terrain.map, tuning.sim.step);
    if (!enemyBodyIsDry(probe, terrain) || probe.y < body.y - maxDrop) return false;
    if (probe.onGround) return true;
  }
  return false;
}

/** 先按实际斜坡/半砖物理求下一步，再检查前脚支撑和水域。 */
export function enemyStepIsSafe(body: Body, terrain: EnemyTerrain, tuning: Tuning): boolean {
  const probe = { ...body };
  moveAndCollide(probe, terrain.map, tuning.sim.step);
  if (probe.wallContact !== 0) return false;
  if (!enemyBodyIsDry(probe, terrain)) return false;
  const leadingX = probe.x + Math.sign(body.vx) * (body.halfWidth + .05);
  // 脚底高度由身体覆盖的最高面决定，连续下坡的前脚可能低一个身宽。
  const floor = terrainHeightAt(terrain.map, leadingX, probe.y + .05, Math.min(2, body.halfWidth * 2 + body.groundSnap + .1), true);
  return floor !== null && enemyBodyIsDry({ ...probe, y: floor }, terrain);
}
