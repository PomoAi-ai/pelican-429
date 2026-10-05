import {
  ATTENTION_ARCS, ATTENTION_STEP, CLAUDE_ASCENT_SUBTITLE, CLAUDE_ASCENT_MODELS, CLAUDE_CLIMB, DUET_AT, OVERTURE_KICKS,
  OVERTURE_MAINS, PRELUDE_REST, PRELUDE_WORDS, type PreludeIgnition,
} from '../config/intro-overture.ts';
import {
  CORAL, GOLD, MONO, SANS, clamp01, easeIn, easeOut, font, glow, hit, label, latestIndex, letterXs, lerp,
  mixHex, noise, pulse, ramp, ring, scratchCanvas, smooth, spaced, type Frame, type Point,
} from './intro-overture-kit.ts';

/** 每个主词一种颜色，同时是带出它的萤火的颜色。 */
export const MAIN_COLORS = ['#ffe2a8', GOLD, '#5aa8ff', CORAL, '#8fb0ff', '#ffc9a3', '#e4ecff'] as const;
const KICKS = OVERTURE_KICKS.map((kick) => kick.at);

const PRELUDE_STYLE: Record<PreludeIgnition, { family: string; weight: number; scale: number; color: string }> = {
  terminal: { family: MONO, weight: 600, scale: 0.78, color: '#8de8c4' },
  drop: { family: SANS, weight: 800, scale: 0.92, color: '#6f9bff' },
  pixels: { family: SANS, weight: 800, scale: 0.9, color: '#9fe38a' },
  stones: { family: SANS, weight: 800, scale: 0.9, color: '#f4f2ea' },
  attention: { family: SANS, weight: 700, scale: 0.9, color: '#e9f1f3' },
};

export interface WordBox {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly width: number;
  readonly left: number;
}

/** 前奏词的排版：萤火的落点由它决定，因此绘制与轨迹共用同一结果。 */
export function preludeBoxes(f: Frame): WordBox[] {
  return PRELUDE_WORDS.map((word) => {
    const style = PRELUDE_STYLE[word.ignite];
    const size = f.u * style.scale;
    f.ctx.font = font(size, style.family, style.weight);
    const width = f.ctx.measureText(word.text).width;
    const x = word.x * f.w;
    return { x, y: word.y * f.h + size * 0.36, size, width, left: x - width / 2 };
  });
}

/** 从词中飞出的小号术语，沿放射方向离开。 */
export function drawTerm(f: Frame, text: string, origin: Point, born: number, seed: number): void {
  const age = f.t - born;
  if (age < 0 || age > 1.3) return;
  const angle = -Math.PI / 2 + (noise(seed) - 0.5) * 2.6;
  const distance = f.u * (1.1 + 3.4 * easeOut(age / 1.3));
  const { ctx } = f;
  ctx.save();
  ctx.globalAlpha *= ramp(0, 0.08, age) * (1 - ramp(0.7, 1.3, age)) * 0.75;
  label(ctx, text, origin[0] + Math.cos(angle) * distance * 1.4, origin[1] + Math.sin(angle) * distance,
    Math.max(10, f.u * 0.22), '#9fb7be', MONO);
  ctx.restore();
}

export function drawPrelude(f: Frame, boxes: readonly WordBox[]): void {
  PRELUDE_WORDS.forEach((word, k) => {
    const next = PRELUDE_WORDS[k + 1]?.at ?? PRELUDE_REST;
    const fadeEnd = k + 1 < PRELUDE_WORDS.length ? next + 0.18 : PRELUDE_REST + 0.4;
    if (f.t < word.at - 0.22 || f.t > fadeEnd) return;
    const box = boxes[k]!;
    const style = PRELUDE_STYLE[word.ignite];
    const { ctx } = f;
    ctx.save();
    ctx.globalAlpha *= 1 - smooth(next, fadeEnd, f.t);
    ctx.font = font(box.size, style.family, style.weight);
    ctx.textAlign = 'left';
    IGNITE[word.ignite](f, word.text, box, word.at, style.color);
    ctx.restore();
    word.terms.forEach((term, j) => drawTerm(f, term, [box.x, box.y - box.size * 0.5], word.at + 0.125 * (j + 1), k * 5 + j));
  });
}

