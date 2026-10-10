import * as THREE from 'three';
import { mulberry32 } from '../core/rng.ts';
import { createTileMap } from '../world/tile-map.ts';
import { DEFAULT_TILES } from '../world/tile-types.ts';
import { createFluidMap, FLUID_FULL } from '../world/fluid-map.ts';
import { FLORA_RULES, createFloraGeometries, createFloraMeshes, createWindMaterial } from '../render/flora.ts';
import type { FloraInstance, FloraSpecies } from '../render/flora.ts';
import { createWeedRibbonGeometry, createWeedRoundGeometry } from '../render/flora-geometry.ts';
import { AQUATIC_WIND } from '../render/water-flora.ts';
import { SHRUB_RULES, createShrubAtlas, createShrubMaterial, createShrubMesh } from '../render/flora-shrubs.ts';
import type { ShrubInstance, ShrubKind } from '../render/flora-shrubs.ts';
import { ROCK_KINDS, ROCK_NATIVE, createRockParts, type RockKind } from '../render/rock-geometry.ts';
import { createRockMaterial } from '../render/rock-material.ts';
import { createDecorBatch } from '../render/surface-decor-view.ts';
import type { RockInstance } from '../render/surface-decor.ts';
import { CAVE_DECOR_KINDS, createCaveDecorParts, createCaveDecorMaterial, createPartBatch, caveDecorMatrix } from '../render/cave-decor-view.ts';
import type { CaveDecorItem, CaveDecorKind } from '../render/cave-decor-view.ts';
import { createWaterView } from '../render/water-view.ts';
import type { DepthTheme } from './depth-scenery.ts';
import type { DepthLayerId } from './definition-depth-layout.ts';

interface DetailPlan {
  flowers: FloraInstance[];
  shrubs: ShrubInstance[];
  rocks: RockInstance[];
  crystals: CaveDecorItem[];
}

