/**
 * 调参校验原语（从 tuning.ts 拆出，任务 019 收尾）：非法即抛，错误信息 `Invalid tuning: <路径> <规则>, got <值>`。
 */

export function fail(path: string, rule: string, value: unknown): never {
  throw new Error(`Invalid tuning: ${path} ${rule}, got ${String(value)}`);
}

export function finite(path: string, v: number): void {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'must be a finite number', v);
}
export function positive(path: string, v: number): void {
  finite(path, v);
  if (v <= 0) fail(path, 'must be > 0', v);
}
export function nonNegative(path: string, v: number): void {
  finite(path, v);
  if (v < 0) fail(path, 'must be >= 0', v);
}
export function ticks(path: string, v: number, min = 0): void {
  if (!Number.isInteger(v) || v < min) fail(path, `must be an integer >= ${min}`, v);
}
export function unit(path: string, v: number, allowZero: boolean): void {
  finite(path, v);
  if (v > 1 || v < 0 || (!allowZero && v === 0)) fail(path, allowZero ? 'must be in [0,1]' : 'must be in (0,1]', v);
}

export function intRange(path: string, v: number, min: number, max: number): void {
  if (!Number.isInteger(v) || v < min || v > max) fail(path, `must be an integer in [${min},${max}]`, v);
}

export function inRange(path: string, v: number, min: number, max: number): void {
  finite(path, v);
  if (v < min || v > max) fail(path, `must be in [${min},${max}]`, v);
}
