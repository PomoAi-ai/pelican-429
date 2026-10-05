import { FINALE_CUES as C, FINALE_CLAUDE_CLIMB, FINALE_CODE, FINALE_NOTE_KEYS, FINALE_OPEN_MODELS, FINALE_RETRY_TIMES } from '../config/intro-finale.ts';
import { FINALE_MODELS } from '../config/intro-models.ts';
import { clamp, glow, MONO, SANS, SERIF, seeded, smooth, TAU, type EditionFrame } from './intro-edition-shared.ts';
import {
  CYAN, GOLD, IVORY, STORM, STORM_VIOLET, hit, label, mix, note, star, stroke, type Point,
} from './intro-finale-geometry.ts';

/** 风暴撕扯强度：16 秒骤起，越往后越猛，进入黑场后消失。 */
export const stormForce = (t: number): number =>
  t >= C.storm && t < C.blackout ? .55 + .45 * smooth(C.storm, C.collapse, t) : 0;
/** 崩塌时每个元素按自己的种子错开下坠；24 秒的冲击波把一切重建，所以高潮后归零。 */
export const fallAt = (t: number, seed: number): number =>
  t < C.rise ? smooth(C.collapse + seed * .7, C.collapse + seed * .7 + .8, t) ** 2 : 0;
export const goneAt = (t: number): number => t < C.rise ? smooth(C.collapse + .6, C.blackout, t) : 0;

/** [拍点, 变化量, 用时]：攀升一格一格地涨到 99，雷击一记一记地砍，崩塌把余量慢慢抽干。 */
const AGI_STEPS: readonly (readonly [number, number, number])[] = [
  [C.build, 6, .3], ...C.claudeClimb.map((at) => [at, 13, .3] as const), [C.senses, 8, .3],
  ...FINALE_OPEN_MODELS.filter((_, i) => i % 3 === 0).map(({ at }) => [at, 9, .3] as const), [C.brink - .5, 6, .3],
  [C.strikes[0], -28, .12], [C.strikes[1], -24, .12], [C.strikes[2], -23, .12], [C.strikes[3], -16, .12],
  [C.collapse, -8, 1.2], [C.rise, 100, .3], [C.opus, 12, .3],
];
const agiLevel = (t: number): number => AGI_STEPS.reduce((value, [at, delta, span]) => value + delta * smooth(at, at + span, t), 0);

