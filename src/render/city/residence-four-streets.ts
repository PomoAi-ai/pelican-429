import { districtOutline, DISTRICT_LEVEL, type RiverDistrict } from './residence-four-layout.ts';
import type { AiCityBatches } from './ai-city-batches.ts';

/** 岸线内侧的连续街道把建筑组成街区，临水一侧留出独立的人行带。 */
export function addRiverDistrictStreets(city: AiCityBatches, district: RiverDistrict): void {
  const { put } = city;
  const y = DISTRICT_LEVEL;
  const road = districtOutline(district, 11.5);
  for (let i = 0; i < road.length; i++) {
    const [ax, az] = road[i]!, [bx, bz] = road[(i + 1) % road.length]!;
    const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
    const x = (ax + bx) / 2, z = (az + bz) / 2, angle = -Math.atan2(dz, dx);
    const nx = -dz / length, nz = dx / length;
    put('panel', 'city', x, y + .13, z, length + .22, .1, 6, 0, angle);
    for (const side of [-1, 1]) {
      put('panel', 'stone', x + nx * side * 3.1, y + .23, z + nz * side * 3.1,
        length + .24, .16, .3, 0, angle);
    }
    if (i % 2 === 0) put('panel', 'ivory', x, y + .19, z, Math.min(2, length * .4), .025, .09, 0, angle);
    if (i % 8 !== 2) continue;
    const px = x - nx * 5.7, pz = z - nz * 5.7;
    put('box', 'stone', px, y + .34, pz, 5.2, .55, 1.6, 0, angle);
    put('box', 'green', px, y + .75, pz, 4.9, .55, 1.35, 0, angle);
    const sx = x - nx * 8.2, sz = z - nz * 8.2;
    put('panel', 'gold', sx, y + .55, sz, 2.5, .12, .65, 0, angle);
    put('panel', 'stone', sx, y + .28, sz, 1.6, .5, .4, 0, angle);
  }
  // 商业步行轴与外围街道相交，入口横道留在路面，避免凭空伸入水里。
  const west = road[32]!, east = road[0]!, north = road[48]!, south = road[16]!;
  put('panel', 'paving', (west[0] + east[0]) / 2, y + .15, district.z,
    east[0] - west[0] - 6.4, .16, 7.2);
  put('panel', 'paving', district.x, y + .15, (north[1] + south[1]) / 2,
    6.2, .16, south[1] - north[1] - 6.4);
  for (const [x, z] of [north, south]) {
    for (let stripe = 0; stripe < 5; stripe++) {
      put('panel', 'ivory', x + (stripe - 2) * 1.1, y + .24, z, .55, .025, 5.2);
    }
  }
  if (district.kind === 'garden') {
    // 商廊入口接到真实沿岸道路，打断连续草带；保留中间的草地和植栽。
    const front = district.z + district.depth * .24 + 10;
    for (const side of [-1, 1]) {
      const entranceX = district.x - district.width * .02 + side * 19;
      const junction = road.slice(5, 28).reduce((closest, point) =>
        Math.abs(point[0] - entranceX) < Math.abs(closest[0] - entranceX) ? point : closest);
      const dx = junction[0] - entranceX, dz = junction[1] - front;
      put('panel', 'paving', entranceX + dx / 2, y + .16, front + dz / 2,
        Math.hypot(dx, dz), .2, 4.2, 0, -Math.atan2(dz, dx));
      put('panel', 'stone', entranceX + side * 4, y + .45, front, 3.8, .8, 2);
      put('box', 'green', entranceX + side * 4, y + 1.05, front, 3.5, .65, 1.7);
    }
  }
  // 岸壁下部深色、上部浅色压顶，水面高度始终低于可行走的临水平台。
  const edge = districtOutline(district, .5);
  for (let i = 0; i < edge.length; i++) {
    const [ax, az] = edge[i]!, [bx, bz] = edge[(i + 1) % edge.length]!;
    const length = Math.hypot(bx - ax, bz - az), angle = -Math.atan2(bz - az, bx - ax);
    const x = (ax + bx) / 2, z = (az + bz) / 2;
    put('panel', 'stone', x, y - .5, z, length + .16, .55, .65, 0, angle);
    if (i % 4 === 0) put('panel', 'blue', x, y - .25, z, .35, .75, .7, 0, angle);
  }
}
