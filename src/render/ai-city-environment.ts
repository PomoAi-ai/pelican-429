import * as THREE from 'three';
import { mulberry32 } from '../core/rng.ts';
import { waitSceneResource } from '../core/abort.ts';
import { RESIDENCE_WORLD, RESIDENCE_SEGMENT_WIDTH as SEGMENT_WIDTH } from '../config/residence.ts';
import { AI_CITY_LAYERS, type AiCityLayerId } from '../config/ai-city-look.ts';
import { DEFAULT_WEATHER } from '../config/weather-rules.ts';
import { planTree } from '../world/trees.ts';
import type { WindController } from '../world/wind.ts';
import type { TreeKind } from '../world/level.ts';
import { buildTreeGeometry } from './tree-geometry.ts';
import { createTreeMaterials } from './tree-material.ts';
import { createAiCityBatches, type AiCityBatches } from './ai-city-batches.ts';
import { aiCityRailPoint, createAiCityTraffic } from './ai-city-traffic.ts';
import { loadEnemyAsset } from './enemy-rig.ts';
import { shadowReceiverBounds } from './shadow-fit.ts';
import { createFloraGeometries, createFloraMeshes, createWindMaterial, type FloraInstance } from './flora.ts';
import { createShrubAtlas, createShrubMaterial, createShrubMesh, SHRUB_KINDS, type ShrubInstance } from './flora-shrubs.ts';
import { built, createLilyPadGeometry, createLilyFlowerGeometry } from './aquatic-geometry.ts';
import { createWeatherFx } from './weather-fx.ts';
import type { PrecipSkyLook } from './precip-sky.ts';
import { createTileMap } from '../world/tile-map.ts';
import { DEFAULT_TILES } from '../world/tile-types.ts';
import { createFluidMap, FLUID_FULL } from '../world/fluid-map.ts';
import { createWaterView, waterWaveAt, WATER_BACK_Z, WATER_FRONT_Z, WATER_TOP_BACK_Z } from './water-view.ts';

/** 近处种植与花槽共用正式游戏的花草、灌木和风动。坐标遵循 +Z 朝镜头。 */
export function createAiCityGreenery(beds: readonly { x: number; y: number; z: number; width: number; depth?: number }[]) {
  const root = new THREE.Group();
  const time = { value: 0 };
  const rng = mulberry32(0x67a1c);
  const flowers: FloraInstance[] = [];
  const shrubs: ShrubInstance[] = [];
  for (const bed of beds) {
    const depth = bed.depth ?? .65;
    for (let i = 0; i < Math.ceil(bed.width * 6); i++) {
      const species = (['daisy', 'daisy', 'clover', 'fern', 'lavender'] as const)[i % 5]!;
      flowers.push({ species, x: bed.x + rng() * bed.width, y: bed.y,
        z: bed.z + rng() * depth, yaw: rng() * Math.PI * 2, tilt: 0,
        sx: .65 + rng() * .45, sy: .7 + rng() * .4, shear: 0, tint: species === 'lavender' ? 0xb6aed5 : 0xfff2cf });
    }
    for (let i = 0; i < Math.ceil(bed.width / 1.2); i++) {
      shrubs.push({ kind: i % 4 === 0 ? 'azalea' : i % 3 === 0 ? 'fernclump' : 'hedge',
        x: bed.x + .4 + i * 1.2 + rng() * .35, y: bed.y, z: bed.z - .3,
        yaw: rng() * Math.PI, height: .75 + rng() * .6, tint: 0xd3cba5 });
    }
  }
  const geometries = createFloraGeometries();
  const flowerMaterial = createWindMaterial(time);
  const meshes = createFloraMeshes(flowers, geometries, flowerMaterial, 'ai-city-flowers');
  root.add(...meshes);
  const atlas = createShrubAtlas();
  // 仍用游戏图集与实例材质，只提交本庭院实际使用的变体，避免每丛都绘制十种灌木。
  const variants = new Set(shrubs.map(s => SHRUB_KINDS.indexOf(s.kind)));
  const variantAttribute = atlas.getAttribute('aVar');
  atlas.setIndex(Array.from(atlas.index!.array).filter(index => variants.has(variantAttribute.getX(index))));
  const shrubMaterial = createShrubMaterial(time);
  const shrubMesh = createShrubMesh(shrubs, atlas, shrubMaterial, 'ai-city-shrubs');
  if (shrubMesh) root.add(shrubMesh);
  return { root, update(seconds: number) { time.value = seconds; }, dispose() {
    root.removeFromParent();
    for (const mesh of meshes) mesh.dispose();
    for (const geometry of Object.values(geometries)) geometry.dispose();
    flowerMaterial.dispose();
    if (shrubMesh) { shrubMesh.dispose(); shrubMesh.geometry.dispose(); }
    atlas.dispose(); shrubMaterial.dispose();
  } };
}

interface GardenBed { x: number; y: number; z: number; width: number; depth?: number }

