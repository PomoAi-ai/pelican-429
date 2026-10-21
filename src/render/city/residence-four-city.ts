import * as THREE from 'three';
import { mulberry32 } from '../../core/rng.ts';
import { DISTRICT_LEVEL, RIVER_LEFT, RIVER_RIGHT, residenceRiverDistricts, type RiverDistrict } from './residence-four-layout.ts';
import { createAiCityBatches, type AiCityBatches } from './ai-city-batches.ts';
import { addHarborBuilding, type HarborBuilding } from './harbor-buildings.ts';
import { configureHarborCity } from './harbor-city.ts';
import { createRiverParkTrees } from './residence-four-vegetation.ts';
import { createResidenceFourAtmosphere } from './residence-four-atmosphere.ts';
import type { PrecipSkyLook } from '../sky/precip-sky.ts';

const GROUND = DISTRICT_LEVEL;

function finishDistrict(city: AiCityBatches): void {
  configureHarborCity(city);
  const m = city.material;
  m.ivory.color.set('#e9e0cb'); m.ivory.roughness = .52;
  m.blue.color.set('#ded7c8'); m.blue.metalness = .08; m.blue.roughness = .58;
  m.stone.color.set('#c5bda9'); m.paving.color.set('#9c9b8e');
  m.glass.color.set('#668596'); m.glass.metalness = .04; m.glass.roughness = .34;
  m.cityGlass.color.set('#7a929f'); m.cityGlass.metalness = .03; m.cityGlass.roughness = .4;
  m.farGlass.color.set('#718e9f'); m.farGlass.metalness = .02; m.far.color.set('#8fa9b6');
  m.gold.color.set('#c8a76d'); m.gold.emissiveIntensity = .05;
  m.green.color.set('#677e4c'); m.window.color.set('#b7b3a5');
  m.city.color.set('#58656b'); m.city.roughness = .7;
  m.window.emissive.set('#ffca82');
  for (const [role, material] of Object.entries(m)) {
    material.userData.riverSurface = role;
    material.fog = false;
    material.userData.noLightMap = true;
    material.userData.noPrecip = true;
  }
  city.root.position.y = GROUND;
  city.flush();
}

function addResidentialFloor(city: AiCityBatches, x: number, bottom: number, z: number,
  width: number, depth: number, seed: number): void {
  const height = 3.6, bayCount = Math.max(2, Math.floor(width / 4));
  const bayWidth = (width - 1.1) / bayCount;
  city.put('panel', 'stone', x, bottom + .14, z, width, .28, depth);
  city.put('panel', 'ivory', x, bottom + height - .1, z, width, .2, depth);
  city.put('panel', 'stone', x, bottom + 1.8, z, width - 1.8, 2.9, depth - 2);
  for (const side of [-1, 1]) {
    const faceZ = z + side * depth / 2;
    city.put('panel', 'cityGlass', x, bottom + 1.8, faceZ - side * .75, width - 1, 2.9, .1);
    for (let bay = 0; bay < bayCount; bay++) {
      const bx = x + (bay - (bayCount - 1) / 2) * bayWidth;
      city.put('panel', (bay + seed) % 5 === 1 ? 'window' : 'glass', bx, bottom + 1.8,
        faceZ - side * .63, bayWidth - .7, 2.55, .09);
      city.put('panel', 'gold', bx, bottom + 1.8, faceZ - side * .56, .065, 2.55, .08);
      if ((bay + seed) % 3 === 0) {
        for (let slat = 0; slat < 3; slat++) {
          city.put('panel', 'blue', bx - bayWidth * .25 + slat * .38, bottom + 1.85,
            faceZ + side * .14, .09, 2.8, .48, 0, side * .28);
        }
      }
    }
    for (let pier = 0; pier <= bayCount; pier++) {
      city.put('panel', 'ivory', x + (pier - bayCount / 2) * bayWidth,
        bottom + 1.8, faceZ - side * .2, .54, 3.1, 1.05);
    }
    city.put('panel', 'ivory', x, bottom + 3.25, faceZ + side * .15, width - .3, .12, .55);
    city.put('panel', 'ivory', x + side * (width / 2 - .25), bottom + 1.8, z, .5, 3.1, depth);
    city.put('panel', 'glass', x + side * (width / 2 + .025), bottom + 1.8, z, .04, 2.2, depth * .42);
  }
}

