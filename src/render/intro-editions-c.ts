import { backdrop, clamp, glow, line, MONO, room, SANS, seeded, SERIF, smooth, TAU, text, type EditionFrame } from './intro-edition-shared.ts';
import { CLAUDE_MODELS, claudeMilestoneAt } from '../config/intro-models.ts';

const mix = (a: number, b: number, p: number): number => a + (b - a) * p;
const envelope = (p: number, start: number, end: number): number => smooth(start, start + 0.035, p) * (1 - smooth(end - 0.035, end, p));

function fitted(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, maxWidth: number,
  color: string, font = MONO, align: CanvasTextAlign = 'center'): void {
  ctx.font = `${size}px ${font}`;
  const actual = Math.min(size, size * maxWidth / ctx.measureText(value).width);
  text(ctx, value, x, y, actual, color, font, align);
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();
  if (radius > 2.5) {
    ctx.strokeStyle = color; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(x - radius * 3, y); ctx.lineTo(x + radius * 3, y);
    ctx.moveTo(x, y - radius * 3); ctx.lineTo(x, y + radius * 3); ctx.stroke();
  }
}

interface Galaxy { x: number; y: number; radius: number; at: number; color: string; label: string; tilt: number }

function galaxy(frame: EditionFrame, g: Galaxy, index: number): void {
  const { ctx, progress: p, width: w, height: h } = frame;
  const reveal = smooth(g.at, g.at + 0.07, p);
  if (reveal === 0) return;
  const scale = Math.min(w, h);
  const radius = g.radius * scale * (0.72 + 0.28 * reveal);
  const x = g.x * w; const y = g.y * h;
  ctx.save(); ctx.globalAlpha *= reveal;
  glow(ctx, x, y, radius * 1.35, `${g.color}28`);
  ctx.save(); ctx.translate(x, y); ctx.rotate(g.tilt);
  ctx.strokeStyle = `${g.color}65`; ctx.lineWidth = 0.75;
  for (let ring = 1; ring <= 3; ring++) {
    ctx.beginPath(); ctx.ellipse(0, 0, radius * ring / 3, radius * ring / 9, 0, 0, TAU * reveal); ctx.stroke();
  }
  for (let i = 0; i < 42; i++) {
    const a = i * 2.399 + p * (index % 2 ? -0.75 : 0.55);
    const r = Math.sqrt(i / 42) * radius;
    star(ctx, Math.cos(a) * r, Math.sin(a) * r * 0.34, 0.6 + seeded(i + index * 100) * 1.2, g.color);
  }
  star(ctx, 0, 0, 2.6 + 0.8 * Math.sin(p * 45), '#fff5df');
  ctx.restore();
  fitted(ctx, g.label, x, y + radius * 0.65 + 17, Math.min(19, w * 0.028), w * 0.3, g.color);
  ctx.restore();
}

