import type { IntroLanguage } from '../config/intro-language.ts';
import type { IntroEdition } from '../config/intro-editions.ts';
import { INTRO_WORDS } from '../config/intro.ts';
import type { IntroImages } from './intro-story.ts';

export interface EditionFrame {
  readonly language: IntroLanguage;
  readonly ctx: CanvasRenderingContext2D;
  readonly progress: number;
  readonly seconds: number;
  readonly width: number;
  readonly height: number;
  readonly edition: IntroEdition;
  readonly images: IntroImages;
}
export const TAU = Math.PI * 2;
export const MONO = '"SFMono-Regular", Consolas, monospace';
export const SERIF = 'Georgia, "Times New Roman", serif';
export const SANS = 'Arial, "PingFang SC", sans-serif';
export const clamp = (value: number): number => Math.max(0, Math.min(1, value));
export const smooth = (a: number, b: number, value: number): number => { const u = clamp((value - a) / (b - a)); return u * u * (3 - 2 * u); };
export const seeded = (i: number): number => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export function backdrop(frame: EditionFrame): void {
  frame.ctx.fillStyle = frame.edition.background;
  frame.ctx.fillRect(0, 0, frame.width, frame.height);
}
export function text(ctx: CanvasRenderingContext2D, content: string, x: number, y: number, size: number, color: string, font = MONO, align: CanvasTextAlign = 'left'): void {
  ctx.font = `${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillText(content, x, y);
}
export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string): void {
  const g = ctx.createRadialGradient(x,y,0,x,y,radius); g.addColorStop(0,color); g.addColorStop(1,'transparent'); ctx.fillStyle=g; ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
}
export function line(ctx: CanvasRenderingContext2D, points: readonly (readonly [number,number])[], color: string, width = 1): void {
  ctx.beginPath(); ctx.moveTo(points[0]![0],points[0]![1]); for (const p of points.slice(1)) ctx.lineTo(p[0],p[1]); ctx.strokeStyle=color; ctx.lineWidth=width; ctx.stroke();
}
export function room(frame: EditionFrame, opacity: number): void {
  const {ctx,width:w,height:h,images}=frame;
  const scale=Math.min(w/1672,h/941)*.975;
  ctx.save(); ctx.globalAlpha*=opacity; ctx.drawImage(images.night,(w-1672*scale)/2,(h-941*scale)/2,1672*scale,941*scale); ctx.restore();
}
export function modelAt(progress: number): (typeof INTRO_WORDS)[number] {
  const score = Math.max(5, progress * 32);
  return INTRO_WORDS.findLast((entry) => entry.at <= score)!;
}
export function modelColor(family: string): string {
  return family === 'language' ? '#80cdb2' : family === 'code' ? '#e9a272' : family === 'senses' ? '#9ea8ff' : '#b5c986';
}
