import type { GrassyAttack } from '../config/grassy.ts';
import { HUMAN_BUG_SHOT, HUMAN_CODEX_SHOT, HUMAN_OVERLOAD, HUMAN_OVERLOAD_POST_INVULN_TICKS, HUMAN_SKILLS } from '../config/human-combat.ts';
import type { HumanSkill } from '../config/human-combat.ts';
import { HUMAN_MELEE_ATTACK } from '../config/player-form.ts';
import type { Vec2 } from '../core/math.ts';
import { advanceAttack, startAttack } from '../combat/attacks.ts';
import type { HitSource } from '../combat/combat-system.ts';
import type { Entity, PelicanData } from './entity.ts';
import type { PelicanInput } from './pelican-controller.ts';

export interface HumanCombatData {
  action: GrassyAttack | null;
  ticks: number;
  smashSide: 0 | 1;
  cooldowns: [number, number, number];
  bufferedSkill: 0 | 1 | 2 | 3;
  bufferTicks: number;
  bufferedAim: Vec2 | null;
  aim: Vec2 | null;
  hitIds: number[];
}

export function createHumanCombat(): HumanCombatData {
  return { action: null, ticks: 0, smashSide: 1, cooldowns: [0, 0, 0], bufferedSkill: 0, bufferTicks: 0, bufferedAim: null, aim: null, hitIds: [] };
}

export function cancelHumanCombat(e: Entity): void {
  const h = e.pelican!.humanCombat;
  if (e.health!.hp <= 0) e.health!.overloadInvulnTicks = 0;
  else if (h.action === 'server_overload') {
    e.health!.overloadInvulnTicks = Math.min(e.health!.overloadInvulnTicks, HUMAN_OVERLOAD_POST_INVULN_TICKS + 1);
  }
  h.action = null;
  h.ticks = h.bufferedSkill = h.bufferTicks = 0;
  h.aim = null;
  h.bufferedAim = null;
  h.hitIds.length = 0;
}

export function bufferHumanSkill(p: PelicanData, input: PelicanInput): void {
  if (input.skillPressed === 0 || input.skillPressed === 4) return;
  p.humanCombat.bufferedSkill = input.skillPressed;
  // 包含本帧，保证接下来 12 tick 内恢复可释放时仍能接上右键。
  p.humanCombat.bufferTicks = input.skillPressed === 1 ? 13 : 8;
  p.humanCombat.bufferedAim = input.aim === null ? null : { ...input.aim };
}

function emit(e: Entity, skill: Exclude<HumanSkill, 'server_overload'>, index: number): void {
  const p = e.pelican!;
  const x = e.body.x + e.facing * 0.65;
  const y = e.body.y + 1.55;
  const aim = p.humanCombat.aim;
  const dx = aim === null ? e.facing : aim.x - x;
  const dy = aim === null ? 0 : aim.y - y;
  const angle = Math.atan2(dy, dx) + (skill === 'bug_attack' ? Math.sin(index * 2.4) * 0.16 : (index % 3 - 1) * 0.035);
  p.shotRequests.push({
    def: skill === 'codex_attack' ? HUMAN_CODEX_SHOT : HUMAN_BUG_SHOT,
    x, y, dirX: Math.cos(angle), dirY: Math.sin(angle), ownerId: e.id, team: e.team, level: 1, returned: false,
  });
}

/** Animation and hit timing share one simulation clock; locomotion remains independent. */
export function updateHumanCombat(e: Entity, input: PelicanInput): void {
  const p = e.pelican!;
  const h = p.humanCombat;
  for (let i = 0; i < h.cooldowns.length; i++) h.cooldowns[i] = Math.max(0, h.cooldowns[i]! - 1);
  if (p.form !== 'human') return;
  if (e.health!.hp <= 0 || e.health!.hitstunTicks > 0 || p.transformTicks >= 0) {
    cancelHumanCombat(e);
    e.attack = undefined;
    p.attackBufferTicks = 0;
    return;
  }
  if (h.action === 'keyboard_smash') {
    if (advanceAttack(e.attack!)) h.ticks = e.attack!.elapsed;
    else { e.attack = undefined; h.action = null; }
  } else if (h.action) {
    const cfg = HUMAN_SKILLS[h.action];
    h.ticks++;
    const shot = h.ticks - cfg.release;
    if (h.action !== 'server_overload' && shot >= 0 && shot % cfg.interval === 0 && shot / cfg.interval < cfg.count) emit(e, h.action, shot / cfg.interval);
    if (h.ticks >= cfg.ticks) h.action = null;
  }

  if (h.action === null) {
    const slot = h.bufferedSkill || (input.skill1Held ? 1 : 0);
    if (slot > 0 && h.cooldowns[slot - 1] === 0) {
      const action = (['codex_attack', 'bug_attack', 'server_overload'] as const)[slot - 1]!;
      h.action = action;
      h.ticks = 0;
      h.aim = h.bufferedSkill > 0 ? h.bufferedAim : input.aim;
      h.hitIds.length = 0;
      h.cooldowns[slot - 1] = HUMAN_SKILLS[action].cooldown;
      if (action === 'server_overload') {
        // 起手当帧也会递减一次，保留动作实际结束后的完整两秒。
        e.health!.overloadInvulnTicks = HUMAN_SKILLS[action].ticks + HUMAN_OVERLOAD_POST_INVULN_TICKS + 1;
      }
      h.bufferedSkill = h.bufferTicks = 0;
      p.attackBufferTicks = 0;
      if (h.aim !== null && h.aim.x !== e.body.x) e.facing = h.aim.x > e.body.x ? 1 : -1;
      else if (input.moveX !== 0) e.facing = input.moveX;
    } else if (p.attackBufferTicks > 0) {
      e.attack = startAttack(HUMAN_MELEE_ATTACK);
      h.action = 'keyboard_smash';
      h.ticks = 0;
      h.smashSide = h.smashSide === 0 ? 1 : 0;
      if (p.attackBufferFacing !== 0) e.facing = p.attackBufferFacing;
      else if (input.moveX !== 0) e.facing = input.moveX;
      p.attackBufferTicks = p.attackBufferFacing = 0;
    }
  }
  if (h.bufferTicks > 0 && --h.bufferTicks === 0) h.bufferedSkill = 0;
}

/** Only the burst frame produces damage; hitIds keep it singular if the frame is sampled again. */
export function humanOverloadHitSource(e: Entity): HitSource | null {
  const h = e.pelican!.humanCombat;
  if (h.action !== 'server_overload' || h.ticks !== HUMAN_SKILLS.server_overload.release) return null;
  return {
    sourceId: e.id, ownerId: e.id, team: e.team,
    box: { x: e.body.x - 5.8, y: e.body.y - 0.2, w: 11.6, h: 4.8 },
    def: HUMAN_OVERLOAD, dir: e.facing, hitIds: h.hitIds, maxHits: Infinity, radial: true,
  };
}