function addTerrace(city: AiCityBatches, x: number, z: number, width: number, floors: number, seed: number): void {
  const depth = 14 + seed % 4 * 2, floorHeight = 3.6;
  const handed = seed % 2 === 0 ? 1 : -1;
  city.put('panel', 'stone', x, .2, z, width + 1.8, .4, depth + 1.8);
  const wings = [
    { dx: -handed * width * .16, dz: -depth * .12, w: width * .65, d: depth * .73, floors },
    { dx: handed * width * .33, dz: depth * .08, w: width * .3, d: depth * .83, floors: Math.max(1, floors - 1) },
  ];
  for (const [index, wing] of wings.entries()) {
    for (let floor = 0; floor < wing.floors; floor++) {
      const inset = floor === wing.floors - 1 && wing.floors > 2 ? .12 : 0;
      const fx = x + wing.dx + handed * (floor % 2) * .35;
      const fz = z + wing.dz - inset * depth * .2;
      addResidentialFloor(city, fx, .4 + floor * floorHeight, fz,
        wing.w * (1 - inset), wing.d * (1 - inset), seed + index + floor);
    }
    const roof = .4 + wing.floors * floorHeight;
    const cx = x + wing.dx, cz = z + wing.dz;
    city.put('panel', 'paving', cx, roof + .06, cz, wing.w * .67, .12, wing.d * .68);
    city.put('panel', 'city', cx + handed * wing.w * .2, roof + .8, cz - 1,
      wing.w * .25, 1.3, wing.d * .27);
    city.put('panel', 'city', cx + handed * wing.w * .2, roof + 1.5, cz - 1,
      wing.w * .27, .12, wing.d * .3);
    for (let vent = 0; vent < 3; vent++) {
      city.put('panel', 'blue', cx + handed * wing.w * .2, roof + .4 + vent * .26,
        cz - 1 + wing.d * .14, wing.w * .2, .065, .1);
    }
    const planterX = cx - handed * wing.w * .29;
    city.put('panel', 'stone', planterX, roof + .35, cz + 1, 2, .7, wing.d * .6);
    for (let plant = 0; plant < 4; plant++) {
      city.put('sphere', 'green', planterX, roof + 1 + plant % 2 * .4,
        cz - wing.d * .2 + plant * wing.d * .14, 1.15, 1 + plant % 2 * .3, 1.1);
    }
  }
  const balconyWidth = width * .35, balconyZ = z + depth * .46;
  const balconyX = x - handed * width * .2;
  const balconyY = floorHeight + .4;
  city.put('panel', 'ivory', balconyX, balconyY, balconyZ, balconyWidth, .24, 2.1);
  city.put('panel', 'gold', balconyX, balconyY + 1.1, balconyZ + .9, balconyWidth, .06, .06);
  for (let dx = -balconyWidth / 2; dx <= balconyWidth / 2; dx += 1.2) {
    city.put('panel', 'blue', balconyX + dx, balconyY + .55, balconyZ + .9, .055, 1.1, .055);
  }
  city.put('panel', 'stone', balconyX + handed * balconyWidth * .35, balconyY + .35,
    balconyZ, balconyWidth * .25, .7, 1.4);
  city.put('sphere', 'green', balconyX + handed * balconyWidth * .35, balconyY + .9,
    balconyZ, balconyWidth * .15, .75, .75);
}

