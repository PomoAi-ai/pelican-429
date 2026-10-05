import { HUMAN_BODY_HEIGHT } from '../../config/player-form.ts';
import { grassyAction, isGrassyAttack } from '../../config/grassy.ts';
import { createDummyEntity } from '../../entities/entity.ts';
import type { Entity } from '../../entities/entity.ts';
import { NEUTRAL_INPUT } from '../../entities/pelican-controller.ts';
import { addEntity, getPlayer } from '../../sim/sim-world.ts';
import type { InputFrame } from '../../sim/sim-world.ts';
import { TILE_PLATFORM } from '../../world/tile-types.ts';
import { placeBody } from './scenario.ts';
import type { ScenarioContext, ScenarioDriver } from './scenario.ts';

/** 演示只给正式控制器发送输入；移动、命中和假人归位均由 stepSim 结算。 */
export function prepareHuman(ctx: ScenarioContext, attackMotion: 'still' | 'walk' | 'run'): ScenarioDriver {
  const { world, entry, groundY, facing } = ctx;
  const { clip, flight } = entry.grassyAnimation!;
  const player = getPlayer(world);
  const p = player.pelican!;
  const photon = entry.action === 'photon_burst';
  const attacking = isGrassyAttack(clip) || photon;
  const airborne = flight !== undefined || clip === 'takeoff' || clip === 'hover' || clip === 'fly_forward' || clip === 'land';
  const startsAloft = flight === 'hover' || flight === 'fly_forward' || clip === 'hover' || clip === 'fly_forward' || clip === 'land';
  const originX = 24;
  p.form = p.transformFrom = 'human';
  player.body.height = HUMAN_BODY_HEIGHT;
  player.facing = facing;
  const flightHeight = 4.8;
  placeBody(player.body, originX, groundY + (startsAloft ? flightHeight : 0), !startsAloft);

  const targets: Entity[] = [];
  const addTarget = (offset: number, elevation: number): void => {
    const x = originX + offset;
    const y = groundY + elevation;
    if (elevation > 0) {
      for (let tx = Math.floor(x) - 1; tx <= Math.floor(x); tx++) world.map.set(tx, y - 1, TILE_PLATFORM);
    }
    targets.push(addEntity(world, (id) => createDummyEntity(id, { x, y }, world.tuning)));
  };
  for (const side of [-1, 1]) {
    if (clip === 'keyboard_smash' || clip === 'server_overload') addTarget(side * 2, airborne ? 4 : 0);
    addTarget(side * (attacking ? 8 : 12), 0);
    addTarget(side * (attacking ? 8 : 12), 4);
  }
  let direction = facing;

  return {
    width: photon ? 28 : attacking && clip !== 'keyboard_smash' ? 20 : 16,
    height: photon ? airborne ? 19 : 16 : airborne ? 12.8 : 9,
    input(tick): InputFrame {
      if (player.body.x > (clip === 'ride' ? 31 : 34)) direction = -1;
      else if (player.body.x < (clip === 'ride' ? 17 : 14)) direction = 1;
      const moving = clip === 'walk' || clip === 'run' || clip === 'sprint' || clip === 'ride' || clip === 'fly_forward' || flight === 'fly_forward' || (attacking && flight === undefined && attackMotion !== 'still');
      const takeoff = clip === 'takeoff' || flight === 'takeoff';
      const lift = airborne && clip !== 'land' && (player.body.y < groundY + flightHeight || (takeoff && tick < 20));
      const attack = attacking && tick >= 50 && (tick - 50) % 150 === 0;
      const aimTarget = targets
        .filter((target) => target.health!.hp > 0 && (target.body.x - player.body.x) * player.facing > 0)
        .sort((a, b) => Math.abs(a.body.y - player.body.y) - Math.abs(b.body.y - player.body.y) || Math.abs(a.body.x - player.body.x) - Math.abs(b.body.x - player.body.x))[0];
      return {
        ...NEUTRAL_INPUT,
        moveX: moving ? direction : 0,
        runHeld: clip === 'run' || clip === 'sprint' || (attacking && flight === undefined && attackMotion === 'run'),
        jumpPressed: (clip === 'jump' && tick === 20) || (takeoff && tick === 10),
        jumpHeld: clip === 'jump' ? tick >= 20 && tick < 34 : lift,
        downHeld: clip === 'land' || (clip === 'jump' && tick >= 34),
        mountPressed: clip === 'ride' && tick === 10,
        shootPressed: attack && clip === 'keyboard_smash',
        shootHeld: attack && clip === 'keyboard_smash',
        skillPressed: !attack ? 0 : photon ? 4 : clip === 'codex_attack' ? 1 : clip === 'bug_attack' ? 2 : clip === 'server_overload' ? 3 : 0,
        aim: attacking && clip !== 'keyboard_smash' && aimTarget ? { x: aimTarget.body.x, y: aimTarget.body.y + aimTarget.body.height * .6 } : null,
      };
    },
    focus: () => ({
      x: player.body.x + (attacking && clip !== 'server_overload' && !photon ? player.facing * 3 : 0),
      y: groundY + Math.max(photon ? airborne ? 7 : 5 : airborne ? 4 : 3.4, player.body.y - groundY - 1),
    }),
    status: () => {
      const hit = targets.filter((target) => target.health!.hp < target.health!.maxHp).length;
      const hp = targets.reduce((sum, target) => sum + target.health!.hp, 0);
      const phase = world.photon.chargeTicks > 0 ? '光子聚光' : world.photon.activeTicks > 0 ? '虫群光轮追击'
        : p.humanCombat.action !== null ? grassyAction(p.humanCombat.action).label
        : p.ride.mode !== 'off' ? '骑行' : p.flightMode !== 'none' ? '推进飞行'
          : p.state === 'run' ? p.moveGear === 'run' ? '跑动' : '走路'
            : p.state === 'jump' ? '跳跃' : p.state === 'fall' ? '下落' : '呼吸';
      return `${phase} · ${hit}/${targets.length} 目标受击 · 生命 ${hp}/${targets.length * world.tuning.dummy.maxHp}`;
    },
  };
}