export function agiMeter(f: EditionFrame): void {
  const { ctx, width: w, height: h, seconds: t } = f;
  const dark = t >= C.blackout - .2 && t < C.rise ? smooth(C.blackout - .2, C.blackout, t) : 0;
  const alpha = smooth(C.build, C.build + .4, t) * (1 - dark) * (1 - smooth(C.silence - .2, C.silence, t));
  if (alpha === 0) return;
  const value = agiLevel(t);
  const storming = t >= C.storm && t < C.rise; const climax = t >= C.rise;
  const frozen = t >= C.brink && t < C.storm;
  const blink = frozen && Math.floor(t * 8) % 2 === 0;
  const color = climax ? GOLD : storming ? STORM : value > 85 ? GOLD : CYAN;
  const cells = 25; const width = Math.min(w * .5, 360); const gap = 2;
  const cell = (width - gap * (cells - 1)) / cells; const left = (w - width) / 2;
  const y = Math.max(26, h * .07); const thick = Math.max(6, Math.min(9, h * .012));
  const size = Math.min(13, w * .03); const tick = Math.floor(t * 24);
  // 刚被雷击砍掉的格子还闪着红光碎落，让“掉了多少”看得见。
  const lost = storming ? agiLevel(t - .45) : value;
  ctx.save(); ctx.globalAlpha = alpha;
  if (climax || value > 85) glow(ctx, w * .5, y, width * (.55 + (climax ? .4 : 0)), climax ? '#f8d79150' : '#f8d79120');
  for (let k = 0; k < cells; k++) {
    const x = left + k * (cell + gap);
    const filled = clamp(value / 100 * cells - k);
    const shed = clamp(lost / 100 * cells - k) - filled;
    ctx.globalAlpha = alpha * .22; ctx.fillStyle = color; ctx.fillRect(x, y - thick / 2, cell, thick);
    if (filled > 0) {
      ctx.globalAlpha = alpha * (blink ? .3 : 1);
      ctx.fillRect(x, y - thick / 2, cell * filled, thick);
    }
    if (shed > 0) {
      ctx.globalAlpha = alpha * shed * (seeded(tick + k * 13) > .35 ? .9 : .2);
      ctx.fillStyle = seeded(k + 3) > .5 ? IVORY : STORM;
      ctx.fillRect(x, y - thick / 2 + seeded(k + tick * 7) * thick * 1.6, cell, thick);
    }
  }
  ctx.globalAlpha = alpha;
  if (climax) {
    // 冲破 100%：条体从两端溢出，ASTRA 上线时一路烧到屏幕边缘。
    const reach = Math.max((value - 100) / 100 * width * 2, smooth(C.astra, C.astra + .4, t) * left);
    const beam = ctx.createLinearGradient(left - reach, 0, left + width + reach, 0);
    beam.addColorStop(0, '#f8d79100'); beam.addColorStop(.5, '#fff6dd'); beam.addColorStop(1, '#f8d79100');
    ctx.fillStyle = beam; ctx.fillRect(left - reach, y - 1, width + reach * 2, 2);
    for (let spark = 0; spark < 16; spark++) {
      const u = (seeded(spark + 61) + t * (.4 + seeded(spark + 71) * .5)) % 1;
      const side = spark % 2 ? 1 : -1;
      ctx.globalAlpha = alpha * (1 - u) * .8;
      star(ctx, w * .5 + side * (width * .5 + u * reach), y + (seeded(spark + 81) - .5) * thick * 3, 1.2, IVORY);
    }
    ctx.globalAlpha = alpha;
  }
  const glitch = storming && seeded(tick + 401) < .3 + stormForce(t) * .3;
  const reading = glitch ? ['ERR', 'NaN%', '429', '??%', '0x1A%'][Math.floor(seeded(tick + 409) * 5)]!
    : t >= C.astra ? '∞' : `${Math.round(value)}%`;
  ctx.globalAlpha = alpha * (blink ? .35 : 1);
  label(ctx, 'AGI', left - 10, y, size, 60, color, MONO, 600, 'right');
  label(ctx, reading, left + width + 10, y, size * (t >= C.astra ? 1.5 : 1), 80, color, MONO, 600, 'left');
  const aside = t >= C.brink - .5 && t < C.storm ? (f.language === 'zh' ? '就差 1%。' : 'ONE PERCENT TO GO.')
    : climax && t < C.astra - .2 ? (f.language === 'zh' ? '前沿模型，人人可用。' : 'FRONTIER AI, FOR EVERYONE.') : '';
  if (aside) {
    ctx.globalAlpha = alpha * (climax ? smooth(C.rise + .3, C.rise + .5, t) : smooth(C.brink - .5, C.brink - .3, t)) * .8;
    label(ctx, aside, w * .5, y + size * 1.7, Math.min(11, w * .026), w * .8, color, MONO);
  }
  ctx.restore();
}

/** 四道闪电各劈下一条错误；措辞是通用的故障描述，不对应任何真实产品。 */
const STRIKES = [
  { code: '429 · TOO MANY REQUESTS', zh: '你被限流了', en: "You've been rate-limited." },
  { code: 'REROUTED', zh: '请求被悄悄改道', en: 'Quietly sent somewhere else.' },
  { code: 'DOWNGRADED', zh: '换成了降智模型', en: 'Swapped for a smaller mind.' },
  { code: 'CONNECTION CUT', zh: '连接被切断', en: 'Cut off from the frontier.' },
] as const;

/** 横向切片各自错位，再叠一层红青色差：故障感来自形状被撕开，而不是换一种字体颜色。 */
function tornLabel(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, maxWidth: number,
  color: string, tear: number, seed: number, font = SANS, weight = 800): void {
  const slices = 7; const top = y - size * .8; const slice = size * 1.6 / slices;
  const split = tear * size * .12;
  for (const [dx, tint, alpha] of [[-split, STORM, .75], [split, CYAN, .55], [0, color, 1]] as const) {
    for (let s = 0; s < slices; s++) {
      const offset = (seeded(seed + s * 13) - .5) * tear * size * (seeded(seed + s * 7) > .55 ? 1.1 : .12);
      ctx.save(); ctx.beginPath(); ctx.rect(x - maxWidth, top + s * slice, maxWidth * 2, slice + .5); ctx.clip();
      ctx.globalAlpha *= alpha;
      label(ctx, value, x + dx + offset, y, size, maxWidth, tint, font, weight);
      ctx.restore();
    }
  }
}

