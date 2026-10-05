import { FINALE_CUES as C, FINALE_CODE, FINALE_CODE_TIMES, FINALE_NOTE_KEYS, FINALE_OPEN_MODELS, FINALE_QUESTION_TYPING, FINALE_CLAUDE_CLIMB } from '../config/intro-finale.ts';
import { INTRO_COPY } from '../config/intro-language.ts';
import { CLAUDE_MODELS, FINALE_MODELS } from '../config/intro-models.ts';
import { clamp, glow, MONO, room, SANS, seeded, SERIF, smooth, TAU, type EditionFrame } from './intro-edition-shared.ts';
import {
  CORAL, CYAN, GOLD, IVORY, STORM, STORM_VIOLET, VIOLET, constellationPoints, drawPath, envelope, hit,
  label, mix, note, ribbonPoint, star, stroke, type Point,
} from './intro-finale-geometry.ts';
import { lineage, tokenSurge } from './intro-finale-lineage.ts';
import { agiMeter, fallAt, goneAt, modelRoster, retry, storm, stormForce } from './intro-finale-storm.ts';
import { WINDOW_RECT } from './intro-story.ts';

const HITS: readonly number[] = [...C.birth, ...C.claudeClimb, C.senses, ...C.strikes, ...C.retry, C.rise, C.opus, C.astra,
  ...C.duet, ...C.tutti];
/** [拍点, 幅度 px, 衰减]：前两幕只是轻点，风暴与高潮才真正把画面震开。 */
const SHAKES: readonly (readonly [number, number, number])[] = [
  ...C.birth.map((at) => [at, 1.2, 17] as const), ...C.claudeClimb.map((at) => [at, 1.6, 17] as const), [C.senses, 2, 17],
  ...C.strikes.map((at, i) => [at, [18, 11, 13, 15][i]!, 8] as const), [C.collapse, 10, 5],
  [C.rise, 22, 5], [C.opus, 7, 9], [C.astra, 11, 8], ...C.duet.map((at) => [at, 3, 14] as const),
  ...C.tutti.map((at, i) => [at, 10 + i * 4, 7] as const),
];
/** [拍点, 强度, 衰减, 颜色]：16 秒的白闪与 24 秒的金闪是全片最强的两次。 */
const FLASHES: readonly (readonly [number, number, number, string])[] = [
  ...C.birth.map((at) => [at, .035, 20, IVORY] as const),
  ...C.strikes.flatMap((at, i) => [[at, i === 0 ? .95 : .6, i === 0 ? 6 : 12, '#efe6ff'], [at + .1, .3, 16, '#efe6ff']] as const),
  [C.collapse, .25, 5, STORM], ...C.retry.map((at) => [at, .05, 10, GOLD] as const),
  [C.rise, 1, 3, '#fff2cf'], [C.opus, .25, 8, IVORY], [C.astra, .4, 6, '#fff2cf'],
  ...C.tutti.map((at, i) => [at, .3 + i * .2, 6, '#fff2cf'] as const),
];
const climaxAt = (t: number): number => envelope(t, C.rise, C.silence, .12);
/** 120 BPM 的一拍。 */
const BEAT = .5;
/** 14 秒起冲顶（比屏息早三拍），与乐谱同一拍点。 */
const RUN = C.brink - 3 * BEAT;
/** [拍点, 推镜幅度, 衰减]：风暴四击与三记齐奏一记比一记狠，24 秒爆发推得最深。 */
const PUNCHES: readonly (readonly [number, number, number])[] = [
  ...C.strikes.map((at, i) => [at, i ? .055 : .09, 6] as const), [C.collapse, .04, 3],
  [C.rise, .15, 3.2], [C.opus, .05, 7], [C.astra, .07, 6], ...C.duet.map((at) => [at, .022, 12] as const),
  ...C.tutti.map((at, i) => [at, .08 + i * .04, 5 - i] as const),
];

/** 攀升与高潮的拍网：每拍一下，小节头加重，从拍点起指数回落。 */
function beatPulse(t: number): number {
  const grid = (from: number, to: number, beat: number, bar: number): number => t >= from && t < to
    ? Math.exp(-((t - from) % BEAT) * 10) * (Math.floor((t - from) / BEAT) % 4 ? beat : bar) : 0;
  return Math.max(grid(C.claudeClimb[0], RUN, .4, 1), grid(C.rise, C.duet[0], .5, 1));
}

/**
 * 整体镜头缩放：拍网轻推，冲顶与重敲末尾慢慢压近蓄力，重击猛推后回弹。
 * 只放大不缩小，画面边缘永远铺满。
 */
function cameraZoom(t: number): number {
  const push = t >= RUN && t < C.storm ? smooth(RUN, C.brink, t) * .05
    : t >= C.retry[3] && t < C.rise ? smooth(C.retry[3], C.rise, t) * .06 : 0;
  return 1 + Math.max(push, beatPulse(t) * .03, ...PUNCHES.map(([at, amount, decay]) => hit(t, at, decay) * amount));
}

function background(f: EditionFrame): void {
  const { ctx, width: w, height: h, seconds: t } = f;
  ctx.fillStyle = '#040709'; ctx.fillRect(0, 0, w, h);
  const intensity = smooth(2.8, 5, t) * (1 - smooth(C.silence, C.room, t)) * (1 - goneAt(t));
  const storming = t >= C.storm && t < C.rise;
  // 攀升越高画面越亮；风暴一刀切成冷紫红；高潮的金色是全片最亮的底色。
  const confidence = t < C.storm ? smooth(C.claudeClimb[0], C.brink, t) : 0;
  const climax = climaxAt(t);
  const [core, middle] = storming ? ['#3d0b2e', '#18081b'] : t >= C.rise ? ['#5a3c19', '#1f1812'] : ['#10252e', '#0c141e'];
  const haze = ctx.createRadialGradient(w * .5, h * .56, 0, w * .5, h * .56, Math.max(w, h) * .73);
  haze.addColorStop(0, core); haze.addColorStop(.43, middle); haze.addColorStop(1, '#030609');
  ctx.save(); ctx.globalAlpha = intensity * .9; ctx.fillStyle = haze; ctx.fillRect(0, 0, w, h);
  ctx.globalAlpha = intensity * confidence * .8;
  glow(ctx, w * .5, h * .5, Math.max(w, h) * .6, '#2fb8b42a');
  ctx.globalAlpha = intensity * climax;
  glow(ctx, w * .5, h * .44, Math.max(w, h) * .65, '#f8c66a38');
  for (let i = 0; i < 68; i++) {
    const depth = .5 + seeded(i + 410) * 1.5;
    const x = w * .5 + (seeded(i + 17) - .5) * w * (1 + t * .007) / depth;
    const y = h * .5 + (seeded(i + 817) - .5) * h / depth + fallAt(t, seeded(i + 29)) * h;
    ctx.globalAlpha = intensity * (.12 + .2 * Math.sin(t * .7 + i) ** 2) * (1 + climax);
    star(ctx, x, y, (.35 + .75 / depth) * (1 + climax * .6), storming ? '#d9c6ff' : IVORY);
  }
  ctx.restore();
}

