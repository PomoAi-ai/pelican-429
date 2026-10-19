import * as THREE from 'three';
import { mulberry32 } from '../../core/rng.ts';
import { RESIDENCE_WORLD, RESIDENCE_SEGMENT_WIDTH as SEGMENT_WIDTH } from '../../config/residence.ts';
import { AI_CITY_LAYERS, type AiCityLayerId } from '../../config/ai-city-look.ts';
import { planTree } from '../../world/trees.ts';
import type { TreeKind } from '../../world/level.ts';
import { buildTreeGeometry } from '../tree/tree-geometry.ts';
import { createTreeMaterials } from '../tree/tree-material.ts';
import { createAiCityBatches, type AiCityBatches } from './ai-city-batches.ts';
import { AI_CITY_RAILS, createAiCityTraffic } from './ai-city-traffic.ts';
import { AI_CITY_BACKDROP_FILES, loadAiCityBackdrop, type AiCityBackdrop } from './ai-city-backdrop.ts';
import { shadowReceiverBounds } from '../stage/shadow-fit.ts';
import { createFloraGeometries, createFloraMeshes, createWindMaterial, type FloraInstance } from '../flora/flora.ts';
import { createShrubAtlas, createShrubMaterial, createShrubMesh, SHRUB_KINDS, type ShrubInstance } from '../flora/flora-shrubs.ts';
import { built, createLilyPadGeometry, createLilyFlowerGeometry } from '../water/aquatic-geometry.ts';
import type { PrecipSkyLook } from '../sky/precip-sky.ts';
import { createTileMap } from '../../world/tile-map.ts';
import { DEFAULT_TILES } from '../../world/tile-types.ts';
import { createFluidMap, FLUID_FULL } from '../../world/fluid-map.ts';
import { createWaterView, waterWaveAt, WATER_BACK_Z, WATER_FRONT_Z, WATER_TOP_BACK_Z } from '../water/water-view.ts';

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

