import {
  backdrop, clamp, glow, line, MONO, room, seeded, SERIF, smooth, TAU, text,
  type EditionFrame,
} from './intro-edition-shared.ts';
import { CLAUDE_MODELS, claudeMilestoneAt } from '../config/intro-models.ts';

const ROUTES = [
  { at: 0, name: 'GPT', code: 'complete("hello")', color: '#bcfa83' },
  { at: .22, name: 'ChatGPT', code: 'conversation.next()', color: '#adffbd' },
  { at: .3, name: CLAUDE_MODELS.sonnet35, code: 'read → think → write', color: '#ffd1a1' },
  { at: .36, name: CLAUDE_MODELS.opus45, code: 'compose(world)', color: '#ffc197' },
  { at: .42, name: CLAUDE_MODELS.opus46, code: 'Claude Code / build.world()', color: '#ffb986' },
  { at: .54, name: CLAUDE_MODELS.opus48, code: 'think / edit / run', color: '#ffa978' },
  { at: .57, name: 'Gemini 3', code: 'see / hear / reason', color: '#a5cbff' },
  { at: .66, name: CLAUDE_MODELS.mythos51, code: 'imagine / reason / create', color: '#ffd0b8' },
  { at: .71, name: CLAUDE_MODELS.opus55, code: 'a world takes shape', color: '#ffd0b8' },
  { at: .81, name: 'MANY MINDS', code: 'DeepSeek · Llama · Qwen', color: '#eeffd9' },
] as const;

function fitted(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, maxWidth: number,
  color: string, font = MONO, align: CanvasTextAlign = 'center'): void {
  ctx.font = `${size}px ${font}`;
  const actual = Math.min(size, size * maxWidth / ctx.measureText(value).width);
  text(ctx, value, x, y, actual, color, font, align);
}

function currentRoute(progress: number): (typeof ROUTES)[number] {
  return ROUTES.findLast((entry) => entry.at <= progress)!;
}

function cursor(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  glow(ctx, x, y, size * 4, `${color}65`);
  ctx.fillStyle = color;
  ctx.fillRect(x - size * .22, y - size, size * .44, size * 2);
}

function relayTextLane(frame: EditionFrame): void {
  const { ctx, width: w, height: h, progress: p, seconds: s } = frame;
  const enter = smooth(0, .14, p);
  const mid = h * .49;
  const type = 'hello, intelligence.';
  const size = Math.min(42, w * .054);
  const x = w * .1;
  const typed = type.slice(0, Math.floor(enter * type.length));
  glow(ctx, w * .5, mid, w * .42, '#a6ff631b');
  text(ctx, typed, x, mid, size, '#d9ffc0');
  ctx.font = `${size}px ${MONO}`;
  cursor(ctx, x + ctx.measureText(typed).width + size * .35, mid - size * .35, size * .55, '#c2ff87');
  line(ctx, [[x, mid + size], [w * (.1 + enter * .81), mid + size]], '#a2fb646b', 2);
  for (let i = 0; i < 9; i++) {
    const q = (s * .14 + i / 9) % 1;
    ctx.fillStyle = `rgba(192,255,139,${.5 * q})`;
    ctx.fillRect(x + q * w * .8, mid + size - 2, 3 + q * 5, 4);
  }
  text(ctx, 'ONE CURSOR. AN OPEN ROAD.', x, mid + size * 2.8, Math.min(14, w * .027), '#81ad76');
}