export function drawFinaleScore(f: EditionFrame): void {
  const { ctx, width: w, height: h, seconds: t } = f;
  const continuation = smooth(C.silence, C.end, t);
  const alpha = smooth(2.65, 3.35, t) * mix(1, .72, continuation) * (1 - goneAt(t));
  if (alpha === 0) return;
  // GPT 信号带来第二声部；风暴撕掉之后，高潮三声部一起回来。
  const voices = t < C.senses ? 1 : t < C.rise ? 2 : 3;
  const storming = t >= C.storm && t < C.rise;
  const tear = stormForce(t); const blaze = climaxAt(t); const jolt = Math.floor(t * 20);
  const beat = t >= C.silence ? Math.exp(-((t - C.silence) % .5) * 9)
    : HITS.reduce((value, at) => Math.max(value, hit(t, at, 9)), 0);
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  for (let voice = 0; voice < voices; voice++) {
    const enters = voice === 1 && t < C.rise ? C.senses : C.rise + voice * .12;
    const entrance = voice === 0 ? 1 : smooth(enters, enters + .4, t);
    const color = storming ? [STORM, STORM_VIOLET][voice]! : t >= C.rise && voice === 0 ? GOLD : [CYAN, CORAL, VIOLET][voice]!;
    const unfold = smooth(3, 5.2, t);
    const mesh = .2 + (1 - unfold) * .8 + envelope(t, 7.2, 12.5, .8) * .55;
    // Nodes, score lines and travelling sparks share a trajectory, including when seeking.
    const point = (u: number, row: number): Point => {
      const [x, y] = ribbonPoint(u, t, w, h, voice);
      const angle = u * TAU + t * .12 + row * .15;
      const depth = row * .4;
      const perspective = 1 / (1 + depth * .75);
      const nx = w * .5 + Math.cos(angle) * w * .49 * perspective;
      const ny = h * .79 + (Math.sin(angle) * .105 - depth * .055) * h * perspective;
      const spread = Math.min(6, w * .008);
      const ripple = Math.sin(u * TAU * 7 + row * 2.1 - t * 2) * h * .014 * mesh;
      // The same neural staff folds into a narrow sky ribbon above the playable scene.
      const marchX = w * (.04 + u * .92);
      const marchY = Math.min(h * .3, 185) + Math.sin(u * TAU * 1.4 - t * .8 + voice * .7) * 17
        + (voice - 1) * 12 + (row - 2) * 3 + Math.sin(u * TAU * 7 - t * 4) * (2 + beat * 2);
      // 风暴把谱带按段撕开错位；崩塌时每段按自己的时刻坠落。
      const piece = Math.floor(u * 9) * 31 + row * 13 + voice * 7;
      const torn = tear * (seeded(jolt * 7 + piece) - .5);
      return [mix(mix(nx, x, unfold), marchX, continuation) + torn * w * .03,
        mix(mix(ny, y + (row - 2) * spread + ripple, unfold), marchY, continuation) + torn * h * .13
          + fallAt(t, seeded(piece)) * h * .9];
    };
    for (let staff = 0; staff < 5; staff++) {
      const points = Array.from({ length: 101 }, (_, i) => point(i / 100, staff));
      ctx.globalAlpha = alpha * entrance * (staff === 2 ? .6 + beat * .25 + blaze * .15 : .24 + blaze * .16);
      // shadowBlur 按每次 stroke 计算整条路径的模糊，是这一帧最贵的操作：只给主谱线发光，
      // 并把未被撕掉的各段合成一条路径一次描边，否则高潮三声部会掉到每秒个位数帧。
      ctx.shadowColor = color; ctx.shadowBlur = staff === 2 ? 7 + beat * 6 + blaze * 12 : 0;
      ctx.beginPath();
      // 断裂：风暴中随机抽掉几段谱线。
      for (let piece = 0; piece < 10; piece++) {
        if (seeded(piece * 17 + staff * 5 + voice * 3 + jolt) < tear * .45) continue;
        ctx.moveTo(points[piece * 10]![0], points[piece * 10]![1]);
        for (let i = piece * 10 + 1; i <= piece * 10 + 10; i++) ctx.lineTo(points[i]![0], points[i]![1]);
      }
      ctx.strokeStyle = color; ctx.lineWidth = (staff === 2 ? 1.4 + beat * .7 : .7) + blaze * .8; ctx.stroke();
      ctx.shadowBlur = 0;
      for (let node = 0; node < 24; node++) {
        const u = node / 23;
        const p = point(u, staff);
        const pulse = .5 + .5 * Math.sin(node * .9 + staff - t * 5);
        if (staff < 4 && node < 23) {
          ctx.globalAlpha = alpha * entrance * mesh * (.18 + pulse * .25);
          stroke(ctx, [p, point((node + 1) / 23, staff + 1)], color, .65);
        }
        ctx.globalAlpha = alpha * entrance * Math.sin(u * Math.PI) * (.35 + pulse * .6);
        star(ctx, p[0], p[1], .8 + pulse * 1.3 + beat, color);
        if (staff === 2 && node % 3 === 1) {
          ctx.globalAlpha *= unfold;
          note(ctx, p[0], p[1], Math.min(17, w * .032) * unfold * (1 + beat * .12), color,
            Math.sin(u * TAU) * .12);
        }
      }
    }
    for (let particle = 0; particle < 110; particle++) {
      const seed = particle + voice * 137;
      const u = (seeded(seed + 31) + t * (.045 + seeded(seed + 91) * .065)) % 1;
      const row = particle % 5;
      const age = (t * .65 + seeded(seed + 301)) % 1;
      const scatter = Math.sin(age * Math.PI) * (5 + seeded(seed + 401) * 25) * unfold;
      const [px, py] = point(u, row);
      const [tx, ty] = point(Math.max(0, u - .008 - beat * .01), row);
      const drift = (seeded(seed + 501) - .5) * scatter;
      ctx.globalAlpha = alpha * entrance * Math.sin(u * Math.PI) * (1 - age) * (.45 + beat * .5);
      stroke(ctx, [[tx, ty + drift], [px, py + drift]], color, .65);
      star(ctx, px, py + drift, .55 + seeded(seed + 601) * 1.25 + beat * .7,
        particle % 7 === 0 ? IVORY : color, particle % 19 === 0);
    }
    if (voice === 0) lineage(f, (u) => point(u, 2));
  }
  ctx.restore();
}

