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
