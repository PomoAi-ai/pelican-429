import { FINALE_CUES as C } from '../config/intro-finale.ts';
import { clamp, MONO, seeded, smooth, TAU } from './intro-edition-shared.ts';

export type Point = readonly [number, number];
export const IVORY = '#f4f1e8';
export const GOLD = '#f8d791';
export const CYAN = '#8be6e2';
export const VIOLET = '#b1aaff';
export const CORAL = '#f0ac8e';
/** 风暴一幕的冷紫红：与前两幕的青、金和高潮的金色形成明确的色相断裂。 */
export const STORM = '#ff3d7f';
export const STORM_VIOLET = '#8b5cff';
export const mix = (a: number, b: number, p: number): number => a + (b - a) * p;
export const hit = (t: number, at: number, decay = 7): number => t >= at ? Math.exp(-(t - at) * decay) : 0;
export const envelope = (t: number, from: number, to: number, fade = .3): number =>
  smooth(from, from + fade, t) * (1 - smooth(to - fade, to, t));

export function label(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number,
  maxWidth: number, color: string, font = MONO, weight = 400, align: CanvasTextAlign = 'center'): void {
  ctx.font = `${weight} ${size}px ${font}`;
  const fitted = Math.min(size, size * maxWidth / ctx.measureText(value).width);
  ctx.font = `${weight} ${fitted}px ${font}`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(value, x, y);
}

export function stroke(ctx: CanvasRenderingContext2D, points: readonly Point[], color: string, width = 1): void {
  ctx.beginPath(); ctx.moveTo(points[0]![0], points[0]![1]);
  for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}

export function drawPath(ctx: CanvasRenderingContext2D, points: readonly Point[], progress: number, color: string,
  width = 1): void {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i]![0], p[1] - points[i]![1]));
  let remaining = lengths.reduce((a, b) => a + b, 0) * clamp(progress);
  ctx.beginPath(); ctx.moveTo(points[0]![0], points[0]![1]);
  for (let i = 0; i < lengths.length && remaining > 0; i++) {
    const a = points[i]!; const b = points[i + 1]!; const f = Math.min(1, remaining / lengths[i]!);
    ctx.lineTo(mix(a[0], b[0], f), mix(a[1], b[1], f)); remaining -= lengths[i]!;
  }
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.stroke();
}

export function star(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, cross = false): void {
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();
  if (cross) {
    ctx.beginPath(); ctx.moveTo(x - radius * 3.5, y); ctx.lineTo(x + radius * 3.5, y);
    ctx.moveTo(x, y - radius * 3.5); ctx.lineTo(x, y + radius * 3.5);
    ctx.strokeStyle = color; ctx.lineWidth = .55; ctx.stroke();
  }
}

export function note(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, tilt = 0): void {
  ctx.save(); ctx.translate(x, y); ctx.rotate(tilt); ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(0, 0, size * .31, size * .21, -.35, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(size * .28, 0); ctx.lineTo(size * .28, -size);
  ctx.bezierCurveTo(size * .28, -size * .7, size * .86, -size * .85, size * .56, -size * .48);
  ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.1, size * .065); ctx.stroke(); ctx.restore();
}

const CIRCUIT: readonly Point[] = [[.065,.69],[.23,.69],[.23,.58],[.39,.58],[.39,.77],
  [.62,.77],[.62,.51],[.8,.51],[.8,.69],[.935,.69]];

/** Every stage deforms the same sampled line, so its light keeps a continuous identity. */
export function ribbonPoint(u: number, t: number, w: number, h: number, voice: number): Point {
  const spread = smooth(2.6, 4.6, t);
  const x = w * (.5 + (u - .5) * .87 * spread);
  const circuitIndex = u * (CIRCUIT.length - 1);
  const ci = Math.min(CIRCUIT.length - 2, Math.floor(circuitIndex));
  const a = CIRCUIT[ci]!; const b = CIRCUIT[ci + 1]!; const section = circuitIndex - ci;
  const cx = w * mix(a[0], b[0], section); const cy = h * mix(a[1], b[1], section);
  const staffY = h * .66 + Math.sin(u * Math.PI) * h * .022;
  const build = smooth(7.2, 9, t) * (1 - smooth(11.7, 12.5, t));
  const wave = smooth(11.7, 12.7, t);
  // 三声部在高潮回归时才拉开，星座聚拢时绕成环。
  const braid = smooth(C.rise - .3, C.rise + .5, t);
  const orbit = smooth(C.astra - .3, C.astra + 1, t);
  const wx = x;
  const wy = h * (.66 + Math.sin(u * TAU * (1.2 + voice * .13) - t * 1.8 + voice * 1.3) * (.037 + wave * .045));
  let px = mix(x, cx, build); let py = mix(staffY, cy, build);
  py = mix(py, wy + voice * h * .055 * braid, wave);
  px = mix(px, wx, wave);
  const angle = u * TAU * .94 + t * .18 + voice * .28;
  const ox = w * (.5 + Math.cos(angle) * (.39 + voice * .018));
  const oy = h * (.47 + Math.sin(angle) * (.12 + voice * .022));
  return [mix(px, ox, orbit), mix(py, oy, orbit)];
}

interface GlyphPoint { readonly x: number; readonly y: number; readonly light: number }
let astraPoints: readonly GlyphPoint[] | undefined;

/** Sample once at a fixed resolution; the constellation scales with the viewport afterwards. */
export function constellationPoints(): readonly GlyphPoint[] {
  if (astraPoints) return astraPoints;
  const surface = document.createElement('canvas'); surface.width = 1100; surface.height = 280;
  const ctx = surface.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('intro-finale: cannot create the ASTRA constellation canvas');
  ctx.font = '900 238px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff'; ctx.fillText('ASTRA', 550, 146);
  const pixels = ctx.getImageData(0, 0, 1100, 280).data;
  const points: GlyphPoint[] = [];
  for (let y = 20; y < 260; y += 6) for (let x = 40; x < 1060; x += 6) {
    const alpha = pixels[(y * 1100 + x) * 4 + 3]!;
    if (alpha > 100) points.push({ x: x / 1100 - .5, y: y / 1100, light: .4 + seeded(x * 3 + y) * .6 });
  }
  astraPoints = points;
  return points;
}
