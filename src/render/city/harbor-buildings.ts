import { hash01 } from '../../core/rng.ts';
import type { HarborBuilding } from '../../config/harbor-perspective.ts';
import type { AiCityBatches } from './ai-city-batches.ts';

function addWindows(city: AiCityBatches, building: HarborBuilding, x: number, bottom: number,
  z: number, width: number, depth: number, height: number, roof?: (localX: number) => number,
  widthAt?: (height: number) => number): void {
  const { detail } = building;
  const seed = building.seed + Math.floor(x * 17 + z * 29);
  const floorHeight = detail === 0 ? 4.4 : 2.2;
  const spacing = detail === 2 ? 1.65 : 2.05;
  for (let face = 0; face < 4; face++) {
    const front = face < 2;
    const side = face % 2 === 0 ? 1 : -1;
    for (let floor = 0; floor * floorHeight + 1.35 < height - .65; floor++) {
      const y = floor * floorHeight + 1.35;
      const rowWidth = widthAt ? widthAt(y) : width;
      if (rowWidth < .9) continue;
      const span = front ? rowWidth : depth;
      const count = Math.max(1, Math.floor((span - .8) / spacing));
      const occupied = .15 + hash01(floor + Math.floor(bottom / 2.2), face, seed) * .55;
      for (let column = 0; column < count; column++) {
        const along = (column - (count - 1) / 2) * spacing;
        const localX = front ? along : side * rowWidth / 2;
        if (roof && y > roof(localX) - .7) continue;
        const lit = hash01(column + face * 97, floor + Math.floor(bottom / 2.2) * 31, seed) < occupied;
        if (!lit) continue;
        const rhythm = hash01(column, Math.floor(floor / 4) + face * 101, seed + 5);
        const ww = detail === 2 ? (rhythm < .25 ? 1.2 : rhythm > .68 ? .24 : .58) : .52;
        const hh = detail === 0 ? .62 : detail === 2 && rhythm > .68 ? 1.4 : rhythm < .25 ? .64 : 1.02;
        const tilt = !front && widthAt ? -Math.atan2(side * (widthAt(y + .1) - widthAt(y - .1)), .2) : 0;
        const color = detail === 2 && hash01(column + 17, floor, seed) < .22 ? 'gold' : 'window';
        city.put('panel', color, x + localX + (front ? 0 : side * .035), bottom + y,
          z + (front ? side * (depth / 2 + .035) : along),
          front ? ww : .045, hh, front ? .045 : ww, 0, 0, tilt);
      }
    }
  }
}

function addBlock(city: AiCityBatches, building: HarborBuilding, x: number, bottom: number,
  z: number, width: number, depth: number, height: number): void {
  const { detail } = building;
  const frame = detail === 0 ? 'far' : 'blue';
  const glass = detail === 2 ? 'glass' : detail === 1 ? 'cityGlass' : 'farGlass';
  city.put('panel', glass, x, bottom + height / 2, z, width, height, depth);
  for (const sideX of [-1, 1]) for (const sideZ of [-1, 1]) {
    city.put('panel', frame, x + sideX * (width / 2 - .1), bottom + height / 2,
      z + sideZ * (depth / 2 - .1), .27, height + .1, .27);
  }
  city.put('panel', frame, x, bottom + height - .16, z, width + .12, .32, depth + .12);
  const bandSpace = detail === 0 ? 13.2 : 6.6;
  for (let y = bandSpace; y < height - 1; y += bandSpace) {
    city.put('panel', frame, x, bottom + y, z, width + .08, .12, depth + .08);
  }
  if (detail === 2) {
    for (let side = -1; side <= 1; side += 2) {
      city.put('panel', 'farGlass', x - width * .23, bottom + height * .48,
        z + side * (depth / 2 + .012), width * .11, height * .88, .022);
      for (let xx = -width / 2 + 3.3; xx < width / 2 - 1; xx += 3.3) {
        city.put('panel', 'ivory', x + xx, bottom + height / 2,
          z + side * (depth / 2 + .045), .075, height, .08);
      }
      city.put('panel', 'cityGlass', x + side * (width / 2 + .012), bottom + height * .48,
        z + depth * .16, .022, height * .88, depth * .15);
      for (let zz = -depth / 2 + 3.3; zz < depth / 2 - 1; zz += 3.3) {
        city.put('panel', 'ivory', x + side * (width / 2 + .045), bottom + height / 2,
          z + zz, .08, height, .075);
      }
    }
  }
  addWindows(city, building, x, bottom, z, width, depth, height);
}

