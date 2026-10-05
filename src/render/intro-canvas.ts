import {
  INTRO_CODE_LINES, INTRO_HANDS_OFF_AT, INTRO_MUSIC_END, INTRO_SCORE_RATE, INTRO_VOICES,
  INTRO_WORDS, introBeatAt, introSceneAt, introTimeAtBeat,
} from '../config/intro.ts';
import { drawStory, type IntroImages } from './intro-story.ts';

export const TAU = Math.PI * 2;
export const SANS = '"PingFang SC", "Microsoft YaHei", sans-serif';
export const MONO = '"SFMono-Regular", Consolas, monospace';
export const ease = (a: number, b: number, t: number): number => {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
export const noise = (i: number): number => {
  const value = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};

export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'transparent');
  ctx.fillStyle = gradient;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

const WHITE = '#e8ebe5';
const MUTED = '#91a29f';
const IMAGE_W = 1672;
const IMAGE_H = 941;
const STORY_AT = introSceneAt('night');
const NOTES = ['♪', '♩', '♫', '♩'] as const;
const TERMS = [
  ['hello', 'attention', 'context', 'language', 'prompt', 'understand'],
  ['const', 'think()', 'edit()', 'run()', 'CI / CD', 'build()'],
  ['vision', 'sound', 'perceive', 'listen()', 'multimodal', 'imagine'],
] as const;
type Point = readonly [number, number];
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number,
  size: number, color: string, font = SANS): void {
  ctx.font = `${size}px ${font}`;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

function syntax(ctx: CanvasRenderingContext2D, line: string, count: number, x: number, y: number,
  size: number): number {
  let seen = 0;
  let dx = x;
  for (const part of line.split(/(const|await|world|imagine|listen|build|dream|start|compose)/)) {
    const visible = part.slice(0, Math.max(0, count - seen));
    const keyword = /^(const|await)$/.test(part);
    const action = /^(imagine|listen|build|start|compose)$/.test(part);
    text(ctx, visible, dx, y, size, keyword ? '#bda5de' : action ? '#efbd92' : '#b9d2cb', MONO);
    dx += ctx.measureText(visible).width;
    seen += part.length;
  }
  return dx;
}

function command(ctx: CanvasRenderingContext2D, t: number, w: number, h: number): void {
  if (t >= 10) return;
  const opening = ease(0.1, 0.8, t);
  const release = ease(5, 9, t);
  const size = Math.min(22, w * 0.029);
  const x = w * 0.12;
  const y = h * 0.39;
  ctx.save();
  ctx.globalAlpha = opening * (1 - release);
  text(ctx, 'GRASSY / LOCAL SESSION', x, y - size * 2.8, size * 0.47, '#73877e', MONO);
  for (let i = 0; i < INTRO_CODE_LINES.length; i++) {
    const line = INTRO_CODE_LINES[i]!;
    const count = Math.max(0, Math.min(line.text.length, Math.floor((t - line.at) * 30)));
    const dx = syntax(ctx, line.text, count, x, y + i * size * 1.95, size);
    const nextAt = i + 1 < INTRO_CODE_LINES.length ? INTRO_CODE_LINES[i + 1]!.at : 5;
    if (t >= line.at && t < nextAt && Math.floor(t * 4) % 2 === 0) {
      ctx.fillStyle = WHITE;
      ctx.fillRect(dx + size * 0.2, y + i * size * 1.95 - size * 0.85, size * 0.45, size);
    }
  }
  // 第一声从最后一行离开；之后整条旋律延续它的方向。
  if (t > 3.8) {
    const departure = ease(3.8, 6.5, t);
    ctx.globalAlpha = Math.sin(departure * Math.PI);
    text(ctx, '♪', x + w * (0.2 + departure * 0.16), y + size * 6 - departure * h * 0.18,
      size * 1.5, '#99e2cc', 'serif');
  }
  ctx.restore();
}

function roomTransform(ctx: CanvasRenderingContext2D, w: number, h: number): number {
  const scale = Math.min(w / IMAGE_W, h / IMAGE_H) * 0.975;
  ctx.translate(w / 2, h / 2);
  ctx.scale(scale, scale);
  ctx.translate(-IMAGE_W / 2, -IMAGE_H / 2);
  return scale;
}

function trace(ctx: CanvasRenderingContext2D, points: readonly Point[], progress: number,
  color: string, width: number): void {
  if (progress <= 0) return;
  const lengths = points.slice(1).map((point, i) => Math.hypot(point[0] - points[i]![0], point[1] - points[i]![1]));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let remaining = total * Math.min(1, progress);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(points[0]![0], points[0]![1]);
  for (let i = 0; i < lengths.length; i++) {
    const k = Math.min(1, remaining / lengths[i]!);
    const a = points[i]!;
    const b = points[i + 1]!;
    ctx.lineTo(lerp(a[0], b[0], k), lerp(a[1], b[1], k));
    remaining -= lengths[i]!;
    if (remaining <= 0) break;
  }
  ctx.stroke();
}

function growingWorld(ctx: CanvasRenderingContext2D, t: number, image: HTMLImageElement,
  w: number, h: number): void {
  if (t < 11) return;
  const reveal = ease(24, 32, t);
  const lineOpacity = ease(11, 14, t) * (1 - ease(30.3, 33.5, t));
  ctx.save();
  const scale = roomTransform(ctx, w, h);
  ctx.globalAlpha = reveal * 0.76;
  ctx.drawImage(image, 0, 0, IMAGE_W, IMAGE_H);
  // 真正的房间轮廓与图像使用同一个坐标系，线条最终落回它们所构成的物体。
  ctx.globalAlpha = lineOpacity;
  const thin = Math.min(2.4, 1 / scale);
  trace(ctx, [[296, 506], [296, 74], [1257, 74], [1257, 506], [296, 506]],
    ease(12, 18, t), '#a8b9ff65', thin);
  trace(ctx, [[818, 75], [818, 510]], ease(15, 18.5, t), '#a8b9ff45', thin);
  trace(ctx, [[958, 563], [1656, 561], [1656, 538], [983, 536]],
    ease(13, 19, t), '#efbd9270', thin);
  trace(ctx, [[1620, 563], [1620, 765], [1597, 765], [1597, 565]],
    ease(18, 23, t), '#efbd9245', thin);
  trace(ctx, [[1100, 510], [1114, 354], [1324, 323], [1317, 511], [1100, 510]],
    ease(18, 23, t), '#efbd9290', thin);
  trace(ctx, [[1327, 500], [1332, 323], [1517, 291], [1514, 497], [1327, 500]],
    ease(20, 25, t), '#a8b9ff80', thin);
  trace(ctx, [[1186, 513], [1186, 532], [1259, 531]], ease(22, 25, t), '#efbd9260', thin);
  trace(ctx, [[1439, 535], [1439, 489], [1567, 483], [1570, 535], [1439, 535]],
    ease(23, 27, t), '#d6ded866', thin);
  trace(ctx, [[0, 789], [1672, 789]], ease(23, 29, t), '#efbd923b', thin);
  const typing = Math.floor((Math.min(t, INTRO_HANDS_OFF_AT) - 19) * 18);
  for (let row = 0; row < 7; row++) {
    const count = Math.max(0, Math.min(25 - row % 3 * 4, typing - row * 15));
    if (count === 0) continue;
    ctx.fillStyle = row % 3 === 0 ? '#99e2cc' : row % 2 ? '#efbd92' : '#a8b9ff';
    ctx.globalAlpha = lineOpacity * 0.48;
    ctx.fillRect(1142 + row % 3 * 6, 378 + row * 14, count * 3.3, 2);
  }
  ctx.restore();
}

function curve(u: number, lane: number, t: number, w: number, h: number): Point {
  const root = ease(23, 30, t);
  const sourceX = lerp(0.12, 0.725, root);
  const sourceY = lerp(0.65 + lane * 0.075, 0.48, root);
  const destinationY = [0.40, 0.68, 0.32][lane]!;
  const spread = [0.03, -0.06, 0.18][lane]!;
  const x = lerp(sourceX, 0.94, u);
  const y = lerp(sourceY, destinationY, u) + Math.sin(u * Math.PI) * spread;
  return [x * w, y * h];
}

function voiceLabel(ctx: CanvasRenderingContext2D, t: number, lane: number, w: number, h: number): void {
  const voice = INTRO_VOICES[lane]!;
  const established = ease(voice.at + 2, voice.at + 3, t);
  ctx.save();
  ctx.globalAlpha *= established * 0.72 * (1 - ease(27, 29.2, t));
  const y = h * (0.84 + lane * 0.043);
  ctx.fillStyle = voice.color;
  ctx.fillRect(w * 0.076, y - 5, 2, 5);
  text(ctx, `${voice.label} / ${voice.action}`, w * 0.087, y,
    Math.min(9, w * 0.019), voice.color, MONO);
  ctx.restore();
}

function voices(ctx: CanvasRenderingContext2D, t: number, w: number, h: number): void {
  if (t < 5 || t > 33) return;
  const beat = introBeatAt(t);
  const crescendo = ease(12, 29, t);
  const resolution = 1 - ease(INTRO_MUSIC_END, 33, t);
  const strokeHit = Math.exp(-(beat % 1) * 8);
  for (let lane = 0; lane < INTRO_VOICES.length; lane++) {
    const voice = INTRO_VOICES[lane]!;
    if (t < voice.at) continue;
    const fade = ease(voice.at, voice.at + 0.8, t) * resolution;
    ctx.save();
    ctx.globalAlpha = fade;
    const gradient = ctx.createLinearGradient(w * 0.1, 0, w * 0.94, 0);
    gradient.addColorStop(0, `${voice.color}00`);
    gradient.addColorStop(0.25, `${voice.color}45`);
    gradient.addColorStop(0.8, `${voice.color}80`);
    gradient.addColorStop(1, `${voice.color}00`);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 0.7 + strokeHit * crescendo * 0.65;
    ctx.beginPath();
    for (let sample = 0; sample <= 72; sample++) {
      const [x, y] = curve(sample / 72, lane, t, w, h);
      if (sample === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const division = lane === 1 && t > 20 ? 2 : 1;
    const last = Math.floor(beat * division);
    for (let i = Math.max(0, last - 12); i <= last; i++) {
      const born = introTimeAtBeat(i / division);
      if (born < voice.at) continue;
      const age = t - born;
      const life = 5 - crescendo * 1.1;
      if (age < 0 || age > life) continue;
      const u = age / life;
      const [x, y] = curve(u, lane, t, w, h);
      const alpha = ease(0, 0.16, age) * (1 - ease(0.65, 1, u));
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.textAlign = 'center';
      ctx.shadowBlur = 12;
      ctx.shadowColor = `${voice.color}70`;
      text(ctx, NOTES[(i + lane) % NOTES.length]!, x, y - 4 - strokeHit * crescendo * 3,
        Math.min(28, w * 0.045) * (1 + crescendo * 0.14), voice.color, 'serif');
      if (i % 4 === lane && t < 29) {
        ctx.shadowBlur = 0;
        ctx.globalAlpha *= 0.67;
        text(ctx, TERMS[lane]![Math.floor(i / 4) % TERMS[lane]!.length]!, x, y + 19,
          Math.min(11, w * 0.022), voice.color, MONO);
      }
      ctx.restore();
    }
    voiceLabel(ctx, t, lane, w, h);
    ctx.restore();
  }
}

function conversation(ctx: CanvasRenderingContext2D, t: number, w: number, h: number): void {
  if (t < 5 || t > 13) return;
  const alpha = ease(5, 6, t) * (1 - ease(10.7, 13, t));
  const phrases = ['A thought becomes a word.', 'A word finds an answer.'];
  ctx.save();
  ctx.globalAlpha = alpha;
  const size = Math.min(18, w * 0.032);
  for (let i = 0; i < phrases.length; i++) {
    const age = t - (5.3 + i * 2.3);
    const count = Math.max(0, Math.min(phrases[i]!.length, Math.floor(age * 23)));
    const x = w * (i === 0 ? 0.13 : 0.37);
    text(ctx, phrases[i]!.slice(0, count), x, h * (0.48 + i * 0.09), size,
      i === 0 ? '#b8ddcf' : '#739a8d', MONO);
  }
  ctx.restore();
}

function senses(ctx: CanvasRenderingContext2D, t: number, w: number, h: number): void {
  if (t < 14 || t > 32) return;
  const alpha = ease(14, 16, t) * (1 - ease(28.7, 32, t));
  const beat = introBeatAt(t);
  const pulse = Math.exp(-(beat % 2) * 3);
  const x = w * 0.76;
  const y = h * 0.32;
  const radius = Math.min(w * 0.145, h * 0.19);
  ctx.save();
  ctx.globalAlpha = alpha;
  glow(ctx, x, y, radius * 1.6, '#8297ff0c');
  // 三个感知维度共用一个透镜，后来的版本延展同一个形体而非替换它。
  for (let ring = 0; ring < 3; ring++) {
    ctx.strokeStyle = ring === 0 ? '#a8b9ff66' : '#a8b9ff25';
    ctx.lineWidth = ring === 0 ? 1.2 : 0.7;
    ctx.beginPath();
    ctx.ellipse(x, y, radius * (0.7 + ring * 0.14), radius * (0.7 + ring * 0.14),
      0, -Math.PI * 0.85, -Math.PI * 0.85 + TAU * ease(14 + ring * 0.6, 18 + ring * 0.6, t));
    ctx.stroke();
  }
  ctx.beginPath();
  const grow = ease(14.7, 17, t);
  for (let i = 0; i <= 90; i++) {
    const u = i / 90;
    const xx = x + (u - 0.5) * radius * 2.6;
    const envelope = Math.sin(u * Math.PI) ** 3;
    const wave = Math.sin(u * 32 - beat * 2) * Math.cos(u * 10 + beat * 0.5);
    const yy = y + envelope * wave * radius * (0.14 + pulse * 0.18) * grow;
    if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
  }
  ctx.strokeStyle = '#c4ccffb0';
  ctx.stroke();
  ctx.textAlign = 'center';
  const size = Math.min(9, w * 0.017);
  text(ctx, 'SIGHT', x - radius * 0.69, y + radius + 17, size, '#8e9dbc', MONO);
  text(ctx, 'SOUND', x + radius * 0.69, y + radius + 17, size, '#8e9dbc', MONO);
  if (t > 23) {
    const converge = ease(23, 26, t);
    ctx.globalAlpha *= converge;
    text(ctx, 'THOUGHT', x, y - radius - 13, size, '#b3bfee', MONO);
    ctx.strokeStyle = '#d4dcff60';
    ctx.beginPath();
    ctx.ellipse(x, y, radius * 0.88, radius * 0.28, -0.4, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function branches(ctx: CanvasRenderingContext2D, t: number, w: number, h: number): void {
  if (t < 17 || t >= 29.5) return;
  const alpha = ease(17, 18, t) * (1 - ease(26.5, 29.5, t));
  const names = ['DeepSeek-R1', 'Llama', 'Qwen'];
  ctx.save();
  ctx.globalAlpha = alpha * 0.72;
  const origin: Point = [w * 0.37, h * 0.54];
  for (let i = 0; i < names.length; i++) {
    const end: Point = [w * (0.42 + i * 0.18), h * (0.82 - i * 0.025)];
    const progress = ease(17 + i * 0.35, 19.8 + i * 0.35, t);
    const bend: Point = [lerp(origin[0], end[0], 0.55), origin[1] + h * 0.08];
    trace(ctx, [origin, bend, end], progress, '#c9d5c330', 0.8);
    ctx.textAlign = 'center';
    ctx.globalAlpha = alpha * ease(18.6 + i * 0.35, 19.6 + i * 0.35, t);
    text(ctx, names[i]!, end[0], end[1] + 21, Math.min(13, w * 0.026), '#c6d5bc', MONO);
  }
  ctx.restore();
}

function heading(ctx: CanvasRenderingContext2D, t: number, w: number, h: number): void {
  if (t < 5 || t >= INTRO_HANDS_OFF_AT) return;
  const index = INTRO_WORDS.findLastIndex((word) => t >= word.at);
  const word = INTRO_WORDS[index]!;
  const end = index + 1 < INTRO_WORDS.length ? INTRO_WORDS[index + 1]!.at : INTRO_HANDS_OFF_AT;
  const entry = ease(word.at, word.at + 0.5, t);
  const exit = 1 - ease(end - 0.23, end, t);
  const color = word.family === 'ensemble' ? '#dce0cb' : INTRO_VOICES.find((voice) => voice.id === word.family)!.color;
  const birth = index === 0;
  const headlineSize = Math.min(birth ? 94 : 49, w * (birth ? 0.18 : 0.061));
  const x = w * 0.075;
  const y = h * 0.215;
  ctx.save();
  ctx.globalAlpha = entry * exit;
  text(ctx, birth ? 'THE FIRST VOICE' : word.family === 'ensemble' ? 'THE WORLD OPENS' :
    word.family === 'code' ? 'WORDS BECOME WORLDS' : word.family === 'senses' ? 'A WIDER PERCEPTION' : 'A CONVERSATION BEGINS',
  x, y - headlineSize - 12, Math.min(10, w * 0.02), MUTED, MONO);
  ctx.font = `500 ${headlineSize}px ${SANS}`;
  ctx.fillStyle = color;
  ctx.fillText(word.label, x, y + (1 - entry) * 12);
  text(ctx, word.english, x, y + Math.min(35, w * 0.062), Math.min(14, w * 0.025), '#b2bbb6', MONO);
  if (birth) {
    const expand = ease(5, 7.6, t);
    ctx.strokeStyle = `rgba(153, 226, 204, ${(1 - expand) * 0.3})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(x + w * 0.1, y - 20, Math.min(w, h) * (0.08 + expand * 0.4), 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function autonomous(ctx: CanvasRenderingContext2D, t: number, w: number, h: number): void {
  if (t < INTRO_HANDS_OFF_AT || t >= 34) return;
  const alpha = ease(INTRO_HANDS_OFF_AT, 29.5, t) * (1 - ease(32, 34, t));
  ctx.save();
  ctx.globalAlpha = alpha;
  const x = w * 0.075;
  const y = h * 0.28;
  text(ctx, 'THE HANDS ARE STILL.', x, y - 27, Math.min(11, w * 0.024), '#99a7a2', MONO);
  text(ctx, 'The music continues.', x, y + 6, Math.min(30, w * 0.056), WHITE);
  const line = 'dream.start()';
  const count = Math.max(0, Math.min(line.length, Math.floor((t - 29.65) * 10)));
  const size = Math.min(19, w * 0.039);
  const dx = syntax(ctx, line, count, x, y + 56, size);
  if (count < line.length || Math.floor(t * 3) % 2 === 0) {
    ctx.fillStyle = '#efbd92';
    ctx.fillRect(dx + 5, y + 56 - size * 0.8, size * 0.4, size);
  }
  ctx.restore();
}

function feather(ctx: CanvasRenderingContext2D, seconds: number, w: number, h: number): void {
  const born = (INTRO_MUSIC_END - 0.55) / INTRO_SCORE_RATE;
  if (seconds < born || seconds > 23) return;
  const age = seconds - born;
  const morph = ease(0.25, 1.1, age);
  const x = w * (0.76 + Math.sin(age * 1.25) * 0.035 - age * 0.018);
  const y = h * (0.44 - Math.sin(Math.min(1, age / 1.6) * Math.PI) * 0.10 + Math.max(0, age - 1.5) * 0.045);
  const size = Math.min(56, w * 0.105);
  ctx.save();
  ctx.globalAlpha = ease(0, 0.14, age) * (1 - ease(2.9, 3.85, age));
  ctx.translate(x, y);
  ctx.rotate(-0.28 + Math.sin(age * 1.8) * 0.32);
  glow(ctx, 0, 0, size * 1.3, '#e9f1ff15');
  ctx.save();
  ctx.globalAlpha *= 1 - morph;
  ctx.textAlign = 'center';
  text(ctx, '♪', 0, 5, size * 0.76, '#e9f1ed', 'serif');
  ctx.restore();
  ctx.globalAlpha *= morph;
  ctx.scale(size / 50, size / 50);
  ctx.beginPath();
  ctx.moveTo(-3, 28);
  ctx.bezierCurveTo(-25, 11, -24, -13, 5, -29);
  ctx.bezierCurveTo(23, -8, 17, 12, -3, 28);
  ctx.fillStyle = '#edf2efca';
  ctx.fill();
  ctx.strokeStyle = '#fffefa';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-6, 35);
  ctx.quadraticCurveTo(0, 2, 5, -28);
  ctx.stroke();
  ctx.strokeStyle = '#aab9b75c';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 14; i++) {
    const y = -23 + i * 3.6;
    const spine = 2 - y * 0.09;
    const breadth = Math.sin((i + 1) / 16 * Math.PI) * 17;
    ctx.beginPath();
    ctx.moveTo(spine, y);
    ctx.quadraticCurveTo(spine - breadth * 0.55, y - 1, spine - breadth, y - 8);
    ctx.moveTo(spine, y);
    ctx.quadraticCurveTo(spine + breadth * 0.55, y - 1, spine + breadth * 0.8, y - 8);
    ctx.stroke();
  }
  ctx.restore();
}

/** 每一帧完全由播放时间决定，拖动、重播与暂停无需恢复绘图状态。 */
export function drawIntro(ctx: CanvasRenderingContext2D, timeSeconds: number,
  images: IntroImages, width: number, height: number): void {
  const t = timeSeconds * INTRO_SCORE_RATE;
  const stageHeight = Math.max(1, height - 74);
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  if (timeSeconds < STORY_AT + 1.2) {
    growingWorld(ctx, t, images.night, width, stageHeight);
    command(ctx, t, width, stageHeight);
    conversation(ctx, t, width, stageHeight);
    senses(ctx, t, width, stageHeight);
    branches(ctx, t, width, stageHeight);
    voices(ctx, t, width, stageHeight);
    heading(ctx, t, width, stageHeight);
    autonomous(ctx, t, width, stageHeight);
  }
  if (timeSeconds >= STORY_AT) drawStory(ctx, timeSeconds, images, width, stageHeight);
  feather(ctx, timeSeconds, width, stageHeight);
  ctx.restore();
}