type Ignite = (f: Frame, text: string, box: WordBox, at: number, color: string) => void;

const IGNITE: Record<PreludeIgnition, Ignite> = {
  // ELIZA：终端逐字闪现，三十二分音符一个字母，细光标随后闪烁。
  terminal(f, text, box, at, color) {
    const { ctx, t, u } = f;
    if (t < at) return;
    const count = Math.min(text.length, Math.floor((t - at) / ATTENTION_STEP) + 1);
    const shown = text.slice(0, count);
    ctx.fillStyle = color;
    ctx.fillText(shown, box.left, box.y);
    label(ctx, '>', box.left - box.size * 0.55, box.y, box.size * 0.7, '#4f8f7c', MONO, 600);
    if (count < text.length || Math.floor((t - at) / 0.125) % 2 === 0) {
      ctx.fillStyle = color;
      ctx.font = font(box.size, MONO, 600);
      ctx.fillRect(box.left + ctx.measureText(shown).width + u * 0.05, box.y - box.size * 0.78, Math.max(2, u * 0.06), box.size * 0.9);
    }
  },
  // DEEP BLUE：带重力落下，落地压扁并扬起两道尘线。
  drop(f, text, box, at, color) {
    const { ctx, t, u } = f;
    const fall = ramp(at - 0.2, at, t);
    const impact = hit(t, at, 14);
    ctx.save();
    ctx.translate(box.x, box.y - (1 - fall * fall) * u * 3);
    ctx.scale(1 + impact * 0.12, 1 - impact * 0.2);
    ctx.globalAlpha *= ramp(at - 0.2, at - 0.12, t);
    ctx.fillStyle = color;
    ctx.fillText(text, -box.width / 2, 0);
    ctx.restore();
    if (t < at) return;
    const spread = easeOut(ramp(at, at + 0.35, t));
    ctx.save();
    ctx.globalAlpha *= 0.55 * (1 - spread);
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, u * 0.03);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(box.x + side * box.width * 0.45, box.y + u * 0.08);
      ctx.lineTo(box.x + side * (box.width * 0.5 + u * 1.3 * spread), box.y + u * 0.08);
      ctx.stroke();
    }
    ctx.restore();
  },
  // ALEXNET：散落的像素向字聚合，随后分辨率按三十二分音符逐级变清晰。
  pixels(f, text, box, at, color) {
    const { ctx, t, u } = f;
    const gather = easeIn(ramp(at - 0.2, at, t));
    ctx.save();
    ctx.globalAlpha *= 0.85 * (1 - ramp(at, at + 0.15, t));
    ctx.fillStyle = color;
    for (let i = 0; i < 18; i++) {
      const from: Point = [box.x + (noise(i * 3.1) - 0.5) * u * 7, box.y + (noise(i * 5.3) - 0.5) * u * 4];
      const to: Point = [box.left + noise(i * 7.7) * box.width, box.y - noise(i * 2.9) * box.size * 0.7];
      const s = u * 0.11;
      ctx.fillRect(lerp(from[0], to[0], gather) - s / 2, lerp(from[1], to[1], gather) - s / 2, s, s);
    }
    ctx.restore();
    if (t < at) return;
    const level = Math.floor((t - at) / ATTENTION_STEP);
    if (level >= 3) {
      ctx.fillStyle = color;
      ctx.fillText(text, box.left, box.y);
      return;
    }
    const cell = box.size / [5, 9, 16][level]!;
    const height = box.size * 1.3;
    const g = scratchCanvas(box.width / cell + 2, height / cell + 1);
    g.font = font(box.size / cell, SANS, 800);
    g.fillStyle = color;
    g.fillText(text, 1, box.size / cell);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(g.canvas, box.left - cell, box.y - box.size, g.canvas.width * cell, g.canvas.height * cell);
    ctx.restore();
  },
  // ALPHAGO：字母像棋子一样黑白交替落下，每颗带一圈涟漪。
  stones(f, text, box, at, color) {
    const { ctx, t, u } = f;
    const xs = letterXs(ctx, text, box.left);
    [...text].forEach((char, i) => {
      const placed = at + i * ATTENTION_STEP / 2;
      if (t < placed) return;
      const x = xs[i]!;
      const w = ctx.measureText(char).width;
      const k = ramp(placed, placed + 0.05, t);
      const spread = easeOut(ramp(placed, placed + 0.35, t));
      ring(ctx, x + w / 2, box.y - box.size * 0.35, u * (0.2 + spread * 0.55), u * (0.2 + spread * 0.55),
        '#d8d6cc', 0.35 * (1 - spread), 1);
      ctx.save();
      ctx.translate(x + w / 2, box.y - box.size * 0.35);
      ctx.scale(lerp(1.35, 1, k), lerp(1.35, 1, k));
      if (i % 2 === 0) {
        ctx.fillStyle = color;
        ctx.fillText(char, -w / 2, box.size * 0.35);
      } else {
        ctx.fillStyle = '#0b0b0b';
        ctx.fillText(char, -w / 2, box.size * 0.35);
        ctx.strokeStyle = '#d8d6cc';
        ctx.lineWidth = Math.max(1, box.size * 0.035);
        ctx.strokeText(char, -w / 2, box.size * 0.35);
      }
      ctx.restore();
    });
  },
  // TRANSFORMER：所有字母同时出现（并行），注意力弧线按三十二分音符逐条连上。
  attention(f, text, box, at, color) {
    const { ctx, t, u } = f;
    if (t < at - 0.03) return;
    const xs = letterXs(ctx, text, box.left);
    const tops = [...text].map((c, i): Point => [xs[i]! + ctx.measureText(c).width / 2, box.y - box.size * 0.82]);
    ctx.save();
    ctx.globalAlpha *= ramp(at - 0.03, at + 0.02, t);
    const s = 1 + 0.08 * hit(t, at, 12);
    ctx.translate(box.x, box.y);
    ctx.scale(s, s);
    ctx.fillStyle = color;
    ctx.fillText(text, -box.width / 2, 0);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = Math.max(1, u * 0.03);
    ATTENTION_ARCS.forEach(([a, b], j) => {
      const start = at + j * ATTENTION_STEP;
      const p = ramp(start, start + 0.18, t);
      if (p <= 0) return;
      const from = tops[a]!;
      const to = tops[b]!;
      const lift = box.size * (0.45 + Math.abs(b - a) * 0.12);
      const control: Point = [(from[0] + to[0]) / 2, from[1] - lift];
      ctx.globalAlpha = 0.75 * (1 - 0.4 * (j / ATTENTION_ARCS.length));
      ctx.beginPath();
      ctx.moveTo(from[0], from[1]);
      for (let s2 = 1; s2 <= 16; s2++) {
        const k = (s2 / 16) * p;
        const m = 1 - k;
        ctx.lineTo(m * m * from[0] + 2 * m * k * control[0] + k * k * to[0], m * m * from[1] + 2 * m * k * control[1] + k * k * to[1]);
      }
      ctx.stroke();
      glow(ctx, from[0], from[1], u * 0.18, GOLD, 0.6);
      if (p >= 1) glow(ctx, to[0], to[1], u * 0.18, GOLD, 0.6);
    });
    ctx.restore();
  },
};

