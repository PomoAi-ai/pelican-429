import { NEUTRAL_INPUT } from '../../entities/pelican-controller.ts';
import { createDummyEntity } from '../../entities/entity.ts';
import { setShooterEnabled } from '../../entities/enemy-shooter.ts';
import { addEntity, getPlayer } from '../../sim/sim-world.ts';
import { entityFocus, placeBody } from './scenario.ts';
import type { ScenarioContext, ScenarioDriver } from './scenario.ts';

export function prepareDummy(ctx: ScenarioContext): ScenarioDriver {
  const { world, entry, groundY, facing } = ctx;
  const action = entry.action;
  const pos = action === 'float' ? { x: 50, y: groundY - 2 } : { x: 26, y: groundY };
  const dummy = addEntity(world, (id) => createDummyEntity(id, pos, world.tuning));
  const player = getPlayer(world);
  player.facing = facing;
  const attacking = action === 'hit' || action === 'reset';
  placeBody(player.body, attacking ? 26 - facing * 1.8 : 8, groundY, true);
  if (action === 'shoot') {
    placeBody(player.body, 26 - facing * 8, groundY, true);
    setShooterEnabled(dummy, true, world.tuning);
  }
  if (action === 'reset') dummy.health!.hp = world.tuning.attacks.peck.damage;
  return {
    input: (tick) => ({ ...NEUTRAL_INPUT, attackPressed: attacking && tick === 25, attackSource: attacking ? 'keyboard' : null }),
    focus: () => entityFocus(dummy),
    height: 5,
    width: action === 'shoot' ? 13 : 5,
    status: () => dummy.dummy!.resetPending ? '生命归零 · 等待归位' : dummy.health!.hitstunTicks > 0 ? '受击 / 击退' : `${dummy.health!.hp} / ${dummy.health!.maxHp} HP`,
  };
}
