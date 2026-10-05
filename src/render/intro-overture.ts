import {
  ASTRA_AT, CI_WORDS, CODE_LINE, CODE_RISE_AT, CODE_RISE_STEP, CODE_TIMES, CURSOR_AT, DUET_AT, DUET_LINES, GPT_HITS,
  GPT_SUBTITLE, KEY_CHANGE_AT, MACHINE_AT, MACHINE_STEP, MACHINE_TOKENS, OVERTURE_CUT, OVERTURE_DURATION,
  OVERTURE_KICKS, OVERTURE_MAINS, OVERTURE_TITLE, OVERTURE_VOICES, PRELUDE_REST, PRELUDE_WORDS, PROMPT_NOTE_CHARS,
  PROMPT_TEXT, PROMPT_TIMES, SKY_RISE_AT, SPARK_BLINK, STARS_GATHER_AT, SWARM_AT, SYNC_AT, SYNC_FROM, TUTTI_HITS,
  TUTTI_WORDS,
} from '../config/intro-overture.ts';
import {
  CYAN, FIREFLY, GOLD, MONO, SANS, TAU, easeIn, easeOut, font, glow, hit, label, latestIndex, lerp, lerpPoint,
  mixHex, noise, pulse, ramp, ring, shake, smooth, spaced, type Frame, type Point,
} from './intro-overture-kit.ts';
import {
  MAIN_COLORS, constellation, drawConstellation, drawMains, drawPrelude, drawStarfield, preludeBoxes,
  type WordBox,
} from './intro-overture-words.ts';

const KICKS = OVERTURE_KICKS.map((kick) => kick.at);
const NOTE_GLYPHS = ['♪', '♫', '♩', '♬'] as const;
const NOTE_INDEXES = [...CODE_LINE].flatMap((char, i) => (/[A-G]/.test(char) ? [i] : []));
const NOTE_TIMES = NOTE_INDEXES.map((i) => CODE_TIMES[i]!);
const SENTENCE = PROMPT_TEXT + MACHINE_TOKENS.join('');
const SENTENCE_TIMES: readonly number[] = [
  ...PROMPT_TIMES,
  ...MACHINE_TOKENS.flatMap((token, j) => [...token].map(() => MACHINE_AT + j * MACHINE_STEP)),
];
const LAST_PROMPT = PROMPT_TIMES[PROMPT_TIMES.length - 1]!;
const FIRST_MAIN = OVERTURE_MAINS[0].at;
const DART = 0.15;
const HAMMER = 0.2;
const EPS = 1e-4;

const SHAKES: readonly (readonly [number, number])[] = [
  [PRELUDE_WORDS[1].at, 0.05],
  ...GPT_HITS.map((at, g) => [at, [0.07, 0.09, 0.16][g]!] as const),
  [OVERTURE_MAINS[1].at, 0.06],
  [KEY_CHANGE_AT, 0.05],
  [ASTRA_AT, 0.08],
  ...TUTTI_HITS.map((at, i) => [at, [0.12, 0.14, 0.2][i]!] as const),
];

interface Layout {
  readonly code: { x0: number; y: number; size: number; cw: number };
  readonly prelude: readonly WordBox[];
  readonly prompt: { x0: number; y: number; size: number; cw: number };
  readonly gpt: { lefts: readonly number[]; widths: readonly number[]; y: number; size: number };
}

function layout(f: Frame): Layout {
  const { ctx, u, cx, cy } = f;
  const codeSize = u * 0.62;
  ctx.font = font(codeSize, MONO, 500);
  const codeCw = ctx.measureText('0').width;
  const promptSize = u * 0.5;
  ctx.font = font(promptSize, MONO, 500);
  const promptCw = ctx.measureText('0').width;
  const gptSize = u * 2.5;
  ctx.font = font(gptSize, SANS, 800);
  const widths = [...'GPT'].map((c) => ctx.measureText(c).width);
  const gap = u * 0.3;
  const total = widths.reduce((sum, w) => sum + w, 0) + gap * 2;
  const lefts = widths.map((_, g) => cx - total / 2 + widths.slice(0, g).reduce((sum, w) => sum + w + gap, 0));
  return {
    code: { x0: cx - (codeCw * CODE_LINE.length) / 2, y: cy + u * 0.2, size: codeSize, cw: codeCw },
    prelude: preludeBoxes(f),
    prompt: { x0: cx - (promptCw * SENTENCE.length) / 2, y: cy + u * 1.5, size: promptSize, cw: promptCw },
    gpt: { lefts, widths, y: cy + u * 0.5, size: gptSize },
  };
}