/** 景观只规划实例，花草、湖水和岩石均由正式游戏的工厂绘制。 */
export function createDepthLandscapeDetails(theme: DepthTheme, layers: ReadonlyMap<DepthLayerId, THREE.Group>) {
  const plans = new Map<DepthLayerId, DetailPlan>([...layers.keys()].map(id =>
    [id, { flowers: [], shrubs: [], rocks: [], crystals: [] }]));
  const rng = mulberry32(0x1a4dcafe);
  const sample = ([low, high]: readonly [number, number]): number => low + (high - low) * rng();
  const flowers = (layer: DepthLayerId, left: number, right: number, y: number, species: readonly FloraSpecies[]): void => {
    const plan = plans.get(layer)!.flowers;
    const count = Math.ceil((right - left) * 7);
    for (let i = 0; i < count; i++) {
      const kind = species[i % species.length]!;
      const rule = FLORA_RULES[kind];
      const size = sample(rule.size);
      plan.push({ species: kind, x: left + (i + rng()) / count * (right - left), y, z: (rng() - .5) * .65,
        yaw: rng() * Math.PI * 2, tilt: 0, sx: size, sy: size * sample(rule.stretch), shear: 0,
        tint: rule.palette.length ? rule.palette[Math.floor(rng() * rule.palette.length)]! : 0xffffff });
    }
  };
  const shrub = (layer: DepthLayerId, kind: ShrubKind, x: number, y: number): void => {
    const rule = SHRUB_RULES[kind];
    plans.get(layer)!.shrubs.push({ kind, x, y, z: -.12, yaw: rng() * Math.PI,
      height: sample(rule.height), tint: rule.palette[Math.floor(rng() * rule.palette.length)]! });
  };
  const rock = (layer: DepthLayerId, kind: RockKind, x: number, y: number, width: number, moss = 1): void => {
    plans.get(layer)!.rocks.push({ kind, x, y, z: 0, yaw: (rng() - .5) * .6,
      tilt: 0, width, stretch: 1, tint: 0xffffff, moss });
  };
  const crystal = (layer: DepthLayerId, kind: CaveDecorKind, x: number, y: number, size: number): void => {
    plans.get(layer)!.crystals.push({ kind, x, y, z: 0, sx: size, sy: size, yaw: (rng() - .5) * .6 });
  };
  if (theme === 'valley' || theme === 'buildings') {
    const palette: readonly FloraSpecies[] = theme === 'valley'
      ? ['daisy', 'poppy', 'bluebell', 'clover', 'lavender', 'tuft'] : ['daisy', 'lavender', 'clover'];
    for (const [left, right] of [[2.3, 9.7], [18.3, 29.7], [36.3, 45.7]]) flowers('foreground', left!, right!, 1, palette);
  } else if (theme === 'lake' || theme === 'coast') {
    for (const [left, right] of [[2.3, 9.7], [18.3, 29.7], [36.3, 45.7]]) {
      flowers('foreground', left!, right!, 1, theme === 'lake' ? ['clover', 'tuft', 'daisy'] : ['tuft', 'pebble']);
    }
  } else if (theme === 'ruins') {
    for (const [left, right] of [[2.3, 9.7], [18.3, 21], [37, 45]]) flowers('foreground', left!, right!, 1, ['fern', 'mushroom', 'clover']);
    for (const x of [5, 20, 40]) rock('foreground', 'boulderA', x, 1, 1.3, 1.7);
  } else {
    for (const [x, kind] of [[5, 'crystalCyan0'], [9, 'mushroom0'], [20, 'crystalPurple1'], [28, 'mushroom2'],
      [38, 'crystalCyan1'], [44, 'crystalPurple0']] as const) crystal('foreground', kind, x, 1, .8);
  }
  if (theme === 'valley') {
    shrub('background-near', 'azalea', 6, 2); shrub('background-near', 'rose', 38, 3); shrub('background-near', 'azalea', 44, 2);
    shrub('background-far', 'hedge', 6, 2); rock('background-far', 'outcrop', 40, 3, 3, 1.4);
  } else if (theme === 'lake') {
    for (const x of [5.5, 6, 6.5]) shrub('background-near', 'cattail', x, 2);
    for (const x of [39.5, 40, 40.5]) shrub('background-near', 'cattail', x, 2);
    rock('background-far', 'shoreB', 6, 1, 3); rock('background-far', 'shoreA', 42, 2, 2.6);
    flowers('background-near', 5.7, 6.5, 2, ['reed', 'clover']); flowers('background-near', 39.6, 40.5, 2, ['reed']);
  } else if (theme === 'coast') {
    shrub('background-near', 'marram', 4, 2); shrub('background-near', 'buckthorn', 44, 3);
    rock('background-far', 'sandBoulder', 6, 1, 3.5, 0); rock('background-far', 'shoreB', 46, 2, 3.2, .2);
    for (const x of [5, 8, 20, 28, 39, 44]) rock('foreground', 'sandPebbles', x, 1, .9, 0);
  } else if (theme === 'buildings') {
    shrub('background-near', 'azalea', 12, 1); shrub('background-near', 'rose', 28, 3);
    shrub('background-far', 'hedge', 6, 1); shrub('background-far', 'azalea', 42, 2);
    flowers('background-near', 11.6, 12.5, 1, ['poppy', 'daisy']); flowers('background-near', 27.6, 28.5, 3, ['lavender']);
  } else if (theme === 'ruins') {
    shrub('background-near', 'fernclump', 12, 1); shrub('background-near', 'fernclump', 34, 1);
    rock('background-far', 'strataB', 4, 1, 2.7, 1.8); rock('background-far', 'outcrop', 42, 2, 3, 1.6);
    crystal('background-near', 'crystalCyan1', 34.5, 1, 1.6); crystal('background-far', 'crystalCyan0', 42, 2, 1.8);
    crystal('background-near', 'moss0', 12, 1, 1.8);
  } else {
    for (const [layer, x, y, kind, size] of [
      ['background-near', 8, 2, 'crystalCyan0', 2.4], ['background-near', 8.8, 2, 'crystalCyan1', 1.5],
      ['background-near', 38, 2, 'crystalPurple1', 2.6], ['background-near', 39, 2, 'mushroom1', 1.2],
      ['background-far', 10, 1, 'crystalCyan1', 3.2], ['background-far', 38, 2, 'crystalPurple0', 3.4],
    ] as const) crystal(layer, kind, x, y, size);
    rock('background-near', 'slate', 8, 2, 2.5, 0); rock('background-far', 'graniteB', 38, 2, 3.5, 0);
  }

  const resources: Array<{ dispose(): void }> = [];
  const nodes: THREE.Object3D[] = [];
  const time = { value: 0 };
  const attach = (layer: DepthLayerId, node: THREE.Object3D): void => { layers.get(layer)!.add(node); nodes.push(node); };
  if ([...plans.values()].some(plan => plan.flowers.length)) {
    const geometries = createFloraGeometries();
    const material = createWindMaterial(time);
    resources.push(...Object.values(geometries), material);
    for (const [layer, plan] of plans) if (plan.flowers.length) {
      const meshes = createFloraMeshes(plan.flowers, geometries, material, `landscape-${theme}-${layer}`);
      for (const mesh of meshes) { attach(layer, mesh); resources.push(mesh); }
    }
  }
  if ([...plans.values()].some(plan => plan.shrubs.length)) {
    const atlas = createShrubAtlas();
    const material = createShrubMaterial(time);
    resources.push(atlas, material);
    for (const [layer, plan] of plans) if (plan.shrubs.length) {
      const mesh = createShrubMesh(plan.shrubs, atlas, material, `landscape-${theme}-${layer}`)!;
      attach(layer, mesh); resources.push(mesh.geometry, mesh);
    }
  }
  if ([...plans.values()].some(plan => plan.rocks.length)) {
    const parts = createRockParts();
    const material = createRockMaterial();
    resources.push(material);
    for (const [layer, plan] of plans) if (plan.rocks.length) {
      const batch = createDecorBatch(ROCK_KINDS, parts, material, `landscape-rocks-${theme}-${layer}`,
        kind => ROCK_NATIVE[kind].width, () => 1, plan.rocks.length);
      batch.add(plan.rocks); attach(layer, batch.mesh); resources.push(batch);
    }
    for (const part of parts) part.dispose();
  }
  if ([...plans.values()].some(plan => plan.crystals.length)) {
    const parts = createCaveDecorParts();
    const material = createCaveDecorMaterial(time);
    resources.push(material);
    for (const [layer, plan] of plans) if (plan.crystals.length) {
      const batch = createPartBatch(CAVE_DECOR_KINDS, parts, material, `landscape-crystals-${theme}-${layer}`, plan.crystals.length);
      batch.add(plan.crystals, (index, matrix) => caveDecorMatrix(plan.crystals[index]!, matrix));
      attach(layer, batch.mesh); resources.push(batch);
    }
    for (const part of parts) part.dispose();
  }
  let water: ReturnType<typeof createWaterView> | null = null;
  if (theme === 'lake' || theme === 'coast' || theme === 'cave') {
    const width = theme === 'cave' ? 8 : 20;
    const depth = theme === 'cave' ? 2 : 3;
    const fluid = createFluidMap(createTileMap(width, depth, DEFAULT_TILES));
    for (let x = 0; x < width; x++) for (let y = 0; y < depth; y++) fluid.set(x, y, FLUID_FULL);
    water = createWaterView(fluid, { palette: theme === 'lake' ? 'emerald' : theme === 'coast' ? 'deep' : 'clear' });
    water.root.position.set(theme === 'cave' ? 20 : 14, -depth, 0);
    water.root.scale.z = 4;
    attach('background-far', water.root);
    water.update({ x: 0, y: 0, w: width, h: depth }, 0);
    resources.push(fluid, water);
    if (theme !== 'cave') {
      const geometry = theme === 'coast' ? createWeedRibbonGeometry() : createWeedRoundGeometry();
      const material = createWindMaterial(time, AQUATIC_WIND);
      const weeds = new THREE.InstancedMesh(geometry, material, 18);
      const placement = new THREE.Object3D();
      for (let i = 0; i < 18; i++) {
        placement.position.set(14.5 + i + rng() * .3, -3, -.1);
        placement.rotation.y = rng() * Math.PI;
        placement.scale.set(.5 + rng() * .3, .9 + rng() * .9, .7);
        placement.updateMatrix(); weeds.setMatrixAt(i, placement.matrix);
        weeds.setColorAt(i, new THREE.Color(0xd0e6c0));
      }
      attach('background-far', weeds); resources.push(geometry, material, weeds);
    }
  }
  return {
    update(seconds: number): void {
      time.value = seconds;
      if (water) water.update({ x: 0, y: 0, w: 20, h: 3 }, seconds);
    },
    dispose(): void {
      for (const node of nodes) node.removeFromParent();
      for (const resource of resources.reverse()) resource.dispose();
    },
  };
}
