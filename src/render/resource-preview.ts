import * as THREE from 'three';
import type { ShowcaseCard } from '../config/showcase.ts';
import { resourceEntry } from './resource-catalog.ts';
import { mulberry32 } from '../core/rng.ts';
import type { LevelData } from '../world/level.ts';
import { createTileMap } from '../world/tile-map.ts';
import { DEFAULT_TILES, TILE_TIMBER, TILE_PLATFORM, TILE_ROOF } from '../world/tile-types.ts';
import { createResourceInspection } from './resource-inspection.ts';
import type { InspectionFrame } from './resource-inspection.ts';
import { createTileView } from './tile-view.ts';
import { SHRUB_RULES, SHRUB_Z, createShrubAtlas, createShrubMaterial, createShrubMesh } from './flora-shrubs.ts';
import { FLORA_RULES, FLORA_ROUND_INSET, createFloraGeometries, createFloraMeshes, createWindMaterial } from './flora.ts';
import { ROCK_KINDS, ROCK_NATIVE, createRockParts } from './rock-geometry.ts';
import { ROCK_SIZE, BIG_ROCKS, SMALL_ROCKS, DESERT_DECOR_RULES, DESERT_NATIVE_WIDTH } from './surface-decor.ts';
import { createRockMaterial } from './rock-material.ts';
import { createDecorBatch, createDesertMaterial } from './surface-decor-view.ts';
import { CAVE_DECOR_KINDS, createCaveDecorParts, createCaveDecorMaterial, createPartBatch, caveDecorMatrix } from './cave-decor-view.ts';
import type { CaveDecorItem } from './cave-decor-view.ts';
import { COVER_RULES, createCoverAtlas, createCoverMaterial, createCoverMesh } from './flora-cover.ts';
import { DESERT_KINDS, createDesertParts } from './desert-geometry.ts';
import { createWaterFloraView } from './water-flora-view.ts';
import { aquaticPreviewPlan } from './resource-aquatic.ts';
import { BED_KINDS, FLOAT_KINDS } from './water-flora.ts';
import type { WorldViews } from './world-views.ts';