function relayCircuit(frame: EditionFrame): void {
  const { ctx, width: w, height: h, progress: p, seconds: s } = frame;
  const route = currentRoute(p);
  const focusX = w * .5;
  const horizon = h * .37;
  const depth = smooth(.24, .65, p);
  const rush = s * (.1 + p * .28);
  glow(ctx, focusX, horizon, Math.min(w, h) * .62, '#8dcc631a');
  for (let lane = -4; lane <= 4; lane++) {
    const farX = focusX + lane * w * .016;
    const nearX = focusX + lane * w * .27;
    const jog = lane % 2 === 0 ? 1 : -1;
    line(ctx, [[farX, horizon], [farX + lane * w * .045, h * .53],
      [nearX + jog * w * .055, h * .77], [nearX, h * .82], [nearX, h * 1.06]],
    lane === 0 ? '#c3ff82' : '#4c7a42', lane === 0 ? 3 : 1);
  }
  for (let i = 0; i < 22; i++) {
    const z = ((i / 22 + rush) % 1) ** 2;
    const y = horizon + z * h * .7;
    const span = w * (.03 + z * .93);
    line(ctx, [[focusX - span, y], [focusX + span, y]], `rgba(142,220,93,${.08 + z * .32})`, .5 + z);
  }
  for (let i = 0; i < 34; i++) {
    const lane = i % 7 - 3;
    const z = ((i / 34 + rush * (1 + i % 3 * .03)) % 1) ** 2;
    const x = focusX + lane * w * (.016 + z * .25);
    const y = horizon + z * h * .68;
    ctx.fillStyle = lane < 0 ? '#c0ff8a' : route.color;
    ctx.globalAlpha = .18 + z * .72;
    ctx.fillRect(x, y, 2 + z * 6, 3 + z * 24);
  }
  ctx.globalAlpha = 1;
  const side = Math.sin(s * 1.3) * w * .1 * depth;
  const cy = h * (.76 - Math.sin(s * .7) * .025);
  line(ctx, [[focusX, horizon], [focusX + side * .6, h * .58], [focusX + side, cy]], '#c9ffbd', 2);
  cursor(ctx, focusX + side, cy, Math.min(16, w * .027), route.color);
  const titleSize = Math.min(58, w / (route.name.length * .68 + 3));
  fitted(ctx, route.name, focusX, h * .21, titleSize, w * .88, route.color);
  text(ctx, route.code, focusX, h * .29, Math.min(17, w * .032), '#b2caae', MONO, 'center');
  const labels = ['TOKEN', 'CONTEXT', 'FUNCTION', 'COMMIT', 'BUILD'];
  labels.forEach((label, i) => {
    const phase = (i / labels.length + rush * .42) % 1;
    const sideX = (i % 2 === 0 ? -1 : 1) * w * (.12 + phase * .3);
    ctx.globalAlpha = Math.sin(phase * Math.PI) * .6;
    text(ctx, label, focusX + sideX, horizon + phase * h * .45, 8 + phase * 13, '#a7c692', MONO, 'center');
  });
  ctx.globalAlpha = 1;
}

