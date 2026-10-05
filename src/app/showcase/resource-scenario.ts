import type { ShowcaseCard } from '../../config/showcase.ts';
import { arrangeTerrain } from './terrain-layout.ts';
import { createCompositionScenario } from './composition-scenario.ts';
import { resourceTileColumns } from '../../config/resource-showcase.ts';
import { resourceEntry } from '../../render/resource-catalog.ts';
import { TUNING } from '../../config/tuning.ts';
import { HUT_RULES } from '../../config/worldgen-rules.ts';
import { mulberry32 } from '../../core/rng.ts';
import { NEUTRAL_INPUT } from '../../entities/pelican-controller.ts';
import { createSimWorld, getPlayer, stepSim } from '../../sim/sim-world.ts';
import { createShowcaseLevel } from '../../world/showcase-level.ts';
import { planTree } from '../../world/trees.ts';
import { stampFishingHut } from '../../world/structures.ts';
import { CAVE_CELL, computeSurface } from '../../world/level.ts';
import type { LevelData } from '../../world/level.ts';
import { TILE_GRASS, TILE_SAND, TILE_SANDSTONE, TILE_STONE, TILE_AIR, TILE_TIMBER, TILE_ROOF, TILE_PLATFORM, TILE_BRANCH } from '../../world/tile-types.ts';
import { FLUID_FULL } from '../../world/fluid-map.ts';
import { placeBody } from './scenario.ts';
import type { ShowcaseScenario } from './scenario.ts';