const gptCenter = (L: Layout, g: number): Point =>
  [L.gpt.lefts[g]! + L.gpt.widths[g]! / 2, L.gpt.y - L.gpt.size * 0.36];
const hammerPoint = (L: Layout, g: number): Point =>
  [L.gpt.lefts[g]! + L.gpt.widths[g]! / 2, L.gpt.y - L.gpt.size * 0.98];
const typed = (t: number): number => latestIndex(SENTENCE_TIMES, t) + 1;
const cursorPoint = (f: Frame, L: Layout, n: number): Point =>
  [L.prompt.x0 + n * L.prompt.cw + f.u * 0.06, L.prompt.y - L.prompt.size * 0.35];

/** 主萤火在 0–8 秒的位置：分段解析式，任意时刻可直接求值；冲刺段从上一段末端出发。 */
function heroAt(f: Frame, L: Layout, t: number): Point {
  const { u } = f;
  const wobble = (p: Point): Point => [p[0] + Math.sin(t * 5.1) * u * 0.05, p[1] + Math.cos(t * 4.3) * u * 0.05];
  const dart = (from: number, to: number, target: Point): Point =>
    lerpPoint(heroAt(f, L, from - EPS), target, easeIn(ramp(from, to, t)));
  const { code } = L;
  const penY = code.y - code.size * 0.35;
  if (t < SPARK_BLINK) {
    const settle = easeOut(ramp(0, SPARK_BLINK, t));
    return wobble([code.x0 - u * (1.1 + (1 - settle) * 0.5), code.y - u * (1.2 - (1 - settle) * 0.6)]);
  }
  if (t < CODE_TIMES[0]!) return dart(SPARK_BLINK, CODE_TIMES[0]!, [code.x0, penY]);
  if (t < CODE_RISE_AT) {
    const i = latestIndex(CODE_TIMES, t);
    const p = ramp(CODE_TIMES[i]!, CODE_TIMES[i + 1] ?? CODE_RISE_AT, t);
    return [code.x0 + (i + p) * code.cw, penY - Math.sin(p * Math.PI) * code.size * 0.3];
  }
  const firstWord = PRELUDE_WORDS[0].at;
  if (t < firstWord - DART) {
    return wobble([code.x0 + CODE_LINE.length * code.cw, penY - easeOut(ramp(CODE_RISE_AT, firstWord - DART, t)) * u * 1.2]);
  }
  for (let k = 0; k < PRELUDE_WORDS.length; k++) {
    const box = L.prelude[k]!;
    const at = PRELUDE_WORDS[k]!.at;
    const start: Point = [box.left - u * 0.15, box.y - box.size * 0.75];
    if (t < at) return dart(at - DART, at, start);
    const next = PRELUDE_WORDS[k + 1]?.at;
    if (t < (next === undefined ? PRELUDE_REST : next - DART)) {
      const end: Point = [box.left + box.width + u * 0.3, box.y - box.size * 0.9];
      return wobble(lerpPoint(start, end, easeOut(ramp(at, at + 0.35, t))));
    }
  }
  if (t < CURSOR_AT) {
    return lerpPoint(heroAt(f, L, PRELUDE_REST - EPS), cursorPoint(f, L, 0), smooth(PRELUDE_REST, CURSOR_AT - 0.05, t));
  }
  if (t < GPT_HITS[0] - HAMMER) return cursorPoint(f, L, typed(t));
  for (let g = 0; g < GPT_HITS.length; g++) {
    const at = GPT_HITS[g]!;
    if (t < at) return dart(at - HAMMER, at, hammerPoint(L, g));
    const next = GPT_HITS[g + 1];
    if (next === undefined || t < next - HAMMER) {
      const [x, y] = hammerPoint(L, g);
      return [x, y - u * 0.5 * Math.sin(Math.PI * ramp(at, at + 0.3, t))];
    }
  }
  throw new Error(`intro-overture: hero path has no segment for t=${t}`);
}