/** 树皮、叶卡、冠团和风摆全部来自游戏树工厂；背景树不向玩法注册平台。 */
function createGardenTrees(placements: readonly { x: number; y: number; z: number; height: number; kind: TreeKind }[]) {
  const root = new THREE.Group();
  const time = { value: 0 };
  const materials = createTreeMaterials(time);
  materials.leaf.color.set(0xd9cfad);
  const rng = mulberry32(0xa1765);
  const templates = new Map<TreeKind, ReturnType<typeof buildTreeGeometry>>();
  for (const p of placements) {
    let geometry = templates.get(p.kind);
    if (!geometry) {
      geometry = buildTreeGeometry(planTree(p.kind, 0, 0, rng, templates.size));
      templates.set(p.kind, geometry);
    }
    geometry.leaf.computeBoundingBox();
    const scale = p.height / geometry.leaf.boundingBox!.max.y;
    const group = new THREE.Group();
    group.position.set(p.x - scale * .5, p.y, p.z + .7 * scale * 2.4);
    group.scale.set(scale, scale, scale * 2.4);
    group.rotation.y = (rng() - .5) * .5;
    const bark = new THREE.Mesh(geometry.bark, materials.bark);
    const leaf = new THREE.Mesh(geometry.leaf, materials.leaf);
    bark.customDepthMaterial = materials.barkDepth; leaf.customDepthMaterial = materials.leafDepth;
    bark.castShadow = leaf.castShadow = p.z > -10;
    bark.receiveShadow = leaf.receiveShadow = true;
    group.add(bark, leaf); root.add(group);
  }
  return { root, update(seconds: number): void { time.value = seconds; }, dispose(): void {
    root.removeFromParent(); root.clear(); materials.dispose();
    for (const geometry of templates.values()) { geometry.bark.dispose(); geometry.leaf.dispose(); }
  } };
}

function createGardenLilies(width: number) {
  const root = new THREE.Group();
  const time = { value: 0 };
  const material = createWindMaterial(time, { amplitude: .025, windScale: .2 });
  const geometries = [built(createLilyPadGeometry), built(createLilyFlowerGeometry)];
  const count = Math.ceil(width / 3);
  const meshes = geometries.map(geometry => new THREE.InstancedMesh(geometry, material, count));
  const rng = mulberry32(0x1717);
  const positions = Array.from({ length: count }, () => ({ x: rng() * width, z: 2 + rng(), scale: 1.3 + rng() * .8, yaw: rng() * 6.28 }));
  const transform = new THREE.Object3D();
  for (const mesh of meshes) { mesh.receiveShadow = true; root.add(mesh); }
  return { root, update(seconds: number): void {
    time.value = seconds;
    for (const [i, p] of positions.entries()) {
      transform.position.set(p.x, .82 + waterWaveAt(p.x, seconds), p.z);
      transform.rotation.set(0, p.yaw, 0); transform.scale.setScalar(p.scale); transform.updateMatrix();
      meshes[0]!.setMatrixAt(i, transform.matrix);
      transform.position.x += .3; transform.updateMatrix();
      meshes[1]!.setMatrixAt(i, transform.matrix);
    }
    for (const mesh of meshes) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }
  }, dispose(): void {
    root.removeFromParent();
    for (const mesh of meshes) mesh.dispose();
    for (const geometry of geometries) geometry.dispose();
    material.dispose(); root.clear();
  } };
}

type SegmentLayer = AiCityLayerId | 'ground';
type TreePlacement = { x: number; y: number; z: number; height: number; kind: TreeKind };
type WaterPlacement = { x: number; y: number; z: number; w: number; h: number; depth: number };
interface SegmentPlan { beds: GardenBed[]; trees: TreePlacement[]; waters: WaterPlacement[] }

function addTower(city: AiCityBatches, x: number, base: number, z: number, height: number, width: number,
  style: number, distant = false): void {
  const { put } = city;
  const shell = distant ? 'far' : 'city';
  const glass = distant ? 'farGlass' : 'cityGlass';
  const depth = width * .8;
  // 玻璃是塔身主体；细结构肋、退台和冠部决定轮廓，避免堆出整块亮白墙。
  for (let tier = 0; tier < 3; tier++) {
    const w = width * (1 - tier * .17);
    const y = base + height * (tier + .5) / 3;
    const offset = style === 1 ? tier * width * .13 : 0;
    put('panel', glass, x + offset, y, z, w, height / 3, depth);
    for (const side of [-1, 1]) put('panel', shell, x + offset + side * w / 2, y, z + depth * .42,
      .2, height / 3 + .08, depth * .24);
    put('box', shell, x + offset, base + height * (tier + 1) / 3, z, w + .35, .25, depth + .3);
    for (let floor = 1; floor < height / 3; floor += 2.8) {
      put('panel', shell, x + offset, base + height * tier / 3 + floor, z + depth * .51, w, .07, .1);
      for (let column = 0; column < 3; column++) {
        if ((column + tier + Math.round(floor) + style) % 3 === 0) continue;
        put('panel', 'window', x + offset + (column - 1) * w * .3,
          base + height * tier / 3 + floor + .65, z + depth * .515, w * .15, .55, .035);
      }
    }
    if (!distant) for (const u of [-.25, .25]) put('panel', 'farGlass', x + offset + u * w, y,
      z + depth * .515, .09, height / 3 - .3, .05);
  }
  if (style === 0) {
    put('dome', shell, x, base + height + .15, z, width * .42, width * .65, depth * .47);
    put('panel', glass, x, base + height + width * .25, z + depth * .48, width * .16, width * .5, .08);
  } else {
    put('taper', shell, x + width * .25, base + height + 1.4, z, width * .22, 2.8, depth * .25);
  }
  put('cylinder', distant ? 'farGlass' : 'gold', x, base + height + 3, z, .045, 3, .045);
  put('box', shell, x, base + .6, z, width * 1.6, 1.2, depth * 1.4);
}