/** 单件预览使用游戏工厂，只替换实例规划，不复制几何和着色器。 */
export function createResourcePreview(scene: THREE.Scene, level: LevelData, groundY: number, card: ShowcaseCard, world: WorldViews, frame: InspectionFrame) {
  const entry = resourceEntry(card.entryId);
  const options = card.resource!;
  const rng = mulberry32(options.seed);
  const time = { value: 0 };
  const root = new THREE.Group(); root.name = 'resource-preview'; scene.add(root);
  const disposers: Array<() => void> = [() => root.removeFromParent()];
  const geometry = <T extends THREE.BufferGeometry>(g: T): T => { disposers.push(() => g.dispose()); return g; };
  const material = <T extends THREE.Material>(m: T): T => { disposers.push(() => m.dispose()); return m; };
  const sample = ([lo, hi]: readonly [number, number]): number => lo + (hi - lo) * rng();
  const yaw = (rng() - 0.5) * 0.5;
  const size = 0.9 + rng() * 0.2;
  let hutTiles: ReturnType<typeof createTileView> | null = null;
  let aquatic: ReturnType<typeof createWaterFloraView> | null = null;
  let lastTime = 0;
  const hut = entry.actor === 'hut' || (entry.actor === 'terrain' && entry.action === 'roof');
  const ceiling = entry.actor === 'cave' && (entry.action.includes('Ceil') || entry.action.startsWith('stalactite') || entry.action.startsWith('cobweb'));
  try {
    if (entry.actor === 'shrub') {
      const rule = SHRUB_RULES[entry.action];
      const mesh = createShrubMesh([{ kind: entry.action, x: 24, y: groundY, z: sample(SHRUB_Z), yaw, height: sample(rule.height), tint: rule.palette[Math.floor(rng() * rule.palette.length)]! }],
        geometry(createShrubAtlas()), material(createShrubMaterial(time)), 'resource');
      root.add(mesh!); disposers.push(() => { mesh!.dispose(); mesh!.geometry.dispose(); });
    }
    if (entry.actor === 'grass' && entry.action !== 'natural') {
      const geometries = createFloraGeometries(); Object.values(geometries).forEach(geometry);
      const species = entry.action;
      const rule = FLORA_RULES[species];
      const meshes = createFloraMeshes(Array.from({ length: species === 'vine' ? 1 : 5 }, (_, i) => {
        const scale = sample(rule.size);
        return { species, x: species === 'vine' ? 24 - FLORA_ROUND_INSET : 23.2 + i * 0.4, y: groundY, z: sample(rule.z), yaw: species === 'vine' ? 0 : rng() * Math.PI, tilt: 0,
          sx: species === 'vine' ? 1 : scale, sy: scale * sample(rule.stretch), shear: 0, tint: rule.palette.length ? rule.palette[Math.floor(rng() * rule.palette.length)]! : 0xffffff };
      }), geometries, material(createWindMaterial(time)), 'resource');
      root.add(...meshes); disposers.push(() => meshes.forEach((m) => m.dispose()));
    }
    if (entry.actor === 'cover') {
      const rule = COVER_RULES[entry.action];
      const kind = entry.action;
      const mesh = createCoverMesh(Array.from({ length: kind === 'drape' ? 1 : 5 }, (_, i) => ({ kind, x: kind === 'drape' ? 24 - FLORA_ROUND_INSET : 23 + i * 0.5, y: groundY + 0.01, z: 0.4, yaw: kind === 'drape' ? 0 : yaw, tilt: 0, scale: sample(rule.size), tint: rule.palette[Math.floor(rng() * rule.palette.length)]! })), geometry(createCoverAtlas()), material(createCoverMaterial(time)), 'resource');
      root.add(mesh!); disposers.push(() => { mesh!.dispose(); mesh!.geometry.dispose(); });
    }
    if (entry.actor === 'desert') {
      const parts = createDesertParts(); parts.forEach(geometry);
      const batch = createDecorBatch(DESERT_KINDS, parts, material(createDesertMaterial(time)), 'resource-desert', (kind) => DESERT_NATIVE_WIDTH[kind], (kind) => kind === 'ripple' ? 1 : 1.2, 1);
      disposers.push(() => batch.dispose()); root.add(batch.mesh);
      const rule = DESERT_DECOR_RULES[entry.action];
      batch.add([{ kind: entry.action, x: 24, y: groundY + 0.01, z: sample(rule.z), yaw, tilt: 0, width: sample(rule.width), stretch: 1, tint: rule.tints[Math.floor(rng() * rule.tints.length)]! }]);
    }
    if (entry.actor === 'aquatic') {
      aquatic = createWaterFloraView(level, { plan: aquaticPreviewPlan(level, entry.action, options.seed) });
      scene.add(aquatic.root); disposers.push(() => aquatic!.dispose());
    }
    if (entry.actor === 'rock') {
      const kind = entry.action;
      const parts = createRockParts(); parts.forEach(geometry);
      const batch = createDecorBatch(ROCK_KINDS, parts, material(createRockMaterial()), 'resource-rock', (k) => ROCK_NATIVE[k].width, () => 1, 1);
      disposers.push(() => batch.dispose()); root.add(batch.mesh);
      batch.add([{ kind, x: 24, y: groundY, z: -0.3, yaw, tilt: 0, width: sample(kind === 'arch' ? ROCK_SIZE.arch : kind === 'hoodoo' ? ROCK_SIZE.hoodoo : kind === 'cliff' ? ROCK_SIZE.cliff : kind === 'outcrop' || kind === 'sandOutcrop' ? ROCK_SIZE.outcrop : BIG_ROCKS.has(kind) ? ROCK_SIZE.boulder : SMALL_ROCKS.has(kind) ? ROCK_SIZE.pebbles : ROCK_SIZE.mid), stretch: 1, tint: 0xffffff, moss: 1 }]);
    }
    if (entry.actor === 'cave' && !options.assembly) {
      const parts = createCaveDecorParts(); parts.forEach(geometry);
      const batch = createPartBatch(CAVE_DECOR_KINDS, parts, material(createCaveDecorMaterial(time)), 'resource-cave', 1);
      disposers.push(() => batch.dispose()); root.add(batch.mesh);
      const item: CaveDecorItem = { kind: entry.action, x: 24, y: groundY + (ceiling ? 3 : 0), z: -0.45, sx: size * 1.3, sy: size * 1.3, yaw };
      batch.add([item], (_, matrix) => caveDecorMatrix(item, matrix));
    }
    if (hut && !options.context) {
      // 纯资源视图保留建筑自己的瓦片，去掉周围地形。
      const map = createTileMap(level.map.width, level.map.height, DEFAULT_TILES);
      for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
        const id = level.map.get(x, y);
        if ([TILE_TIMBER, TILE_PLATFORM, TILE_ROOF].includes(id)) { map.set(x, y, id); map.setShape(x, y, level.map.shapeAt(x, y)); }
      }
      hutTiles = createTileView(map); root.add(hutTiles.root); disposers.push(() => hutTiles!.dispose());
      hutTiles.update();
    }
    const bounds = new THREE.Box3().setFromObject(root);
    if (options.reference && !bounds.isEmpty()) {
      bounds.expandByPoint(new THREE.Vector3(20.5, groundY - 0.3, 0));
      bounds.expandByPoint(new THREE.Vector3(23, groundY + 3.5, 0));
    }
    const center = bounds.getCenter(new THREE.Vector3());
    const extent = bounds.getSize(new THREE.Vector3());
    const groundResource = (entry.actor === 'terrain' && !['branch', 'roof'].includes(entry.action)) || (entry.actor === 'grass' && entry.action === 'natural');
    const framing = entry.actor === 'aquatic' && options.reference ? { x: 21.5, y: groundY - 0.75, width: 14, height: 11 } : entry.actor === 'aquatic' ? { x: 24, y: groundY + ((BED_KINDS as readonly string[]).includes(entry.action) ? -4.6 : (FLOAT_KINDS as readonly string[]).includes(entry.action) ? -0.2 : -2), width: 6, height: 3 } : !options.assembly && !groundResource && ['shrub', 'grass', 'cover', 'rock', 'desert', 'cave'].includes(entry.actor)
      ? { x: center.x, y: center.y, width: Math.max(3, extent.x * 1.4), height: Math.max(2, extent.y * 1.5) } : null;
    const inspection = createResourceInspection(level, groundY, options, frame, groundResource,
      entry.actor === 'tree' || (entry.actor === 'terrain' && entry.action === 'branch'));
    root.add(inspection.root); disposers.push(() => inspection.dispose());
    world.tiles.setVegetation(groundResource || options.assembly ? options.vegetation : 'ground');
    world.tiles.root.visible = options.context || groundResource;
    world.caveWall.root.visible = options.context;
    world.decor.root.visible = options.assembly && (!options.composition || options.vegetation === 'all');
    world.caveDecor.root.visible = options.assembly && (!options.composition || options.vegetation === 'all');
    world.water.root.visible = options.composition !== null || entry.actor === 'water' || options.habitat === 'shore' || (entry.actor === 'aquatic' && options.context) || (hut && options.context);
    world.weeds.root.visible = options.context && (entry.actor === 'water' || options.habitat === 'shore' || options.assembly);
    world.waterFlora.root.visible = options.context && (entry.actor === 'water' || options.habitat === 'shore' || options.assembly);
    if (options.composition) {
      world.trees.root.visible = options.vegetation === 'all';
      world.weeds.root.visible = options.vegetation === 'flora' || options.vegetation === 'all';
      world.waterFlora.root.visible = world.weeds.root.visible;
    }
    return {
      framing,
      update(t: number) {
        time.value = t; hutTiles?.setTime(t);
        aquatic?.update({ x: 16, y: groundY - 6, w: 18, h: 10 }, t, t - lastTime, { fluid: level.fluid, windAt: (x) => world.weather.wind.sway(x), pelican: null });
        lastTime = t;
      },
      dispose() { for (const dispose of disposers.reverse()) dispose(); },
    };
  } catch (error) {
    for (const dispose of disposers.reverse()) dispose();
    throw error;
  }
}