function heroGlow(t: number): number {
  if (t < SPARK_BLINK) return 0.4 * ramp(0, 0.4, t);
  if (t < CODE_RISE_AT) return Math.max(0.4 + hit(t, SPARK_BLINK, 5), 0.75 + 0.4 * pulse(t, NOTE_TIMES, 7));
  if (t < PRELUDE_REST) return 0.7 + 0.45 * pulse(t, PRELUDE_WORDS.map((w) => w.at), 6);
  if (t < CURSOR_AT) return lerp(0.7, 0.12, smooth(PRELUDE_REST, PRELUDE_REST + 0.2, t)) + 0.5 * smooth(CURSOR_AT - 0.15, CURSOR_AT, t);
  return 0.8 + 0.5 * pulse(t, [...GPT_HITS], 6);
}

function drawHero(f: Frame, L: Layout): void {
  const { ctx, t, u } = f;
  if (t >= SWARM_AT) return;
  if (t >= CURSOR_AT && t < GPT_HITS[0] - HAMMER) {
    drawCursor(f, L);
    return;
  }
  const brightness = heroGlow(t);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 6; k >= 1; k--) {
    const past = t - k * 0.022;
    if (past < 0) continue;
    const [x, y] = heroAt(f, L, past);
    glow(ctx, x, y, u * 0.17 * (1 - k * 0.09), FIREFLY, brightness * 0.22 * (1 - k / 7));
  }
  const [x, y] = heroAt(f, L, t);
  glow(ctx, x, y, u * 0.5 * (0.7 + 0.3 * Math.min(1, brightness)), FIREFLY, brightness);
  ctx.restore();
}

/** 萤火停成光标：人敲字时为青色，停顿一拍时按八分音符闪烁，机器续写时变金色。 */
function drawCursor(f: Frame, L: Layout): void {
  const { ctx, t, u } = f;
  const [x] = cursorPoint(f, L, typed(t));
  const machine = t >= MACHINE_AT;
  const waiting = !machine && t >= LAST_PROMPT + 0.125;
  if (waiting && Math.floor((t - LAST_PROMPT - 0.125) / 0.125) % 2 === 1) return;
  const color = machine ? GOLD : CYAN;
  const top = L.prompt.y - L.prompt.size * 0.82;
  const height = L.prompt.size * 0.98;
  ctx.save();
  ctx.globalAlpha *= smooth(CURSOR_AT - 0.1, CURSOR_AT, t);
  ctx.fillStyle = color;
  ctx.fillRect(x, top, Math.max(2, u * 0.07), height);
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, top + height / 2, u * 0.45, machine ? GOLD : FIREFLY, 0.5);
  ctx.restore();
}

/** 开场代码：音名发光、语法字符冷却；写完后语法散去，音名化作音符升起。 */
function drawCode(f: Frame, L: Layout): void {
  const { ctx, t, u } = f;
  if (t < CODE_TIMES[0]! || t > CODE_RISE_AT + 2.3) return;
  const { code } = L;
  ctx.save();
  ctx.textAlign = 'left';
  [...CODE_LINE].forEach((char, i) => {
    const at = CODE_TIMES[i]!;
    if (t < at) return;
    const x = code.x0 + i * code.cw;
    const note = NOTE_INDEXES.indexOf(i);
    if (note < 0) {
      const dissolve = ramp(CODE_RISE_AT, CODE_RISE_AT + 0.3, t);
      if (dissolve >= 1) return;
      ctx.globalAlpha = 0.85 * (1 - dissolve);
      ctx.font = font(code.size, MONO, 500);
      ctx.fillStyle = mixHex('#e8fbff', '#6f97a3', ramp(at, at + 0.35, t));
      ctx.fillText(char, x, code.y + dissolve * u * 0.3);
      return;
    }
    const rise = CODE_RISE_AT + note * CODE_RISE_STEP;
    const center: Point = [x + code.cw / 2, code.y - code.size * 0.35];
    const age = t - rise;
    ctx.globalAlpha = 1 - ramp(0, 0.12, age);
    if (ctx.globalAlpha > 0) {
      const pop = 1 + 0.3 * hit(t, at, 10);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, center[0], center[1], code.size * 1.1, GOLD, 0.15 + 0.5 * hit(t, at, 4));
      ctx.restore();
      ctx.save();
      ctx.translate(center[0], center[1]);
      ctx.scale(pop, pop);
      label(ctx, char, 0, code.size * 0.38, code.size * 1.12, mixHex('#fff4c2', GOLD, ramp(at, at + 0.6, t)), MONO, 700);
      ctx.restore();
      ctx.textAlign = 'left';
    }
    if (age < 0) return;
    ctx.globalAlpha = ramp(0, 0.08, age) * (1 - ramp(1.3, 2.1, age));
    const nx = center[0] + Math.sin(age * 3 + note) * u * 0.3 + (note - 1.5) * u * 0.4 * age;
    const ny = center[1] - u * (1.3 * easeOut(Math.min(1, age / 0.5)) + 1.1 * age);
    label(ctx, NOTE_GLYPHS[note % NOTE_GLYPHS.length]!, nx, ny, u * 0.6, note % 2 ? '#a8e6ef' : '#efd095', 'serif');
    ctx.textAlign = 'left';
  });
  ctx.restore();
}