function addArchitecture(city: AiCityBatches, plan: SegmentPlan, index: number): void {
  const { put } = city;
  const pavilions = index % 2 ? [{ x: 18, w: 24, y: 2.6 }, { x: 101, w: 28, y: 4.2 }]
    : [{ x: 20, w: 27, y: 3.2 }, { x: 101, w: 25, y: 2.6 }];
  for (const p of pavilions) {
    const z = -16;
    put('box', 'stone', p.x, p.y - 1.5, z, p.w + 3, 3, 7);
    put('box', 'blue', p.x, p.y + .12, z, p.w, .24, 6.5);
    for (let bay = -2; bay <= 2; bay++) {
      const x = p.x + bay * p.w / 5;
      put('panel', 'glass', x, p.y + 2, z - .7, p.w / 5 - .35, 3.5, .18);
      put('box', 'ivory', x - p.w / 10, p.y + 2, z + .15, .27, 3.7, 2.8);
      put('panel', 'gold', x - p.w / 10 + .14, p.y + 2.5, z + 1.59, .06, 1.6, .04);
      put('panel', 'blue', x, p.y + .7, z + 1.65, p.w / 5 - .55, .13, .14);
      put('panel', 'window', x, p.y + 3.25, z - .58, p.w / 5 - .85, .2, .035);
    }
    put('box', 'ivory', p.x, p.y + 3.95, z, p.w + 1.6, .42, 7);
    put('box', 'soil', p.x, p.y + 4.18, z, p.w - .4, .08, 5.8);
    for (const offset of [-.32, 0, .32]) plan.beds.push({ x: p.x + offset * p.w - 2,
      y: p.y + 4.23, z: z + .6, width: 4, depth: 1.6 });
    for (const side of [-1, 1]) plan.trees.push({ x: p.x + side * p.w * .32, y: p.y + 4.23,
      z: z - .5, height: 4 + (side + 1) * .4, kind: side < 0 ? 'broad' : 'oak' });
    for (let step = 0; step < 4; step++) put('panel', 'paving', p.x + p.w / 2 + .6 + step * .6,
      p.y - .25 - step * .7, z + .6, 1.2, .3, 4.8);
  }
  // 独立半穹顶温室有真正的底座、入口和白色弧肋。
  const x = index % 2 ? 69 : 43;
  put('cylinder', 'stone', x, .5, -20, 8.2, 2, 5.3);
  put('dome', 'glass', x, 1.6, -20, 8, 5, 5);
  for (let k = 0; k < 5; k++) {
    const a = k * Math.PI / 4;
    city.curve(Array.from({ length: 13 }, (_, i) => {
      const t = i * Math.PI / 12;
      return new THREE.Vector3(x + Math.cos(t) * 8 * Math.cos(a), 1.6 + Math.sin(t) * 5.04,
        -20 + Math.cos(t) * 5 * Math.sin(a));
    }), .1, 'ivory');
  }
  put('box', 'ivory', x, 1.4, -14.6, 3.2, 2.8, 1.6);
  put('panel', 'blue', x, 1.25, -13.74, 2.2, 2.5, .08);
  plan.waters.push({ x: 0, y: -1.2, z: -12, w: SEGMENT_WIDTH, h: 1, depth: 3.5 });
}