function neuralNetwork(f: EditionFrame): void {
  const { ctx, width: w, height: h, seconds: t } = f;
  const storming = t >= C.storm && t < C.rise;
  const flicker = storming ? .35 + .65 * seeded(Math.floor(t * 24) + 7) : 1;
  const alpha = smooth(C.motif[0], C.birth[0], t) * (1 - smooth(C.silence - .2, C.silence, t)) * (1 - goneAt(t)) * flicker;
  if (alpha === 0) return;
  const impact = [...HITS, ...FINALE_OPEN_MODELS.map((model) => model.at)]
    .reduce((value, at) => Math.max(value, hit(t, at, 9)), 0);
  // The score clock also drives depth and pulses, so a seek reconstructs the same image.
  const beat = Math.exp(-((t - C.motif[0]) % .5) * 9);
  const energy = Math.max(beat * .55, impact) * (1 + climaxAt(t) * .6);
  const color = t >= C.rise ? GOLD : storming ? STORM : t >= C.senses ? VIOLET : CYAN;
  const opacity = alpha * (1 - envelope(t, C.build, C.senses, .4) * .72);
  const cx = w * .5; const cy = h * mix(.79, .86, smooth(C.astra - .3, C.astra, t));
  const scale = Math.min(w, h);
  const project = (x: number, y: number, z: number): Point => {
    const perspective = 1 / (1 + z * .75);
    return [cx + x * w * .49 * perspective, cy + (y * .105 - z * .055) * h * perspective];
  };
  const layers = Array.from({ length: 8 }, (_, depth) =>
    Array.from({ length: 10 }, (_, node) => {
      const angle = node / 10 * TAU + t * .12 + depth * .15;
      return project(Math.cos(angle), Math.sin(angle), depth * .4);
    }));
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  ctx.translate(0, fallAt(t, .2) * h * .6);
  for (let depth = layers.length - 1; depth >= 0; depth--) {
    const nodes = layers[depth]!;
    const activation = Math.exp(-((t * 2 + depth * .15) % 1) * 5);
    ctx.globalAlpha = opacity * (.11 + activation * .14);
    stroke(ctx, [...nodes, nodes[0]!], color, .6);
    nodes.forEach((a, node) => {
      const b: Point = depth === layers.length - 1 ? [cx, cy] : layers[depth + 1]![node]!;
      ctx.globalAlpha = opacity * (.14 + energy * .14);
      stroke(ctx, [a, b], color, .65);
      const travel = (t * 2 + node * .17 - depth * .13 + 8) % 1;
      const tail = Math.max(0, travel - .23);
      ctx.globalAlpha = opacity * Math.sin(travel * Math.PI) * (.4 + energy * .55);
      stroke(ctx, [[mix(a[0], b[0], tail), mix(a[1], b[1], tail)],
        [mix(a[0], b[0], travel), mix(a[1], b[1], travel)]], node % 3 ? color : IVORY, 1.2);
      const radius = scale * .003 * (1 + activation) / (1 + depth * .16);
      ctx.globalAlpha = opacity * (.4 + activation * .6);
      star(ctx, a[0], a[1], radius, node % 3 ? color : IVORY);
      if (depth % 3 === 0) {
        ctx.beginPath(); ctx.arc(a[0], a[1], radius * 2.5, 0, TAU);
        ctx.lineWidth = .6; ctx.strokeStyle = color; ctx.stroke();
      }
    });
  }
  for (let ring = 0; ring < 4; ring++) {
    const radius = scale * (.055 + ring * .029) * (1 + energy * .08);
    const rotation = (ring % 2 ? -1 : 1) * t * (.25 + ring * .07);
    ctx.globalAlpha = opacity * (.58 - ring * .09);
    ctx.strokeStyle = ring % 2 ? CYAN : color; ctx.lineWidth = ring === 0 ? 1.6 : .8;
    for (let arc = 0; arc < 3; arc++) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, radius, radius * .4, (ring - 1.5) * .32,
        rotation + arc * TAU / 3, rotation + arc * TAU / 3 + 1.45);
      ctx.stroke();
    }
  }
  for (let tick = 0; tick < 40; tick++) {
    const angle = tick / 40 * TAU + t * .08;
    const r = scale * .155; const length = tick % 5 ? 3 : 8;
    ctx.globalAlpha = opacity * (tick % 5 ? .22 : .6);
    stroke(ctx, [[cx + Math.cos(angle) * r, cy + Math.sin(angle) * r * .36],
      [cx + Math.cos(angle) * (r + length), cy + Math.sin(angle) * (r + length) * .36]], color, .7);
  }
  const sphere = scale * .055;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(-.28);
  ctx.strokeStyle = color; ctx.lineWidth = .8;
  for (let meridian = 0; meridian < 6; meridian++) {
    const longitude = meridian / 6 * Math.PI + t * .35;
    ctx.globalAlpha = opacity * (.28 + .35 * Math.abs(Math.cos(longitude)));
    ctx.beginPath(); ctx.ellipse(0, 0, sphere * Math.max(.025, Math.abs(Math.cos(longitude))), sphere, 0, 0, TAU); ctx.stroke();
  }
  for (let latitude = -2; latitude <= 2; latitude++) {
    const y = latitude * sphere * .3;
    ctx.globalAlpha = opacity * .4;
    ctx.beginPath(); ctx.ellipse(0, y, Math.sqrt(sphere * sphere - y * y), sphere * .15, 0, 0, TAU); ctx.stroke();
  }
  ctx.restore();
  const beam = ctx.createLinearGradient(cx - w * .23, 0, cx + w * .23, 0);
  beam.addColorStop(0, `${color}00`); beam.addColorStop(.5, '#ffffff'); beam.addColorStop(1, `${color}00`);
  ctx.globalAlpha = opacity * (.3 + energy * .55); ctx.fillStyle = beam;
  ctx.fillRect(cx - w * .23, cy - .8, w * .46, 1.6);
  const ripple = (t * 2) % 1;
  ctx.globalAlpha = opacity * (1 - ripple) * (.2 + impact * .5);
  ctx.beginPath(); ctx.ellipse(cx, cy, scale * (.09 + ripple * .4), scale * (.025 + ripple * .09), 0, 0, TAU);
  ctx.strokeStyle = color; ctx.lineWidth = .8; ctx.stroke();
  ctx.globalAlpha = opacity;
  glow(ctx, cx, cy, scale * (.08 + energy * .025), `${color}50`);
  glow(ctx, cx, cy, scale * .025, '#ffffffa0');
  star(ctx, cx, cy, scale * (.005 + energy * .006), IVORY, true);
  ctx.restore();
}

