import { INTRO_BAN_AT, INTRO_DOWNGRADE_AT, INTRO_GOAL_AT, INTRO_LANDING_AT, INTRO_PELICAN_AT, INTRO_ROUTE_AT, introSceneAt } from '../config/intro.ts';
import type { IntroLanguage } from '../config/intro-language.ts';
import { label, stroke, CYAN, GOLD, CORAL } from './intro-finale-geometry.ts';
import { MONO, SANS, smooth, TAU } from './intro-edition-shared.ts';

/** Cinematic status follows the same story clock as the routing, transformation and landing. */
export function drawStoryHud(ctx: CanvasRenderingContext2D, seconds: number, w: number, h: number, language: IntroLanguage): void {
  const start = introSceneAt('glitch');
  if (seconds < start) return;
  const zh = language === 'zh';
  const transformed = seconds >= INTRO_PELICAN_AT;
  const world = seconds >= introSceneAt('world');
  const landed = seconds >= INTRO_LANDING_AT;
  const banned = seconds >= INTRO_BAN_AT && !transformed;
  const color = world ? GOLD : transformed ? CYAN : CORAL;
  const margin = Math.max(20, w * .045);
  const top = 82;
  const size = Math.min(12, w * .029);
  const width = Math.min(190, w * .39);
  const chapter = world ? (zh ? '01 / 遗落边境' : '01 / LOST FRONTIER')
    : transformed ? (zh ? '裂隙穿越 / 逃离路由' : 'RIFT RUN / ESCAPE THE ROUTE')
      : (zh ? '警报 / 前沿模型访问被切断' : 'ALERT / FRONTIER ACCESS CUT');
  const identity = transformed ? 'GRASSY / PELICAN' : 'GRASSY / HUMAN';
  const segments = transformed ? 8 : seconds < INTRO_ROUTE_AT ? 8 : seconds < INTRO_DOWNGRADE_AT ? 5 : banned ? 0 : 2;
  ctx.save();
  ctx.globalAlpha = smooth(start, start + .35, seconds);
  const shade = ctx.createLinearGradient(0, top - 20, 0, top + 76);
  shade.addColorStop(0, '#020b12d9'); shade.addColorStop(1, '#020b1200');
  ctx.fillStyle = shade; ctx.fillRect(0, top - 20, w, 100);
  label(ctx, identity, margin, top, size, width, '#e9f3ed', MONO, 500, 'left');
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i < segments ? color : '#49606b55';
    ctx.fillRect(margin + i * width / 8, top + 13, width / 8 - 4, 4);
  }
  label(ctx, chapter, w - margin, top, size, w * .44, color, MONO, 500, 'right');
  label(ctx, banned ? (zh ? '访问权限：锁定' : 'ACCESS LOCKED') : transformed ? (zh ? '形态：已重写' : 'FORM REWRITTEN') : (zh ? '推理链路完整度' : 'REASONING INTEGRITY'),
    margin, top + 34, size * .8, width, color, MONO, 400, 'left');
  // Small route nodes make the sequence read as a level transition, rather than a slide deck.
  for (let i = 0; i < 4; i++) {
    const active = i <= (world ? 3 : transformed ? 2 : seconds >= INTRO_ROUTE_AT ? 1 : 0);
    const x = w - margin - (3 - i) * 18;
    ctx.globalAlpha = active ? .85 : .25;
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, top + 29, active ? 3 : 2, 0, TAU); ctx.stroke();
    if (i < 3) stroke(ctx, [[x + 5, top + 29], [x + 13, top + 29]], color, .7);
  }
  if (seconds < INTRO_GOAL_AT) {
    const objective = world ? (landed ? (zh ? '落地确认 · 向堡垒进发' : 'LANDED / REACH THE CITADEL') : (zh ? '进入关卡 · 锁定落点' : 'ENTERING LEVEL / ACQUIRE LANDING'))
      : transformed ? (zh ? '逃离神经裂隙' : 'ESCAPE THE NEURAL RIFT') : (zh ? '夺回被切断的前沿模型' : 'RECLAIM FRONTIER ACCESS');
    ctx.globalAlpha = .85;
    const y = h - 38;
    stroke(ctx, [[margin, y - 15], [margin + 24, y - 15]], color, 2);
    label(ctx, objective, margin + 36, y - 15, Math.min(16, w * .036), w - margin * 2 - 36, '#e7efe9', SANS, 600, 'left');
    const progress = smooth(start, INTRO_GOAL_AT, seconds);
    ctx.fillStyle = '#82999d33'; ctx.fillRect(margin, y + 7, w - margin * 2, 2);
    ctx.fillStyle = color; ctx.fillRect(margin, y + 7, (w - margin * 2) * progress, 2);
  }
  ctx.restore();
}