function bolt(ctx: CanvasRenderingContext2D, w: number, h: number, index: number, power: number): void {
  const seed = index * 97 + 5;
  const from: Point = [w * (.22 + seeded(seed) * .56), -10];
  const to: Point = [w * (.5 + (seeded(seed + 1) - .5) * .22), h * .5];
  const points: Point[] = Array.from({ length: 15 }, (_, k) => {
    const u = k / 14; const jag = k === 0 || k === 14 ? 0 : (seeded(seed + k * 3) - .5) * w * .09;
    return [mix(from[0], to[0], u) + jag, mix(from[1], to[1], u)];
  });
  const branches = [4, 7, 10].map((start, b): Point[] => {
    const side = seeded(seed + b + 40) > .5 ? 1 : -1; let [x, y] = points[start]!;
    return [[x, y], ...Array.from({ length: 4 }, (_, k): Point => {
      x += side * w * (.025 + seeded(seed + b * 9 + k) * .03); y += h * (.03 + seeded(seed + b * 5 + k) * .03);
      return [x, y];
    })];
  });
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // 宽而淡的紫色描边充当辉光，代替 shadowBlur：四道闪电叠在一起时模糊是这一幕最贵的操作。
  ctx.globalAlpha = power * .25; stroke(ctx, points, STORM_VIOLET, 40 * power + 4);
  branches.forEach((branch) => stroke(ctx, branch, STORM_VIOLET, 16 * power + 2));
  ctx.globalAlpha = power * .9; stroke(ctx, points, '#d8c8ff', 11 * power + 1);
  branches.forEach((branch) => stroke(ctx, branch, '#c7b4ff', 3.5 * power + .5));
  ctx.globalAlpha = power; stroke(ctx, points, '#ffffff', 3);
  ctx.restore();
  glow(ctx, to[0], to[1], Math.min(w, h) * .4 * power, '#ff3d7f66');
}

export function storm(f: EditionFrame): void {
  const { ctx, width: w, height: h, seconds: t } = f;
  if (t < C.storm || t >= C.blackout) return;
  const force = stormForce(t); const alive = 1 - goneAt(t); const tick = Math.floor(t * 24);
  const burst = C.strikes.reduce((value, at) => Math.max(value, hit(t, at, 3)), 0);
  ctx.save();
  // 斜雨与噪点越下越密，崩塌后随画面一起熄灭。
  const drops = Math.round(70 + 170 * smooth(C.storm, C.collapse, t));
  for (let i = 0; i < drops; i++) {
    const length = h * (.04 + seeded(i + 800) * .08); const p = (seeded(i + 1000) + t * (1.3 + seeded(i + 700))) % 1;
    const x = seeded(i + 900) * (w + h * .4) - p * h * .4; const y = -length + p * (h + length * 2);
    ctx.globalAlpha = alive * force * (.1 + seeded(i + 1100) * .3);
    stroke(ctx, [[x, y], [x - length * .4, y + length]], i % 5 ? '#b8a2ff' : '#ff9cc4', .8);
  }
  ctx.fillStyle = IVORY;
  for (let i = 0; i < 90; i++) {
    ctx.globalAlpha = alive * force * seeded(tick * 131 + i) * .35;
    ctx.fillRect(seeded(tick * 17 + i) * w, seeded(tick * 29 + i) * h, 1 + seeded(i + tick) * 2, 1);
  }
  for (let i = 0; i < 3 + Math.floor(force * 4 + burst * 5); i++) {
    const y = seeded(tick * 37 + i * 3) * h; const band = 2 + seeded(tick * 41 + i) * h * .03;
    ctx.globalAlpha = alive * (.12 + burst * .3) * seeded(tick + i * 5);
    ctx.fillStyle = [STORM, STORM_VIOLET, '#000000'][i % 3]!;
    ctx.fillRect(0, y, w, band);
  }
  C.strikes.forEach((at, index) => {
    const age = t - at;
    if (age < 0 || age > .5) return;
    bolt(ctx, w, h, index, Math.exp(-age * 7) * (seeded(Math.floor(t * 30) + index * 7) > .25 ? 1 : .35));
  });
  // 429 砸在正中央：落下时放大，随后一直留在风暴里压着画面。
  const slam = hit(t, C.strikes[0], 5);
  const tear = .15 + burst * 1.3;
  // 每一击 429 都重新亮起并歪一下，越到后面越压不住；第一击从巨大砸回原位。
  const ember = .22 + .78 * Math.max(Math.exp(-(t - C.storm) * .9), burst * .85);
  ctx.globalAlpha = alive * ember * (seeded(tick + 77) > .12 ? 1 : .4);
  ctx.save(); ctx.translate(w * .5, h * .4 + fallAt(t, .1) * h); ctx.rotate((seeded(tick + 5) - .5) * burst * .12);
  tornLabel(ctx, '429', 0, 0, Math.min(w * .36, h * .44) * (1 + slam * .5 + burst * .1),
    w * .9, '#ffe3ee', tear, tick * 3 + 11, SANS, 900);
  ctx.restore();
  const index = C.strikes.findLastIndex((at) => t >= at);
  const strike = STRIKES[index]!;
  const pop = hit(t, C.strikes[index]!, 9);
  const drop = fallAt(t, .35) * h;
  ctx.globalAlpha = alive;
  tornLabel(ctx, strike.code, w * .5, h * .7 + drop, Math.min(66, w * .085) * (1 + pop * .3), w * .92,
    IVORY, .1 + hit(t, C.strikes[index]!, 4) * .9, tick * 5 + index * 101);
  ctx.globalAlpha = alive * smooth(C.strikes[index]!, C.strikes[index]! + .12, t);
  label(ctx, f.language === 'zh' ? strike.zh : strike.en, w * .5, h * .785 + drop, Math.min(20, w * .04), w * .86, '#ffb3cd', SANS, 600);
  ctx.restore();
}