/** 主词被下一个主词推出画面的方向；最后的 ASTRA 化回萤火，不推。 */
const PUSH: readonly Point[] = [[0, 1], [0, -1], [-1, 0], [0, -1], [0, -1], [0, 1], [0, 0]];
const MAIN_SCALE = 1.05;

function mainText(index: number, t: number): string {
  const main = OVERTURE_MAINS[index]!;
  if (main.entry !== 'ascend') return main.text;
  const step = latestIndex(CLAUDE_ASCENT_MODELS.map((model) => model.at), t);
  return step < 0 ? main.text : CLAUDE_ASCENT_MODELS[step]!.text;
}

export function mainBox(f: Frame, index: number): WordBox {
  const main = OVERTURE_MAINS[index]!;
  const nominalSize = f.u * (main.entry === 'constellation' ? 1 : MAIN_SCALE);
  const weight = main.entry === 'constellation' ? 700 : 800;
  const text = mainText(index, f.t);
  f.ctx.font = font(nominalSize, SANS, weight);
  const size = nominalSize * Math.min(1, f.w * 0.8 / f.ctx.measureText(text).width);
  f.ctx.font = font(size, SANS, weight);
  const width = f.ctx.measureText(text).width;
  const y = main.entry === 'constellation' ? f.cy - f.h * 0.1 : f.cy;
  return { x: f.cx, y: y + size * 0.36, size, width, left: f.cx - width / 2 };
}