function relayPerception(frame: EditionFrame): void {
  const { ctx, width: w, height: h, progress: p, seconds: s } = frame;
  const cx = w * .5;
  const cy = h * .52;
  const route = currentRoute(p);
  const radius = Math.min(w * .38, h * .4);
  for (let i = 0; i < 9; i++) {
    const z = (i / 9 + s * .19) % 1;
    const r = radius * (.1 + z * 1.6);
    ctx.beginPath(); ctx.ellipse(cx, cy, r, r * .66, -.14, 0, TAU);
    ctx.strokeStyle = `rgba(159,206,255,${(1 - z) * .46})`; ctx.lineWidth = .5 + z * 2; ctx.stroke();
  }
  for (let lane = 0; lane < 3; lane++) {
    const y = cy + (lane - 1) * radius * .43;
    ctx.beginPath();
    for (let i = 0; i <= 100; i++) {
      const x = i / 100 * w;
      const envelope = Math.sin(i / 100 * Math.PI);
      const wave = Math.sin(x / w * 24 + s * 5 + lane) * radius * .1 * envelope;
      if (i === 0) ctx.moveTo(x, y + wave); else ctx.lineTo(x, y + wave);
    }
    ctx.strokeStyle = ['#a8d2ff', '#baff80', '#ffc09e'][lane]!; ctx.lineWidth = 2; ctx.stroke();
    const q = (s * .3 + lane / 3) % 1;
    cursor(ctx, q * w, y + Math.sin(q * 24 + s * 5 + lane) * radius * .1 * Math.sin(q * Math.PI), 6 + q * 7, route.color);
  }
  const size = Math.min(56, w / (route.name.length * .7 + 2));
  fitted(ctx, route.name, cx, h * .16, size, w * .88, route.color);
  text(ctx, route.code, cx, h * .24, Math.min(17, w * .034), '#a5c8b8', MONO, 'center');
  text(ctx, 'GEMINI 3 · TEXT / VISION / SOUND', cx, h * .9, Math.min(16, w * .028), '#a5cbff', MONO, 'center');
  for (let i = 0; i < 26; i++) {
    const a = seeded(i) * TAU;
    const z = (s * .4 + seeded(i + 60)) % 1;
    const inner = radius * (.35 + z);
    const outer = inner + z * radius * .25;
    line(ctx, [[cx + Math.cos(a) * inner, cy + Math.sin(a) * inner * .7],
      [cx + Math.cos(a) * outer, cy + Math.sin(a) * outer * .7]], '#7cad9855', 1);
  }
  const finish = smooth(.75, .78, p) * (1 - smooth(.9, .95, p));
  ctx.save(); ctx.globalAlpha = finish;
  glow(ctx, cx, h * .38, radius * 1.2, '#ffd77625');
  line(ctx, [[w * .12, h * .74], [w * .12, h * .34], [w * .88, h * .34], [w * .88, h * .74]], '#efc979', 2);
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = i % 2 ? '#bf995655' : '#ffe2a8';
    ctx.fillRect(w * (.12 + i * .76 / 24), h * .34 - 6, w * .76 / 24, 6);
  }
  text(ctx, 'GPT-6 ASTRA', cx, h * .45, Math.min(42, w * .07), '#ffe7a5', MONO, 'center');
  ctx.restore();
}

function relayArrival(frame: EditionFrame): void {
  const { ctx, width: w, height: h, progress: p } = frame;
  const q = smooth(.9, 1, p);
  room(frame, q);
  const scale = Math.min(w / 1672, h / 941) * .975;
  const targetX = (w - 1672 * scale) / 2 + 1220 * scale;
  const targetY = (h - 941 * scale) / 2 + 409 * scale;
  ctx.globalAlpha = 1 - smooth(.975, 1, p);
  cursor(ctx, w * .5 + (targetX - w * .5) * q, h * .52 + (targetY - h * .52) * q,
    Math.max(2, (1 - q) * 16), '#d1ff97');
  ctx.globalAlpha = 1;
}

export function drawRelay(frame: EditionFrame): void {
  const { ctx, progress: p } = frame;
  ctx.save(); backdrop(frame);
  if (p === 1) { room(frame, 1); ctx.restore(); return; }
  ctx.globalAlpha = 1 - smooth(.9, .985, p);
  if (p < .23) relayTextLane(frame);
  else if (p < .66) relayCircuit(frame);
  else relayPerception(frame);
  ctx.globalAlpha = 1;
  if (p >= .9) relayArrival(frame);
  ctx.restore();
}

function tideDepth(frame: EditionFrame): void {
  const { ctx, width: w, height: h, seconds: s } = frame;
  const ocean = ctx.createLinearGradient(0, 0, 0, h);
  ocean.addColorStop(0, '#02131f'); ocean.addColorStop(.55, '#0a3c50'); ocean.addColorStop(1, '#020e1c');
  ctx.fillStyle = ocean; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 32; i++) {
    const x = seeded(i + 70) * w;
    const y = (seeded(i + 20) * h - s * (3 + i % 4) + h * 4) % h;
    ctx.fillStyle = `rgba(133,226,230,${.07 + seeded(i) * .23})`;
    ctx.beginPath(); ctx.arc(x, y, 1 + seeded(i + 33) * 1.5, 0, TAU); ctx.fill();
  }
  glow(ctx, w * .5, h * .4, Math.max(w, h) * .52, '#4cbaca22');
}