/** GPT 诞生：人写青色半句、机器金色补完；G、P、T 三拍重击，整句在 T 上被吸入。 */
function drawBirth(f: Frame, L: Layout): void {
  const { ctx, t, u, cx, h } = f;
  if (t < CURSOR_AT || t > FIRST_MAIN + 0.25) return;
  const tHit = GPT_HITS[2];
  ctx.save();
  ctx.translate(0, -easeIn(ramp(FIRST_MAIN, FIRST_MAIN + 0.2, t)) * h * 0.75);
  ctx.globalAlpha *= 1 - ramp(FIRST_MAIN + 0.08, FIRST_MAIN + 0.2, t);
  const [tx, ty] = gptCenter(L, 2);
  if (t < tHit) {
    const absorb = easeIn(ramp(tHit - 0.25, tHit, t));
    [...SENTENCE].forEach((char, i) => {
      const at = SENTENCE_TIMES[i]!;
      if (t < at) return;
      const human = i < PROMPT_TEXT.length;
      const accent = human && (PROMPT_NOTE_CHARS as readonly number[]).includes(i);
      const flash = hit(t, at, 8);
      const x = lerp(L.prompt.x0 + (i + 0.5) * L.prompt.cw, tx, absorb);
      const y = lerp(L.prompt.y - L.prompt.size * 0.35, ty, absorb) - (human ? 0 : flash * u * 0.12);
      ctx.save();
      ctx.globalAlpha *= 1 - absorb * 0.6;
      ctx.translate(x, y);
      ctx.scale(1 - absorb * 0.7, 1 - absorb * 0.7);
      label(ctx, char, 0, L.prompt.size * 0.35, L.prompt.size * (accent ? 1.08 : 1),
        mixHex('#ffffff', human ? CYAN : GOLD, 1 - flash), MONO, accent || !human ? 700 : 500);
      ctx.restore();
    });
  }
  if (t >= GPT_HITS[0] - 0.06) {
    const back = ctx.createRadialGradient(cx, ty, 0, cx, ty, u * 5);
    const strength = 0.08 * ramp(GPT_HITS[0], GPT_HITS[1], t) + 0.22 * pulse(t, [...GPT_HITS], 2.5);
    back.addColorStop(0, `rgba(242, 196, 109, ${strength})`);
    back.addColorStop(1, 'rgba(242, 196, 109, 0)');
    ctx.fillStyle = back;
    ctx.fillRect(cx - u * 5, ty - u * 5, u * 10, u * 10);
  }
  const beat = 1 + 0.03 * pulse(t, KICKS, 10);
  [...'GPT'].forEach((letter, g) => {
    const land = GPT_HITS[g]!;
    if (t < land - 0.06) return;
    const [lx, ly] = gptCenter(L, g);
    const s = lerp(1.9, 1, easeIn(ramp(land - 0.06, land, t))) * (1 + 0.05 * hit(t, land, 10)) * beat;
    ctx.save();
    ctx.globalAlpha *= ramp(land - 0.06, land - 0.02, t);
    ctx.translate(lx, ly);
    ctx.scale(s, s);
    ctx.shadowColor = `${GOLD}77`;
    ctx.shadowBlur = u * 0.4;
    label(ctx, letter, 0, L.gpt.size * 0.36, L.gpt.size, mixHex('#ffffff', GOLD, ramp(land, land + 0.3, t)), SANS, 800);
    ctx.restore();
    const reach = g === 2 ? 8 : 5;
    for (const delay of g === 2 ? [0, 0.08] : [0]) {
      const e = easeOut(ramp(land + delay, land + delay + 0.7, t));
      if (t >= land + delay) ring(ctx, lx, ly, u * (0.6 + e * reach), u * (0.5 + e * reach * 0.6), GOLD, 0.5 * (1 - e), Math.max(1, u * 0.05 * (1 - e)));
    }
  });
  if (t >= tHit) {
    ctx.font = font(u * 0.27, MONO, 500);
    const full = ctx.measureText(GPT_SUBTITLE).width;
    const shown = GPT_SUBTITLE.slice(0, Math.ceil(ramp(tHit, tHit + 0.3, t) * GPT_SUBTITLE.length));
    label(ctx, shown, cx - full / 2, L.prompt.y, u * 0.27, '#d9c08a', MONO, 500, 'left');
  }
  ctx.restore();
}