function addPodium(city: AiCityBatches, building: HarborBuilding, height: number): void {
  const { x, z, width: w, depth: d, detail, seed } = building;
  city.put('box', 'stone', x, .28, z, w + 1.5, .56, d + 1.5);
  city.put('panel', detail === 0 ? 'far' : 'blue', x, height / 2 + .28, z, w + .8, height - .56, d + .8);
  city.put('panel', 'ivory', x, height, z, w + 1.2, .22, d + 1.2);
  const entrance = Math.min(3.2, w * .26);
  city.put('panel', 'glass', x, height * .46, z + d / 2 + .43, entrance, height * .65, .08);
  city.put('panel', 'gold', x, height * .83, z + d / 2 + .65, entrance + 1.2, .16, 1.05);
  city.put('panel', 'window', x, height * .74, z + d / 2 + .49, entrance * .7, .12, .04);
  if (detail === 0) return;
  for (const side of [-1, 1]) {
    for (let column = 0; column < Math.floor(w / 1.9); column++) {
      const xx = x + (column - (Math.floor(w / 1.9) - 1) / 2) * 1.9;
      if (side === 1 && Math.abs(xx - x) < entrance / 2 + .6) continue;
      city.put('panel', hash01(column, side, seed) > .3 ? 'window' : 'glass', xx,
        height * .47, z + side * (d / 2 + .43), .86, height * .53, .05);
    }
    city.put('panel', 'blue', x + side * (entrance / 2 + .15), height * .44,
      z + d / 2 + .49, .14, height * .7, .15);
    city.put('panel', 'gold', x + side * (w / 2 - .3), height * .5,
      z + d / 2 + .45, .06, height * .62, .06);
  }
}

function addRooftop(city: AiCityBatches, building: HarborBuilding, x: number, y: number, z: number,
  width: number, depth: number): void {
  const { detail } = building;
  city.put('panel', detail === 0 ? 'far' : 'blue', x, y + .16, z, width + .15, .32, depth + .15);
  city.put('panel', 'ivory', x - width * .19, y + .5, z - depth * .16, width * .24, .65, depth * .28);
  if (detail > 0) {
    city.put('panel', 'blue', x + width * .17, y + .4, z + depth * .08, width * .22, .48, depth * .32);
    for (const side of [-1, 1]) {
      city.put('cylinder', 'gold', x + side * width * .38, y + .56, z, .055, 1.2, .055);
      city.put('sphere', 'light', x + side * width * .38, y + 1.2, z, .09, .09, .09);
    }
  }
  if (detail === 2 && building.kind === 'slab' && hash01(4, 8, building.seed) > .55) {
    const radius = Math.min(width, depth) * .22;
    const px = x + width * .18, pz = z + depth * .12;
    city.put('cylinder', 'blue', px, y + .44, pz, radius + .15, .2, radius + .15);
    city.put('ring', 'ivory', px, y + .56, pz, radius, radius, 1.8, Math.PI / 2);
    for (const side of [-1, 1]) city.put('panel', 'ivory', px + side * radius * .2,
      y + .57, pz, .08, .025, radius * .6);
    city.put('panel', 'ivory', px, y + .57, pz, radius * .4, .025, .08);
  }
}