function tideBirth(frame: EditionFrame): void {
  const { ctx, width: w, height: h, progress: p, seconds: s } = frame;
  const q = smooth(0, .12, p);
  const dropY = h * (.13 + q * .4);
  if (p < .13) {
    text(ctx, 'g', w * .5, dropY, Math.min(60, w * .13), '#e5fff4', SERIF, 'center');
    glow(ctx, w * .5, dropY - 15, 70, '#71e5ea22');
  }
  const ripple = smooth(.1, .3, p);
  for (let i = 0; i < 8; i++) {
    const r = (ripple * 1.4 - i * .11) * w * .51;
    if (r <= 0) continue;
    ctx.beginPath(); ctx.ellipse(w * .5, h * .54, r, r * .23, -.05, 0, TAU);
    ctx.strokeStyle = `rgba(140,247,235,${.52 - i * .055})`; ctx.lineWidth = i === 0 ? 2 : .7; ctx.stroke();
  }
  if (p > .13) {
    ctx.globalAlpha = smooth(.13, .19, p);
    text(ctx, 'GPT', w * .5, h * .39, Math.min(100, w * .19), '#d7fff0', SERIF, 'center');
    text(ctx, 'A WORD ENTERS THE WATER', w * .5, h * .78, Math.min(14, w * .032), '#7bb6bb', MONO, 'center');
    ctx.globalAlpha = 1;
  }
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * TAU + s * .08;
    const r = ripple * w * .32;
    ctx.globalAlpha = ripple * .65;
    text(ctx, ['hello', 'language', 'context', '♪'][i % 4]!, w * .5 + Math.cos(a) * r,
      h * .54 + Math.sin(a) * r * .23, Math.min(13, w * .024), '#affff0', MONO, 'center');
  }
  ctx.globalAlpha = 1;
}

function tideWaveY(x: number, layer: number, frame: EditionFrame): number {
  const { width: w, height: h, progress: p, seconds: s } = frame;
  const height = (.016 + smooth(.29, .87, p) * .055) * h;
  return h * (.38 + layer * .067) + Math.sin(x / w * 7 + s * .8 + layer * .52) * height
    + Math.sin(x / w * 13 - s * .47 + layer * .22) * height * .24;
}