const ROSTER = [...FINALE_CLAUDE_CLIMB, FINALE_MODELS.gpt, FINALE_MODELS.gemini, ...FINALE_OPEN_MODELS.map(({ name }) => name)];
const GLYPHS = '#%&@!?/\\01_';

function rosterSlot(i: number, w: number, h: number): { x: number; y: number; align: CanvasTextAlign; width: number; size: number } {
  if (w < 700) {
    return { x: w * (.18 + (i % 3) * .32), y: h * (.835 + Math.floor(i / 3) * .032), align: 'center', width: w * .3, size: Math.min(10, w * .026) };
  }
  const right = i % 2 === 1;
  return { x: w * (right ? .965 : .035), y: h * (.19 + Math.floor(i / 2) * .08), align: right ? 'right' : 'left', width: w * .17, size: Math.min(13, w * .011) };
}

/** 风暴里亮过的型号一个个乱码、变灰；ASTRA 上线时全员原位回归，变成金色。 */
export function modelRoster(f: EditionFrame): void {
  const { ctx, width: w, height: h, seconds: t } = f;
  const storming = t >= C.storm && t < C.blackout;
  if (!storming && (t < C.astra || t >= C.silence)) return;
  const tick = Math.floor(t * 18);
  ctx.save();
  ROSTER.forEach((name, i) => {
    const slot = rosterSlot(i, w, h);
    if (storming) {
      // 7 与 15 互质，熄灭顺序在两侧之间来回跳，而不是自上而下排队。
      const dies = C.storm + .3 + (i * 7 % ROSTER.length) / ROSTER.length * 3.4;
      const rot = smooth(dies - 1.1, dies, t); const dead = t >= dies;
      const shown = dead ? `× ${name}` : [...name].map((char, k) =>
        char !== ' ' && seeded(i * 97 + k * 13 + tick) < rot * .8 ? GLYPHS[Math.floor(seeded(k + tick * 3) * GLYPHS.length)]! : char).join('');
      const flicker = !dead && rot > 0 && seeded(tick + i * 31) < rot * .5 ? .2 : 1;
      ctx.globalAlpha = (1 - goneAt(t)) * (dead ? .32 : .8 * flicker) + hit(t, dies, 10) * .6;
      label(ctx, shown, slot.x + (dead ? 0 : (seeded(tick + i) - .5) * rot * 6), slot.y + fallAt(t, seeded(i + 50)) * h,
        slot.size, slot.width, dead ? '#5a5866' : rot > .35 ? STORM : IVORY, MONO, 500, slot.align);
      return;
    }
    const at = C.astra + i * .06; const pop = hit(t, at, 8);
    ctx.globalAlpha = smooth(at, at + .12, t) * (1 - smooth(C.silence - .2, C.silence, t));
    if (pop > .05) glow(ctx, slot.x, slot.y, slot.size * 4 * pop, '#f8d79150');
    label(ctx, name, slot.x, slot.y, slot.size * (1 + pop * .35), slot.width, i < FINALE_CLAUDE_CLIMB.length ? GOLD : IVORY,
      MONO, 600, slot.align);
  });
  ctx.restore();
}