function modelPorts(f: EditionFrame): void {
  const { ctx, width: w, height: h, seconds: t } = f;
  // 第二幕的接入标签沿谱带轮换；风暴一来就被名单一起接管（modelRoster）。
  if (t >= C.storm) return;
  const alpha = smooth(FINALE_OPEN_MODELS[0]!.at, FINALE_OPEN_MODELS[0]!.at + .18, t);
  if (alpha === 0) return;
  const narrow = w < 700;
  const elapsed = t - FINALE_OPEN_MODELS[0]!.at;
  const first = narrow ? Math.floor(elapsed) % FINALE_OPEN_MODELS.length : Math.floor(elapsed / 2.5) % 3 * 3;
  const models = FINALE_OPEN_MODELS.slice(first, first + (narrow ? 1 : 3));
  const visibility = Math.min(1, (elapsed % (narrow ? 1 : 2.5)) / .15);
  ctx.save();
  models.forEach((model, index) => {
    const u = narrow ? .5 : .16 + index * .34;
    const [x, y] = ribbonPoint(u, t, w, h, 0);
    const color = [CYAN, CORAL, VIOLET][index]!;
    const below = narrow || index === 1;
    const labelY = y + (below ? 36 : -32);
    const margin = w * (narrow ? .42 : .16);
    const labelX = Math.max(margin, Math.min(w - margin, x));
    ctx.globalAlpha = alpha * visibility * .48;
    stroke(ctx, [[x, y], [labelX, labelY + (below ? -10 : 10)]], color, .8);
    star(ctx, x, y, 2.5, color, true);
    ctx.globalAlpha = alpha * visibility * .75;
    ctx.shadowColor = '#040709'; ctx.shadowBlur = 8;
    label(ctx, model.name, labelX, labelY, Math.min(12, w * .029), w * (narrow ? .8 : .28), color, MONO);
  });
  ctx.restore();
}

function ignition(f: EditionFrame): void {
  const { ctx, width: w, height: h, seconds: t } = f;
  if (t > C.birth[0] + .15) return;
  const s = Math.min(27, w * .045); const cw = s * .602; const left = (w - FINALE_CODE.length * cw) / 2;
  const y = h * .5; const alpha = smooth(.15, C.spark, t) * (1 - smooth(2.8, C.birth[0] + .1, t));
  ctx.save(); ctx.globalAlpha = alpha;
  const x = left - s * .55 + smooth(C.spark, 2.5, t) * (FINALE_CODE.length * cw + s * .55);
  glow(ctx, x, y - s * .35, s * (1.8 + hit(t, C.spark) * 1.5), '#b4ffd938');
  star(ctx, x, y - s * .35, 1.2 + hit(t, C.spark) * 2.5, '#d9ffdf', true);
  for (let i = 0; i < FINALE_CODE.length; i++) {
    const noteIndex = FINALE_NOTE_KEYS.indexOf(i);
    const keyAt = FINALE_CODE_TIMES[i]!;
    if (t < keyAt) continue;
    // 按下回车，代码才被运行：音名在回车之后飞出成音符，其余字符散去。
    const rise = smooth(C.run + Math.max(0, noteIndex) * .06, 3.3, t);
    ctx.globalAlpha = alpha * (noteIndex < 0 ? 1 - rise : 1);
    const px = left + i * cw; const py = y - rise * h * .095;
    // 每个键按下的瞬间先亮一下，再回到代码的灰色。
    const color = noteIndex >= 0 ? GOLD : t - keyAt < .08 ? '#d9f2ee' : '#708a92';
    if (noteIndex >= 0 && rise > .3) note(ctx, px + cw * .5, py, s * .95, color, -.1);
    else label(ctx, FINALE_CODE[i]!, px, py, s, cw * 1.2, color, MONO, noteIndex < 0 ? 400 : 600, 'left');
    if (noteIndex >= 0) {
      ctx.globalAlpha = alpha * hit(t, keyAt);
      glow(ctx, px + cw * .5, py - s * .2, s * 2.8, '#f5d78148');
    }
  }
  if (t >= C.run) {
    const press = hit(t, C.run, 6);
    ctx.globalAlpha = alpha * (.35 + press * .65);
    label(ctx, '⏎', left + FINALE_CODE.length * cw + cw * .6, y, s * (1 + press * .3), cw * 2, GOLD, MONO, 600, 'left');
    ctx.globalAlpha = alpha * press;
    glow(ctx, w * .5, y, s * 6, '#f5d78130');
  }
  if (t > .65) {
    ctx.globalAlpha = alpha * .5;
    label(ctx, f.language === 'zh' ? '一个音符，一个世界。' : 'ONE NOTE. A WORLD.', w * .5, y + s * 2.1, Math.min(10, w * .022), w * .85, '#8caaa7');
  }
  ctx.restore();
}

function birth(f: EditionFrame): void {
  const { ctx, width: w, height: h, seconds: t } = f;
  if (t < C.birth[0] || t > C.question) return;
  const alpha = 1 - smooth(4.95, C.question, t); const unit = Math.min(w * .16, h * .19);
  ctx.save(); ctx.globalAlpha = alpha;
  for (let i = 0; i < 3; i++) {
    const age = t - C.birth[i]!;
    if (age < 0) continue;
    const strike = hit(t, C.birth[i]!, 10); const x = w * .5 + (i - 1) * unit * 1.04;
    const y = h * .41 - strike * h * .03;
    glow(ctx, x, y, unit * (.85 + strike * .3), '#8de9cd17');
    label(ctx, 'GPT'[i]!, x, y, unit * (1 + strike * .15), unit * 1.1, IVORY, SANS, 800);
    ctx.globalAlpha = alpha * hit(t, C.birth[i]!, 4);
    stroke(ctx, [[x, y + unit * .57], [x, h * .68]], CYAN, 1.4); ctx.globalAlpha = alpha;
  }
  ctx.globalAlpha = alpha * smooth(C.birth[2], C.birth[2] + .25, t);
  label(ctx, 'GENERATIVE PRE-TRAINED TRANSFORMER', w * .5, h * .41 + unit * .83,
    Math.min(12, w * .023), w * .84, CYAN);
  ctx.restore();
}

function conversation(f: EditionFrame): void {
  const { ctx, width: w, height: h, seconds: t } = f;
  const alpha = envelope(t, C.question, C.build, .22);
  if (alpha === 0) return;
  const phrase = f.language === 'zh' ? '我们能创造一个更美好的世界吗？' : 'Can we build a better world?';
  const typed = phrase.slice(0, Math.ceil(clamp((t - C.question) / FINALE_QUESTION_TYPING) * phrase.length));
  ctx.save(); ctx.globalAlpha = alpha;
  label(ctx, f.language === 'zh' ? '人类' : 'HUMAN', w * .1, h * .26, Math.min(11, w * .024), w * .2, CYAN, MONO, 500, 'left');
  label(ctx, typed, w * .1, h * .365, Math.min(58, w * .068), w * .83, IVORY, SERIF, 400, 'left');
  const answer = smooth(C.answer, C.answer + .25, t);
  ctx.globalAlpha *= answer;
  label(ctx, f.language === 'zh' ? '那就一起开始吧。' : 'Let’s begin, together.', w * .9, h * .49, Math.min(37, w * .06), w * .75, GOLD, SERIF, 400, 'right');
  label(ctx, 'CHATGPT', w * .9, h * .55, Math.min(11, w * .024), w * .3, '#b59e77', MONO, 400, 'right');
  ctx.restore();
}