function addResidentialTower(city: AiCityBatches, x: number, z: number, height: number, handed: number): void {
  const width = 17, depth = 19;
  city.put('panel', 'stone', x, 1, z, 25, 2, 25);
  city.put('panel', 'glass', x, height / 2 + 2, z, width, height, depth);
  city.put('panel', 'stone', x + handed * 5.6, height * .43 + 2, z - .8, 6.5, height * .86, depth + 1.5);
  city.put('panel', 'ivory', x + handed * 5.6, height * .86 + 2.3, z - .8, 7, .6, depth + 2.5);
  for (const side of [-1, 1]) {
    for (let dx = -7; dx <= 7; dx += 3.5) {
      city.put('panel', 'ivory', x + dx, height / 2 + 2, z + side * 9.6, .22, height, .45);
    }
    for (let y = 5; y < height + 1; y += 3.8) {
      city.put('panel', 'city', x, y, z + side * 9.56, width, .16, .2);
      if (Math.floor(y) % 3 === 0) city.put('panel', 'window', x - handed * 4, y + .9,
        z + side * 9.58, 3.8, .5, .12);
    }
  }
  const bevel: [number, number][] = [[x - 8.5, height + 2], [x + 8.5, height + 2],
    [x + 8.5, height + (handed > 0 ? 9 : 3)], [x - 8.5, height + (handed > 0 ? 3 : 9)]];
  city.landform(bevel, z, depth, 'glass');
  const roofAngle = Math.atan2(handed * 6, width);
  city.put('panel', 'ivory', x, height + 6, z, Math.hypot(width, 6), .3, depth + .7, 0, 0, roofAngle);
  city.put('panel', 'city', x - handed * 2, height + 3, z - 2, 4, 1.7, 7);
  city.put('panel', 'gold', x - handed * 7.7, height / 2 + 2, z + 9.84, .12, height, .15);
  // The entrance projects from the podium; the taller stone wing carries the upper terrace.
  city.put('panel', 'ivory', x - handed * 2, 4.5, z + 12.8, 14, .5, 5);
  for (const dx of [-5, 5]) city.put('panel', 'stone', x + dx - handed * 2, 2.3, z + 14.4, .5, 4.4, .5);
}

function addWatersideGallery(city: AiCityBatches, x: number, z: number, width: number): void {
  city.put('panel', 'stone', x, .45, z, width + 2, .9, 15);
  city.put('panel', 'paving', x, .16, z + 9, width + 7, .3, 5.5);
  city.put('panel', 'glass', x, 3.2, z, width, 5.5, 12);
  city.put('panel', 'stone', x, 6.1, z - 2.2, width + 1, .7, 9);
  city.put('panel', 'ivory', x, 5.8, z + 6.5, width + 3, .38, 4.2);
  for (let dx = -width / 2 + 1.5; dx < width / 2; dx += 5.5) {
    city.put('panel', 'ivory', x + dx, 3.25, z + 6.55, .45, 5.6, .8);
    city.put('panel', 'gold', x + dx + 1.8, 4.7, z + 6.45, 2.7, .15, .12);
    city.put('panel', 'window', x + dx + 2.7, 3, z + 6.07, 3.4, 3.8, .1);
  }
  for (const dx of [-width * .32, width * .3]) {
    city.put('panel', 'city', x + dx, 7, z - 2, 5.6, 1.3, 4);
    for (let vent = -2; vent <= 2; vent++) city.put('panel', 'stone', x + dx + vent,
      7.7, z - 2, .14, .2, 4.1);
  }
  for (const dx of [-width * .28, width * .26]) {
    city.put('panel', 'stone', x + dx, 6.7, z + 1.8, 10, .6, 2);
    city.put('sphere', 'green', x + dx - 2, 7.3, z + 1.8, 2.1, .7, 1);
    city.put('sphere', 'green', x + dx + 1.5, 7.2, z + 1.8, 2.5, .65, 1);
  }
}

function addPavilion(city: AiCityBatches, x: number, z: number): void {
  city.put('panel', 'ivory', x, .4, z, 62, .8, 32);
  city.put('panel', 'glass', x, 4.3, z, 54, 7.8, 24);
  for (const dx of [-17, 0, 17]) {
    city.put('dome', 'ivory', x + dx, 7.9, z, 13, 5.6, 16);
    city.put('dome', 'glass', x + dx, 8.1, z + .4, 10.6, 5.1, 15.7);
  }
  for (let dx = -26; dx <= 26; dx += 5.2) {
    city.put('panel', 'ivory', x + dx, 4.4, z + 12.6, .5, 8, 1.2);
  }
  city.put('panel', 'gold', x, 8.2, z + 13.3, 56, .14, .16);
}

function addSkyGarden(city: AiCityBatches, x: number, y: number, z: number, side: number): void {
  const center = x + side * 14;
  city.put('cylinder', 'ivory', center, y, z, 17, .8, 9);
  city.put('cylinder', 'gold', center, y - .45, z, 16.8, .14, 8.8);
  city.put('cylinder', 'paving', center, y + .45, z, 15.5, .12, 7.5);
  city.put('panel', 'ivory', x + side * 7, y - 7, z, .8, 19.8, .8, 0, 0, -side * Math.PI / 4);
  for (let index = 0; index < 5; index++) {
    const px = center - 10 + index * 5;
    city.put('panel', 'stone', px, y + .8, z - 2.6, 3.2, .7, 3.2);
    city.put('sphere', 'green', px, y + 1.5, z - 2.6, 2, .9, 1.9);
    if (index % 2 === 0) {
      city.put('cylinder', 'stone', px, y + 2.4, z - 2.6, .2, 3, .2);
      city.put('sphere', 'green', px, y + 4.1, z - 2.6, 2.8, 2, 2.6);
      city.put('sphere', 'green', px + 1.2, y + 4.9, z - 2.3, 1.9, 1.5, 1.8);
    }
  }
}