type MemberKind = 'split' | 'main' | 'voice';
interface Member {
  readonly kind: MemberKind;
  readonly born: number;
  readonly color: string;
  readonly seed: number;
  readonly text: string;
}

const VOICE_COLORS: Record<(typeof OVERTURE_VOICES)[number]['text'], string> = {
  'BERT': '#9ad0ff', 'GPT-2': '#f6d58a', 'GPT-3': '#f2c46d', 'DALL·E': '#ff9ec4', 'COPILOT': '#b4f08c',
  'STABLE DIFFUSION': '#ffb27a', 'MIDJOURNEY': '#c7a8ff', 'LLAMA': '#a0e7c9', 'GPT-4o': '#ffe08a', 'o1': '#e6e6ff',
  'QWEN': '#b9a6ff', 'GPT-5': '#ffd27a', 'KIMI': '#8fe0ff',
};
const SPLIT_COLORS = [FIREFLY, '#c8f08a', '#e6f59a', '#bdeb7c', '#d0f590', '#e9f7a8'] as const;

/** 乐团成员：GPT 分裂出的六只，加上每个主词（ASTRA 由星点组成，不另带萤火）和次要声部各一只。 */
const MEMBERS: readonly Member[] = [
  ...SPLIT_COLORS.map((color, i): Member => ({ kind: 'split', born: SWARM_AT, color, seed: i * 11 + 3, text: '' })),
  ...[
    ...OVERTURE_MAINS.flatMap((main, k): Member[] => (main.entry === 'constellation' ? []
      : [{ kind: 'main', born: main.at, color: MAIN_COLORS[k]!, seed: 100 + k * 13, text: main.text }])),
    ...OVERTURE_VOICES.map((voice, k): Member => ({ kind: 'voice', born: voice.at, color: VOICE_COLORS[voice.text], seed: 200 + k * 17, text: voice.text })),
  ].sort((a, b) => a.born - b.born),
];

function orbit(f: Frame, m: Member, t: number): Point {
  const s = m.seed;
  const speed = (0.28 + 0.3 * noise(s + 3)) * (noise(s + 4) < 0.5 ? -1 : 1);
  const a = noise(s + 5) * TAU + speed * t;
  return [
    f.cx + f.w * (0.3 + 0.13 * noise(s + 1)) * Math.cos(a) + Math.sin(t * 2.3 + s) * f.u * 0.12,
    f.cy + f.h * (0.25 + 0.11 * noise(s + 2)) * Math.sin(a) + Math.cos(t * 1.9 + s) * f.u * 0.1,
  ];
}

/** 次要声部的萤火带着名字沿外旋的弧线飞出画面，之后自己回到乐团的轨道。 */
function spiral(f: Frame, m: Member, age: number): Point {
  const a = m.seed * 2.39996 + 0.8 * age * (noise(m.seed) < 0.5 ? -1 : 1);
  const r = 1 + 0.55 * age * age;
  return [f.cx + f.w * 0.27 * r * Math.cos(a), f.cy + f.h * 0.24 * r * Math.sin(a)];
}

function memberBase(f: Frame, L: Layout, m: Member, t: number): Point | null {
  const age = t - m.born;
  if (m.kind === 'split') {
    if (age < 0) return null;
    const a = (m.seed / 11) * (TAU / SPLIT_COLORS.length) + 0.4;
    const [ox, oy] = hammerPoint(L, 2);
    const burst = easeOut(Math.min(1, age / 0.45)) * f.u * 2.4;
    return lerpPoint([ox + Math.cos(a) * burst, oy + Math.sin(a) * burst], orbit(f, m, t), smooth(0.3, 1.1, age));
  }
  if (m.kind === 'main') {
    if (age < -0.35) return null;
    const center: Point = [f.cx, f.cy - f.u * 0.3];
    if (age < 0) {
      const a = noise(m.seed + 6) * TAU;
      return lerpPoint([f.cx + Math.cos(a) * f.w * 0.75, f.cy + Math.sin(a) * f.h * 0.75], center, easeIn(ramp(-0.35, 0, age)));
    }
    return lerpPoint(center, orbit(f, m, t), smooth(0, 0.7, age));
  }
  if (age < 0) return null;
  return lerpPoint(spiral(f, m, age), orbit(f, m, t), smooth(0.55, 1.25, age));
}