function tidePolyphony(frame: EditionFrame): void {
  const { ctx, width: w, height: h, progress: p, seconds: s } = frame;
  const union = smooth(.65, .88, p);
  const sunrise = smooth(.73, .79, p);
  ctx.save(); ctx.globalAlpha = sunrise;
  const sunX = w * .76; const sunY = h * (.41 - sunrise * .09);
  const sunR = Math.min(w * .13, h * .15);
  glow(ctx, sunX, sunY, sunR * 2.6, '#f3c26642');
  const sunlight = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
  sunlight.addColorStop(0, '#fff0bc'); sunlight.addColorStop(1, '#ce913b44');
  ctx.fillStyle = sunlight; ctx.beginPath(); ctx.arc(sunX, sunY, sunR, 0, TAU); ctx.fill();
  ctx.restore();
  for (let layer = 10; layer >= 0; layer--) {
    ctx.beginPath();
    for (let i = 0; i <= 96; i++) {
      const x = i / 96 * w;
      const y = tideWaveY(x, layer, frame);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = layer % 3 === 0 ? '#9dd8f093' : '#67d5d147';
    ctx.lineWidth = layer % 3 === 0 ? 1.8 : .6; ctx.stroke();
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
    ctx.fillStyle = `rgba(19,115,134,${.025 + layer * .004})`; ctx.fill();
  }
  const claude = claudeMilestoneAt(p);
  const terms = p < .52 ? [claude, 'function', 'reason', 'build', 'Claude Code']
    : p < .64 ? ['Gemini 3', 'TEXT', 'VISION', 'AUDIO', claude, 'DeepSeek', 'Qwen', 'Llama']
      : [claude, 'IMAGINE', 'CREATE', 'AUDIO', 'Gemini 3', 'DeepSeek', 'Qwen', 'Llama'];
  for (let i = 0; i < terms.length; i++) {
    const x = w * (.13 + ((i * .173 + s * .016) % .75));
    const layer = i % 8 + 1;
    const y = tideWaveY(x, layer, frame);
    ctx.save(); ctx.translate(x, y - 9);
    ctx.rotate(Math.cos(x / w * 7 + s * .8 + layer * .52) * .08);
    fitted(ctx, terms[i]!, 0, 0, Math.min(i === 0 ? 22 : 14, w * (i === 0 ? .044 : .028)),
      Math.min(x, w - x) * 1.7, i === 0 ? '#d9fff2' : '#87cbd0'); ctx.restore();
  }
  const title = p < .52 ? 'THOUGHT FINDS FORM' : p < .64 ? 'THE WORLD ANSWERS' : p < .76 ? 'IMAGINATION FINDS FORM' : 'EVERY VOICE, AN OCEAN';
  text(ctx, title, w * .5, h * .19, Math.min(30, w * .046), '#d6f2e9', SERIF, 'center');
  if (p >= .52) {
    const r = Math.min(w * .28, h * .26);
    ctx.save(); ctx.translate(w * .5, h * .43); ctx.rotate(s * .09);
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * (.24 + i * .06), i / 3 * Math.PI, 0, TAU);
      ctx.strokeStyle = `rgba(167,209,255,${.28 + union * .17})`; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }
  for (let i = 0; i < 36; i++) {
    const x = ((seeded(i) + s * .006 * (1 + i % 3)) % 1) * w;
    const y = tideWaveY(x, i % 10, frame);
    text(ctx, ['♪', '{', '}', '♫', 'λ'][i % 5]!, x, y - 4, 10 + seeded(i + 11) * 9,
      i % 3 === 0 ? '#d1f2ecb0' : '#75cac577', MONO, 'center');
  }
  ctx.save(); ctx.globalAlpha = sunrise * (1 - smooth(.91, .97, p));
  text(ctx, 'GPT-6 ASTRA', w * .89, h * .3, Math.min(31, w * .055), '#ffe4a4', SERIF, 'right');
  for (let i = 0; i < 14; i++) {
    const y = h * (.43 + i * .034);
    const span = w * (.017 + i * .004) * (1 + Math.sin(s * .8 + i) * .3);
    line(ctx, [[sunX - span, y], [sunX + span, y]], `rgba(255,210,124,${.35 - i * .021})`, 1.7);
  }
  ctx.restore();
}

function tideGlass(frame: EditionFrame): void {
  const { ctx, width: w, height: h, progress: p, seconds: s } = frame;
  const q = smooth(.9, 1, p);
  ctx.save(); ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i <= 80; i++) {
    const x = i / 80 * w;
    const y = h * (1 - q) + Math.sin(i / 80 * 10 + s) * h * .035 * Math.sin(q * Math.PI);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h); ctx.closePath(); ctx.clip(); room(frame, 1); ctx.restore();
  ctx.globalAlpha = (1 - q) * .35;
  for (let i = 0; i < 45; i++) {
    const x = seeded(i + 190) * w;
    const y = (seeded(i + 70) * h + s * 60) % h;
    line(ctx, [[x, y], [x - 4, y + 14]], '#c6ecff', 1);
  }
  ctx.globalAlpha = 1;
}

export function drawTides(frame: EditionFrame): void {
  const { ctx, progress: p } = frame;
  ctx.save(); tideDepth(frame);
  if (p < .3) tideBirth(frame); else tidePolyphony(frame);
  if (p >= .9) tideGlass(frame);
  ctx.restore();
}