const ROOM_LINES: readonly (readonly Point[])[] = [
  [[.1,.8],[.1,.2],[.59,.2],[.85,.07],[.85,.63],[.59,.8],[.1,.8]],
  [[.59,.2],[.59,.8]], [[.18,.31],[.41,.31],[.41,.58],[.18,.58],[.18,.31]],
  [[.295,.31],[.295,.58]], [[.18,.445],[.41,.445]],
  [[.39,.66],[.79,.66],[.92,.76],[.51,.76],[.39,.66]],
  [[.51,.76],[.51,.98]], [[.87,.76],[.87,.98]],
  [[.57,.41],[.78,.41],[.78,.62],[.57,.62],[.57,.41]],
  [[.675,.62],[.675,.66]], [[.8,.6],[.86,.6],[.88,.63],[.82,.63],[.8,.6],[.8,.65],[.82,.68],[.88,.68],[.88,.63]],
];

function architecture(f: EditionFrame): void {
  const { ctx, width: w, height: h, seconds: t } = f;
  const alpha = smooth(C.build, C.build + .5, t) * (1 - smooth(C.senses, C.senses + .8, t));
  if (alpha === 0) return;
  const rw = Math.min(w * .8, h * .82); const rh = rw * .52;
  const left = (w - rw) / 2; const top = h * .46;
  ctx.save(); ctx.globalAlpha = alpha;
  const perspective = smooth(C.build, 9, t);
  for (let i = 0; i < 13; i++) {
    ctx.globalAlpha = alpha * .085 * perspective;
    stroke(ctx, [[w * .5, h * .52], [w * (-.1 + i * .1), h * .98]], CYAN, .8);
  }
  ROOM_LINES.forEach((path, index) => {
    const begin = C.build + index * .27;
    ctx.globalAlpha = alpha * (index < 2 ? .3 : .75);
    const points = path.map(([x, y]) => [left + x * rw, top + y * rh] as const);
    drawPath(ctx, points, smooth(begin, begin + .7, t), index > 4 ? CORAL : CYAN, index < 2 ? 1 : 1.4);
  });
  // 7.5 秒只先画房间线稿，第一个型号名落在 8 秒拍点上，与音乐重拍同步。
  const climb = C.claudeClimb.findLastIndex((at) => t >= at);
  if (climb >= 0) {
    const impulse = hit(t, C.claudeClimb[climb]!, 8);
    ctx.globalAlpha = alpha;
    label(ctx, FINALE_CLAUDE_CLIMB[climb]!.toUpperCase(), w * .5, h * .285, Math.min(58, w * .079) * (1 + impulse * .05), w * .88, CORAL, SANS, 600);
    label(ctx, f.language === 'zh' ? (t < 9 ? '让语言成为运行的代码' : t < 10.5 ? '思考 · 编辑 · 运行' : '世界，从这里开始')
      : (t < 9 ? 'WORDS BECOME WORKING CODE' : t < 10.5 ? 'THINK. EDIT. RUN.' : 'A PLACE TO BEGIN.'),
      w * .5, h * .355, Math.min(12, w * .023), w * .83, '#c6b7a8');
    const snippets = ['const world = imagine();', 'world.add(light);', 'await world.build();', 'return possibility;'];
    label(ctx, snippets[climb]!, w * .5, h * .91, Math.min(15, w * .029), w * .84, '#9fb2ac');
  }
  ctx.restore();
}

function secondaryVoices(f: EditionFrame): void {
  const { ctx, width: w, height: h, seconds: t } = f;
  const words = [
    ['git push', 8.25], ['build', 9.25], ['lint', 10.25], ['CI', 11.25],
  ] as const;
  ctx.save();
  for (let i = 0; i < words.length; i++) {
    const [value, at] = words[i]!; const age = t - at;
    const alpha = envelope(t, at, at + 1.45, .18);
    if (alpha === 0) continue;
    const side = i % 2 ? .83 : .17; const x = w * (side + (i % 2 ? 1 : -1) * age * .015);
    const y = h * (.83 - age * .025);
    ctx.globalAlpha = alpha * .7;
    label(ctx, value, x, y, Math.min(12, w * .025), w * .3, i < 4 ? '#91aba8' : VIOLET);
  }
  ctx.restore();
}

function perception(f: EditionFrame): void {
  const { ctx, width: w, height: h, seconds: t } = f;
  // 风暴第一道闪电直接劈断这一屏，不做淡出。
  if (t >= C.storm) return;
  const alpha = smooth(C.senses, C.senses + .28, t);
  if (alpha === 0) return;
  const pride = smooth(C.senses, C.brink, t);
  ctx.save(); ctx.globalAlpha = alpha;
  glow(ctx, w * .5, h * .64, Math.min(w * .62, h * .48), '#6962bf20');
  for (let row = 0; row < 12; row++) {
    const points: Point[] = [];
    for (let i = 0; i <= 80; i++) {
      const u = i / 80; const taper = Math.sin(u * Math.PI);
      points.push([w * (.035 + u * .93), h * (.68 + row * .013 + Math.sin(u * TAU * 1.8 - t * 2 + row * .12) * .045 * taper)]);
    }
    ctx.globalAlpha = alpha * (.2 - row * .011); stroke(ctx, points, row % 3 ? VIOLET : CYAN, .8);
  }
  ctx.globalAlpha = alpha * .95;
  glow(ctx, w * .5, h * .27, Math.min(w, h) * (.2 + pride * .2), '#f8d79124');
  label(ctx, FINALE_MODELS.gpt.toUpperCase(), w * .5, h * .265,
    Math.min(76, w * .115) * (1 + pride * .08), w * .89, IVORY, SANS, 600);
  ctx.globalAlpha = alpha;
  label(ctx, f.language === 'zh' ? 'GPT / 下一个前沿' : 'GPT / THE NEXT FRONTIER', w * .5, h * .35, Math.min(12, w * .022), w * .86, GOLD);
  ctx.globalAlpha = alpha * smooth(C.brink - 1.5, C.brink - 1, t) * .8;
  label(ctx, f.language === 'zh' ? '全员就位。AGI，就在下一拍。' : 'EVERYONE IS ONLINE. AGI IS ONE BEAT AWAY.', w * .5, h * .42,
    Math.min(15, w * .033), w * .86, '#d9e9e3', SANS);
  ctx.globalAlpha = alpha * .35;
  label(ctx, `${f.language === 'zh' ? '伴奏' : 'SUPPORT'} · ${FINALE_MODELS.gemini}`, w * .5, h * .9,
    Math.min(11, w * .026), w * .85, '#77959e');
  ctx.restore();
}