function addNeedle(city: AiCityBatches, x: number, z: number, height: number): void {
  city.put('panel', 'ivory', x, 1.9, z, 35, 3.8, 25);
  const wings = [[-12, 4, .43, 8, 13], [-6, 1, .72, 8, 15],
    [1, -3, 1, 7, 16], [7, 2, .85, 6, 12], [13, 0, .56, 7, 13]] as const;
  for (const [index, [dx, dz, factor, width, depth]] of wings.entries()) {
    const cx = x + dx, cz = z + dz, h = height * factor;
    const steps = [[0, 1], [.39, 1], [.44, .76], [.69, .76], [.74, .51], [.94, .51], [1, .03]] as const;
    const edge = (t: number, w: number, side: number) => cx + side * width * w / 2 + t * width * .24;
    const contour: [number, number][] = steps.map(([t, w]) => [edge(t, w, -1), t * h + 3.8]);
    contour.push(...[...steps].reverse().map(([t, w]): [number, number] => [edge(t, w, 1), t * h + 3.8]));
    city.landform(contour, cz, depth, 'glass');
    for (const sideX of [-1, 1]) for (const sideZ of [-1, 1]) {
      for (let step = 1; step < steps.length; step++) {
        const a = steps[step - 1]!, b = steps[step]!;
        const ax = edge(a[0], a[1], sideX), bx = edge(b[0], b[1], sideX);
        const ay = a[0] * h + 3.8, by = b[0] * h + 3.8;
        city.put('panel', sideX === -1 && sideZ === 1 ? 'gold' : 'ivory', (ax + bx) / 2,
          (ay + by) / 2, cz + sideZ * (depth / 2 + .1), Math.hypot(bx - ax, by - ay),
          .35 + index % 2 * .1, .32, 0, 0, Math.atan2(by - ay, bx - ax));
      }
    }
    for (let floor = 1; floor * 3.5 < h * .87; floor++) {
      const t = floor * 3.5 / h;
      const upper = steps.findIndex(([at]) => at > t);
      const a = steps[upper - 1]!, b = steps[upper]!;
      const w = width * THREE.MathUtils.lerp(a[1], b[1], (t - a[0]) / (b[0] - a[0]));
      const floorX = cx + t * width * .24;
      for (const side of [-1, 1]) {
        city.put('panel', 'city', floorX, 3.8 + floor * 3.5, cz + side * (depth / 2 + .03), w, .08, .08);
        if ((floor + index) % 3 === 0) city.put('panel', 'window', floorX, 2.9 + floor * 3.5,
          cz + side * (depth / 2 + .06), w * .38, .55, .08);
      }
    }
    city.put('cylinder', 'gold', cx + width * .24, h + 6, cz, .12, 5, .12);
  }
  for (const [y, w] of [[height * .24, 30], [height * .47, 23], [height * .66, 15]] as const) {
    city.put('panel', 'city', x + 1, y, z, w, .5, 19);
    city.put('panel', 'gold', x + 1, y + .3, z + 9.55, w, .07, .1);
  }
  city.put('cylinder', 'gold', x + 2.68, height + 10.3, z - 3, .11, 13, .11);
  city.put('sphere', 'light', x + 2.68, height + 16.8, z - 3, .23, .23, .23);
  addSkyGarden(city, x - 11, height * .35, z + 3, -1);
  addSkyGarden(city, x + 12, height * .23, z + 3, 1);
}