/** 编排叠加：升上高处 → 在 ASTRA 拍点落成星位 → 接句时排成整齐的环，随齐奏重拍向外一震。 */
function memberAt(f: Frame, L: Layout, index: number, t: number, stars: readonly Point[]): Point | null {
  const m = MEMBERS[index]!;
  const base = memberBase(f, L, m, t);
  if (base === null) return null;
  let p = base;
  const s = m.seed;
  if (t >= SKY_RISE_AT) {
    const a = noise(s + 5) * TAU + 0.6 * t;
    p = lerpPoint(p, [f.cx + f.w * 0.34 * Math.cos(a), f.cy - f.h * 0.3 + f.h * 0.08 * Math.sin(a)], smooth(SKY_RISE_AT, SKY_RISE_AT + 0.6, t));
  }
  if (t >= STARS_GATHER_AT) {
    const star = stars[Math.floor(((index + 0.5) * stars.length) / MEMBERS.length)]!;
    p = lerpPoint(p, star, easeIn(ramp(STARS_GATHER_AT, ASTRA_AT, t)));
  }
  if (t >= DUET_AT) {
    const kick = 1 + 0.14 * pulse(t, [...TUTTI_HITS], 7) + 0.03 * pulse(t, KICKS, 10);
    const a = (index / MEMBERS.length) * TAU + t * 0.4;
    p = lerpPoint(p, [f.cx + f.w * 0.36 * kick * Math.cos(a), f.cy + f.h * 0.3 * kick * Math.sin(a)], smooth(DUET_AT, DUET_AT + 0.6, t));
  }
  return p;
}

/** 闪烁从各自相位渐渐同步：相位差随 SYNC 进度收拢到 0，18 秒起只在齐奏重拍上同时闪亮。 */
function memberGlow(m: Member, index: number, t: number): number {
  const lift = 0.35 * smooth(SKY_RISE_AT, SKY_RISE_AT + 0.6, t) * (1 - smooth(DUET_AT, DUET_AT + 0.5, t));
  let blink: number;
  if (t < SYNC_AT) {
    const period = t < SYNC_AT - 1 ? 0.5 : 0.25;
    const phase = t / period - noise(index * 7 + 2) * (1 - smooth(SYNC_FROM, SYNC_AT, t));
    blink = Math.exp(-(phase - Math.floor(phase)) * 5);
  } else {
    blink = pulse(t, [...TUTTI_HITS], 5) * 1.4;
  }
  return Math.min(1.4, 0.3 + 0.5 * blink + hit(t, m.born, 5) + lift);
}

function drawSwarm(f: Frame, L: Layout, stars: readonly Point[]): void {
  const { ctx, t, u } = f;
  if (t < SWARM_AT) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  MEMBERS.forEach((m, index) => {
    const head = memberAt(f, L, index, t, stars);
    if (head === null) return;
    const brightness = memberGlow(m, index, t);
    for (let k = 5; k >= 1; k--) {
      const past = memberAt(f, L, index, t - k * 0.025, stars);
      if (past !== null) glow(ctx, past[0], past[1], u * 0.15 * (1 - k * 0.12), m.color, brightness * 0.16 * (1 - k / 6));
    }
    glow(ctx, head[0], head[1], u * 0.42 * (0.7 + 0.3 * Math.min(1, brightness)), m.color, brightness * 0.85);
  });
  ctx.restore();
  ctx.save();
  MEMBERS.forEach((m) => {
    const age = t - m.born;
    if (m.kind !== 'voice' || age < 0 || age > 1.25) return;
    const [x, y] = spiral(f, m, age);
    ctx.globalAlpha = ramp(0, 0.06, age) * (1 - ramp(0.7, 1.25, age)) * 0.85;
    label(ctx, m.text, x + u * 0.22, y + u * 0.08, Math.max(10, u * 0.24), m.color, MONO, 600, 'left');
  });
  ctx.restore();
}