function addCanyon(city: AiCityBatches, plan: SegmentPlan, index: number): void {
  const { put } = city;
  const rng = mulberry32(0xc411 + index);
  // 峡谷左右岩壁露出天然折面；河谷缺口留给远城，顶面仍有实体支撑。
  const cliffs = [{ x: 2, w: 36, y: 4.5, fall: 29 }, { x: 76, w: 42, y: 7.5, fall: 84 }];
  for (const cliff of cliffs) {
    const { x, w, y } = cliff;
    city.landform([[x - 3, -7], [x, y - .8], [x + w * .24, y], [x + w * .48, y - .35],
      [x + w * .72, y + .3], [x + w, y - .5], [x + w + 4, -7]], -35, 11, 'rock');
    put('panel', 'soil', x + w / 2, y - .12, -35, w - 2, .25, 9);
    for (let n = 0; n < 12; n++) {
      const xx = x + 1 + n * (w - 2) / 12;
      put('rock', n % 3 ? 'stone' : 'middle', xx, y - 3.8 + rng(), -28.9,
        1.1 + rng() * .8, 3.2 + rng() * 2, .8 + rng() * .7, .1, rng() * .4, (rng() - .5) * .2);
    }
    for (let n = 0; n < 4; n++) {
      const xx = x + 3 + n * (w - 6) / 4;
      plan.trees.push({ x: xx, y, z: -35.5, height: 3.3 + rng() * 1.7, kind: n % 2 ? 'broad' : 'oak' });
      plan.beds.push({ x: xx - 2, y, z: -31.5, width: 4, depth: 1 });
    }
    const fallX = cliff.fall;
    plan.waters.push({ x: fallX - 5, y: y - 1, z: -33.5, w: 9, h: 1, depth: 2.6 });
    plan.waters.push({ x: fallX, y: y - 9, z: -28.2, w: 3, h: 9, depth: .9 });
    for (const side of [-1, 1]) put('rock', 'stone', fallX + 1.5 + side * 2.1, y - 3.8,
      -28.4, .65, 4.6, .9, 0, side * .2, side * .09);
  }
  plan.waters.push({ x: 20, y: -5.4, z: -33, w: 83, h: 1, depth: 4.5 });
  const points = Array.from({ length: 17 }, (_, i) => {
    const point = aiCityRailPoint(index * SEGMENT_WIDTH - 8 + i * 9);
    point.x -= index * SEGMENT_WIDTH; return point;
  });
  city.curve(points, .25, 'ivory');
  city.curve(points.map(p => p.clone().add(new THREE.Vector3(0, -.34, 0))), .18, 'blue');
  city.curve(points.map(p => p.clone().add(new THREE.Vector3(0, .25, .45))), .055, 'gold');
  for (const [x, y, span] of [[42, 6.5, 31], [81, 7, 30]] as const) {
    city.curve(Array.from({ length: 17 }, (_, i) => new THREE.Vector3(x + (i / 16 - .5) * span,
      -4.5 + Math.sin(i / 16 * Math.PI) * (y + 3.8), -33)), .4, 'ivory');
    for (const side of [-1, 1]) put('taper', 'stone', x + side * span / 2, -1.7, -33, .85, 6, 1.1);
    for (const u of [-.3, 0, .3]) {
      const lower = -4.5 + Math.cos(u * Math.PI) * (y + 3.8);
      put('panel', 'ivory', x + u * span, (lower + y) / 2, -33, .14, y - lower + .2, .14);
    }
  }
}

function addMainCity(city: AiCityBatches, index: number): void {
  const { put } = city;
  const base = -4;
  city.landform([[-15, -22], [-15, -5], [3, -4], [28, -5.5], [53, -4], [70, -5.5],
    [85, -4], [108, -3], [143, -5], [143, -22]], -75, 12, 'mountain');
  // 各街区的高楼、低楼与空隙错开，住宅正后方保留较低的街区。
  for (const [x, h, w, style] of [[-13, 23, 4, 0], [1, 34, 4.5, 1], [13, 21, 5, 0],
    [31, 13, 5.5, 1], [52, 9, 7, 0], [97, 21, 5, 1], [115, 30, 4.8, 0], [127, 17, 5, 1]] as const) {
    addTower(city, x, base, -70 - (style ? 4 : 0), h * .7 + THREE.MathUtils.euclideanModulo(index, 3), w * .8, style);
  }
  for (const [x, w, y] of [[0, 31, -1], [45, 28, -2], [112, 28, 1]] as const) {
    put('box', 'city', x, y - 1, -71, w, 2, 11);
    put('panel', 'middle', x, y + .08, -71, w - .4, .16, 10.6);
    for (let n = -2; n <= 2; n++) {
      const xx = x + n * w / 5;
      put('box', 'city', xx, y + 2.2, -66, w / 5 - .4, 4.4, 3.2);
      put('panel', 'cityGlass', xx, y + 2.3, -64.35, w / 5 - 1, 2.6, .1);
      put('panel', 'window', xx, y + 2.85, -64.27, w / 5 - 1.4, .38, .035);
      put('panel', 'middle', xx, y + 4.45, -66, w / 5 - .6, .1, 3);
    }
  }
  for (const [x, span, y] of [[8, 18, 10], [107, 20, 13]] as const) {
    put('box', 'city', x, y, -70, span, .45, 1.8);
    put('panel', 'cityGlass', x, y + .7, -68.95, span, .8, .12);
    put('panel', 'light', x, y + .33, -68.86, span, .06, .035);
    put('panel', 'city', x, y + 1.2, -69.1, span + .2, .13, 2);
  }
  // 椭圆环站具有空心剪影、双弧支腿与蓝色玻璃内环，可从主屋右侧辨识。
  const x = 82;
  put('panel', 'cityGlass', x, 8, -70, 2.1, 24, 2.1);
  for (const side of [-1, 1]) city.curve([
    new THREE.Vector3(x + side * 3.5, base, -70), new THREE.Vector3(x + side * 2.4, 8, -70),
    new THREE.Vector3(x + side * 1.3, 18, -70), new THREE.Vector3(x, 22, -70)], .24, 'city');
  put('ring', 'city', x, 17, -70, 5.8, 3.8, 5.8, Math.PI / 2 - .16);
  put('ring', 'cityGlass', x, 17.15, -70, 5.55, 3.6, 5.55, Math.PI / 2 - .16);
  put('ring', 'light', x, 17.2, -70, 5.65, 3.7, 5.65, Math.PI / 2 - .16);
  put('cylinder', 'gold', x, 22.5, -70, .045, 3.5, .045);
  put('box', 'city', x, base + .5, -70, 9, 1, 7);
  city.curve([new THREE.Vector3(-12, 3, -79), new THREE.Vector3(40, 5, -77),
    new THREE.Vector3(85, 1, -79), new THREE.Vector3(138, 4, -78)], .25, 'city');
}