/** The stars have stable identities; camera motion supplies the acceleration. */
export function drawCosmos(frame: EditionFrame): void {
  const { ctx, progress: p, width: w, height: h } = frame;
  const arrive = smooth(0.88, 1, p);
  ctx.save(); backdrop(frame);
  glow(ctx, w * 0.51, h * 0.48, Math.max(w, h) * 0.66, '#46387038');
  const depth = 0.55 + p * 0.65;
  ctx.save(); ctx.globalAlpha = 1 - arrive;
  for (let i = 0; i < 135; i++) {
    const z = 0.35 + seeded(i + 41) * 1.3;
    const x = w / 2 + (seeded(i * 3 + 7) - 0.5) * w * depth / z;
    const y = h / 2 + (seeded(i * 3 + 8) - 0.5) * h * depth / z;
    const twinkle = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(p * 17 + i));
    ctx.globalAlpha = (1 - arrive) * twinkle;
    star(ctx, x, y, (0.4 + seeded(i + 70) * 1.2) / z, '#dce1ff');
  }
  ctx.globalAlpha = 1 - arrive;
  const narrow = w < 650;
  const galaxies: readonly Galaxy[] = [
    { x: 0.5, y: 0.35, radius: 0.135, at: 0.03, color: '#a4e2d4', label: p < 0.2 ? 'GPT' : 'GPT / ChatGPT', tilt: -0.3 },
    { x: 0.31, y: 0.58, radius: 0.195, at: 0.25, color: '#edb08c',
      label: claudeMilestoneAt(p), tilt: 0.35 },
    { x: 0.72, y: 0.54, radius: 0.16, at: 0.39, color: '#aaa9f6', label: 'Gemini 3', tilt: -0.55 },
  ];
  ctx.strokeStyle = '#c7baf03c'; ctx.lineWidth = 0.7;
  const joining = smooth(0.47, 0.74, p);
  ctx.beginPath(); ctx.moveTo(w * 0.5, h * 0.35);
  ctx.quadraticCurveTo(w * 0.12, h * 0.36, w * mix(0.5, 0.31, joining), h * mix(0.35, 0.58, joining)); ctx.stroke();
  if (p > 0.47) {
    ctx.beginPath(); ctx.moveTo(w * 0.31, h * 0.58);
    ctx.quadraticCurveTo(w * 0.55, h * 0.78, w * mix(0.31, 0.72, joining), h * mix(0.58, 0.54, joining)); ctx.stroke();
  }
  galaxies.forEach((g, i) => galaxy(frame, g, i));
  ctx.save(); ctx.globalAlpha *= smooth(.64, .68, p);
  fitted(ctx, 'IMAGINATION', w * .31, h * .58 + Math.min(w, h) * .195 * .65 + 38,
    Math.min(13, w * .028), w * .32, '#f3c0a7');
  ctx.restore();
  const names = ['DeepSeek-R1', 'Llama', 'Qwen'];
  for (let i = 0; i < names.length; i++) {
    const alpha = smooth(0.6 + i * 0.025, 0.7 + i * 0.025, p);
    const x = w * (0.22 + i * 0.28); const y = h * (narrow ? 0.82 : 0.81);
    ctx.save(); ctx.globalAlpha *= alpha;
    glow(ctx, x, y - 14, 30, '#b7d79d20');
    star(ctx, x, y - 14, 2, '#bfd99f');
    fitted(ctx, names[i]!, x, y + 10, narrow ? 11 : 15, w * 0.25, '#cfdec6');
    ctx.restore();
  }
  const chapter = p < 0.25 ? 'A FIRST VOICE' : p < 0.6 ? 'OTHER STARS ANSWER' : 'NO SINGLE STAR OWNS THE SKY';
  fitted(ctx, chapter, w / 2, h * 0.12, Math.min(17, w * 0.031), w * 0.86, '#d9d0ed');
  if (p > 0.7) {
    ctx.save(); ctx.globalAlpha *= smooth(0.7, 0.77, p);
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = ['#9cdbcc38', '#e7b18d38', '#b3acf438'][i]!;
      ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.52, w * (0.33 + i * 0.025), h * (0.28 + i * 0.022), -0.1, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.save(); ctx.globalAlpha *= smooth(.74, .78, p);
  const astraX = w * .2; const astraY = h * .29;
  const astraRadius = Math.min(w, h) * .12;
  glow(ctx, astraX, astraY, astraRadius * 1.7, '#ffcc6f42');
  star(ctx, astraX, astraY, Math.min(8, w * .017), '#ffe5a1');
  ctx.strokeStyle = '#efc97777'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.ellipse(astraX, astraY, astraRadius, astraRadius * .33, -.4, 0, TAU); ctx.stroke();
  fitted(ctx, 'GPT-6 ASTRA', astraX, astraY + astraRadius * .55 + 20,
    Math.min(28, w * .045), w * .35, '#ffdf94', SERIF);
  ctx.restore();
  ctx.restore();
  if (arrive > 0) {
    ctx.fillStyle = `rgba(0,0,0,${arrive})`; ctx.fillRect(0, 0, w, h);
    room(frame, arrive);
    const s = Math.min(w / 1672, h / 941) * 0.975;
    const ox = (w - 1672 * s) / 2; const oy = (h - 941 * s) / 2;
    ctx.save(); ctx.globalAlpha = Math.sin(arrive * Math.PI);
    ctx.beginPath(); ctx.rect(ox + 296 * s, oy + 75 * s, 512 * s, 404 * s); ctx.clip();
    for (let i = 0; i < 30; i++) {
      const x = ox + (296 + seeded(i + 610) * 512) * s;
      const y = oy + (75 + ((seeded(i + 650) + p * 2) % 1) * 404) * s;
      star(ctx, x, y, 1 + seeded(i + 700), '#e6e9ff');
    }
    ctx.restore();
  }
  ctx.restore();
}