function addBlade(city: AiCityBatches, building: HarborBuilding, bottom: number, height: number): void {
  const { x, z, width: w, depth: d, detail } = building;
  const glass = detail === 2 ? 'glass' : detail === 1 ? 'cityGlass' : 'farGlass';
  const roof = (xx: number): number => xx < -w * .12
    ? height * (.94 + (xx + w / 2) / (w * .38) * .06)
    : height * (1 - (xx + w * .12) / (w * .62) * .19);
  city.landform([
    [x - w / 2, bottom], [x + w / 2, bottom],
    [x + w / 2, bottom + height * .81], [x - w * .12, bottom + height],
    [x - w / 2, bottom + height * .94],
  ], z, d, glass);
  addWindows(city, building, x, bottom, z, w, d, height, roof);
  for (const side of [-1, 1]) {
    const top = roof(side * w / 2);
    for (const sideZ of [-1, 1]) {
      city.put('panel', detail === 0 ? 'far' : 'blue', x + side * (w / 2 - .1), bottom + top / 2,
        z + sideZ * (d / 2 - .1), .26, top, .26);
    }
  }
  const points = [[-w / 2, height * .94], [-w * .12, height], [w / 2, height * .81]] as const;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (const side of [-1, 1]) {
      city.put('panel', detail === 0 ? 'far' : 'ivory', x + (a[0] + b[0]) / 2,
        bottom + (a[1] + b[1]) / 2, z + side * (d / 2 + .03), length, .18, .18,
        0, 0, Math.atan2(b[1] - a[1], b[0] - a[0]));
    }
  }
  if (detail > 0) {
    const stripeH = height * .61;
    city.put('panel', 'gold', x - w / 2 + .24, bottom + stripeH / 2,
      z + d / 2 + .05, .12, stripeH, .07);
    city.put('cylinder', 'blue', x - w * .12, bottom + height + .65, z, .07, 1.3, .07);
    city.put('sphere', 'light', x - w * .12, bottom + height + 1.35, z, .1, .1, .1);
  }
  if (detail === 2) {
    for (const side of [-1, 1]) {
      city.put('panel', 'ivory', x + side * w * .43, bottom + height * .4,
        z, .22, height * .8, d + .65);
      for (let bay = 0; bay < 3; bay++) {
        const dx = (bay % 2 === 0 ? 1 : -1) * w * .63;
        const dy = height * .15;
        city.put('panel', bay === 1 ? 'gold' : 'ivory', x, bottom + height * (.22 + bay * .19),
          z + side * (d / 2 + .09), Math.hypot(dx, dy), .13, .13,
          0, 0, Math.atan2(dy, dx));
      }
    }
  }
}

function addSpire(city: AiCityBatches, building: HarborBuilding, bottom: number, height: number): void {
  const { x, z, width: w, depth: d, detail } = building;
  const outline = [[.49, 0], [.43, .34], [.26, .72], [.075, .94], [.025, .985]] as const;
  const widthAt = (y: number): number => {
    const t = y / height;
    for (let i = 1; i < outline.length; i++) {
      const a = outline[i - 1]!, b = outline[i]!;
      if (t <= b[1]) return 2 * w * (a[0] + (b[0] - a[0]) * (t - a[1]) / (b[1] - a[1]));
    }
    return w * .05;
  };
  const shape: [number, number][] = outline.map(([xx, yy]) => [x - xx * w, bottom + yy * height]);
  shape.push(...[...outline].reverse().map(([xx, yy]): [number, number] => [x + xx * w, bottom + yy * height]));
  city.landform(shape, z, d, detail === 2 ? 'glass' : detail === 1 ? 'cityGlass' : 'farGlass');
  addWindows(city, building, x, bottom, z, w, d, height * .985, undefined, widthAt);
  for (const sideX of [-1, 1]) for (const sideZ of [-1, 1]) {
    for (let i = 1; i < outline.length; i++) {
      const a = outline[i - 1]!, b = outline[i]!;
      const dx = sideX * (b[0] - a[0]) * w, dy = (b[1] - a[1]) * height;
      city.put('panel', detail === 0 ? 'far' : sideX === 1 ? 'ivory' : 'gold',
        x + sideX * (a[0] + b[0]) * w / 2, bottom + (a[1] + b[1]) * height / 2,
        z + sideZ * (d / 2 + .06), Math.hypot(dx, dy), detail === 0 ? .16 : .24, .2,
        0, 0, Math.atan2(dy, dx));
    }
  }
  if (detail === 2) {
    for (const side of [-1, 1]) {
      const wing: [number, number][] = [
        [x + side * w * .08, bottom], [x + side * w * .34, bottom],
        [x + side * w * .18, bottom + height * .46], [x + side * w * .08, bottom + height * .6],
      ];
      city.landform(wing, z + d / 2 + .18, .4, 'blue');
    }
    city.put('panel', 'light', x, bottom + height * .43, z + d / 2 + .05, .12, height * .68, .08);
  }
  city.put('cylinder', 'ivory', x, bottom + height * .992, z, .09, height * .025, .09);
  city.put('sphere', 'light', x, bottom + height * 1.008, z, .12, .12, .12);
}