function addDistantLandscape(city: AiCityBatches, index: number): void {
  const rng = mulberry32(0xf4a9 + index);
  const profile = (base: number, peak: number): Array<[number, number]> => [
    [-15, -22], ...Array.from({ length: 15 }, (_, i): [number, number] =>
      [-15 + i * 11.3, base + rng() * peak + (i % 3 === 1 ? 7 : 0)]), [144, -22],
  ];
  city.landform(profile(8, 14), -150 - THREE.MathUtils.euclideanModulo(index, 3) * .8, 5, 'ridge');
  city.landform(profile(-1, 12), -137 - THREE.MathUtils.euclideanModulo(index, 3) * .6, 9, 'mountain');
  for (const [x, h, w] of [[6, 19, 3.7], [21, 27, 3], [38, 15, 3.8], [95, 24, 3.5], [109, 16, 4]] as const) {
    addTower(city, x, -3, -132, h, w, THREE.MathUtils.euclideanModulo(index, 2), true);
  }
  city.curve([new THREE.Vector3(-10, 1, -131), new THREE.Vector3(30, 3.7, -131),
    new THREE.Vector3(78, 2, -131), new THREE.Vector3(140, 4, -131)], .25, 'far');
}

function addGardens(city: AiCityBatches, plan: SegmentPlan, index: number, homeCenter: number): void {
  const { put } = city;
  const { groundTop } = RESIDENCE_WORLD;
  const homeHere = homeCenter >= 0 && homeCenter <= SEGMENT_WIDTH;
  const centers = homeHere ? [8, homeCenter - 23, homeCenter + 23, 115] : [10, 39, 78, 111];
  for (const [i, rawX] of centers.entries()) {
    const x = Math.max(6, Math.min(SEGMENT_WIDTH - 6, rawX));
    if (homeHere && Math.abs(x - homeCenter) < 17) continue;
    const w = i % 2 ? 12 : 10;
    put('box', 'ivory', x, groundTop - .25, -7, w, .6, 4);
    put('box', 'soil', x, groundTop + .03, -7, w - .4, .06, 3.6);
    plan.beds.push({ x: x - w / 2 + .5, y: groundTop + .06, z: -7, width: w - 1, depth: 1.2 });
    plan.trees.push({ x: x + (i % 2 ? 2 : -2), y: groundTop + .06, z: -7.7,
      height: 6.3 + i * .7, kind: i % 3 === 0 ? 'willow' : i % 2 ? 'oak' : 'broad' });
    put('box', 'blue', x - 2, groundTop + .45, -3.4, 3.7, .7, .85);
    put('box', 'ivory', x - 2, groundTop + .85, -3.4, 3.8, .12, .95);
  }
  const pergolaX = index % 2 ? 95 : 17;
  for (const z of [-9, -5]) city.curve(Array.from({ length: 17 }, (_, i) => new THREE.Vector3(
    pergolaX + Math.cos(i / 16 * Math.PI) * 5, groundTop + Math.sin(i / 16 * Math.PI) * 5.2, z)), .13, 'ivory');
  for (let i = 1; i < 8; i++) {
    const a = i / 8 * Math.PI;
    put('panel', 'gold', pergolaX + Math.cos(a) * 5, groundTop + Math.sin(a) * 5.2, -7, .1, .1, 4);
  }
  // 同一园区的四种沿岸段落，仅改变林带、休憩廊、能源顶棚和小码头的组合。
  const x = index % 2 ? 30 : 103;
  put('box', 'blue', x, groundTop + 3.8, -6, 12, .3, 5, 0, 0, -.035);
  for (let i = 0; i < 5; i++) put('panel', 'glass', x - 4.8 + i * 2.4, groundTop + 4,
    -6, 2.2, .08, 4.6, 0, 0, -.035);
  for (const side of [-1, 1]) put('box', 'ivory', x + side * 5, groundTop + 1.8, -7.7, .3, 3.6, .4);
  if (THREE.MathUtils.euclideanModulo(index, 4) === 2) for (let i = 0; i < 3; i++) {
    put('box', 'blue', x - 3 + i * 3, groundTop + .85, -6, 1.5, 1.7, 1.2);
    put('panel', 'light', x - 3 + i * 3, groundTop + 1.2, -5.36, .8, .3, .05);
  }
  for (let i = 0; i < 10; i++) put('panel', 'paving', 61 + i * .55, groundTop - .17, -5,
    .5, .28, 5.7);
  for (const xx of [61, 66]) put('cylinder', 'blue', xx, .4, -7.7, .1, 2.5, .1);
  for (let x = 8; x < SEGMENT_WIDTH; x += 22) {
    put('cylinder', 'blue', x, groundTop + 1.05, -1.9, .09, 2.1, .09);
    put('box', 'gold', x, groundTop + 2.15, -1.9, .32, .72, .32);
    put('panel', 'light', x, groundTop + 2.15, -1.72, .19, .56, .03);
  }
  for (const x of [homeHere ? homeCenter - 22 : 28, homeHere ? homeCenter + 23 : 91]) {
    if (x < 5 || x > SEGMENT_WIDTH - 5) continue;
    put('cylinder', 'stone', x, .2, 4.5, 4.6, 1.1, 2.1);
    put('cylinder', 'soil', x, .8, 4.5, 4.4, .12, 1.95);
    plan.beds.push({ x: x - 3.5, y: .87, z: 3.4, width: 7, depth: 1.6 });
  }
}