export function drawMains(f: Frame): void {
  OVERTURE_MAINS.forEach((main, k) => {
    const next = OVERTURE_MAINS[k + 1]?.at ?? DUET_AT;
    if (f.t < main.at - 0.35 || f.t > next + 0.3) return;
    const box = mainBox(f, k);
    const { ctx, w, h } = f;
    const [px, py] = PUSH[k]!;
    const shove = easeIn(ramp(next, next + 0.2, f.t));
    ctx.save();
    ctx.translate(px * shove * w * 0.75, py * shove * h * 0.75);
    ctx.globalAlpha *= main.entry === 'constellation'
      ? 1 - smooth(next, next + 0.3, f.t)
      : 1 - ramp(next + 0.08, next + 0.2, f.t);
    const beat = f.t > main.at ? 1 + 0.035 * pulse(f.t, KICKS, 10) : 1;
    ctx.translate(box.x, box.y);
    ctx.scale(beat, beat);
    ctx.translate(-box.x, -box.y);
    ctx.shadowColor = `${MAIN_COLORS[k]!}66`;
    ctx.shadowBlur = f.u * 0.25;
    ctx.font = font(box.size, SANS, main.entry === 'constellation' ? 700 : 800);
    ctx.textAlign = 'left';
    ENTRY[main.entry](f, mainText(k, f.t), box, main.at, MAIN_COLORS[k]!);
    ctx.restore();
    main.terms.forEach((term, j) => drawTerm(f, term, [box.x, box.y - box.size], main.at + 0.125 * (j + 1), 40 + k * 3 + j));
  });
}

type Entry = Ignite;