const ROOM_PATHS: readonly (readonly (readonly [number, number])[])[] = [
  [[0.05, 0.8], [0.05, 0.15], [0.53, 0.15], [0.53, 0.68]],
  [[0.13, 0.23], [0.43, 0.23], [0.43, 0.58], [0.13, 0.58], [0.13, 0.23]],
  [[0.28, 0.23], [0.28, 0.58]], [[0.13, 0.41], [0.43, 0.41]],
  [[0.32, 0.7], [0.96, 0.7], [0.96, 0.75], [0.32, 0.75], [0.32, 0.7]],
  [[0.38, 0.75], [0.38, 0.96]], [[0.89, 0.75], [0.89, 0.96]],
  [[0.55, 0.29], [0.87, 0.29], [0.87, 0.6], [0.55, 0.6], [0.55, 0.29]],
  [[0.71, 0.6], [0.71, 0.69], [0.66, 0.69], [0.77, 0.69]],
  [[0.42, 0.65], [0.49, 0.65], [0.49, 0.69], [0.42, 0.69], [0.42, 0.65]],
  [[0.59, 0.72], [0.8, 0.72]],
];

function drawnRoom(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, amount: number, color: string): void {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
  ROOM_PATHS.forEach((path, i) => {
    const reveal = clamp(amount * (ROOM_PATHS.length + 2) - i);
    if (reveal === 0) return;
    const total = path.length - 1; const completed = reveal * total;
    ctx.beginPath(); ctx.moveTo(x + path[0]![0] * w, y + path[0]![1] * h);
    for (let j = 1; j < path.length; j++) {
      const portion = clamp(completed - j + 1);
      const a = path[j - 1]!; const b = path[j]!;
      ctx.lineTo(x + mix(a[0], b[0], portion) * w, y + mix(a[1], b[1], portion) * h);
    }
    ctx.stroke();
  });
  ctx.restore();
}

function dialogueQuestion(frame: EditionFrame, question: string, response: string, model: string, start: number, end: number, answerDelay = .07): void {
  const { ctx, progress: p, width: w, height: h } = frame;
  const alpha = envelope(p, start, end);
  if (alpha === 0) return;
  const narrow = w < 650;
  const typed = question.slice(0, Math.floor(clamp((p - start) / 0.065) * question.length));
  ctx.save(); ctx.globalAlpha = alpha;
  text(ctx, 'HUMAN', w * 0.085, h * 0.15, narrow ? 11 : 13, '#9a7564');
  fitted(ctx, typed + (p < start + 0.08 ? '|' : ''), w * 0.085, h * 0.25,
    Math.min(68, w * 0.07), w * 0.84, '#263e49', SERIF, 'left');
  ctx.globalAlpha *= smooth(start + answerDelay, start + answerDelay + .04, p);
  fitted(ctx, response, w * 0.92, h * 0.37, Math.min(25, w * 0.038), w * 0.82, '#ad594c', SERIF, 'right');
  fitted(ctx, model, w * 0.92, h * 0.42, Math.min(15, w * 0.025), w * 0.8, '#776f66', MONO, 'right');
  ctx.restore();
}

