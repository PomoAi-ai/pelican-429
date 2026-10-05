/**
 * ?debug 调试键：按 N 切换手动 / 自动降水，保留手动雨雪强度（顺序 = PRECIP_DEBUG_CYCLE）。
 * 只调用传入的 apply（main：环境命令 setPrecipMode，不写保存值，与 V 键循环风模式一致）；返回移除监听的函数。
 */
import { PRECIP_DEBUG_CYCLE } from '../config/precip-rules.ts';
import type { PrecipMode } from '../config/precip-rules.ts';

export const PRECIP_DEBUG_KEY = 'KeyN';

/** 循环中的下一个模式（不在循环表中即抛）。 */
export function nextPrecipMode(current: PrecipMode): PrecipMode {
  const i = PRECIP_DEBUG_CYCLE.indexOf(current);
  if (i < 0) throw new Error(`precip-debug: mode ${String(current)} is not in the debug cycle`);
  return PRECIP_DEBUG_CYCLE[(i + 1) % PRECIP_DEBUG_CYCLE.length] as PrecipMode;
}

interface KeyTarget {
  addEventListener(type: 'keydown', listener: (e: KeyboardEvent) => void): void;
  removeEventListener(type: 'keydown', listener: (e: KeyboardEvent) => void): void;
}

export function installPrecipDebugKey(target: KeyTarget, current: () => PrecipMode, apply: (mode: PrecipMode) => void): () => void {
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.code !== PRECIP_DEBUG_KEY || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const next = nextPrecipMode(current());
    apply(next);
    console.info(`[weather] precip mode → ${next}`);
  };
  target.addEventListener('keydown', onKeyDown);
  return () => target.removeEventListener('keydown', onKeyDown);
}