const ENTRY: Record<(typeof OVERTURE_MAINS)[number]['entry'], Entry> = {
  // CHATGPT：逐字流式输出，带金色光标，像一次对话的开始。
  stream(f, text, box, at, color) {
    const { ctx, t, u } = f;
    const xs = letterXs(ctx, text, box.left);
    let end = box.left;
    [...text].forEach((char, i) => {
      const shown = at + i * ATTENTION_STEP / 2;
      if (t < shown) return;
      const k = ramp(shown, shown + 0.08, t);
      ctx.save();
      ctx.globalAlpha *= k;
      ctx.fillStyle = mixHex('#ffffff', color, k);
      ctx.fillText(char, xs[i]!, box.y + (1 - k) * u * 0.25);
      ctx.restore();
      end = xs[i]! + ctx.measureText(char).width;
    });
    if (t >= at && t < at + 0.4) {
      ctx.fillStyle = GOLD;
      ctx.fillRect(end + u * 0.08, box.y - box.size * 0.75, Math.max(2, u * 0.06), box.size * 0.85);
    }
  },
  // GPT-4：从镜头前砸下，"GPT-" 落在拍上，"4" 晚一个十六分音符再补一击。
  slam(f, text, box, at, color) {
    const { ctx, t, u } = f;
    const head = text.slice(0, -1);
    const tailX = box.left + ctx.measureText(head).width;
    const parts: [string, number, number][] = [[head, box.left, at], [text.slice(-1), tailX, at + 0.125]];
    for (const [part, x, land] of parts) {
      if (t < land - 0.1) continue;
      const k = easeIn(ramp(land - 0.1, land, t));
      const s = lerp(2.4, 1, k);
      const pw = ctx.measureText(part).width;
      ctx.save();
      ctx.globalAlpha *= ramp(land - 0.1, land - 0.04, t);
      ctx.translate(x + pw / 2, box.y - box.size * 0.36);
      ctx.scale(s, s);
      ctx.fillStyle = mixHex('#ffffff', color, ramp(land, land + 0.25, t));
      ctx.fillText(part, -pw / 2, box.size * 0.36);
      ctx.restore();
      const e = easeOut(ramp(land, land + 0.6, t));
      ring(ctx, x + pw / 2, box.y - box.size * 0.36, u * (0.4 + e * 4), u * (0.3 + e * 2.4), color, 0.5 * (1 - e), Math.max(1, u * 0.04));
    }
  },
  // DEEPSEEK-R1：从深处浮上来，拍上与下一个八分音符各发出一次声呐脉冲。
  sonar(f, text, box, at, color) {
    const { ctx, t, u } = f;
    const rise = easeOut(ramp(at - 0.25, at, t));
    ctx.save();
    ctx.globalAlpha *= rise;
    ctx.fillStyle = mixHex('#1c3a66', color, rise);
    ctx.fillText(text, box.left, box.y + (1 - rise) * u * 1.8);
    ctx.restore();
    for (const ping of [at, at + 0.25]) {
      const e = easeOut(ramp(ping, ping + 0.6, t));
      if (t >= ping) ring(ctx, box.x, box.y - box.size * 0.36, box.width * (0.55 + e * 0.8), box.size * (0.7 + e * 1.6), color, 0.45 * (1 - e), Math.max(1, u * 0.025));
    }
  },
  // Claude Opus 4：从中间向两侧绽开、字距收拢；随后版本逐拍沿台阶向上攀升。
  bloom(f, text, box, at, color) {
    const { ctx, t, u } = f;
    const chars = [...text];
    const xs = letterXs(ctx, text, box.left);
    const middle = (chars.length - 1) / 2;
    const climbed = latestIndex(CLAUDE_CLIMB.map((step) => step.at), t) + 1;
    const step = pulse(t, CLAUDE_CLIMB.map((s) => s.at), 9);
    const lift = -u * 0.08 * climbed - u * 0.06 * step;
    const spread = u * 0.5 * (1 - easeOut(ramp(at, at + 0.4, t)));
    chars.forEach((char, i) => {
      const shown = at + Math.floor(Math.abs(i - middle)) * ATTENTION_STEP;
      if (t < shown) return;
      ctx.save();
      ctx.globalAlpha *= ramp(shown, shown + 0.1, t);
      ctx.fillStyle = mixHex('#fff1e8', color, ramp(shown, shown + 0.3, t) - step * 0.4);
      ctx.fillText(char, xs[i]! + spread * (i - middle), box.y + lift);
      ctx.restore();
    });
    CLAUDE_CLIMB.forEach((version, j) => {
      if (t < version.at) return;
      const x = f.cx - u * 3.6 + j * u * 1.8;
      const y = box.y - box.size * 1.25 - j * u * 0.42 + lift;
      const latest = j === climbed - 1;
      const pop = hit(t, version.at, 12);
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.globalAlpha *= latest ? 1 : 0.5;
      if (latest) glow(ctx, x, y - u * 0.12, u * 0.6, color, 0.35 + pop * 0.4);
      ctx.translate(x, y);
      ctx.scale(1 + pop * 0.4, 1 + pop * 0.4);
      label(ctx, version.text, 0, 0, u * 0.32, mixHex('#ffffff', color, 1 - pop), MONO, 600);
      ctx.restore();
      if (j > 0) label(ctx, '·', x - u * 0.9, y + u * 0.2, u * 0.34, `${color}88`, MONO, 600);
    });
  },
  // GEMINI 3：一对孪生字从两侧合拢，拍上合二为一，留下一层紫色色差。
  twins(f, text, box, at, color) {
    const { ctx, t, u } = f;
    const k = easeIn(ramp(at - 0.3, at, t));
    const apart = (1 - k) * u * 3.2;
    const ghost = u * (0.03 + 0.1 * hit(t, at, 6));
    ctx.save();
    ctx.globalAlpha *= 0.6 * k;
    ctx.fillStyle = '#c59bff';
    ctx.fillText(text, box.left - apart - ghost, box.y);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha *= t < at ? 0.6 * k : 1;
    ctx.fillStyle = mixHex('#ffffff', color, ramp(at, at + 0.3, t));
    ctx.fillText(text, box.left + apart, box.y);
    ctx.restore();
  },
  // Mythos 与 Opus 依次占据主位，完整型号随重音替换，避免把 Opus 误读为 Mythos 的后续版本。
  ascend(f, text, box, at, color) {
    const { ctx, t, u, h } = f;
    const rise = easeOut(ramp(at - 0.3, at, t));
    const light = hit(t, at, 1.6);
    if (t >= at) {
      ctx.save();
      ctx.shadowBlur = 0;
      const beam = ctx.createLinearGradient(0, box.y + u, 0, 0);
      beam.addColorStop(0, `${color}00`);
      beam.addColorStop(0.5, `${color}2e`);
      beam.addColorStop(1, `${color}00`);
      ctx.globalAlpha *= light;
      ctx.fillStyle = beam;
      ctx.fillRect(box.x - box.width * 0.6, 0, box.width * 1.2, box.y + u);
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha *= rise;
    const modelBeat = pulse(t, CLAUDE_ASCENT_MODELS.map((model) => model.at), 12);
    ctx.fillStyle = mixHex('#ffffff', color, ramp(at, at + 0.6, t) * (1 - modelBeat));
    ctx.translate(box.x, box.y);
    ctx.scale(1 + modelBeat * 0.05, 1 + modelBeat * 0.05);
    ctx.fillText(text, -box.width / 2, (1 - rise) * h * 0.12);
    ctx.restore();
    if (t >= CLAUDE_ASCENT_SUBTITLE.at) {
      ctx.save();
      ctx.shadowBlur = 0;
      ctx.globalAlpha *= ramp(CLAUDE_ASCENT_SUBTITLE.at, CLAUDE_ASCENT_SUBTITLE.at + 0.15, t);
      spaced(ctx, CLAUDE_ASCENT_SUBTITLE.text, box.x, box.y + u * 0.85, u * 0.28, '#f2d49a', MONO, u * 0.12, 600);
      ctx.restore();
    }
  },
  // GPT-6 ASTRA：星光色的字在主拍上亮起，星点与连线由萤火群拼出（见 drawConstellation）。
  constellation(f, text, box, at) {
    const { ctx, t } = f;
    if (t < at - 0.02) return;
    const s = 1 + 0.06 * (1 - ramp(at, at + 0.12, t));
    ctx.save();
    ctx.globalAlpha *= 0.9 * ramp(at - 0.02, at + 0.06, t);
    ctx.translate(box.x, box.y - box.size * 0.36);
    ctx.scale(s, s);
    ctx.fillStyle = mixHex('#ffffff', '#cfdcff', ramp(at, at + 0.4, t));
    ctx.fillText(text, -box.width / 2, box.size * 0.36);
    ctx.restore();
  },
};

export interface Constellation {
  readonly stars: readonly Point[];
  readonly letters: readonly number[];
  readonly edges: readonly (readonly [number, number])[];
}

let constellationCache: { key: string; value: Constellation } | undefined;

/**
 * 从字形取样星位：粗网格加确定性抖动，再把每颗星连到同一字母里最近的前一颗星，形成星座连线而不是格子。
 * 只依赖舞台尺寸，因此按尺寸缓存。
 */
export function constellation(f: Frame): Constellation {
  const key = `${f.w}x${f.h}`;
  if (constellationCache?.key === key) return constellationCache.value;
  const index = OVERTURE_MAINS.findIndex((main) => main.entry === 'constellation');
  const text = OVERTURE_MAINS[index]!.text;
  const box = mainBox(f, index);
  const height = box.size * 1.3;
  const g = scratchCanvas(box.width + 4, height);
  g.font = font(box.size, SANS, 700);
  g.fillStyle = '#fff';
  g.fillText(text, 2, box.size);
  const data = g.getImageData(0, 0, g.canvas.width, g.canvas.height).data;
  f.ctx.font = font(box.size, SANS, 700);
  const xs = letterXs(f.ctx, text, 2);
  const step = box.size * 0.15;
  const stars: Point[] = [];
  const letters: number[] = [];
  for (let y = step / 2, row = 0; y < height; y += step, row++) {
    for (let x = step / 2, col = 0; x < box.width + 4; x += step, col++) {
      const sx = Math.round(x + (noise(row * 31 + col * 7) - 0.5) * step * 0.6);
      const sy = Math.round(y + (noise(row * 13 + col * 17) - 0.5) * step * 0.6);
      if (sx < 0 || sy < 0 || sx >= g.canvas.width || sy >= g.canvas.height) continue;
      if (data[(sy * g.canvas.width + sx) * 4 + 3]! < 140) continue;
      stars.push([box.left - 2 + sx, box.y - box.size + sy]);
      letters.push(latestIndex(xs, sx));
    }
  }
  const edges: [number, number][] = [];
  stars.forEach((star, i) => {
    let best = -1;
    let bestDistance = step * 1.9;
    for (let j = 0; j < i; j++) {
      if (letters[j] !== letters[i]) continue;
      const d = Math.hypot(star[0] - stars[j]![0], star[1] - stars[j]![1]);
      if (d < bestDistance) {
        bestDistance = d;
        best = j;
      }
    }
    if (best >= 0) edges.push([best, i]);
  });
  const value = { stars, letters, edges };
  constellationCache = { key, value };
  return value;
}

/** 星座：星点在主拍上亮起，连线按字母以三十二分音符依次画出；16 秒起随萤火散回。 */
export function drawConstellation(f: Frame, at: number): void {
  const { ctx, t, u } = f;
  if (t < at - 0.1 || t > DUET_AT + 0.4) return;
  const { stars, letters, edges } = constellation(f);
  const fade = ramp(at - 0.1, at + 0.05, t) * (1 - smooth(DUET_AT, DUET_AT + 0.35, t));
  ctx.save();
  ctx.globalAlpha *= fade;
  ctx.save();
  ctx.globalAlpha *= 0.4;
  ctx.strokeStyle = '#b9c8ff';
  ctx.lineWidth = Math.max(1, u * 0.02);
  ctx.beginPath();
  for (const [a, b] of edges) {
    const p = ramp(at + letters[b]! * ATTENTION_STEP, at + letters[b]! * ATTENTION_STEP + 0.15, t);
    if (p <= 0) continue;
    const from = stars[a]!;
    const to = stars[b]!;
    ctx.moveTo(from[0], from[1]);
    ctx.lineTo(lerp(from[0], to[0], p), lerp(from[1], to[1], p));
  }
  ctx.stroke();
  ctx.restore();
  ctx.globalCompositeOperation = 'lighter';
  stars.forEach((star, i) => {
    const twinkle = 0.55 + 0.45 * Math.sin(t * 7 + i * 1.7);
    glow(ctx, star[0], star[1], u * 0.12, '#cfdcff', twinkle * clamp01(0.4 + hit(t, at, 3)));
  });
  ctx.restore();
}

/** 星空背景：Claude 升华段渐显的细小星点。 */
export function drawStarfield(f: Frame, from: number): void {
  const { ctx, t, w, h, u } = f;
  if (t < from || t > DUET_AT + 0.4) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= smooth(from, from + 0.5, t) * (1 - smooth(DUET_AT, DUET_AT + 0.35, t));
  for (let i = 0; i < 60; i++) {
    const twinkle = 0.5 + 0.5 * Math.sin(t * (3 + noise(i * 9) * 4) + i * 2.3);
    glow(ctx, noise(i * 3.7) * w, noise(i * 6.1) * h * 0.72, u * (0.05 + noise(i) * 0.06), '#cfdcff', 0.5 * twinkle);
  }
  ctx.restore();
}