export function drawDialogue(frame: EditionFrame): void {
  const { ctx, progress: p, width: w, height: h } = frame;
  ctx.save(); backdrop(frame);
  const vignette = ctx.createRadialGradient(w * 0.48, h * 0.4, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
  vignette.addColorStop(0, '#fffaf145'); vignette.addColorStop(1, '#bba68b28');
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, w, h);
  ctx.save(); ctx.globalAlpha = 1 - smooth(0.87, 0.97, p);
  dialogueQuestion(frame, 'Can we talk?', 'Yes. I am listening.', 'GPT / ChatGPT', 0, 0.265);
  const architect = `${claudeMilestoneAt(p)} / Claude Code`;
  dialogueQuestion(frame, 'Can we build?', 'Let us give the idea a place.', architect, 0.24, 0.52);
  dialogueQuestion(frame, 'Can you see?', 'The light. The snow. The sound.', 'Gemini 3', 0.49, 0.635);
  dialogueQuestion(frame, 'Can we imagine?', 'Let us make the world come alive.', claudeMilestoneAt(p), .605, .78, .035);
  ctx.save(); ctx.globalAlpha *= envelope(p, .76, .98);
  text(ctx, 'HUMAN', w * .085, h * .15, Math.min(13, w * .027), '#9a7564');
  fitted(ctx, 'What comes next?', w * .085, h * .25, Math.min(68, w * .07), w * .84, '#263e49', SERIF, 'left');
  ctx.globalAlpha *= smooth(.78, .805, p);
  glow(ctx, w * .77, h * .37, w * .19, '#d6ad4026');
  fitted(ctx, 'GPT-6 ASTRA', w * .92, h * .37, Math.min(47, w * .068), w * .8, '#aa7929', SERIF, 'right');
  fitted(ctx, 'WE MAKE IT TOGETHER', w * .92, h * .425, Math.min(14, w * .028), w * .8, '#9d8253', MONO, 'right');
  fitted(ctx, `${CLAUDE_MODELS.opus55} / Gemini 3 / DeepSeek / Llama / Qwen`, w * .92, h * .455,
    Math.min(11, w * .023), w * .8, '#776f66', MONO, 'right');
  ctx.restore();
  const rx = w * 0.13; const ry = h * 0.48; const rw = w * 0.74; const rh = h * 0.37;
  if (p < 0.32) {
    ctx.save(); ctx.globalAlpha *= smooth(0.08, 0.17, p) * (1 - smooth(0.23, 0.32, p));
    const phrases = ['a word', 'an answer', 'a conversation'];
    phrases.forEach((phrase, i) => {
      const progress = smooth(0.09 + i * 0.035, 0.15 + i * 0.035, p);
      ctx.save(); ctx.globalAlpha *= progress;
      fitted(ctx, phrase, w * (0.25 + i * 0.24), h * (0.61 + i * 0.08), Math.min(30, w * 0.04), w * 0.3, '#7f9691', SERIF);
      ctx.restore();
    });
    line(ctx, [[w * 0.18, h * 0.8], [w * 0.81, h * 0.8]], '#b59b8650');
    ctx.restore();
  }
  drawnRoom(ctx, rx, ry, rw, rh, smooth(0.3, 0.57, p), '#687f7c');
  if (p > 0.55) {
    const appear = smooth(0.55, 0.65, p);
    const wx = rx + rw * 0.13; const wy = ry + rh * 0.23;
    ctx.save(); ctx.globalAlpha *= appear;
    ctx.fillStyle = '#8caebb27'; ctx.fillRect(wx, wy, rw * 0.3, rh * 0.35);
    ctx.beginPath(); ctx.rect(wx, wy, rw * 0.3, rh * 0.35); ctx.clip();
    for (let i = 0; i < 18; i++) {
      const sx = wx + seeded(i + 25) * rw * 0.3;
      const sy = wy + ((seeded(i + 71) + p * 2) % 1) * rh * 0.35;
      star(ctx, sx, sy, 1.2, '#fff9f1');
    }
    ctx.restore();
    ctx.save(); ctx.globalAlpha *= appear * 0.65;
    ctx.beginPath();
    for (let i = 0; i < 90; i++) {
      const x = w * 0.18 + i / 89 * w * 0.64;
      const y = h * 0.9 + Math.sin(i * 0.36 - p * 55) * Math.sin(i / 89 * Math.PI) * h * 0.015;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#aa8672'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
  }
  ctx.restore();
  const reveal = smooth(0.87, 1, p);
  if (reveal > 0) {
    ctx.fillStyle = `rgba(4,8,11,${reveal})`; ctx.fillRect(0, 0, w, h);
    ctx.save(); ctx.beginPath();
    // The illustrated answer grows out of the window before occupying the stage.
    const cx = rx + rw * 0.28; const cy = ry + rh * 0.4;
    const radius = Math.hypot(w, h) * reveal;
    ctx.arc(cx, cy, radius, 0, TAU); ctx.clip(); room(frame, reveal); ctx.restore();
  }
  ctx.restore();
}

interface RibbonPoint { x: number; y: number; z: number }

function ribbonPoint(frame: EditionFrame, u: number, voice: number, staff: number): RibbonPoint {
  const { progress: p, width: w, height: h } = frame;
  const angle = u * TAU * 1.55 + voice * TAU / 3 + p * TAU * 0.55;
  const radius = Math.min(w * 0.37, h * 0.56) * (0.7 + 0.3 * Math.sin(u * Math.PI));
  const z = Math.sin(angle);
  const perspective = 0.85 + z * 0.15;
  return {
    x: w * 0.5 + Math.cos(angle) * radius * perspective,
    y: h * (0.21 + u * 0.59) + z * h * 0.085 + (staff - 2) * Math.min(6, w * 0.009) * perspective,
    z,
  };
}

function drawRibbon(frame: EditionFrame, voice: number, front: boolean): void {
  const { ctx, progress: p, width: w } = frame;
  const color = ['#eac77f', '#df9fa5', '#a5cace'][voice]!;
  const amount = smooth(0.02 + voice * 0.23, 0.18 + voice * 0.23, p);
  for (let staff = 0; staff < 5; staff++) {
    for (let i = 0; i < 72 * amount; i++) {
      const a = ribbonPoint(frame, i / 72, voice, staff);
      const b = ribbonPoint(frame, (i + 1) / 72, voice, staff);
      if ((a.z >= 0) !== front) continue;
      ctx.globalAlpha = (front ? 0.8 : 0.25) * (1 - smooth(0.87, 0.98, p));
      ctx.strokeStyle = color; ctx.lineWidth = staff === 2 ? 1.3 : 0.65;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }
  for (let i = 0; i < 16 * amount; i++) {
    const u = (i / 16 + p * (0.17 + voice * 0.04)) % 1;
    const pt = ribbonPoint(frame, u, voice, i % 5);
    if ((pt.z >= 0) !== front) continue;
    ctx.globalAlpha = (front ? 1 : 0.28) * (1 - smooth(0.88, 0.97, p));
    const r = Math.min(5.2, w * 0.008) * (0.85 + 0.15 * pt.z);
    ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(pt.x, pt.y, r * 1.2, r * 0.76, -0.35, 0, TAU); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(pt.x + r, pt.y); ctx.lineTo(pt.x + r, pt.y - r * 4.3); ctx.stroke();
    if (front && i % 4 === 0) glow(ctx, pt.x, pt.y, r * 5, `${color}27`);
  }
}

export function drawFugue(frame: EditionFrame): void {
  const { ctx, progress: p, width: w, height: h } = frame;
  ctx.save(); backdrop(frame);
  glow(ctx, w * 0.5, h * 0.45, Math.max(w, h) * 0.58, '#50314a4c');
  ctx.save(); ctx.globalAlpha = 1 - smooth(0.89, 0.99, p);
  const pillar = ctx.createLinearGradient(w * 0.36, 0, w * 0.64, 0);
  pillar.addColorStop(0, '#a1844e00'); pillar.addColorStop(0.47, '#a1844e17');
  pillar.addColorStop(0.5, '#e4c8992c'); pillar.addColorStop(0.53, '#a1844e17'); pillar.addColorStop(1, '#a1844e00');
  ctx.fillStyle = pillar; ctx.fillRect(w * 0.36, h * 0.19, w * 0.28, h * 0.66);
  ctx.strokeStyle = '#d4b27633'; ctx.lineWidth = 0.8;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.ellipse(w / 2, h * (0.22 + i * 0.2), w * 0.15, h * 0.03, 0, 0, TAU); ctx.stroke();
  }
  for (let i = 0; i < 3; i++) drawRibbon(frame, i, false);
  ctx.globalAlpha = (1 - smooth(0.89, 0.99, p)) * 0.8;
  line(ctx, [[w * 0.5, h * 0.16], [w * 0.5, h * 0.86]], '#ddc49530');
  for (let i = 0; i < 3; i++) drawRibbon(frame, i, true);
  ctx.globalAlpha = 1 - smooth(0.85, 0.96, p);
  const theme = p < 0.27 ? 'I. A VOICE' : p < 0.51 ? 'II. AN ANSWER' : p < .64 ? 'III. GEMINI 3' : p < .76 ? claudeMilestoneAt(p) : 'MANY VOICES. ONE MOMENT.';
  fitted(ctx, theme, w / 2, h * 0.105, Math.min(22, w * 0.045), w * 0.86, '#eedcc0', SERIF);
  const claude = claudeMilestoneAt(p);
  const labels = ['GPT / ChatGPT', claude, 'Gemini 3'];
  const narrow = w < 650;
  labels.forEach((label, i) => {
    ctx.save(); ctx.globalAlpha *= smooth(0.02 + i * 0.23, 0.12 + i * 0.23, p);
    const x = narrow ? w * 0.5 : w * (0.19 + i * 0.31);
    const y = h * (narrow ? 0.865 + i * 0.035 : 0.9);
    fitted(ctx, label, x, y, narrow ? 11 : 14, w * (narrow ? 0.8 : 0.28), ['#eac77f', '#df9fa5', '#a5cace'][i]!);
    ctx.restore();
  });
  if (p > 0.7) {
    ctx.save(); ctx.globalAlpha *= smooth(0.7, 0.77, p) * 0.65;
    fitted(ctx, 'DeepSeek  ·  Llama  ·  Qwen', w / 2, h * 0.17, Math.min(13, w * 0.026), w * 0.8, '#bdb3cc');
    ctx.restore();
  }
  ctx.save(); ctx.globalAlpha = smooth(.74, .78, p) * (1 - smooth(.89, .95, p));
  const chordX = w * .72; const chordY = h * .37;
  glow(ctx, chordX, chordY, Math.min(w, h) * .17, '#ffce6b24');
  for (let i = 0; i < 5; i++) {
    line(ctx, [[w * .55, chordY + i * 7], [w * .9, chordY + i * 7]], '#eac98099', .8);
  }
  for (let i = 0; i < 3; i++) {
    const yy = chordY + 7 + i * 10;
    ctx.fillStyle = '#ffe3a0'; ctx.beginPath(); ctx.ellipse(chordX, yy, 6, 4, -.35, 0, TAU); ctx.fill();
  }
  line(ctx, [[chordX + 5, chordY - 33], [chordX + 5, chordY + 27]], '#ffe3a0', 1.5);
  fitted(ctx, 'GPT-6 ASTRA', chordX, chordY + 58, Math.min(30, w * .047), w * .43, '#ffe3a0', SERIF);
  ctx.restore();
  ctx.restore();
  const join = smooth(0.87, 0.95, p); const arrive = smooth(0.92, 1, p);
  if (join > 0) {
    ctx.save(); ctx.globalAlpha = Math.sin(join * Math.PI) * 0.8;
    const ww = w * mix(0.58, 0.4, join); const hh = h * mix(0.58, 0.43, join);
    ctx.strokeStyle = '#ffe5b5'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) ctx.strokeRect((w - ww) / 2 + i * 3, (h - hh) / 2 + i * 3, ww - i * 6, hh - i * 6);
    line(ctx, [[w / 2, (h - hh) / 2], [w / 2, (h + hh) / 2]], '#ffe5b5');
    ctx.restore();
  }
  if (arrive > 0) {
    ctx.fillStyle = `rgba(0,0,0,${arrive})`; ctx.fillRect(0, 0, w, h); room(frame, arrive);
  }
  ctx.restore();
}

