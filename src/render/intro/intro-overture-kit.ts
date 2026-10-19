/** 序章绘制的小工具：缓动、确定性噪声、颜色、萤火光点与文字。全部无状态，只缓存与时间无关的贴图。 */

export type Point = readonly [number, number];

/** 一帧的绘制上下文：u 是随舞台缩放的排版单位（16:9 舞台上约为宽度的 1/16）。 */
export interface Frame {
  readonly ctx: CanvasRenderingContext2D;
  readonly t: number;
  readonly w: number;
  readonly h: number;
  readonly u: number;
  readonly cx: number;
  readonly cy: number;
}

export const TAU = Math.PI * 2;
export const SANS = '"PingFang SC", "Microsoft YaHei", sans-serif';
export const MONO = '"SFMono-Regular", Consolas, monospace';

export const CYAN = '#7fe3f0';
export const GOLD = '#f2c46d';
export const CORAL = '#ff9a76';
export const FIREFLY = '#d8f27a';

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
export const ramp = (a: number, b: number, t: number): number => clamp01((t - a) / (b - a));
export const smooth = (a: number, b: number, t: number): number => {
  const x = ramp(a, b, t);
  return x * x * (3 - 2 * x);
};
export const easeIn = (x: number): number => x * x * x;
export const easeOut = (x: number): number => 1 - (1 - x) ** 3;
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
export const lerpPoint = (a: Point, b: Point, k: number): Point => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
export const noise = (i: number): number => {
  const value = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
};
/** 拍点后的指数衰减，拍点前为 0：所有冲击都由它驱动，因此任意时刻都能直接求值。 */
export const hit = (t: number, at: number, decay: number): number => (t >= at ? Math.exp(-(t - at) * decay) : 0);

export function pulse(t: number, times: readonly number[], decay: number): number {
  let value = 0;
  for (const at of times) value = Math.max(value, hit(t, at, decay));
  return value;
}

/** 最近一次已发生的时刻的下标，尚未开始时为 -1。 */
export function latestIndex(times: readonly number[], t: number): number {
  let index = -1;
  times.forEach((at, i) => { if (at <= t) index = i; });
  return index;
}

function channels(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = channels(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function mixHex(a: string, b: string, k: number): string {
  const ca = channels(a);
  const cb = channels(b);
  const value = ca.map((c, i) => Math.round(lerp(c, cb[i]!, clamp01(k))));
  return `#${((1 << 24) | (value[0]! << 16) | (value[1]! << 8) | value[2]!).toString(16).slice(1)}`;
}

const sprites = new Map<string, HTMLCanvasElement>();

/** 每种颜色只生成一次的萤火光晕贴图，避免每帧为几十只萤火新建径向渐变。 */
function sprite(color: string): HTMLCanvasElement {
  const cached = sprites.get(color);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d')!;
  const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, rgba('#fffbe6', 1));
  gradient.addColorStop(0.13, rgba(color, 0.95));
  gradient.addColorStop(0.38, rgba(color, 0.26));
  gradient.addColorStop(1, rgba(color, 0));
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 64);
  sprites.set(color, canvas);
  return canvas;
}

/** 在当前透明度上叠加一个光点。 */
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, alpha: number): void {
  if (alpha <= 0.003 || radius <= 0) return;
  const base = ctx.globalAlpha;
  ctx.globalAlpha = base * Math.min(1, alpha);
  ctx.drawImage(sprite(color), x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = base;
}

let scratch: HTMLCanvasElement | undefined;

/** 像素化与星座取样共用的离屏画布；两者都在同一次调用内用完，不跨帧保留内容。 */
export function scratchCanvas(width: number, height: number): CanvasRenderingContext2D {
  scratch ??= document.createElement('canvas');
  scratch.width = Math.max(1, Math.ceil(width));
  scratch.height = Math.max(1, Math.ceil(height));
  return scratch.getContext('2d', { willReadFrequently: true })!;
}

export const font = (size: number, family: string, weight = 400): string =>
  `${weight} ${Math.max(1, size).toFixed(2)}px ${family}`;

export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number,
  color: string, family = SANS, weight = 400, align: CanvasTextAlign = 'center'): void {
  ctx.font = font(size, family, weight);
  ctx.textAlign = align;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** 当前字体下每个字符的左边缘；用于逐字动画。 */
export function letterXs(ctx: CanvasRenderingContext2D, text: string, left: number): number[] {
  return [...text].map((_, i) => left + ctx.measureText(text.slice(0, i)).width);
}

/** 带字距的逐字绘制（居中），返回总宽。 */
export function spaced(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number,
  color: string, family: string, spacing: number, weight = 400): number {
  ctx.font = font(size, family, weight);
  ctx.textAlign = 'left';
  ctx.fillStyle = color;
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((sum, value) => sum + value, 0) + spacing * (chars.length - 1);
  let cursor = x - total / 2;
  chars.forEach((c, i) => {
    ctx.fillText(c, cursor, y);
    cursor += widths[i]! + spacing;
  });
  return total;
}

export function ring(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number,
  color: string, alpha: number, width: number): void {
  if (alpha <= 0.003) return;
  const base = ctx.globalAlpha;
  ctx.globalAlpha = base * alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = base;
}

/** 由多次重击叠加出的画面震动；按 40Hz 取噪声，带顿挫感。 */
export function shake(t: number, hits: readonly (readonly [number, number])[], u: number): Point {
  let amount = 0;
  for (const [at, amplitude] of hits) amount += amplitude * hit(t, at, 14);
  const step = Math.floor(t * 40);
  return [(noise(step * 7 + 1) - 0.5) * 2 * amount * u, (noise(step * 7 + 4) - 0.5) * 2 * amount * u];
}