function ascension(f: EditionFrame): void {
  const { ctx, width: w, height: h, seconds: t } = f;
  const alpha = envelope(t, C.rise, C.astra, .1);
  if (alpha === 0) return;
  const opus = t >= C.opus;
  const pulse = hit(t, opus ? C.opus : C.rise, 3); const age = t - C.rise;
  ctx.save(); ctx.globalAlpha = alpha;
  const light = ctx.createLinearGradient(0, h * .1, 0, h * .9);
  light.addColorStop(0, '#f5b38800'); light.addColorStop(.5, '#f5b38830'); light.addColorStop(1, '#f5b38800');
  ctx.fillStyle = light;
  ctx.beginPath(); ctx.moveTo(w * .46, h * .03); ctx.lineTo(w * .9, h * .93);
  ctx.lineTo(w * .1, h * .93); ctx.lineTo(w * .54, h * .03); ctx.closePath(); ctx.fill();
  // 金色光点顺着光柱往上冲，越到 Opus 越快。
  for (let i = 0; i < 130; i++) {
    const x = w * (.08 + seeded(i + 27) * .84);
    const travel = seeded(i + 54) * .62 + age * (.3 + seeded(i + 9) * .25);
    const y = h * (.86 - travel % .8);
    ctx.globalAlpha = alpha * (.25 + seeded(i) * .6);
    stroke(ctx, [[x, y], [x, y + h * .025]], i % 3 ? GOLD : IVORY, .7);
    star(ctx, x, y, .6 + seeded(i + 8) * 1.4, i % 3 ? GOLD : CYAN);
  }
  ctx.globalAlpha = alpha;
  glow(ctx, w * .5, h * .34, Math.min(w * .45, h * .4), '#f9bd6230');
  label(ctx, 'CLAUDE', w * .5, h * .215, Math.min(16, w * .033), w * .8, GOLD, MONO, 500);
  // Mythos 5.1 只通过受信任访问提供；“人人可用”的主张下，主角用同一模型的公开版 Fable 5.1。
  const model = opus ? CLAUDE_MODELS.opus55 : CLAUDE_MODELS.fable51;
  label(ctx, model.replace('Claude ', '').toUpperCase(), w * .5, h * .31, Math.min(84, w * .125) * (1 + pulse * .045), w * .9, IVORY, SANS, 600);
  label(ctx, f.language === 'zh' ? (opus ? '让想象成为世界' : '越过已知的边界') : (opus ? 'THE IDEA BECOMES A WORLD' : 'BEYOND THE KNOWN'), w * .5, h * .41,
    Math.min(18, w * .034), w * .8, GOLD);
  label(ctx, f.language === 'zh' ? (opus ? '构建 · 打磨 · 创造' : '向所有人开放的前沿模型')
    : (opus ? 'BUILD. REFINE. CREATE.' : 'FRONTIER AI, OPEN TO EVERYONE'), w * .5, h * .46,
    Math.min(11, w * .023), w * .85, '#c2ad94');
  ctx.restore();
}

function astra(f: EditionFrame): void {
  const { ctx, width: w, height: h, seconds: t } = f;
  if (t < C.astra - .3 || t > C.tutti[0] + .15) return;
  const gather = smooth(C.astra - .3, C.astra, t);
  const alpha = 1 - smooth(C.tutti[0] - .2, C.tutti[0] + .15, t);
  const pulse = hit(t, C.astra, 3.8); const span = Math.min(w * 1.13, h * 1.6);
  const centerY = h * .365;
  ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = 'screen';
  glow(ctx, w * .5, centerY + span * .09, Math.min(w, h) * (.5 + pulse * .25), '#f6be512b');
  for (let ray = 0; ray < 42; ray++) {
    const angle = seeded(ray + 100) * TAU; const length = Math.min(w, h) * (.16 + seeded(ray + 140) * .5);
    const start = length * (.2 + gather * .15); const end = length * (1 + pulse * .3);
    ctx.globalAlpha = alpha * gather * (.045 + hit(t, C.astra, 8) * .18);
    stroke(ctx, [[w * .5 + Math.cos(angle) * start, centerY + Math.sin(angle) * start],
      [w * .5 + Math.cos(angle) * end, centerY + Math.sin(angle) * end]], GOLD, .7);
  }
  const points = constellationPoints();
  for (let i = 0; i < points.length; i++) {
    const point = points[i]!;
    const targetX = w * .5 + point.x * span;
    const targetY = centerY + (point.y - .126) * span;
    const angle = seeded(i + 37) * TAU; const distance = .1 + seeded(i + 217) * .65;
    const fromX = w * (.5 + Math.cos(angle) * distance); const fromY = h * (.5 + Math.sin(angle) * distance);
    const x = mix(fromX, targetX, gather); const y = mix(fromY, targetY, gather);
    const twinkle = .83 + Math.sin(t * 4 + i * 2.3) * .17;
    ctx.globalAlpha = alpha * (.28 + gather * .72) * point.light * twinkle;
    const radius = Math.max(.5, span / 1100 * (1.3 + point.light * .9)) * (1 + pulse * .4);
    star(ctx, x, y, radius, i % 8 ? GOLD : IVORY, i % 67 === 0);
    if (i % 9 === 0 && i > 0) {
      const prev = points[i - 1]!;
      if (prev.y === point.y) {
        ctx.globalAlpha *= .3 * gather;
        stroke(ctx, [[w * .5 + prev.x * span, targetY], [targetX, targetY]], GOLD, .55);
      }
    }
  }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = alpha * smooth(C.astra, C.astra + .1, t);
  label(ctx, FINALE_MODELS.gpt.replace(/ Astra$/, '').toUpperCase(), w * .5, centerY - span * .137, Math.min(20, w * .04), w * .7, GOLD, MONO, 500);
  label(ctx, f.language === 'zh' ? '路由恢复，ASTRA 上线。' : 'ROUTE RESTORED. ASTRA ONLINE.', w * .5, centerY + span * .125,
    Math.min(11, w * .021), w * .87, '#d7c9ab');
  // 模型回来了，权利属于用它们的人。
  // 这一行正好压在环绕的谱带上，深色描底才读得清。
  ctx.globalAlpha = alpha * smooth(C.astra + .35, C.astra + .6, t);
  ctx.shadowColor = '#140d04'; ctx.shadowBlur = 10;
  label(ctx, f.language === 'zh' ? '学生 · 医生 · 开发者 · 每一个人' : 'STUDENTS · DOCTORS · BUILDERS · EVERYONE', w * .5, centerY + span * .165,
    Math.min(14, w * .03), w * .87, GOLD, MONO, 600);
  ctx.shadowBlur = 0;
  ctx.restore();
}