function gear(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rotation: number, color: string): void {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.beginPath();
  const teeth = 18;
  for (let i = 0; i < teeth * 4; i++) {
    const a = i / (teeth * 4) * TAU;
    const radius = r * (i % 4 < 2 ? 1 : .9);
    if (i === 0) ctx.moveTo(Math.cos(a) * radius, Math.sin(a) * radius);
    else ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
  }
  ctx.closePath(); ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.stroke();
  for (const scale of [.34, .68]) {
    ctx.beginPath(); ctx.arc(0, 0, r * scale, 0, TAU); ctx.stroke();
  }
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * TAU;
    line(ctx, [[Math.cos(a) * r * .34, Math.sin(a) * r * .34],
      [Math.cos(a) * r * .68, Math.sin(a) * r * .68]], color, 2);
  }
  ctx.restore();
}

function compilerSeed(frame: EditionFrame): void {
  const { ctx, width: w, height: h, progress: p, seconds: s } = frame;
  const radius = Math.min(w * .2, h * .24);
  gear(ctx, w * .5, h * .43, radius, s * .17, '#dca95c');
  text(ctx, '{ }', w * .5, h * .45, radius * .43, '#ffe4a3', MONO, 'center');
  const command = 'import intelligence';
  text(ctx, command.slice(0, Math.floor(smooth(.015, .16, p) * command.length)), w * .5, h * .78,
    Math.min(24, w * .047), '#e7d7b6', MONO, 'center');
  text(ctx, 'GPT  →  ChatGPT', w * .5, h * .87, Math.min(14, w * .031), '#9d9078', MONO, 'center');
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU;
    const phase = (s * .25 + i / 12) % 1;
    const r = radius * (1.8 - phase * .75);
    ctx.globalAlpha = Math.sin(phase * Math.PI) * .65;
    text(ctx, ['(', ')', ';', '♪'][i % 4]!, w * .5 + Math.cos(a) * r,
      h * .43 + Math.sin(a) * r, 15, '#efc471', MONO, 'center');
  }
  ctx.globalAlpha = 1;
}

