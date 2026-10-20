/** 城区开场的网址参数：入口 from 与交通中心直接发射 flight；非法值在这里抛错。 */
import { TRANSIT_DESTINATIONS } from '../../config/transit.ts';
import type { Vec2 } from '../../core/math.ts';
import { cityEntrySpawn, type CityState } from '../../sim/city.ts';
import { getPlayer, type SimWorld } from '../../sim/sim-world.ts';
import { launchTransitFlight } from '../../sim/transit.ts';

/** 城区入口的出生点：from=wilds 在城区右端，from=transit 在交通中心街面旁；没有 from 为 null。 */
export function cityEntry(params: URLSearchParams, city: CityState): Vec2 | null {
  const from = params.get('from');
  if (from === null) return null;
  if (from !== 'wilds' && from !== 'transit') throw new Error(`未知城区入口：from=${from}`);
  return cityEntrySpawn(city, from);
}

/** flight=<目的地>：城区交通中心跳过登舱直接发射（星舰飞行测试）。这是首个 tick 之前的初始状态，直接写入而不经命令。 */
export function launchFlightFromUrl(params: URLSearchParams, world: SimWorld): void {
  const flight = params.get('flight');
  if (flight === null) return;
  const target = TRANSIT_DESTINATIONS.find(item => item.id === flight);
  if (!target) throw new Error(`网址参数 flight 不是交通中心目的地：${flight}`);
  const transit = world.city?.transit;
  if (!transit) throw new Error('flight 只能在主世界城区使用：?mode=game&from=transit&flight=…');
  launchTransitFlight(transit, getPlayer(world).body, target.id);
}