function addGround(city: AiCityBatches, plan: SegmentPlan): void {
  const { groundTop } = RESIDENCE_WORLD;
  // 基座顶面接住铺装底面，不能与铺装顶面共面，否则移动镜头时会出现大块交错三角。
  city.put('panel', 'blue', SEGMENT_WIDTH / 2, groundTop - 1.2, -.8, SEGMENT_WIDTH, 2.2, 4);
  for (let x = 0; x < SEGMENT_WIDTH; x += 2) {
    city.put('panel', 'paving', x + 1, groundTop - .05, -.8, 1.96, .1, 3.95);
    city.put('panel', 'ivory', x + 1, groundTop - .3, 1.22, 1.96, .5, .2);
  }
  plan.waters.push({ x: 0, y: -.2, z: 3.2, w: SEGMENT_WIDTH, h: 1, depth: 1.4 });
}

function createSegmentWater(city: AiCityBatches, p: WaterPlacement) {
  const fluid = createFluidMap(createTileMap(p.w, p.h, DEFAULT_TILES));
  for (let x = 0; x < p.w; x++) for (let y = 0; y < p.h; y++) fluid.set(x, y, FLUID_FULL);
  const view = createWaterView(fluid, { palette: 'deep', maxBuildsPerFrame: 8 });
  view.root.position.set(p.x, p.y, p.z); view.root.scale.z = p.depth;
  city.root.add(view.root);
  city.put('panel', 'waterBed', p.x + p.w / 2, p.y - .13,
    p.z + (WATER_TOP_BACK_Z + WATER_FRONT_Z) * p.depth / 2,
    p.w, .26, (WATER_FRONT_Z - WATER_TOP_BACK_Z) * p.depth + .12);
  city.put('panel', 'waterBed', p.x + p.w / 2, p.y + p.h / 2 - .02,
    p.z + WATER_BACK_Z * p.depth - .08, p.w, p.h, .12);
  const materials = new Set<THREE.MeshStandardMaterial>();
  let nightFactor = 0;
  return { setNightFactor(night: number): void {
    nightFactor = night;
    for (const material of materials) material.emissiveIntensity = 1 - night;
  }, update(time: number): void {
    if (view.update({ x: 0, y: 0, w: p.w, h: p.h }, time) > 0) {
      view.root.traverse(object => {
        if (object instanceof THREE.Mesh) materials.add(object.material as THREE.MeshStandardMaterial);
      });
      // 水面本身接收世界光照；夜间同时收掉白天用于通透感的底部微光。
      for (const material of materials) material.emissiveIntensity = 1 - nightFactor;
    }
  },
    dispose(): void { view.dispose(); } };
}