function compilerFactory(frame: EditionFrame): void {
  const { ctx, width: w, height: h, progress: p, seconds: s } = frame;
  const cx = w * .5;
  const cy = h * .43;
  const r = Math.min(w * .23, h * .25);
  const tempo = 2 + p * 3;
  glow(ctx, cx, cy, r * 2, '#e8a62c12');
  gear(ctx, cx, cy, r, s * .45, '#d9ab5c');
  gear(ctx, cx - r * 1.36, cy + r * .32, r * .48, -s * .93, '#927b56');
  gear(ctx, cx + r * 1.4, cy - r * .29, r * .52, -s * .86, '#c19b63');
  const claude = claudeMilestoneAt(p);
  const build = p >= .5 && p < .59 ? 'GEMINI 3' : claude;
  fitted(ctx, build, cx, h * .12, Math.min(34, w / (build.length * .65 + 2)), w * .88, '#ffd891');
  fitted(ctx, p < .49 ? 'READ → REASON → WRITE' : p < .63 ? `${claude} / COMPILE` : 'IMAGINE → BUILD → RUN', cx, h * .2,
    Math.min(14, w * .031), w * .88, '#b49b76');
  const beats = ['parse()', 'think()', 'build()', 'run()'];
  for (let i = 0; i < 4; i++) {
    const x = w * (.2 + i * .2);
    const strike = Math.max(0, Math.sin(s * tempo * Math.PI + i * Math.PI * .5)) ** 8;
    const base = h * .78;
    const top = h * (.65 + strike * .085);
    line(ctx, [[x, h * .61], [x, top]], '#b3935e', 3);
    ctx.fillStyle = '#e7bd70'; ctx.fillRect(x - w * .032, top, w * .064, h * .023);
    ctx.fillStyle = '#4c4537'; ctx.fillRect(x - w * .053, base, w * .106, h * .012);
    if (strike > .5) glow(ctx, x, base, w * .065, '#ffc15e55');
    text(ctx, beats[i]!, x, h * .86, Math.min(13, w * .027), '#d7bb84', MONO, 'center');
  }
  const q = (s * .35) % 1;
  text(ctx, '{}', cx, cy + r * .12, r * .4, '#fff0bf', MONO, 'center');
  ctx.beginPath(); ctx.arc(cx, cy, r * .8, -.5 * Math.PI, -.5 * Math.PI + q * TAU);
  ctx.strokeStyle = '#fadb8c'; ctx.lineWidth = 4; ctx.stroke();
  if (p > .5) {
    const outputs = ['TEXT', 'VISION', 'AUDIO'];
    outputs.forEach((label, i) => {
      const x = w * (.22 + i * .28);
      const amplitude = 3 + Math.sin(s * 3 + i) ** 2 * 9;
      ctx.beginPath();
      for (let j = 0; j <= 30; j++) {
        const px = x - w * .065 + j / 30 * w * .13;
        const py = h * .94 + Math.sin(j * .65 + s * 6) * amplitude * Math.sin(j / 30 * Math.PI);
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = '#93bae6'; ctx.lineWidth = 1.2; ctx.stroke();
      text(ctx, label, x, h * .91, Math.min(11, w * .026), '#a3c0de', MONO, 'center');
    });
    text(ctx, 'GEMINI 3', w * .5, h * .985, Math.min(12, w * .028), '#a3c0de', MONO, 'center');
  }
}

function compilerComplete(frame: EditionFrame): void {
  const { ctx, width: w, height: h, progress: p, seconds: s } = frame;
  const r = Math.min(w * .24, h * .28);
  glow(ctx, w * .5, h * .48, r * 1.8, '#edbf562b');
  gear(ctx, w * .5, h * .48, r, s * .09, '#d5ad6455');
  text(ctx, 'BUILD SUCCEEDED', w * .5, h * .36, Math.min(14, w * .031), '#b5eda7', MONO, 'center');
  text(ctx, 'GPT-6 ASTRA', w * .5, h * .47, Math.min(42, w * .072), '#ffe2a0', MONO, 'center');
  text(ctx, 'dream.start()'.slice(0, Math.floor(smooth(.79, .885, p) * 13)), w * .5, h * .57,
    Math.min(25, w * .049), '#f5d28b', MONO, 'center');
  text(ctx, 'DeepSeek  /  Llama  /  Qwen', w * .5, h * .81, Math.min(15, w * .03), '#9ba68b', MONO, 'center');
}

function compilerShutter(frame: EditionFrame): void {
  const { ctx, width: w, height: h, progress: p } = frame;
  const q = smooth(.9, 1, p);
  room(frame, 1);
  const blades = 7;
  for (let i = 0; i < blades; i++) {
    const rowH = h / blades;
    const retract = clamp(q * 1.35 - i % 3 * .12);
    const length = w * (1 - retract);
    const x = i % 2 === 0 ? -w * retract : w * retract;
    ctx.fillStyle = '#14181e'; ctx.fillRect(x, i * rowH, w, rowH + 1);
    if (length > 0) line(ctx, [[x, i * rowH], [x + w, i * rowH]], '#806e45', 1);
  }
}

export function drawCompiler(frame: EditionFrame): void {
  const { ctx, width: w, height: h, progress: p } = frame;
  ctx.save(); backdrop(frame);
  for (let i = 0; i < 12; i++) {
    line(ctx, [[w * i / 11, 0], [w * i / 11, h]], '#a2a1870b', 1);
  }
  if (p < .24) compilerSeed(frame);
  else if (p < .76) compilerFactory(frame);
  else compilerComplete(frame);
  if (p >= .9) compilerShutter(frame);
  ctx.restore();
}