function duet(f: EditionFrame): void {
  const { ctx, width: w, height: h, seconds: t } = f;
  if (t < C.duet[0] || t >= C.tutti[0]) return;
  const index = C.duet.findLastIndex((at) => t >= at);
  const phrases = ['world = new Island()', 'island.grow(grass)', 'add(pelican)', 'pelican.fly()'];
  const who = index % 2 ? 'AI' : f.language === 'zh' ? '人类' : 'HUMAN'; const color = index % 2 ? GOLD : CYAN;
  const pulse = hit(t, C.duet[index]!, 10);
  ctx.save(); ctx.globalAlpha = .7 + pulse * .3;
  label(ctx, who, w * .5, h * .735, Math.min(10, w * .023), w * .4, color);
  label(ctx, phrases[index]!, w * .5, h * .785, Math.min(26, w * .05), w * .88, IVORY, MONO, 500);
  ctx.restore();
}

function tutti(f: EditionFrame): void {
  const { ctx, width: w, height: h, seconds: t } = f;
  if (t < C.tutti[0] || t >= C.silence) return;
  const index = C.tutti.findLastIndex((at) => t >= at);
  const pulse = hit(t, C.tutti[index]!, 9); const value = ['VIBE', 'CODING', 'VIBE CODING'][index]!;
  ctx.save();
  glow(ctx, w * .5, h * .42, Math.min(w, h) * (.55 + index * .12 + pulse * .2), index % 2 ? '#f9c56e30' : '#90ebd435');
  const push = 1 + pulse * (.12 + index * .06);
  const size = Math.min(index === 2 ? 84 : 118, w * (index === 2 ? .125 : .18)) * push;
  // 砸下的瞬间字被震出青、珊瑚两道残影，随拍点衰减合回一体。
  const split = pulse * size * (.08 + index * .04);
  ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = pulse * .8;
  label(ctx, value, w * .5 - split, h * .425, size, w * .91, CYAN, SANS, 800);
  label(ctx, value, w * .5 + split, h * .425, size, w * .91, CORAL, SANS, 800);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  label(ctx, value, w * .5, h * .425, size, w * .91, index === 0 ? CYAN : GOLD, SANS, 800);
  label(ctx, f.language === 'zh' ? '人类 × AI' : 'HUMAN × AI', w * .5, h * .54, Math.min(15, w * .031), w * .75, IVORY, MONO, 500);
  // 每一记放出一圈；最后一记一直放射到静默点，画面停在最亮处。
  const rings = index === 2 ? 4 : 1;
  for (let ring = 0; ring < rings; ring++) {
    const radiate = index === 2 ? ((t - C.tutti[2]) / .8 + ring / rings) % 1 : clamp((t - C.tutti[index]!) / .5);
    ctx.globalAlpha = (1 - radiate) * (.38 + index * .12);
    ctx.beginPath(); ctx.ellipse(w * .5, h * .44, w * (.18 + radiate * .5), h * (.04 + radiate * .28), 0, 0, TAU);
    ctx.lineWidth = 1 + (1 - radiate) * index * 1.5; ctx.strokeStyle = GOLD; ctx.stroke();
  }
  ctx.restore();
}

function enterRoom(f: EditionFrame): void {
  const { ctx, width: w, height: h, seconds: t } = f;
  if (t < C.silence) return;
  const dissolve = smooth(C.silence, C.silence + .16, t);
  ctx.save(); ctx.globalAlpha = dissolve; ctx.fillStyle = '#030609'; ctx.fillRect(0, 0, w, h); ctx.restore();
  const reveal = smooth(C.room, C.end, t);
  room(f, reveal);
  const scale = Math.min(w / 1672, h / 941) * .975;
  const screenX = (w - 1672 * scale) / 2 + 1230 * scale;
  const screenY = (h - 941 * scale) / 2 + 433 * scale;
  const settle = smooth(C.silence, C.room + .7, t);
  const x = mix(w * .5, screenX, settle); const y = mix(h * .445, screenY, settle);
  ctx.save(); ctx.globalAlpha = (1 - smooth(C.room + .65, C.end, t)) * dissolve;
  glow(ctx, x, y, Math.min(w, h) * (.095 - settle * .06), '#f4d19b2c');
  star(ctx, x, y, Math.max(1, 2.4 - settle), GOLD, true);
  ctx.restore();
  // 齐奏后的静音拍只留下全片的主张，房间亮起时再退场。
  const copy = INTRO_COPY[f.language];
  const slogan = smooth(C.silence + .05, C.silence + .2, t) * (1 - smooth(C.room + .45, C.room + .8, t));
  if (slogan > 0) {
    ctx.save(); ctx.globalAlpha = slogan;
    label(ctx, copy.title, w * .5, h * .64, Math.min(52, w * .075), w * .88, IVORY, SERIF);
    ctx.globalAlpha = slogan * .8;
    label(ctx, copy.rights, w * .5, h * .71, Math.min(15, w * .032), w * .86, GOLD, SANS);
    ctx.restore();
  }
  // 窗外远远闪两下：故事段的雨雪夜接着来，“序章”之后才是真正的风暴。
  const thunder = Math.max(hit(t, C.room + .45, 7), hit(t, C.room + .6, 10) * .7);
  const [wx, wy, ww, wh] = WINDOW_RECT;
  const ox = (w - 1672 * scale) / 2; const oy = (h - 941 * scale) / 2;
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = thunder * .55;
  ctx.fillStyle = '#b9c4ff'; ctx.fillRect(ox + wx * scale, oy + wy * scale, ww * scale, wh * scale);
  ctx.globalAlpha = thunder;
  const crack: readonly Point[] = [[.62, 0], [.55, .3], [.6, .38], [.5, .72]];
  stroke(ctx, crack.map(([u, v]) => [ox + (wx + u * ww) * scale, oy + (wy + v * wh) * scale] as const), '#ffffff', 1.4);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = smooth(C.room + .4, C.room + .6, t);
  label(ctx, f.language === 'zh' ? '窗外，真正的风暴才刚开始。' : 'Outside, the real storm is only just beginning.', w * .5, h * .93,
    Math.min(13, w * .03), w * .86, '#c9d2ff', SERIF);
  ctx.restore();
}

