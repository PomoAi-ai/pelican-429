import { clamp } from '../core/math.ts';
import type { Vec2 } from '../core/math.ts';
import { createRideData } from '../entities/entity.ts';
import { cancelHumanCombat } from '../entities/human-combat.ts';
import type { Entity } from '../entities/entity.ts';
import { resolvePelicanState } from '../entities/pelican-controller.ts';
import { submersion } from '../physics/fluid-contact.ts';
import { moveAndCollide } from '../physics/tile-collision.ts';
import { playerFits } from './player-space.ts';
import { cancelPlayerTransform } from './player-transform.ts';
import { getPlayer } from './sim-world.ts';
import type { SimWorld } from './sim-world.ts';

const SEARCH_RADIUS = 8;

function destination(world: SimWorld, player: Entity, target: Vec2): Vec2 | null {
  const center = {
    x: clamp(target.x, player.body.halfWidth, world.map.width - player.body.halfWidth),
    y: clamp(target.y, 0, world.map.height - player.body.height),
  };
  if (playerFits(world, player, center, player.body.height)) return center;
  const candidates: Vec2[] = [];
  // 半格网格对齐真实半砖顶面，避免点击的小数偏移漏掉刚好容纳身体的洞口。
  for (let y = Math.ceil((center.y - SEARCH_RADIUS) * 2) / 2; y <= center.y + SEARCH_RADIUS; y += 0.5) {
    for (let x = Math.ceil((center.x - SEARCH_RADIUS) * 2) / 2; x <= center.x + SEARCH_RADIUS; x += 0.5) {
      if (Math.hypot(x - center.x, y - center.y) <= SEARCH_RADIUS) candidates.push({ x, y });
    }
  }
  const distance = (p: Vec2) => (p.x - center.x) ** 2 + (p.y - center.y) ** 2;
  candidates.sort((a, b) => distance(a) - distance(b) || b.y - a.y || a.x - b.x);
  return candidates.find((point) => playerFits(world, player, point, player.body.height)) ?? null;
}

/** 调试地图点击坐标为脚底位置；附近没有完整身体的容身处时不改变模拟。 */
export function teleportPlayer(world: SimWorld, target: Vec2): Vec2 | null {
  const player = getPlayer(world);
  const point = destination(world, player, target);
  if (point === null) return null;
  const b = player.body;
  cancelPlayerTransform(player);
  Object.assign(b, { x: point.x, y: point.y, prevX: point.x, prevY: point.y, vx: 0, vy: 0, onGround: false, wallContact: 0, dropThroughTicks: 0 });
  moveAndCollide(b, world.map, 0);
  player.attack = undefined;
  player.health!.hitstunTicks = 0;
  player.solid!.contact = 0;
  player.solid!.supportId = null;
  for (const other of world.entities) {
    if (other.solid?.supportId === player.id) other.solid.supportId = null;
  }
  const p = player.pelican!;
  cancelHumanCombat(p);
  Object.assign(p, {
    stateTicks: 0, coyoteTicks: 0, jumpBufferTicks: 0, attackBufferTicks: 0, attackBufferFacing: 0,
    jumping: false, flightMode: 'none', flownThisAir: false, flightNeedsRepress: false,
    shootBufferTicks: 0, shootAim: null, shotTicks: -1, shotDir: { x: player.facing, y: 0 },
    shotSide: player.facing, shotRequests: [], moveGear: 'walk', gearShiftUp: false, ride: createRideData(),
  });
  Object.assign(p.weapon, { skimming: false, skimTicks: 0, gulpTicks: 0, mouthful: null, bufferedSkill: 0, skillBufferTicks: 0, dashTicks: 0, events: [] });
  p.submersion = submersion(b, world.fluid);
  p.inWater = p.submersion >= world.tuning.player.swim.enterDepth;
  resolvePelicanState(player);
  p.stateTicks = 0;
  world.hitstopTicks = 0;
  world.photon.chargeTicks = 0;
  world.photon.activeTicks = 0;
  world.photon.buffered = false;
  return { x: b.x, y: b.y };
}
