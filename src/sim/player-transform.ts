import { HUMAN_BODY_HEIGHT, PLAYER_TRANSFORM } from '../config/player-form.ts';
import { createRideData } from '../entities/entity.ts';
import type { Entity } from '../entities/entity.ts';
import { cancelPelicanCombat } from '../entities/pelican-weapons.ts';
import { playerFits } from './player-space.ts';
import type { InputFrame, SimWorld } from './sim-world.ts';

export function cancelPlayerTransform(player: Entity): void {
  const p = player.pelican!;
  p.transformTicks = -1;
  p.transformBuffered = false;
  p.transformFrom = p.form;
}

/** 起手和换形中点都检查空间，防止空中上升或其他实体移入后换形穿墙。 */
export function stepPlayerTransform(world: SimWorld, input: InputFrame): void {
  const player = world.entities.find((entity) => entity.id === world.playerId)!;
  const p = player.pelican!;
  if (player.health!.hp <= 0) {
    cancelPlayerTransform(player);
    return;
  }
  const next = p.transformFrom === 'pelican' ? 'human' : 'pelican';
  const height = next === 'human' ? HUMAN_BODY_HEIGHT : world.tuning.player.height;
  if (p.transformTicks >= 0) {
    p.transformBuffered = false;
    p.transformTicks++;
    if (p.transformTicks === PLAYER_TRANSFORM.swapTick) {
      if (!playerFits(world, player, player.body, height)) {
        cancelPlayerTransform(player);
        world.events.push({ type: 'transformBlocked', id: player.id, reason: 'space' });
        return;
      }
      p.form = next;
      player.body.height = height;
    }
    if (p.transformTicks >= PLAYER_TRANSFORM.durationTicks) cancelPlayerTransform(player);
    return;
  }
  const requested = p.transformBuffered || input.transformPressed;
  p.transformBuffered = false;
  if (!requested || player.health!.hitstunTicks > 0) return;
  if (!playerFits(world, player, player.body, p.form === 'pelican' ? HUMAN_BODY_HEIGHT : world.tuning.player.height)) {
    world.events.push({ type: 'transformBlocked', id: player.id, reason: 'space' });
    return;
  }
  cancelPelicanCombat(player);
  p.transformFrom = p.form;
  p.transformTicks = 0;
  p.ride = createRideData();
  p.jumpBufferTicks = 0;
  p.jumping = false;
  p.flightMode = 'none';
  player.body.vx = 0;
  world.photon.buffered = false;
}