/** 乐团段每拍从一只萤火身上飘出一个音符，作装饰流。 */
function drawNotes(f: Frame, L: Layout): void {
  const { ctx, t, u } = f;
  if (t < SWARM_AT + 0.5 || t > KEY_CHANGE_AT + 1.6) return;
  ctx.save();
  for (let k = 0, born = SWARM_AT + 0.5; born < KEY_CHANGE_AT; k++, born += 0.5) {
    const age = t - born;
    if (age < 0 || age > 1.6) continue;
    const candidates = MEMBERS.flatMap((m, i) => (m.born <= born - 0.3 ? [i] : []));
    const index = candidates[(k * 7) % candidates.length]!;
    const origin = memberAt(f, L, index, born, []);
    if (origin === null) continue;
    ctx.globalAlpha = 0.55 * ramp(0, 0.08, age) * (1 - ramp(0.9, 1.6, age));
    label(ctx, NOTE_GLYPHS[k % NOTE_GLYPHS.length]!, origin[0] + Math.sin(age * 4 + k) * u * 0.3,
      origin[1] - u * (1.3 * age + 0.4 * age * age), u * 0.34, MEMBERS[index]!.color, 'serif');
  }
  ctx.restore();
}

/** CI 小词按 hat 的弱位从四边出现并飞出画面。 */
function drawCi(f: Frame): void {
  const { ctx, t, w, h, u } = f;
  ctx.save();
  CI_WORDS.forEach((word, i) => {
    const age = t - word.at;
    if (age < 0 || age > 0.65) return;
    const side = i % 4;
    const along = 0.18 + 0.64 * noise(i * 3.3 + 1);
    const travel = easeIn(ramp(0, 0.65, age)) * 0.3;
    const [x, y] = side === 0 ? [w * (0.07 - travel), h * along]
      : side === 1 ? [w * (0.93 + travel), h * along]
        : side === 2 ? [w * along, h * (0.08 - travel)] : [w * along, h * (0.94 + travel)];
    ctx.globalAlpha = 0.6 * ramp(0, 0.04, age) * (1 - ramp(0.3, 0.65, age));
    label(ctx, word.text, x, y, Math.max(10, u * 0.2), word.text.includes('✓') ? '#7fdc9a' : '#8aa6ad', MONO, 500);
  });
  ctx.restore();
}

/** 人与 AI 交替接句：最新的一句最亮；18 秒两边最后一句一起落向中心。 */
function drawDuet(f: Frame): void {
  const { ctx, t, w, u, cx, cy } = f;
  if (t < DUET_AT - 0.05 || t > SYNC_AT + 0.05) return;
  const newest = latestIndex(DUET_LINES.map((line) => line.at), t);
  ctx.save();
  DUET_LINES.forEach((line, i) => {
    if (t < line.at) return;
    const later = DUET_LINES.slice(i + 1).find((other) => other.who === line.who);
    const human = line.who === 'human';
    let x = human ? cx - w * 0.25 : cx + w * 0.25;
    let y = cy + u * 0.15;
    let alpha = i === newest ? 1 : 0.5;
    if (later) {
      const out = easeIn(ramp(later.at, later.at + 0.12, t));
      if (out >= 1) return;
      y -= out * u * 0.7;
      alpha *= 1 - out;
    } else {
      const merge = easeIn(ramp(SYNC_AT - 0.06, SYNC_AT, t));
      x = lerp(x, cx, merge);
      alpha *= 1 - merge * 0.7;
    }
    const pop = hit(t, line.at, 14);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(1 + pop * 0.15, 1 + pop * 0.15);
    label(ctx, line.text, 0, 0, u * 0.44, mixHex('#ffffff', human ? CYAN : GOLD, 1 - pop), MONO, 600);
    ctx.restore();
  });
  ctx.restore();
}