export function addHarborBuilding(city: AiCityBatches, building: HarborBuilding): void {
  const { x, z, width: w, depth: d, height, kind, detail } = building;
  const podium = Math.min(3.8, height * .14);
  const h = height - podium;
  addPodium(city, building, podium);
  if (kind === 'blade') {
    addBlade(city, building, podium, h);
    return;
  }
  if (kind === 'twin') {
    const wing = w * .34;
    addBlock(city, building, x - w * .33, podium, z + d * .05, wing, d * .9, h * .78);
    addBlock(city, building, x + w * .33, podium, z, wing, d, h);
    const bridgeY = podium + h * .63;
    city.put('panel', 'blue', x, bridgeY, z, w * .7, 1.75, d * .35);
    city.put('panel', 'ivory', x, bridgeY + .94, z, w * .73, .13, d * .38);
    for (const side of [-1, 1]) {
      city.put('panel', 'window', x, bridgeY, z + side * (d * .175 + .035), w * .3, .55, .04);
    }
    addRooftop(city, building, x - w * .33, podium + h * .78, z + d * .05, wing, d * .9);
    addRooftop(city, building, x + w * .33, height, z, wing, d);
    return;
  }
  if (kind === 'ring') {
    addBlock(city, building, x, podium, z, w * .67, d * .78, h - 2.5);
    const radius = w * .58;
    for (const sideX of [-1, 1]) for (const sideZ of [-1, 1]) {
      city.put('panel', 'gold', x + sideX * w * .24, height - 1.3,
        z + sideZ * d * .27, .18, 2.5, .18);
    }
    city.put('ring', 'blue', x, height - .52, z, radius, radius, 11, Math.PI / 2);
    city.put('ring', 'ivory', x, height - .21, z, radius, radius, 4.5, Math.PI / 2);
    city.put('ring', 'light', x, height - .48, z, radius * 1.025, radius * 1.025, 2, Math.PI / 2);
    city.put('cylinder', 'blue', x, height - .5, z, w * .16, 1, w * .16);
    city.put('cylinder', 'gold', x, height + .7, z, .055, 1.4, .055);
    city.put('sphere', 'light', x, height + 1.45, z, .09, .09, .09);
    return;
  }
  if (kind === 'spire') {
    addSpire(city, building, podium, h);
    return;
  }
  if (kind === 'stepped') {
    addBlock(city, building, x, podium, z, w, d, h * .52);
    addBlock(city, building, x + w * .045, podium + h * .52, z - d * .045, w * .77, d * .77, h * .29);
    addBlock(city, building, x - w * .025, podium + h * .81, z - d * .08, w * .52, d * .56, h * .19);
    if (detail > 0) {
      for (const level of [.52, .81]) {
        const levelW = w * (level === .52 ? 1 : .77);
        city.put('panel', 'gold', x, podium + h * level + .12, z + d * (level === .52 ? .48 : .34),
          levelW, .12, .12);
      }
    }
    addRooftop(city, building, x - w * .025, height, z - d * .08, w * .52, d * .56);
    return;
  }
  addBlock(city, building, x, podium, z, w, d, h);
  addRooftop(city, building, x, height, z, w, d);
  if (detail === 2) {
    city.put('panel', 'gold', x + w / 2 - .35, podium + h * .42,
      z + d / 2 + .05, .11, h * .84, .08);
  }
}