function createGardenLilies(width: number, clearing: AiCityClearing | null) {
  const root = new THREE.Group();
  const time = { value: 0 };
  const material = createWindMaterial(time, { amplitude: .025, windScale: .2 });
  const geometries = [built(createLilyPadGeometry), built(createLilyFlowerGeometry)];
  const rng = mulberry32(0x1717);
  const positions = Array.from({ length: Math.ceil(width / 3) }, () => ({ x: rng() * width, z: 2 + rng(), scale: 1.3 + rng() * .8, yaw: rng() * 6.28 }))
    .filter(p => !cleared(clearing, p.x, p.x + .3));
  const meshes = geometries.map(geometry => new THREE.InstancedMesh(geometry, material, positions.length));
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
export interface AiCityClearing { readonly minX: number; readonly maxX: number }
/** 空地不与分段对齐，按物体的段内 x 区间过滤而不是整段丢弃。 */
const cleared = (clearing: AiCityClearing | null, left: number, right: number): boolean =>
  clearing !== null && left < clearing.maxX && right > clearing.minX;
type TreePlacement = { x: number; y: number; z: number; height: number; kind: TreeKind };
type WaterPlacement = { x: number; y: number; z: number; w: number; h: number; depth: number };
interface SegmentPlan { beds: GardenBed[]; trees: TreePlacement[]; waters: WaterPlacement[] }

// 近轨贴着水面跨过整段，远轨高架横穿近城楼群腰部，两层列车在画面上下错开；列车由交通层沿同一高度行驶。
// z 为所在层的原始层距，分段平移后与 AI_CITY_RAILS 的世界深度重合。
function addRail(city: AiCityBatches, rail: { y: number; scale: number }, z: number, pier: number): void {
  const { put } = city;
  const { y, scale: k } = rail;
  // 深色梁身配一道灯带，在黄昏楼群脚下读作轨道而不是一道白栏杆。
  put('box', 'blue', 64, y, z, SEGMENT_WIDTH + .2, .34 * k, .8 * k);
  put('box', 'ivory', 64, y + .19 * k, z, SEGMENT_WIDTH + .2, .05 * k, .86 * k);
  put('panel', 'light', 64, y - .05 * k, z + .41 * k, SEGMENT_WIDTH + .2, .05 * k, .02);
  for (let x = pier / 2; x < SEGMENT_WIDTH; x += pier) {
    put('taper', 'blue', x, (y - .17 * k) / 2, z, .55 * k, y - .17 * k, .55 * k);
  }
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
}

// 前景格子：玩家前方的水带、圆花坛与局部格子台。顶面不高于落脚线，只压住画面下缘，不挡角色。
function addGround(city: AiCityBatches, plan: SegmentPlan, homeCenter: number, clearing: AiCityClearing | null): void {
  const { put } = city;
  // 水带按整格切开，只保留空地两侧。
  const clamp = (x: number): number => THREE.MathUtils.clamp(x, 0, SEGMENT_WIDTH);
  const gapLeft = clearing ? clamp(Math.floor(clearing.minX)) : SEGMENT_WIDTH;
  const gapRight = clearing ? clamp(Math.ceil(clearing.maxX)) : SEGMENT_WIDTH;
  for (const [x, w] of [[0, gapLeft], [gapRight, SEGMENT_WIDTH - gapRight]] as const) {
    if (w > 0) plan.waters.push({ x, y: -.2, z: 3.2, w, h: 1, depth: 1.4 });
  }
  const homeHere = homeCenter >= 0 && homeCenter <= SEGMENT_WIDTH;
  const planters = [homeHere ? homeCenter - 22 : 28, homeHere ? homeCenter + 23 : 91]
    .filter(x => x >= 5 && x <= SEGMENT_WIDTH - 5 && !cleared(clearing, x - 4.6, x + 4.6));
  for (const x of planters) {
    put('cylinder', 'stone', x, .2, 4.5, 4.6, 1.1, 2.1);
    put('cylinder', 'soil', x, .8, 4.5, 4.4, .12, 1.95);
    plan.beds.push({ x: x - 3.5, y: .87, z: 3.4, width: 7, depth: 1.6 });
  }
  // 每列从水下 y=−0.5 起砌整格，2 为满高（顶面即落脚线），1.5 为顶上半砖；成簇出现、彼此留出水面。
  const clusters = [{ x: 9, columns: [1.5, 2, 2] }, { x: 58, columns: [2, 1.5] }, { x: 108, columns: [1.5, 2, 2, 1.5] }];
  for (const cluster of clusters) {
    const center = cluster.x + cluster.columns.length / 2;
    if ((homeHere && Math.abs(center - homeCenter) < 18) || planters.some(x => Math.abs(x - center) < 8)
      || cleared(clearing, cluster.x, cluster.x + cluster.columns.length)) continue;
    for (const [i, height] of cluster.columns.entries()) {
      const x = cluster.x + i + .5;
      put('box', 'stone', x, 0, 3.9, .97, .97, 1.9);
      put('box', 'ivory', x, .5 + (height - 1) / 2, 3.9, .97, height - 1 - .03, 1.9);
      put('panel', 'paving', x, height - .5 + .01, 3.9, .95, .03, 1.85);
    }
  }
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

function createEnvironmentSegment(layer: SegmentLayer, index: number, homeCenter: number, detail: boolean,
  backdrop: AiCityBackdrop | null, clearing: AiCityClearing | null) {
  const city = createAiCityBatches();
  city.root.name = `ai-city-${layer}-segment-${index}`;
  city.root.position.x = index * SEGMENT_WIDTH;
  const originalDepth = { garden: -7, architecture: -16, canyon: -35, city: -70, distance: -140 };
  if (layer !== 'ground') city.root.position.z = AI_CITY_LAYERS.find(value => value.id === layer)!.depth - originalDepth[layer];
  const plan: SegmentPlan = { beds: [], trees: [], waters: [] };
  const local = clearing && { minX: clearing.minX - index * SEGMENT_WIDTH, maxX: clearing.maxX - index * SEGMENT_WIDTH };
  switch (layer) {
    case 'ground': addGround(city, plan, homeCenter - index * SEGMENT_WIDTH, local); break;
    case 'garden': addGardens(city, plan, index, homeCenter - index * SEGMENT_WIDTH); break;
    // 只有前景场景（住宅2）没有绘制背景：湖面由宿主原画提供，这一层只留近轨。
    case 'architecture':
      addRail(city, AI_CITY_RAILS.near, -16, 16);
      if (backdrop) city.root.add(backdrop.create('water', index));
      break;
    case 'canyon': addRail(city, AI_CITY_RAILS.far, -35, 24); city.root.add(backdrop!.create('canyon', index)); break;
    case 'city': city.root.add(backdrop!.create('city', index)); break;
    case 'distance': city.root.add(backdrop!.create('distance', index)); break;
  }
  const animated: Array<{ update(time: number): void; dispose(): void }> = [];
  const nightResponders: Array<{ setNightFactor(night: number): void }> = [city];
  if (detail && plan.beds.length) {
    const greenery = createAiCityGreenery(plan.beds);
    city.root.add(greenery.root); animated.push(greenery);
  }
  if (detail && plan.trees.length) {
    const trees = createGardenTrees(plan.trees);
    city.root.add(trees.root); animated.push(trees);
  }
  if (layer === 'ground' && detail) {
    const lilies = createGardenLilies(SEGMENT_WIDTH, local);
    city.root.add(lilies.root); animated.push(lilies);
  }
  const waters = plan.waters.map(p => createSegmentWater(city, p));
  animated.push(...waters); nightResponders.push(...waters);
  city.flush();
  return { root: city.root, detail, setNightFactor(night: number): void {
    for (const item of nightResponders) item.setNightFactor(night);
  }, update(time: number): void {
    for (const item of animated) item.update(time);
  }, dispose(): void {
    for (const item of animated) item.dispose();
    city.dispose();
  } };
}

/**
 * 分层和分段只管理表现，不向玩法注册台地；同一资源工厂服务目录与住宅游戏。
 * foreground 只建前景格子与背景格子二的近轨和近处交通，供自带湖景原画的住宅2复用。
 * clearing 为世界 x 区间 [minX, maxX)，其中不建前景格子，留给自带街面的设施；背景层照常。
 */
export function createAiCityEnvironment({ homeCenter, scenery, clearing = null }:
  { homeCenter: number; scenery: 'full' | 'foreground'; clearing?: AiCityClearing | null }) {
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
  let backdrop: AiCityBackdrop | null = null;
  let traffic: ReturnType<typeof createAiCityTraffic> | null = null;
  let pending: Array<{ layer: SegmentLayer; index: number; detail: boolean }> = [];
  const sync = (): void => {
    const detail = range.w < 190;
    const wanted = new Set<string>();
    const built = scenery === 'full' ? AI_CITY_LAYERS : AI_CITY_LAYERS.filter(layer => layer.id === 'architecture');
    const spans = [{ id: 'ground' as const, depth: 0 }, ...built].map(layer => {
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
    const view = createEnvironmentSegment(job.layer, job.index, homeCenter, job.detail, backdrop, clearing);
    (job.layer === 'ground' ? ground : layers[job.layer]).add(view.root);
    view.setNightFactor(nightFactor); view.update(time);
    segments.set(`${job.layer}:${job.index}`, { ...job, view });
  };
  const setVisibleRange = (x: number, width: number): void => { range = { x, w: width }; sync(); };
  sync();
  return { root, layers,
    async prepare(signal: AbortSignal, onProgress: (progress: { completed: number; total: number }) => void): Promise<void> {
      signal.throwIfAborted();
      let completed = 0;
      const total = pending.length + (scenery === 'full' ? AI_CITY_BACKDROP_FILES : 0);
      onProgress({ completed, total });
      if (scenery === 'full') {
        const loaded = await loadAiCityBackdrop(signal, () => {
          completed++; onProgress({ completed, total });
        }, homeCenter);
        if (disposed || signal.aborted) {
          loaded.dispose();
          signal.throwIfAborted();
          throw new DOMException('城市环境已经释放', 'AbortError');
        }
        backdrop = loaded;
        if (weather) backdrop.setWeather(weather);
        backdrop.setNightFactor(nightFactor);
      }
      // 住宅2只留近轨列车，天上不放飞行车。
      traffic = createAiCityTraffic(homeCenter, scenery === 'full' ? ['near', 'far'] : ['near'], scenery === 'full');
      root.add(traffic.root); traffic.setNightFactor(nightFactor);
      traffic.near.visible = layers.architecture.visible; traffic.far.visible = layers.canyon.visible;
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
      backdrop?.setWeather(look);
    },
    setNightFactor(night: number): void {
      nightFactor = night;
      backdrop?.setNightFactor(night);
      traffic?.setNightFactor(night);
      for (const segment of segments.values()) segment.view.setNightFactor(night);
    },
    setLayerVisible(id: AiCityLayerId, visible: boolean): void {
      layers[id].visible = visible;
      if (traffic && id === 'architecture') traffic.near.visible = visible;
      if (traffic && id === 'canyon') traffic.far.visible = visible;
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
      backdrop?.update(seconds);
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
      backdrop?.dispose();
      segments.clear(); root.clear();
    },
  };
}