function addSail(city: AiCityBatches, x: number, z: number, height: number, width: number): void {
  const depth = 17;
  const left = (t: number) => x - width * (.48 - .18 * t);
  const right = (t: number) => x + width * (.48 * Math.cos(t * Math.PI / 2) - .3 * t);
  const contour: [number, number][] = [[left(0), 0], [right(0), 0]];
  for (let i = 1; i <= 24; i++) contour.push([right(i / 24), height * i / 24]);
  contour.push([left(1), height], [left(0), 0]);
  city.landform(contour, z, depth, 'glass');
  for (const side of [-1, 1]) {
    const points = Array.from({ length: 25 }, (_, i) => new THREE.Vector3(right(i / 24), height * i / 24, z + side * (depth / 2 + .1)));
    city.curve(points, .65, 'ivory');
    city.curve([new THREE.Vector3(left(0), 0, z + side * depth / 2),
      new THREE.Vector3(left(1), height, z + side * depth / 2)], .48, 'ivory');
    for (let y = 3.2; y < height - 2; y += 3.2) {
      const l = left(y / height), r = right(y / height);
      city.put('panel', 'ivory', (l + r) / 2, y, z + side * (depth / 2 + .12), r - l, .12, .12);
      if (y % 9.6 < 3.3) city.put('panel', 'window', (l + r) / 2, y - .8,
        z + side * (depth / 2 + .08), (r - l) * .48, .3, .08);
    }
  }
  city.put('panel', 'ivory', x, .3, z, width + 4, .6, depth + 4);
}

function addBridge(city: AiCityBatches, a: { x: number; z: number }, b: { x: number; z: number }, y: number): void {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const rotation = Math.atan2(a.z - b.z, b.x - a.x);
  const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2;
  city.put('panel', 'blue', x, y, z, length, .65, 4.2, 0, rotation);
  city.put('panel', 'glass', x, y + 1.5, z, length, 2.4, 3.5, 0, rotation);
  city.put('panel', 'ivory', x, y + 2.85, z, length + .3, .22, 4.5, 0, rotation);
  for (let along = 3; along < length - 2; along += 4.8) {
    const t = along / length;
    city.put('panel', 'ivory', a.x + (b.x - a.x) * t, y + 1.5,
      a.z + (b.z - a.z) * t, .2, 2.4, 4.1, 0, rotation);
  }
}

function districtPoint(district: RiverDistrict, x: number, z: number) {
  return { x: district.x + x * district.width / 2, z: district.z + z * district.depth / 2 };
}

function addGardenDistrict(city: AiCityBatches, district: RiverDistrict): void {
  const random = mulberry32(district.seed);
  const lots = [[-.35, .11, 31, 3], [.35, .08, 27, 5], [-.03, -.48, 31, 3]] as const;
  for (const [index, [dx, dz, width, floors]] of lots.entries()) {
    const position = districtPoint(district, dx, dz);
    addTerrace(city, position.x + random() * 3 - 1.5, position.z + random() * 3 - 1.5, width + random() * 2, floors,
      district.seed + index * 17);
  }
  const left = districtPoint(district, -.56, -.39), right = districtPoint(district, .51, -.46);
  addResidentialTower(city, left.x, left.z, 25 + district.seed % 7, -1);
  addResidentialTower(city, right.x, right.z, 38 + district.seed % 9, 1);
  const gallery = districtPoint(district, -.04, .48);
  addWatersideGallery(city, gallery.x, gallery.z, Math.min(58, district.width * .3));
  addBridge(city, districtPoint(district, -.35, .11), districtPoint(district, .35, .08), 5.4);
}

function addCivicDistrict(city: AiCityBatches, district: RiverDistrict): void {
  const far = district.z < -700;
  const pavilion = districtPoint(district, -.2, .28);
  addPavilion(city, pavilion.x, pavilion.z);
  const lots = [
    [-.43, -.19, 43, 'stepped'], [-.08, -.4, 79, 'blade'],
    [.35, -.25, 58, 'twin'], [.42, .28, 36, 'stepped'],
  ] as const;
  for (const [index, [dx, dz, height, kind]] of lots.entries()) {
    const position = districtPoint(district, dx, dz);
    const adjusted = height * (far ? .72 : 1) + Math.sin(district.seed + index) * 7;
    if (index === 0) addSail(city, position.x, position.z, adjusted, 18);
    else addHarborBuilding(city, { ...position, width: kind === 'twin' ? 23 : 16, depth: 18,
      height: adjusted, kind, detail: far ? 1 : 2, seed: district.seed + index * 23 });
  }
  addBridge(city, districtPoint(district, -.08, -.4), districtPoint(district, .35, -.25), far ? 17 : 25);
}

