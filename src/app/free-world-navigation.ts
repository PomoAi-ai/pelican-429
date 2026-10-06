import { parseSeed } from '../config/game-settings.ts';
import type { FreeWorldSize } from '../config/free-world.ts';

/** 重新生成与快速旅行保留同一世界的种子、规模和 GM 状态。 */
export function freeWorldSearch(current: string, seed: number, gm: boolean, region: string, size: FreeWorldSize): string {
  const params = new URLSearchParams(current);
  for (const key of ['level', 'scene', 'inspect', 'composition', 'material', 'environment', 'debug', 'mapTeleport', 'perfPanel', 'tileGrid', 'dummyShoot']) params.delete(key);
  params.set('mode', 'game');
  params.set('free', '1');
  params.set('seed', String(parseSeed(String(seed))));
  params.set('gm', gm ? '1' : '0');
  params.set('region', region);
  params.set('size', size);
  return `?${params}`;
}