/** VIBE（人，青）与 CODING（AI，金）分两拍砸下，第三拍整句最强。 */
function drawTutti(f: Frame): void {
  const { ctx, t, u, cx, cy, w } = f;
  if (t < TUTTI_HITS[0] - 0.08) return;
  const size = u * 1.25;
  ctx.font = font(size, SANS, 800);
  const [first, second] = TUTTI_WORDS;
  const full = ctx.measureText(`${first} ${second}`).width;
  const left = cx - full / 2;
  const finale = hit(t, TUTTI_HITS[2], 8);
  const back = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.5);
  back.addColorStop(0, `rgba(242, 196, 109, ${0.06 + 0.16 * pulse(t, [...TUTTI_HITS], 3)})`);
  back.addColorStop(1, 'rgba(242, 196, 109, 0)');
  ctx.fillStyle = back;
  ctx.fillRect(0, 0, w, f.h);
  const parts: [string, number, number, string][] = [
    [first, left, TUTTI_HITS[0], CYAN],
    [second, left + ctx.measureText(`${first} `).width, TUTTI_HITS[1], GOLD],
  ];
  for (const [word, x, land, color] of parts) {
    if (t < land - 0.07) continue;
    const ww = ctx.measureText(word).width;
    const s = lerp(2.2, 1, easeIn(ramp(land - 0.07, land, t))) * (1 + 0.06 * hit(t, land, 9) + 0.1 * finale);
    ctx.save();
    ctx.globalAlpha *= ramp(land - 0.07, land - 0.03, t);
    ctx.translate(x + ww / 2, cy);
    ctx.scale(s, s);
    ctx.shadowColor = `${color}88`;
    ctx.shadowBlur = u * 0.4;
    label(ctx, word, 0, size * 0.36, size, mixHex('#ffffff', color, ramp(land, land + 0.3, t) - finale), SANS, 800);
    ctx.restore();
  }
  for (const at of TUTTI_HITS) {
    const e = easeOut(ramp(at, at + 0.6, t));
    if (t >= at) ring(ctx, cx, cy, w * (0.1 + e * 0.5), f.h * (0.08 + e * 0.4), at === TUTTI_HITS[2] ? '#ffffff' : GOLD, 0.45 * (1 - e), Math.max(1, u * 0.05));
  }
}

function drawTitle(f: Frame): void {
  const { ctx, t, u, cx, cy } = f;
  const { at } = OVERTURE_TITLE;
  if (t < at) return;
  ctx.save();
  ctx.globalAlpha = smooth(at, at + 0.2, t) * (1 - smooth(OVERTURE_DURATION - 0.3, OVERTURE_DURATION, t));
  spaced(ctx, OVERTURE_TITLE.text, cx, cy - u * 0.1, u * 0.6, '#e2dbcd', MONO, u * 0.3, 600);
  label(ctx, OVERTURE_TITLE.subtitle, cx, cy + u * 0.6, u * 0.22, '#a4afb2', SANS);
  ctx.restore();
}

/**
 * 序章一帧。每帧完全由 seconds 决定，可任意拖动与重播；舞台黑底由调用方清屏。
 * stageHeight 是可见舞台高度（控制栏以上），所有内容裁剪在其中。
 */
export function drawOverture(ctx: CanvasRenderingContext2D, seconds: number, width: number, stageHeight: number): void {
  if (seconds < 0 || seconds >= OVERTURE_DURATION) return;
  const u = Math.min(width / 16, stageHeight / 9);
  const f: Frame = { ctx, t: seconds, w: width, h: stageHeight, u, cx: width / 2, cy: stageHeight * 0.48 };
  const t = seconds;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, stageHeight);
  ctx.clip();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.textBaseline = 'alphabetic';
  const collapsed = OVERTURE_CUT + 0.12;
  if (t < collapsed) {
    const L = layout(f);
    const stars = t >= SKY_RISE_AT ? constellation(f).stars : [];
    const [sx, sy] = shake(t, SHAKES, u);
    ctx.save();
    ctx.translate(sx, sy);
    // 收束：萤火群与文字一起塌向中心一点。
    const fold = 1 - 0.97 * easeIn(ramp(OVERTURE_CUT, collapsed, t));
    ctx.translate(f.cx, f.cy);
    ctx.scale(fold, fold);
    ctx.translate(-f.cx, -f.cy);
    drawCode(f, L);
    drawPrelude(f, L.prelude);
    drawBirth(f, L);
    drawStarfield(f, SKY_RISE_AT + 0.5);
    drawCi(f);
    drawNotes(f, L);
    drawMains(f);
    drawConstellation(f, ASTRA_AT);
    drawDuet(f);
    drawTutti(f);
    drawHero(f, L);
    drawSwarm(f, L, stars);
    ctx.restore();
  } else {
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, f.cx, f.cy, u * 1.4 * (1 - ramp(collapsed, collapsed + 0.12, t)), '#fff4d0', 1 - ramp(collapsed, collapsed + 0.14, t));
    ctx.globalCompositeOperation = 'source-over';
  }
  drawTitle(f);
  ctx.restore();
}