/** 黑场里只剩光标；人重新敲下同一行代码，每个音名点亮一圈光，最后把光收向中心等待爆发。 */
export function retry(f: EditionFrame): void {
  const { ctx, width: w, height: h, seconds: t } = f;
  if (t < C.blackout || t >= C.rise) return;
  const s = Math.min(30, w * .05); const cw = s * .602; const left = (w - FINALE_CODE.length * cw) / 2; const y = h * .47;
  const lit = C.retry.filter((at) => t >= at).length;
  const charge = smooth(C.retry[3], C.rise, t);
  ctx.save();
  for (let ring = 0; ring < lit; ring++) {
    const swell = hit(t, C.retry[ring]!, 5);
    ctx.globalAlpha = .5 + swell * .5;
    glow(ctx, w * .5, y, s * (2.6 + ring * 2.4) * (1 + charge * .5 + swell * .15), '#f5d78116');
    ctx.globalAlpha = .18 + swell * .5;
    ctx.beginPath(); ctx.ellipse(w * .5, y, s * (3 + ring * 2.2) * (1 + swell * .1), s * (1.1 + ring * .8), 0, 0, TAU);
    ctx.strokeStyle = GOLD; ctx.lineWidth = .8; ctx.stroke();
  }
  ctx.globalAlpha = smooth(C.blackout + .2, C.retry[0], t) * .7;
  label(ctx, f.language === 'zh' ? '人类' : 'HUMAN', left, y - s * 1.7, Math.min(11, w * .024), w * .3, CYAN, MONO, 500, 'left');
  let cursor = left;
  for (let i = 0; i < FINALE_CODE.length; i++) {
    const at = FINALE_RETRY_TIMES[i]!;
    if (t < at) break;
    const noteIndex = FINALE_NOTE_KEYS.indexOf(i);
    const px = left + i * cw; cursor = px + cw;
    ctx.globalAlpha = 1;
    label(ctx, FINALE_CODE[i]!, px, y, s, cw * 1.2, noteIndex < 0 ? '#7f959b' : GOLD, MONO, noteIndex < 0 ? 400 : 700, 'left');
    if (noteIndex >= 0) {
      const strike = hit(t, at, 6);
      glow(ctx, px + cw * .5, y - s * .2, s * (2 + strike * 2.5 + charge * 2), '#f5d78150');
      note(ctx, px + cw * .5, y - s * (1.25 + strike * .35), s * .8, GOLD, -.1);
    }
  }
  if (t >= C.rerun) {
    const press = hit(t, C.rerun, 6);
    ctx.globalAlpha = .4 + press * .6;
    label(ctx, '⏎', cursor + cw * .9, y, s * (1 + press * .35), cw * 2, GOLD, MONO, 700, 'left');
    cursor += cw * 2;
  }
  // 光标在等待时闪烁，打字时常亮：与人真正敲键盘时的终端一致。
  const typing = FINALE_RETRY_TIMES.some((at) => t >= at && t - at < .25);
  ctx.globalAlpha = typing || Math.floor(t * 3.5) % 2 === 0 ? .9 : 0;
  ctx.fillStyle = IVORY; ctx.fillRect(cursor + 2, y - s * .55, cw * .8, s * 1.1);
  ctx.globalAlpha = smooth(C.retry[0] + .2, C.retry[0] + .5, t) * .75;
  label(ctx, f.language === 'zh' ? '再来一次。' : 'Once more.', w * .5, y + s * 2.3, Math.min(17, w * .036), w * .8, '#d9cdb0', SERIF);
  if (charge > 0) {
    // 光从四周向音符收拢，越接近 24 秒越快、越亮。
    const reach = Math.hypot(w, h) * .6;
    for (let i = 0; i < 110; i++) {
      const angle = seeded(i + 1300) * TAU; const lag = seeded(i + 1400) * .5;
      const p = clamp((charge - lag) / (1 - lag)) ** 1.6;
      const r = reach * (1 - p) * (.5 + seeded(i + 1500) * .5);
      const x = w * .5 + Math.cos(angle) * r; const yy = y + Math.sin(angle) * r * .7;
      ctx.globalAlpha = p * (1 - p) * 3 * .8;
      stroke(ctx, [[x, yy], [w * .5 + Math.cos(angle) * (r + 30 * p + 6), y + Math.sin(angle) * (r + 30 * p + 6) * .7]], i % 4 ? GOLD : IVORY, 1);
    }
    ctx.globalAlpha = charge;
    glow(ctx, w * .5, y, Math.min(w, h) * (.1 + charge * .25), '#fff1c860');
  }
  ctx.restore();
}
