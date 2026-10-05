import { HUMAN_BODY_HEIGHT } from '../../config/player-form.ts';
import { NEUTRAL_INPUT } from '../../entities/pelican-controller.ts';
import { createDummyEntity } from '../../entities/entity.ts';
import type { Entity } from '../../entities/entity.ts';
import { setShooterEnabled } from '../../entities/enemy-shooter.ts';
import { addEntity, getPlayer } from '../../sim/sim-world.ts';
import type { InputFrame } from '../../sim/sim-world.ts';
import { TILE_PLATFORM } from '../../world/tile-types.ts';
import { entityFocus, placeBody } from './scenario.ts';
import type { ScenarioContext, ScenarioDriver } from './scenario.ts';

export function preparePelican(ctx: ScenarioContext): ScenarioDriver {
  const { world, entry, groundY, facing } = ctx;
  const player = getPlayer(world);
  const p = player.pelican!;
  const action = entry.action;
  const transforming = action === 'transform-human' || action === 'transform-pelican';
  const originX = 24;
  player.facing = facing;
  placeBody(player.body, originX, groundY, true);
  if (action === 'transform-pelican') {
    p.form = p.transformFrom = 'human';
    player.body.height = HUMAN_BODY_HEIGHT;
  }
  if (action === 'swim') placeBody(player.body, 50, groundY - 2.2);
  if (action === 'glide') placeBody(player.body, originX, groundY + 8);
  const targets: Entity[] = [];
  const target = (offset: number, elevation = 0): Entity => {
    const x = originX + facing * offset;
    const y = groundY + elevation;
    if (elevation > 0) {
      for (let tx = Math.floor(x) - 1; tx <= Math.floor(x) + 1; tx++) world.map.set(tx, y - 1, TILE_PLATFORM);
    }
    const dummy = addEntity(world, (id) => createDummyEntity(id, { x, y }, world.tuning));
    targets.push(dummy);
    return dummy;
  };
  let width = 5;
  let height = 5;
  let centerX = originX;
  let centerY = groundY + 2;
  if (transforming) { width = 5.5; height = 4.8; centerY = groundY + 1.85; }
  if (action === 'water') {
    target(5.5);
    width = 12; height = 6; centerX += facing * 3;
  } else if (action === 'fish') {
    for (const offset of [5, 7.5, 10]) target(offset);
    width = 26; height = 10; centerX += facing * 9; centerY += 1;
  } else if (action === 'dash') {
    for (const offset of [3, 5.5, 8]) target(offset);
    width = 19; height = 9; centerX += facing * 6; centerY += 1;
  } else if (action === 'swallow') {
    setShooterEnabled(target(7), true, world.tuning);
    width = 14; height = 7; centerX += facing * 3.5;
  } else if (action === 'ultimate') {
    for (const offset of [-9, -4, 4, 9]) target(offset);
    target(-7, 4); target(7, 4);
    width = 28; height = 16; centerY = groundY + 4.5;
  }
  let swallowed = false;
  let gulpStarted = false;
  let direction = facing;
  const input = (tick: number): InputFrame => {
    const frame = { ...NEUTRAL_INPUT };
    // 为刹车与转向留出距离，演示跑步/骑行时不会意外进入旁边的水池。
    if (player.body.x > 35) direction = -1;
    else if (player.body.x < 12) direction = 1;
    const move = (speed: boolean): InputFrame => ({ ...frame, moveX: direction, runHeld: speed });
    if (transforming) return { ...frame, transformPressed: tick === 45, moveX: tick >= 160 && tick < 205 ? facing : 0 };
    if (action === 'walk') return move(false);
    if (action === 'run') return move(true);
    if (action === 'turn') return { ...frame, moveX: tick < 50 ? facing : tick < 110 ? -facing as 1 | -1 : facing };
    if (action === 'jump') return { ...frame, jumpPressed: tick === 20, jumpHeld: tick >= 20 && tick < 40 };
    if (action === 'fly') return { ...frame, jumpPressed: tick === 20, jumpHeld: tick >= 20 && tick < 120 };
    if (action === 'glide') return { ...frame, moveX: facing };
    if (action === 'swim') return { ...frame, moveX: tick < 100 ? facing : -facing as 1 | -1 };
    if (action === 'water') return { ...frame, shootPressed: tick === 30, shootHeld: tick >= 30 && tick < 100 };
    if (action === 'fish') return { ...frame, skillPressed: tick === 30 ? 1 : 0 };
    if (action === 'dash') return { ...frame, skillPressed: tick === 30 ? 2 : 0 };
    if (action === 'ultimate') return { ...frame, skillPressed: tick === 30 ? 4 : 0 };
    if (action === 'swallow') {
      if (p.weapon.mouthful && !swallowed) {
        swallowed = true;
        setShooterEnabled(targets[0]!, false, world.tuning);
      }
      const incoming = world.entities.some((entity) => entity.kind === 'enemyShot' && entity.team === 'enemy' && Math.abs(entity.body.x - player.body.x) < 4.5);
      const gulp = !gulpStarted && incoming;
      if (gulp) gulpStarted = true;
      return { ...frame, skillPressed: gulp ? 3 : 0 };
    }
    if (action === 'mount' || action === 'ride' || action === 'dismount') {
      return { ...frame, mountPressed: tick === 20 || (action === 'dismount' && tick === 100), moveX: action === 'ride' && tick > 55 ? direction : 0 };
    }
    return frame;
  };
  return {
    input,
    focus: () => targets.length > 0 || transforming ? { x: centerX, y: centerY } : entityFocus(player),
    width, height,
    status: () => {
      if (transforming) return p.transformTicks >= 0
        ? p.transformFrom === 'human' ? '羽毛生长 · 身体换形' : '羽毛收退 · 身体换形'
        : p.form === 'human' ? 'Grassy · 人类形态 · F 变为鹈鹕' : '鹈鹕形态 · F 变为主角';
      if (targets.length > 0) {
        const hit = targets.filter((entity) => entity.health!.hp < entity.health!.maxHp).length;
        const hp = targets.reduce((sum, entity) => sum + entity.health!.hp, 0);
        const maxHp = targets.reduce((sum, entity) => sum + entity.health!.maxHp, 0);
        const phase = action === 'swallow' ? p.weapon.mouthful ? '已吞入 · 凝聚反击' : swallowed ? '反吐完成' : '等待来袭弹'
          : action === 'ultimate' ? world.photon.chargeTicks > 0 ? '光子聚光' : world.photon.activeTicks > 0 ? '虫群光轮追击' : '光子爆裂'
          : action === 'dash' ? p.weapon.dashTicks > 0 ? '振翅突进' : '突进演示' : action === 'fish' ? '鱼群轰炸' : '吐水普攻';
        return `${phase} · ${hit}/${targets.length} 目标受击 · 生命 ${hp}/${maxHp}`;
      }
      if (p.ride.mode !== 'off') return ({ mounting: '上车中', riding: '骑行', dismounting: '下车中' })[p.ride.mode];
      return ({ idle: '待机', run: p.moveGear === 'walk' ? '走路' : '跑步', jump: '起跳', fall: '下落', attack: '攻击', fly: '振翅飞行', glide: '滑翔', swim: '游泳' })[p.state];
    },
  };
}