function createEnvironmentSegment(layer: SegmentLayer, index: number, homeCenter: number, detail: boolean, wind: WindController) {
  const city = createAiCityBatches();
  city.root.name = `ai-city-${layer}-segment-${index}`;
  city.root.position.x = index * SEGMENT_WIDTH;
  const originalDepth = { garden: -7, architecture: -16, canyon: -35, city: -70, distance: -140 };
  if (layer !== 'ground') city.root.position.z = AI_CITY_LAYERS.find(value => value.id === layer)!.depth - originalDepth[layer];
  const plan: SegmentPlan = { beds: [], trees: [], waters: [] };
  switch (layer) {
    case 'ground': addGround(city, plan); break;
    case 'garden': addGardens(city, plan, index, homeCenter - index * SEGMENT_WIDTH); break;
    case 'architecture': addArchitecture(city, plan, index); break;
    case 'canyon': addCanyon(city, plan, index); break;
    case 'city': addMainCity(city, index); break;
    case 'distance': addDistantLandscape(city, index); break;
  }
  const animated: Array<{ update(time: number): void; dispose(): void }> = [];
  const nightResponders: Array<{ setNightFactor(night: number): void }> = [city];
  const weatherResponders: Array<{ setWeather(weather: PrecipSkyLook): void }> = [];
  if (detail && plan.beds.length) {
    const greenery = createAiCityGreenery(plan.beds);
    city.root.add(greenery.root); animated.push(greenery);
  }
  if (detail && plan.trees.length) {
    const trees = createGardenTrees(plan.trees);
    city.root.add(trees.root); animated.push(trees);
  }
  if (layer === 'ground' && detail) {
    const lilies = createGardenLilies(SEGMENT_WIDTH);
    city.root.add(lilies.root); animated.push(lilies);
  }
  const waters = plan.waters.map(p => createSegmentWater(city, p));
  animated.push(...waters); nightResponders.push(...waters);
  if (layer === 'distance') {
    const weather = { ...DEFAULT_WEATHER, seed: DEFAULT_WEATHER.seed + index,
      particles: { ...DEFAULT_WEATHER.particles, lineMax: 0, lineRate: 0, debrisMax: 0, debrisRate: 0 },
      clouds: { count: 8, speed: .4, zNear: -136, zFar: -158 } };
    const clouds = createWeatherFx({ scene: city.root, weather, wind, cameraDistance: 40 });
    const material = clouds.meshes.clouds.material as THREE.ShaderMaterial;
    material.uniforms.uOpacity!.value = .68;
    const cloudColors = [
      { uniform: material.uniforms.uTop! as THREE.IUniform<THREE.Color>, night: new THREE.Color('#203352') },
      { uniform: material.uniforms.uBottom! as THREE.IUniform<THREE.Color>, night: new THREE.Color('#101b31') },
      { uniform: material.uniforms.uSky! as THREE.IUniform<THREE.Color>, night: new THREE.Color('#152542') },
    ].map(color => ({ ...color, day: color.uniform.value.clone() }));
    weatherResponders.push({ setWeather(look): void {
      clouds.setOvercast(look.cloudAmount, look.cloudGray);
      for (const color of cloudColors) color.day.copy(color.uniform.value);
    } });
    nightResponders.push({ setNightFactor(night): void {
      for (const color of cloudColors) color.uniform.value.copy(color.day).lerp(color.night, night);
      material.uniforms.uOpacity!.value = .68 - night * .3;
    } });
    // 固定世界云层，分段内环绕；不跟着镜头竖直浮动。
    animated.push({ update(time): void {
      clouds.update({ x: 35, y: 0, w: 28, h: 20 }, 0, () => 0);
    }, dispose(): void { clouds.dispose(); } });
  }
  city.flush();
  return { root: city.root, detail, setNightFactor(night: number): void {
    for (const item of nightResponders) item.setNightFactor(night);
  }, setWeather(weather: PrecipSkyLook): void {
    for (const item of weatherResponders) item.setWeather(weather);
  }, update(time: number): void {
    for (const item of animated) item.update(time);
  }, dispose(): void {
    for (const item of animated) item.dispose();
    city.dispose();
  } };
}