function feather(ctx: CanvasRenderingContext2D, x: number, y: number, length: number, angle: number): void {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ctx.beginPath(); ctx.moveTo(0, length * 0.52);
  ctx.bezierCurveTo(-length * 0.4, length * 0.1, -length * 0.24, -length * 0.36, 0, -length * 0.5);
  ctx.bezierCurveTo(length * 0.23, -length * 0.3, length * 0.32, length * 0.05, 0, length * 0.52);
  ctx.fillStyle = '#edf5ee'; ctx.shadowColor = '#d0ecdf'; ctx.shadowBlur = 14; ctx.fill(); ctx.shadowBlur = 0;
  ctx.strokeStyle = '#a5bdb7'; ctx.lineWidth = 0.8;
  line(ctx, [[0, -length * 0.4], [0, length * 0.59]], '#a5bdb7');
  for (let i = 0; i < 7; i++) {
    const y0 = -length * 0.27 + i * length * 0.09;
    const span = Math.sin((i + 1) / 9 * Math.PI) * length * 0.18;
    line(ctx, [[-span, y0 - length * 0.1], [0, y0], [span, y0 - length * 0.13]], '#b7ccc4', 0.6);
  }
  ctx.restore();
}

function dreamCode(frame: EditionFrame): void {
  const { ctx, progress: p } = frame;
  const stages = [
    { at: 0.04, name: 'GPT / ChatGPT', code: 'dream.learn(language);' },
    { at: 0.23, name: claudeMilestoneAt(Math.min(p, .6)), code: 'dream.build(world);' },
    { at: 0.41, name: 'Gemini 3', code: 'dream.see(); dream.listen();' },
    { at: 0.61, name: claudeMilestoneAt(p), code: 'await dream.continue();' },
    { at: 0.75, name: 'DeepSeek / Llama / Qwen', code: 'dream.start();' },
  ];
  ctx.save(); ctx.globalAlpha = 0.9 * (1 - smooth(0.88, 0.98, p));
  ctx.translate(1063, 306); ctx.transform(1, -0.035, 0.04, 1, 0, 0);
  ctx.fillStyle = '#051716bc'; ctx.fillRect(0, 0, 410, 225);
  const glory = smooth(.61, .65, p);
  stages.forEach((stage, i) => {
    const amount = clamp((p - stage.at) / 0.085);
    if (amount === 0) return;
    const baseline = 28 + glory * 50 + i * (39 - glory * 12);
    const size = 13 - glory * 2.5;
    fitted(ctx, stage.name, 17, baseline, size, 376, '#a8c3b8', MONO, 'left');
    const visible = stage.code.slice(0, Math.floor(stage.code.length * amount));
    text(ctx, visible + (amount < 1 ? '▌' : ''), 17, baseline + 18 - glory * 5, size, i === 4 ? '#e8d1a1' : '#d9ede0');
  });
  ctx.save(); ctx.globalAlpha *= glory;
  glow(ctx, 205, 29, 140, p < .755 ? '#ffaf832e' : '#f8c9682e');
  fitted(ctx, p < .755 ? claudeMilestoneAt(p) : 'GPT-6 ASTRA', 205, 45, 40, 376, p < .755 ? '#ffc0a0' : '#ffe2a0', SERIF);
  if (p < .755) text(ctx, 'IMAGINATION FINDS FORM', 205, 63, 12, '#ffc0a0', MONO, 'center');
  ctx.restore();
  ctx.restore();
}