/** 24 秒金色冲击波洗掉风暴色；之后每个重拍各放一圈，齐奏越来越大。 */
function shockwaves(f: EditionFrame): void {
  const { ctx, width: w, height: h, seconds: t } = f;
  if (t < C.rise || t >= C.silence) return;
  const reach = Math.hypot(w, h) * .62;
  const waves = [[C.rise, 1, 1.1], [C.opus, .35, .8], [C.astra, .55, .9], ...C.tutti.map((at, i) => [at, .45 + i * .2, .8] as const)] as const;
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  for (const [at, strength, span] of waves) {
    const p = (t - at) / span;
    if (p < 0 || p >= 1) continue;
    const r = (1 - (1 - p) ** 3) * reach * (.55 + strength * .45);
    // 外圈的光晕用同一条路径再描一道宽而淡的边，代替 shadowBlur：大椭圆的模糊每帧要几十毫秒。
    ctx.beginPath(); ctx.ellipse(w * .5, h * .45, r, r * .64, 0, 0, TAU);
    ctx.strokeStyle = GOLD;
    ctx.globalAlpha = (1 - p) * strength * .22; ctx.lineWidth = 3 + (1 - p) * 80 * strength; ctx.stroke();
    ctx.globalAlpha = (1 - p) * strength; ctx.lineWidth = 3 + (1 - p) * 26 * strength; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(w * .5, h * .45, r * .9, r * .9 * .64, 0, 0, TAU);
    ctx.lineWidth = 1.5; ctx.strokeStyle = IVORY; ctx.stroke();
  }
  const burst = clamp((t - C.rise) / 1.3);
  if (burst < 1) {
    ctx.globalAlpha = (1 - burst) * .9;
    glow(ctx, w * .5, h * .45, reach * (.3 + burst * .7), '#ffd98a70');
    for (let ray = 0; ray < 56; ray++) {
      const angle = seeded(ray + 1700) * TAU; const length = reach * (.4 + seeded(ray + 1750) * .6);
      const head = length * (1 - (1 - burst) ** 2); const tail = Math.max(0, head - length * .35);
      ctx.globalAlpha = (1 - burst) * (.3 + seeded(ray + 1800) * .5);
      stroke(ctx, [[w * .5 + Math.cos(angle) * tail, h * .45 + Math.sin(angle) * tail * .64],
        [w * .5 + Math.cos(angle) * head, h * .45 + Math.sin(angle) * head * .64]], ray % 4 ? GOLD : IVORY, 1.6);
    }
  }
  ctx.restore();
}

/** [拍点, 强度, 衰减]：变形镜头式的横向光带只划过 24 秒爆发与三记齐奏，把全片最炸的几拍和其他重拍区分开。 */
const STREAKS: readonly (readonly [number, number, number])[] = [
  [C.rise, 1, 2.4], ...C.tutti.map((at, i) => [at, .55 + i * .2, 4.5 - i] as const),
];

function lensStreak(f: EditionFrame): void {
  const { ctx, width: w, height: h, seconds: t } = f;
  const power = Math.max(...STREAKS.map(([at, strength, decay]) => hit(t, at, decay) * strength));
  if (power < .01) return;
  const y = h * .45; const core = h * (.003 + power * .006);
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  // 把径向光晕压扁成一条横向椭圆，一次渐变就得到镜头光晕，不用模糊滤镜。
  ctx.save(); ctx.translate(w * .5, y); ctx.scale(1, .045);
  ctx.globalAlpha = power * .8; glow(ctx, 0, 0, w * (.45 + power * .35), '#ffd98ad0');
  ctx.restore();
  const band = ctx.createLinearGradient(0, 0, w, 0);
  band.addColorStop(0, '#fff6dd00'); band.addColorStop(.5, '#ffffff'); band.addColorStop(1, '#fff6dd00');
  ctx.globalAlpha = power; ctx.fillStyle = band; ctx.fillRect(0, y - core / 2, w, core);
  ctx.restore();
}

export function drawFinale(frame: EditionFrame): void {
  const { ctx, width: w, height: h, seconds: t } = frame;
  // 屏息半拍：画面定格在 99% 的那一刻，只有进度条还在闪。
  const scene = t >= C.brink && t < C.storm ? { ...frame, seconds: C.brink } : frame;
  background(scene);
  ctx.save();
  const zoom = cameraZoom(t);
  ctx.translate(w * .5, h * .5); ctx.scale(zoom, zoom); ctx.translate(-w * .5, -h * .5);
  // 风暴持续低频震颤，重敲末尾蓄力时也跟着发抖；窄屏按比例减小，避免把字甩出画面。
  const rumble = t >= C.storm && t < C.blackout ? 1.5 + stormForce(t) * 3 : t >= C.retry[3] && t < C.rise ? smooth(C.retry[3], C.rise, t) * 4 : 0;
  const shake = Math.max(rumble, ...SHAKES.map(([at, amplitude, decay]) => hit(t, at, decay) * amplitude)) * Math.min(1, w / 900);
  ctx.translate((seeded(Math.floor(t * 40) + 91) - .5) * shake * 2, (seeded(Math.floor(t * 40) + 191) - .5) * shake * 2);
  neuralNetwork(scene);
  if (t < C.silence) drawFinaleScore(scene);
  ignition(scene); birth(scene); conversation(scene); architecture(scene);
  secondaryVoices(scene); perception(scene); modelPorts(scene);
  storm(frame); retry(frame);
  shockwaves(frame); ascension(frame); tokenSurge(frame); astra(frame); duet(frame); tutti(frame); modelRoster(frame);
  if (scene !== frame) {
    ctx.save(); ctx.globalAlpha = smooth(C.brink, C.brink + .12, t) * .35; ctx.fillStyle = '#000'; ctx.fillRect(-20, -20, w + 40, h + 40); ctx.restore();
  }
  agiMeter(frame);
  ctx.restore();
  ctx.save();
  // 雷击后反相一下：白闪褪去时画面像底片一样翻过去，被劈中的感觉比再亮一层白更直接。
  // 每击只翻一次，四击间隔一秒，闪烁频率不超过每秒三次。
  if (C.strikes.some((at) => t >= at + .05 && t < at + .12)) {
    ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }
  for (const [at, strength, decay, color] of FLASHES) {
    const flash = hit(t, at, decay) * strength;
    if (flash < .001) continue;
    ctx.globalAlpha = flash; ctx.fillStyle = color; ctx.fillRect(0, 0, w, h);
  }
  // 拍网上的色彩脉冲：攀升是青色，高潮是金色，每个重拍都看得见。
  const pulse = beatPulse(t);
  if (pulse > .01) {
    ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = pulse * (t >= C.rise ? .09 : .06);
    ctx.fillStyle = t >= C.rise ? GOLD : CYAN; ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
  lensStreak(frame);
  enterRoom(frame);
  if (t >= C.silence) drawFinaleScore(frame);
}