function addLandmarkDistrict(city: AiCityBatches, district: RiverDistrict, central: boolean): void {
  const center = districtPoint(district, 0, -.11);
  const left = districtPoint(district, -.43, -.05);
  const right = districtPoint(district, .4, -.2);
  if (central) addNeedle(city, center.x, center.z, 190);
  else {
    const kind = district.seed % 2 === 0 ? 'twin' : 'stepped';
    addHarborBuilding(city, { ...center, width: 26, depth: 23, height: 84 + district.seed % 23,
      kind, detail: 2, seed: district.seed });
    addSkyGarden(city, center.x + 6, 48, center.z + 4, 1);
  }
  addSail(city, left.x, left.z, central ? 77 : 55 + district.seed % 17, 23);
  addHarborBuilding(city, { ...right, width: 22, depth: 21, height: central ? 94 : 61,
    kind: central ? 'twin' : 'blade', detail: 2, seed: district.seed + 71 });
  for (const dx of [-.3, .25]) {
    const position = districtPoint(district, dx, .35);
    addTerrace(city, position.x, position.z, 34, 3, district.seed + Math.round(dx * 20));
  }
  const gallery = districtPoint(district, .04, .61);
  addWatersideGallery(city, gallery.x, gallery.z, 66);
  addBridge(city, left, center, 30);
  addBridge(city, center, right, 41);
}

function createRiverCity(layout: readonly RiverDistrict[], homeCenter: number) {
  const garden = createAiCityBatches(), main = createAiCityBatches();
  garden.root.name = 'residence-four-garden-islands';
  main.root.name = 'residence-four-river-islands';
  for (const district of layout) {
    if (district.kind === 'garden') addGardenDistrict(garden, district);
    else if (district.kind === 'civic') addCivicDistrict(main, district);
    else addLandmarkDistrict(main, district, Math.abs(district.x - homeCenter - 242) < 1);
  }
  finishDistrict(garden); finishDistrict(main);
  return [garden, main];
}

function createFarCity(): AiCityBatches {
  const city = createAiCityBatches(); city.root.name = 'residence-four-distant-city';
  const random = mulberry32(0x4d098);
  const kinds: readonly HarborBuilding['kind'][] = ['stepped', 'slab', 'blade', 'spire'];
  for (let row = 0; row < 3; row++) {
    const spacing = 470 + row * 55;
    for (let center = RIVER_LEFT + 190 + row * 81, cluster = 0; center < RIVER_RIGHT - 150; center += spacing, cluster++) {
      const count = 9 - row * 2;
      for (let index = 0; index < count; index++) {
        const dx = (index - (count - 1) / 2) * 24 + (random() - .5) * 18;
        const central = 1 - Math.abs(index - (count - 1) / 2) / (count / 2);
        const z = -1180 - row * 260 - random() * 64;
        addHarborBuilding(city, { x: center + dx, z,
          width: 15 + random() * 10, depth: 18 + random() * 11,
          height: (14 + random() * 13 + central * 26) * (1 - row * .17),
          kind: kinds[(index + cluster) % kinds.length]!, detail: 0, seed: index + cluster * 97 + row * 403 });
        if (index % 2 === 0) addHarborBuilding(city, { x: center + dx + 10, z: z + 24,
          width: 24, depth: 15, height: 7 + random() * 8, kind: 'stepped', detail: 0,
          seed: index + cluster * 11 });
      }
    }
  }
  finishDistrict(city);
  return city;
}

/** 岛屿与建筑共用世界坐标，前后错开的街区之间保留连续水道。 */
export function createResidenceFourCity(homeCenter: number, riverLevel: { value: number }) {
  const root = new THREE.Group(); root.name = 'residence-four-city';
  const layout = residenceRiverDistricts(homeCenter);
  const districts = [...createRiverCity(layout, homeCenter), createFarCity()];
  const trees = createRiverParkTrees(layout);
  root.add(...districts.map(city => city.root), trees.root);
  const atmosphere = createResidenceFourAtmosphere([
    ...districts.flatMap(city => Object.values(city.material)), trees.material.bark, trees.material.leaf,
  ], riverLevel);
  for (const city of districts) city.setNightFactor(0);
  return { root,
    setWeather(look: PrecipSkyLook) { atmosphere.setWeather(look); },
    setNightFactor(value: number) {
      atmosphere.setNightFactor(value);
      for (const city of districts) city.setNightFactor(value);
    },
    dispose() { root.removeFromParent(); for (const city of districts) city.dispose(); trees.dispose(); root.clear(); },
  };
}