/** 分层和分段只管理表现，不向玩法注册台地；同一资源工厂服务目录与住宅游戏。 */
export function createAiCityEnvironment({ homeCenter, wind }: { homeCenter: number; wind: WindController }) {
  const root = new THREE.Group();
  root.name = 'ai-city-environment';
  const layers = Object.fromEntries(AI_CITY_LAYERS.map(layer => {
    const group = new THREE.Group(); group.name = `ai-city-layer-${layer.id}`;
    group.userData.depth = layer.depth; root.add(group);
    return [layer.id, group];
  })) as Record<AiCityLayerId, THREE.Group>;
  const ground = new THREE.Group(); ground.name = 'ai-city-ground'; root.add(ground);
  const segments = new Map<string, { layer: SegmentLayer; index: number; view: ReturnType<typeof createEnvironmentSegment> }>();
  const firstSegment = Math.floor(RESIDENCE_WORLD.minX / SEGMENT_WIDTH);
  const lastSegment = Math.ceil(RESIDENCE_WORLD.maxX / SEGMENT_WIDTH) - 1;
  let range = { x: homeCenter - 24, w: 48 };
  const frustumCorners = Array.from({ length: 8 }, () => new THREE.Vector3());
  let time = 0;
  let nightFactor = 0;
  let weather: PrecipSkyLook | null = null;
  let rangeKey = '';
  let disposed = false, prepared = false;
  let traffic: ReturnType<typeof createAiCityTraffic> | null = null;
  let pending: Array<{ layer: SegmentLayer; index: number; detail: boolean }> = [];
  const sync = (): void => {
    const detail = range.w < 190;
    const wanted = new Set<string>();
    const spans = [{ id: 'ground' as const, depth: 0 }, ...AI_CITY_LAYERS].map(layer => {
      const padding = 14 + Math.abs(layer.depth) * 1.25;
      const horizon = layer.id === 'city' || layer.id === 'distance';
      return { ...layer, first: Math.max(firstSegment - (horizon ? 1 : 0), Math.floor((range.x - padding) / SEGMENT_WIDTH)),
        last: Math.min(lastSegment + (horizon ? 1 : 0), Math.floor((range.x + range.w + padding) / SEGMENT_WIDTH)) };
    });
    const key = `${detail}:${spans.map(s => `${s.id}:${s.first}:${s.last}`).join('/')}`;
    if (key === rangeKey) return;
    rangeKey = key;
    for (const span of spans) for (let index = span.first; index <= span.last; index++) wanted.add(`${span.id}:${index}`);
    for (const [key, segment] of segments) {
      const detailedLayer = segment.layer === 'ground' || segment.layer === 'garden' || segment.layer === 'architecture' || segment.layer === 'canyon';
      if (!wanted.has(key) || (detailedLayer && segment.view.detail !== detail)) {
        segment.view.dispose(); segments.delete(key);
      }
    }
    pending = [];
    for (const span of spans) for (let index = span.first; index <= span.last; index++) {
      if (!segments.has(`${span.id}:${index}`)) pending.push({ layer: span.id, index, detail });
    }
    const center = (range.x + range.w / 2) / SEGMENT_WIDTH;
    pending.sort((a, b) => Math.abs(a.index + .5 - center) - Math.abs(b.index + .5 - center));
  };
  const buildNext = (): void => {
    const job = pending.shift()!;
    const view = createEnvironmentSegment(job.layer, job.index, homeCenter, job.detail, wind);
    (job.layer === 'ground' ? ground : layers[job.layer]).add(view.root);
    if (weather) view.setWeather(weather);
    view.setNightFactor(nightFactor); view.update(time);
    segments.set(`${job.layer}:${job.index}`, { ...job, view });
  };
  const setVisibleRange = (x: number, width: number): void => { range = { x, w: width }; sync(); };
  sync();
  return { root, layers,
    async prepare(signal: AbortSignal, onProgress: (progress: { completed: number; total: number }) => void): Promise<void> {
      signal.throwIfAborted();
      let completed = 0;
      onProgress({ completed, total: pending.length + 1 });
      await waitSceneResource(loadEnemyAsset('watchWasp'), signal);
      signal.throwIfAborted();
      if (disposed) throw new DOMException('城市环境已经释放', 'AbortError');
      traffic = createAiCityTraffic(homeCenter); root.add(traffic.root); traffic.setNightFactor(nightFactor);
      traffic.trains.visible = layers.canyon.visible; traffic.drones.visible = layers.architecture.visible;
      completed++; onProgress({ completed, total: completed + pending.length });
      while (pending.length) {
        // 将几何装配分散到浏览器任务，让加载谱线和场景目录持续响应。
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        signal.throwIfAborted();
        if (disposed) throw new DOMException('城市环境已经释放', 'AbortError');
        if (!pending.length) break;
        buildNext(); completed++; onProgress({ completed, total: completed + pending.length });
      }
      traffic.update(time, range);
      prepared = true;
    },
    setWeather(look: PrecipSkyLook): void {
      weather = look;
      for (const segment of segments.values()) segment.view.setWeather(look);
    },
    setNightFactor(night: number): void {
      nightFactor = night;
      traffic?.setNightFactor(night);
      for (const segment of segments.values()) segment.view.setNightFactor(night);
    },
    setLayerVisible(id: AiCityLayerId, visible: boolean): void {
      layers[id].visible = visible;
      if (traffic && id === 'canyon') traffic.trains.visible = visible;
      if (traffic && id === 'architecture') traffic.drones.visible = visible;
    },
    setVisibleRange,
    setCamera(camera: THREE.PerspectiveCamera): void {
      camera.updateMatrixWorld();
      for (const [index, corner] of frustumCorners.entries()) {
        corner.set(index & 1 ? 1 : -1, index & 2 ? 1 : -1, index & 4 ? 1 : -1).unproject(camera);
      }
      const visible = shadowReceiverBounds(frustumCorners, -1, 1);
      if (visible) setVisibleRange(visible.centerX - visible.halfWidth, visible.halfWidth * 2);
    },
    update(seconds: number): void {
      time = seconds;
      if (prepared && pending.length) buildNext();
      traffic?.update(seconds, range);
      for (const segment of segments.values()) {
        if (segment.layer === 'ground' || layers[segment.layer].visible) segment.view.update(seconds);
      }
    },
    dispose(): void {
      disposed = true; pending = [];
      root.removeFromParent(); traffic?.dispose();
      for (const segment of segments.values()) segment.view.dispose();
      segments.clear(); root.clear();
    },
  };
}