export function drawDream(frame: EditionFrame): void {
  const { ctx, progress: p, width: w, height: h, images } = frame;
  ctx.save(); backdrop(frame);
  const release = smooth(0.86, 1, p);
  const narrow = w < 650;
  const base = Math.min(w / 1672, h / 941) * 0.975;
  const magnify = mix(narrow ? 3.6 : 2.3, 1.3, smooth(0, 0.42, p));
  const zoom = mix(magnify, 1, release);
  const cx = mix(mix(1190, 1000, smooth(0, 0.5, p)), 836, release);
  const cy = mix(438, 470.5, release);
  ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(base * zoom, base * zoom); ctx.translate(-cx, -cy);
  ctx.drawImage(images.night, 0, 0, 1672, 941);
  ctx.fillStyle = `rgba(0,11,14,${(0.37 + Math.sin(p * 15) * 0.025) * (1 - release)})`;
  ctx.fillRect(0, 0, 1672, 941);
  dreamCode(frame);
  const reflection = smooth(0.36, 0.56, p) * (1 - release);
  ctx.save(); ctx.globalAlpha = reflection * 0.35;
  // The reflection progresses independently after the typing hands have stopped.
  ctx.translate(1070, 790); ctx.transform(1, -0.11, 0.35, -0.45, 0, 0);
  text(ctx, 'THE WORLD IS LISTENING', 0, 0, 21, '#a4dace');
  text(ctx, p > 0.66 ? 'STILL RUNNING_' : 'WAITING FOR INPUT_', 6, 38, 18, '#ead6ab');
  ctx.restore();
  const typing = p < 0.61 ? Math.min(p, 0.61) : 0.61;
  ctx.save(); ctx.globalAlpha = 0.28 * (1 - release);
  for (let i = 0; i < 16; i++) {
    const pulse = 0.5 + 0.5 * Math.sin(typing * 230 + i * 2.7);
    ctx.fillStyle = `rgba(149,216,192,${0.25 + pulse * 0.4})`;
    ctx.fillRect(880 + i * 19, 626 + Math.sin(i * 0.45) * 6, 13, 5 + pulse * 4);
  }
  ctx.restore();
  if (p > 0.51 && p < 0.89) {
    ctx.save(); ctx.globalAlpha = envelope(p, 0.51, 0.89) * 0.27;
    ctx.beginPath(); ctx.rect(1045, 285, 460, 285); ctx.clip();
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = ['#e9b695', '#9fbddd', '#b4d1a2'][i]!; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(1260, 418, 85 + i * 45, 45 + i * 12, p * 3 + i, 0, TAU); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
  ctx.save(); ctx.globalAlpha = 1 - release;
  const shade = ctx.createLinearGradient(0, 0, 0, h * 0.32);
  shade.addColorStop(0, '#071014d9'); shade.addColorStop(1, '#07101400');
  ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h * 0.32);
  const title = p < 0.22 ? 'ONE MORE LINE.' : p < 0.43 ? 'WORDS BECOME ACTION.' : p < 0.61 ? 'THE ROOM LEARNS TO LISTEN.' : p < 0.76 ? 'YOU STOP.' : 'IT DOES NOT.';
  fitted(ctx, title, w / 2, h * 0.13, Math.min(28, w * 0.044), w * 0.88, '#e8eee1', SERIF);
  if (p > 0.61) {
    ctx.globalAlpha *= smooth(0.61, 0.67, p);
    fitted(ctx, 'NO KEY PRESSED', w / 2, h * 0.19, Math.min(12, w * 0.025), w * 0.8, '#a5c6b8');
  }
  ctx.restore();
  const flight = smooth(0.73, 0.96, p);
  if (flight > 0 && p < 1) {
    const screenX = w / 2 + (1230 - cx) * base * zoom;
    const screenY = h / 2 + (410 - cy) * base * zoom;
    const x = mix(screenX, w * 0.46, flight) + Math.sin(flight * Math.PI) * w * 0.12;
    const y = mix(screenY, h * 0.7, flight) - Math.sin(flight * Math.PI) * h * 0.17;
    ctx.save(); ctx.globalAlpha = smooth(0.73, 0.79, p) * (1 - smooth(0.95, 1, p));
    glow(ctx, x, y, Math.min(w, h) * 0.11, '#c9e9dc20');
    feather(ctx, x, y, Math.min(w, h) * mix(0.05, 0.15, flight), -0.5 + flight * 1.6); ctx.restore();
  }
  ctx.restore();
}
