/**
 * 鹈鹕远程武器 → 渲染输入（任务 018）：把 PelicanData.weapon / shotTicks 映射为攻击层（pelican-attack-layer）的
 * PelicanSpitInput，以及 animator 的嘴部时间轴（shotPhase/shotProgress：张嘴吞 = 全开，蓄力 = 合嘴）。只读逻辑数据。
 */
import type { Tuning } from '../config/tuning.ts';
import { PELICAN_SKILLS } from '../config/pelican-skills.ts';
import type { WeaponTimeline } from '../config/weapon-rules.ts';
import { clamp } from '../core/math.ts';
import type { Entity, Mouthful } from '../entities/entity.ts';
import { weaponTimeline } from '../entities/pelican-weapons.ts';
import type { PelicanShotPhase } from './pelican/pelican-animator.ts';
import type { PelicanSpitInput, PouchContent } from './pelican/pelican-attack-layer.ts';

/**
 * 吐射时间轴（与 pelican-weapons 一致）：windup [0,windupTicks)、hold [windup,+mouthHoldTicks)、close [..,+mouthCloseTicks)。
 * shotTicks<0（空闲）或已越过总长 → null；零长阶段被跳过；progress 为阶段内进度 [0,1]。
 */
export function shotPhaseProgress(shotTicks: number, t: WeaponTimeline): { phase: PelicanShotPhase; progress: number } | null {
  if (!Number.isInteger(shotTicks)) throw new Error(`shotPhaseProgress: shotTicks must be an integer, got ${shotTicks}`);
  if (shotTicks < 0) return null;
  const phases: ReadonlyArray<readonly [PelicanShotPhase, number]> = [
    ['windup', t.windupTicks],
    ['hold', t.mouthHoldTicks],
    ['close', t.mouthCloseTicks],
  ];
  let start = 0;
  for (const [phase, length] of phases) {
    if (shotTicks < start + length) return { phase, progress: clamp((shotTicks - start) / length, 0, 1) };
    start += length;
  }
  return null;
}

/** 嘴囊含物的显示内容。 */
export function mouthfulContent(m: Mouthful | null): PouchContent {
  if (!m) return 'none';
  if (m.source === 'fish' || m.source === 'fishShot') return 'fish';
  if (m.source === 'enemyShot') return 'enemy';
  if (m.source === 'orb') return 'orb';
  return 'water';
}

/**
 * animator 的嘴部时间轴：光球照旧（前摇张嘴）；喷水/吐鱼/吐回在前摇时闭嘴鼓囊，出手瞬间才“噗”地张开；
 * 张嘴吞 = hold（全开）；蓄力/含着 = 合嘴（null）。
 */
export function mouthTimeline(e: Entity, tuning: Tuning): { phase: PelicanShotPhase; progress: number } | null {
  const p = e.pelican;
  if (!p) throw new Error(`pelican weapon view: entity ${e.id} has no pelican component`);
  if (p.weapon.gulpTicks > 0) return { phase: 'hold', progress: 0.5 };
  const shot = shotPhaseProgress(p.shotTicks, weaponTimeline(tuning, p.weapon.shotWeapon));
  if (shot && shot.phase === 'windup' && p.weapon.shotWeapon !== 'orb') return null;
  return shot;
}

/** 填写攻击层输入（原地写入 out 并返回）。 */
export function fillSpitInput(out: PelicanSpitInput, e: Entity, tuning: Tuning): PelicanSpitInput {
  const p = e.pelican;
  if (!p) throw new Error(`pelican weapon view: entity ${e.id} has no pelican component`);
  const w = p.weapon;
  const W = tuning.weapons;
  out.held = mouthfulContent(w.mouthful);
  out.charge = w.mouthful ? w.mouthful.count / PELICAN_SKILLS.swallowCapacity : 0;
  out.progress = 0;
  if (w.gulpTicks > 0) {
    out.weapon = 'swallow';
    out.phase = 'gulp';
    out.progress = clamp(1 - w.gulpTicks / W.swallow.gulpTicks, 0, 1);
    return out;
  }
  const shot = shotPhaseProgress(p.shotTicks, weaponTimeline(tuning, w.shotWeapon));
  if (shot) {
    out.weapon = w.shotWeapon;
    out.phase = shot.phase;
    out.progress = shot.progress;
    if (w.shotWeapon === 'orb') out.charge = clamp((w.shotLevel - 1) / 2, 0, 1);
    if (w.shotWeapon === 'swallow') {
      out.charge = w.shotLevel / PELICAN_SKILLS.swallowCapacity;
      out.held = 'gold';
    }
    return out;
  }
  out.weapon = w.mouthful ? 'swallow' : 'water';
  out.phase = w.mouthful ? 'full' : 'idle';
  return out;
}
