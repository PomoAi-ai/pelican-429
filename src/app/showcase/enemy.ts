import { ENEMY_RULES } from '../../config/enemy-rules.ts';
import type { EnemyKind } from '../../config/enemy-rules.ts';
import { attackPhase } from '../../combat/attacks.ts';
import { createEnemyEntity, startEnemySkill } from '../../entities/enemy.ts';
import { NEUTRAL_INPUT } from '../../entities/pelican-controller.ts';
import { addEntity, getPlayer } from '../../sim/sim-world.ts';
import { entityFocus, placeBody } from './scenario.ts';
import type { ScenarioContext, ScenarioDriver } from './scenario.ts';
import { DRONE_APPEARANCES } from '../../config/drone-appearance.ts';

export function prepareEnemy(ctx: ScenarioContext): ScenarioDriver {
  const { world, entry, groundY, facing } = ctx;
  const kind = entry.actor as EnemyKind;
  const cfg = ENEMY_RULES[kind];
  if (entry.action === 'variants') {
    const drones = [21.5, 24.5, 27.5, 30.5].map((x, index) => {
      const drone = addEntity(world, (id) => createEnemyEntity(id, 'watchWasp', { x, y: groundY + 2.5 + index % 2 }, world.tuning, world.level.seed ?? 0));
      drone.enemy!.enabled = false;
      drone.facing = facing;
      return drone;
    });
    placeBody(getPlayer(world).body, 48, groundY, true);
    return {
      input: () => NEUTRAL_INPUT,
      focus: () => ({ x: 26, y: groundY + 3 }), width: 14, height: 6,
      status: () => drones.map((drone) => DRONE_APPEARANCES[drone.enemy!.appearanceIndex]!.name).join(' · '),
    };
  }
  const enemy = addEntity(world, (id) => createEnemyEntity(id, kind, { x: 26, y: groundY + (kind === 'watchWasp' ? 3 : 0) }, world.tuning, world.level.seed ?? 0));
  enemy.facing = facing;
  enemy.enemy!.patrolDirection = facing;
  enemy.enemy!.enabled = entry.action === 'move' || entry.action === 'tracking';
  enemy.enemy!.cooldownTicks = Math.ceil(entry.seconds / world.tuning.sim.step);
  const player = getPlayer(world);
  const skill = entry.action === 'skill1' ? 0 : 1;
  const distance = entry.action === 'idle' ? 18 : entry.action === 'move' ? 9 : entry.action === 'hit' ? -4 : kind === 'watchWasp' ? .3 : cfg.skills[skill].range * 0.8;
  placeBody(player.body, 26 + facing * distance, groundY, true);
  player.facing = entry.action === 'hit' ? facing : facing === 1 ? -1 : 1;
  const combat = entry.action === 'skill1' || entry.action === 'skill2' || entry.action === 'hit' || entry.action === 'tracking';
  return {
    input(tick) {
      if (entry.action === 'tracking') {
        const cycle = tick % 180;
        return { ...NEUTRAL_INPUT, moveX: cycle < 90 ? facing : facing === 1 ? -1 : 1, jumpPressed: cycle === 35 || cycle === 125, jumpHeld: (cycle >= 35 && cycle < 50) || (cycle >= 125 && cycle < 140) };
      }
      if (tick === 30 && (entry.action === 'skill1' || entry.action === 'skill2')) startEnemySkill(enemy, skill, entityFocus(player));
      return { ...NEUTRAL_INPUT, shootPressed: entry.action === 'hit' && tick === 25, shootHeld: entry.action === 'hit' && tick === 25, aim: entityFocus(enemy) };
    },
    focus: () => combat ? { x: (enemy.body.x + player.body.x) / 2, y: groundY + 1.6 } : entityFocus(enemy),
    width: combat ? Math.abs(distance) + 5 : 5.5,
    height: kind === 'watchWasp' || combat ? 6 : 4.5,
    status: () => enemy.removed ? '已清除' : `${cfg.name} · ${enemy.attack ? `${enemy.attack.def.id === cfg.skills[0].id ? cfg.skills[0].name : cfg.skills[1].name} · ${attackPhase(enemy.attack) === 'startup' ? '准备' : attackPhase(enemy.attack) === 'active' ? '攻击' : '收招'}` : enemy.health!.hitstunTicks > 0 ? '受击' : entry.label} · ${enemy.health!.hp} / ${enemy.health!.maxHp} HP`,
  };
}
