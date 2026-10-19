import { parseSeed } from '../config/game-settings.ts';
import { parseFreeWorldSize, type FreeWorldSize } from '../config/free-world.ts';
import { TUNING } from '../config/tuning.ts';

/** 城区与原野共用的网址世界参数：缺省种子取调参默认值，GM 只接受 0 / 1。 */
export function parseMainWorldParams(params: URLSearchParams): { seed: number; gm: boolean; size: FreeWorldSize } {
  const gm = params.get('gm');
  if (gm !== null && gm !== '0' && gm !== '1') throw new Error(`未知 GM 开关：${gm}`);
  return {
    seed: params.has('seed') ? parseSeed(params.get('seed')!) : TUNING.worldgen.seed,
    gm: gm === '1',
    size: parseFreeWorldSize(params.get('size')),
  };
}

/** 重新生成与快速旅行保留同一世界的种子、规模和 GM 状态。 */
export function freeWorldSearch(current: string, seed: number, gm: boolean, region: string, size: FreeWorldSize): string {
  const params = new URLSearchParams(current);
  for (const key of ['level', 'scene', 'demo', 'inspect', 'composition', 'material', 'environment', 'debug', 'mapTeleport', 'perfPanel', 'tileGrid', 'dummyShoot', 'from']) params.delete(key);
  params.set('mode', 'game');
  params.set('free', '1');
  params.set('seed', String(parseSeed(String(seed))));
  params.set('gm', gm ? '1' : '0');
  params.set('region', region);
  params.set('size', size);
  return `?${params}`;
}

/** 城区与原野之间的出口与快速旅行：保留种子、规模、GM 等设置，换到对侧世界的入口；transit 出生在城区交通中心街面。场景页的 demo 不带进游戏页。 */
export function worldMapSearch(current: string, target: 'wilds' | 'city' | 'transit'): string {
  const params = new URLSearchParams(current);
  for (const key of ['level', 'scene', 'demo', 'region', 'free', 'from']) params.delete(key);
  params.set('mode', 'game');
  if (target === 'wilds') params.set('free', '1');
  else params.set('from', target === 'city' ? 'wilds' : 'transit');
  return `?${params}`;
}

/** 场景间跳转带上当前网址的种子、规模与 GM：城区的这三项只存在网址里，丢掉会让原野换成另一个世界。 */
export function keepWorldParams(target: URL | string, current: string): URL {
  const url = target instanceof URL ? new URL(target) : new URL(target, location.href);
  const params = new URLSearchParams(current);
  for (const key of ['seed', 'size', 'gm']) {
    const value = params.get(key);
    if (value !== null) url.searchParams.set(key, value);
  }
  return url;
}
