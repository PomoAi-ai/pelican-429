import { attackTotalTicks } from '../combat/attacks.ts';
import { HUMAN_SKILLS } from '../config/human-combat.ts';
import { PLAYER_TRANSFORM } from '../config/player-form.ts';
import type { Tuning } from '../config/tuning.ts';
import type { Entity } from './entity.ts';
import { timelineLength, weaponTimeline } from './pelican-weapons.ts';

/** 当前拖出的技能最早可起手的等待时间；冷却与动作锁并行计时。 */
export function getSkillWaitTicks(entity: Entity, index: number, tuning: Tuning, photonCooldownTicks: number, photonChargeTicks: number): number {
  const p = entity.pelican!;
  const transform = p.transformTicks < 0 ? 0 : PLAYER_TRANSFORM.durationTicks - p.transformTicks;
  if (index === 3) return Math.max(transform, photonCooldownTicks, photonChargeTicks);
  const attack = entity.attack ? attackTotalTicks(entity.attack.def) - entity.attack.elapsed : 0;
  const hitstun = entity.health!.hitstunTicks;
  if (p.form === 'human') {
    const h = p.humanCombat;
    const action = h.action === null ? 0 : h.action === 'keyboard_smash' ? attack : HUMAN_SKILLS[h.action].ticks - h.ticks;
    return Math.max(transform, hitstun, h.cooldowns[index]!, action);
  }
  const w = p.weapon;
  // 吞弹的再次点击会立即结束吞窗，无需等本技能冷却。
  if (index === 2 && w.gulpTicks > hitstun) return Math.max(transform, hitstun);
  const shot = p.shotTicks < 0 ? 0 : timelineLength(weaponTimeline(tuning, w.shotWeapon)) - p.shotTicks;
  // 含有弹体时，吞窗结束还要完成反吐时间轴，其他技能才能开始。
  const gulp = w.gulpTicks + (w.gulpTicks > 0 && w.mouthful !== null ? timelineLength(tuning.weapons.swallow) : 0);
  return Math.max(transform, hitstun, w.cooldowns[index]!, attack, w.dashTicks, shot, gulp);
}