export function createResourceScenario(card: ShowcaseCard): ShowcaseScenario {
  const options = card.resource!;
  if (options.composition) return createCompositionScenario(card);
  const entry = resourceEntry(card.entryId);
  const { level: base, groundY } = createShowcaseLevel(card.environment);
  const sampleColumns = resourceTileColumns(options, base.map.width);
  const firstSample = sampleColumns[0]!;
  const lastSample = sampleColumns[sampleColumns.length - 1]!;
  const sampleCenter = (firstSample + lastSample + 1) / 2;
  const rng = mulberry32(options.seed);
  const treeKind = entry.actor === 'tree' ? entry.action : entry.actor === 'terrain' && entry.action === 'branch' ? 'oak' : options.habitat === 'wood' ? 'oak' : null;
  const hut = entry.actor === 'hut' || (entry.actor === 'terrain' && entry.action === 'roof');
  const singleTile = entry.actor === 'terrain' && entry.action !== 'branch' && !hut && (options.layout === 'single' || options.layout === 'raised');
  const trees = treeKind ? (singleTile ? sampleColumns : [24]).map((x, i) => planTree(treeKind, x, groundY, rng, i + 1)) : [];
  const water = entry.actor === 'water' || entry.actor === 'aquatic' || options.habitat === 'shore';
  let structures: LevelData['structures'] = [];
  let lakes: LevelData['lakes'] = [];
  // 从共享场地读取池岸材料，避免复制它的尺寸和地层配置。
  for (const lake of base.lakes) for (let y = 0; y < lake.level; y++) for (let x = lake.x0; x <= lake.x1; x++) {
    if (base.fluid.amountAt(x, y) === 0) continue;
    base.fluid.set(x, y, 0);
    base.map.set(x, y, base.map.get(lake.x0 - 1, y));
    base.caves.mask[y * base.map.width + x] = 0;
  }
  // 地上场景使用正式草地瓦片，附着花草由 tile-view 按环境自动生成。
  for (let x = 2; x < base.map.width - 2; x++) {
    if (card.environment === 'surface') base.map.set(x, groundY - 1, TILE_GRASS);
    if (entry.actor === 'desert' || options.habitat === 'desert') {
      base.map.set(x, groundY - 1, TILE_SAND);
      for (let y = groundY - 4; y < groundY - 1; y++) base.map.set(x, y, TILE_SANDSTONE);
    }
  }
  if (entry.actor === 'terrain' && entry.action !== 'branch' && !hut) arrangeTerrain(base.map, groundY, entry.action, options);
  if (options.habitat === 'desert' && entry.actor === 'terrain' && entry.action === 'sand') {
    for (let x = 2; x < base.map.width - 2; x++) for (let y = groundY - 4; y < groundY - 1; y++) base.map.set(x, y, TILE_SANDSTONE);
  }
  const ceiling = entry.actor === 'cave' && (entry.action.includes('Ceil') || entry.action.startsWith('stalactite') || entry.action.startsWith('cobweb'));
  if (ceiling) for (let x = 21; x <= 27; x++) base.map.set(x, groundY + 3, TILE_STONE);
  if ((entry.actor === 'grass' && entry.action === 'vine') || (entry.actor === 'cover' && entry.action === 'drape')) {
    for (let x = 24; x < base.map.width - 2; x++) for (let y = groundY - 2; y < groundY; y++) base.map.set(x, y, TILE_AIR);
  }
  if (entry.actor === 'cave' && entry.action.startsWith('cobweb')) {
    for (let y = groundY; y < groundY + 3; y++) base.map.set(23, y, TILE_STONE);
  }
  let focus = { x: 24, y: groundY + 1 };
  let height = 5;
  let width = 7;
  let referenceX = 21.5;
  if (entry.actor === 'terrain' || (entry.actor === 'grass' && entry.action === 'natural')) {
    focus = { x: 24.5, y: groundY - 0.5 }; height = 7; width = 16;
  }
  if (singleTile) {
    focus = { x: sampleCenter, y: groundY + (options.layout === 'single' ? -0.5 : 0.25) };
    height = 3; width = lastSample - firstSample + 5;
    referenceX = firstSample - 2.5;
  }
  if (trees.length && (entry.actor === 'tree' || (entry.actor === 'terrain' && entry.action === 'branch') || options.assembly)) {
    const tree = trees[0]!;
    height = Math.max(...trees.map((item) => item.trunkHeight + item.canopyHeight)) + 3;
    const left = Math.min(...trees.map((item) => item.x - item.canopyHalfWidth - Math.abs(item.crownDx)));
    const right = Math.max(...trees.map((item) => item.x + item.canopyHalfWidth + Math.abs(item.crownDx)));
    width = right - left + 6;
    focus = { x: trees.length === 1 ? tree.x + 0.5 + tree.crownDx / 2 : (left + right + 1) / 2, y: groundY + (height - 3) / 2 };
    referenceX = tree.x - 2;
  }
  if (water && singleTile) {
    // 岸边水槽避开每个样本及承托列，保持形状对照完整。
    lakes = sampleColumns.map((x) => ({ x0: x + 1, x1: x + 2, level: groundY - 1, perched: false }));
    for (const lake of lakes) for (let x = lake.x0; x <= lake.x1; x++) for (let y = groundY - 5; y < groundY; y++) {
      base.map.set(x, y, TILE_AIR);
      if (y < lake.level) base.fluid.set(x, y, FLUID_FULL);
      if (card.environment === 'underground') base.caves.mask[y * base.map.width + x] = CAVE_CELL;
    }
  } else if (hut || water) {
    const side = entry.action === 'left' ? -1 : 1;
    const hutX = 28;
    const hutRight = hutX + HUT_RULES.WALL_WIDTH;
    const x0 = water ? 18 : side === 1 ? hutRight : hutX - 12;
    const x1 = water ? 30 : side === 1 ? hutRight + 11 : hutX - 1;
    for (let y = groundY - 5; y < groundY; y++) for (let x = x0; x <= x1; x++) {
      base.map.set(x, y, TILE_AIR);
      base.fluid.set(x, y, FLUID_FULL);
      if (card.environment === 'underground') base.caves.mask[y * base.map.width + x] = CAVE_CELL;
    }
    lakes = [{ x0, x1, level: groundY, perched: false }];
    if (hut) {
      const mapWidth = base.map.width;
      const ids = Uint16Array.from({ length: mapWidth * base.map.height }, (_, i) => base.map.get(i % mapWidth, Math.floor(i / mapWidth)));
      const shapes = new Uint8Array(ids.length);
      structures = [stampFishingHut(ids, shapes, mapWidth, { x0: hutX, floorY: groundY, lakeSide: side, pierLen: 7, lake: 0 },
        { air: TILE_AIR, timber: TILE_TIMBER, roof: TILE_ROOF, platform: TILE_PLATFORM }, 1)];
      base.map.load(ids, shapes);
      const structure = structures[0]!;
      for (let x = structure.pierX0; x <= structure.pierX1; x++) base.fluid.set(x, groundY - 1, 0);
      height = HUT_RULES.WALL_HEIGHT + HUT_RULES.ROOF_ROWS + 12;
      width = 25;
      focus = { x: hutX + HUT_RULES.WALL_WIDTH / 2 + side * 2, y: groundY + 4 };
      referenceX = side === 1 ? hutX - 3 : hutRight + 2;
    } else {
      height = 10; width = 20;
      focus = { x: 24.5, y: groundY - 1.5 };
      referenceX = 16;
    }
  }
  if (options.assembly && entry.actor === 'cave') {
    focus = { x: 24, y: groundY + 9 }; height = 24; width = 34;
  }
  for (const tree of trees) for (const platform of tree.platforms) {
    for (let x = platform.x0; x <= platform.x1; x++) base.map.set(x, platform.ty, TILE_BRANCH);
  }
  const glowKind = entry.action.startsWith('crystalPurple') ? 'crystalPurple' : entry.action.startsWith('mushroom') ? 'mushroom' : 'crystalCyan';
  const level: LevelData = {
    ...base, seed: options.seed, trees, structures, lakes,
    deserts: options.habitat === 'desert' ? [{ x0: 2, x1: base.map.width - 3, lo: 2, hi: base.map.width - 3, mesas: [] }] : [], surface: computeSurface(base.map),
    caves: { ...base.caves, pools: [], glows: entry.actor === 'cave' && (entry.action.startsWith('crystal') || entry.action.startsWith('mushroom'))
      ? [{ x: 24, y: groundY + (ceiling ? 3 : 0), kind: glowKind, ceiling, light: 170, seed: options.seed }] : options.assembly && card.environment === 'underground' ? base.caves.glows : [] },
  };
  const world = createSimWorld({ level, tuning: TUNING, precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
  placeBody(getPlayer(world).body, referenceX, groundY, true);
  let ticks = 0;
  return {
    world, entry, groundY, facing: 1, height, width,
    durationTicks: Math.round(entry.seconds / TUNING.sim.step),
    get elapsedTicks() { return ticks; },
    step() { stepSim(world, NEUTRAL_INPUT); ticks++; },
    focus: () => focus,
    status: () => `${options.assembly && entry.actor === 'cave' ? '完整洞穴' : entry.label} · Seed ${options.seed}${options.reference ? ' · 鹈鹕原始比例' : ''}`,
    dispose() { level.fluid.dispose(); },
  };
}
