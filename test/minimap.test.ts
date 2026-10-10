// 任务 016 小地图：颜色映射、栅格增量重绘、视窗/缩放/大地图计算、fail-fast、DOM 创建/切换/dispose、分层。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FakeElement } from './helpers/fake-dom.ts';
import {
  BIG_MAP_MAX_SCALE,
  CANOPY_COLORS,
  HUT_WALL_COLOR,
  MINIMAP_ZOOM_MAX,
  MINIMAP_ZOOM_MIN,
  TILE_COLORS,
  TRUNK_COLOR,
  bigMapFit,
  bigMapFitScale,
  bigMapRect,
  caveColor,
  clampBigMap,
  clampZoom,
  createMinimapRaster,
  followView,
  packRgba,
  panBigMap,
  rasterBlit,
  skyColor,
  stepZoom,
  tileColor,
  unpackRgba,
  viewToWorld,
  waterOver,
  worldToView,
  zoomBigMapAt,
} from '../src/ui/minimap-model.ts';
import type { MinimapSource } from '../src/ui/minimap-model.ts';
import { createMinimap } from '../src/ui/minimap.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import type { TileMap } from '../src/world/tile-map.ts';
import { createFluidMap } from '../src/world/fluid-map.ts';
import type { FluidMap } from '../src/world/fluid-map.ts';
import { stepFluid } from '../src/world/fluid-sim.ts';
import {
  BUILTIN_TILES,
  DEFAULT_TILES,
  TILE_DIRT,
  TILE_GRASS,
  TILE_PLATFORM,
  TILE_ROOF,
  TILE_SAND,
  TILE_STONE,
  TILE_TIMBER,
  createTileRegistry,
} from '../src/world/tile-types.ts';
import { SHAPE_HALF, SHAPE_SLOPE_L, SHAPE_SLOPE_R } from '../src/world/tile-shapes.ts';
import type { FishingHut, TreeInstance } from '../src/world/level.ts';

type Rgb = readonly [number, number, number];
const P = 4;
const opaque = (c: Rgb): number => packRgba(c[0], c[1], c[2]);

interface World {
  tiles: TileMap;
  fluid: FluidMap;
  source: MinimapSource & { tiles: TileMap };
}

/** W×H 世界，ty < ground 的行填 dirt（ground=0 则全空）。 */
function world(W: number, H: number, ground = 0, extra: Partial<Pick<MinimapSource, 'trees' | 'structures'>> = {}): World {
  const tiles = createTileMap(W, H, DEFAULT_TILES);
  for (let ty = 0; ty < ground; ty++) for (let tx = 0; tx < W; tx++) tiles.set(tx, ty, TILE_DIRT);
  const fluid = createFluidMap(tiles);
  return { tiles, fluid, source: { tiles, fluid, trees: extra.trees ?? [], structures: extra.structures ?? [] } };
}

/** 栅格中瓦片 (tx,ty) 的子像素 (sx,sy)（sy=0 为格顶行）。 */
function px(r: { pixels: Uint32Array; width: number }, H: number, tx: number, ty: number, sx: number, sy: number): number {
  return r.pixels[((H - 1 - ty) * P + sy) * r.width + tx * P + sx] as number;
}

function tilePixels(r: { pixels: Uint32Array; width: number }, H: number, tx: number, ty: number): number[] {
  const out: number[] = [];
  for (let sy = 0; sy < P; sy++) for (let sx = 0; sx < P; sx++) out.push(px(r, H, tx, ty, sx, sy));
  return out;
}

const lum = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

describe('minimap 颜色映射', () => {
  test('packRgba/unpackRgba 往返（ImageData 小端 0xAABBGGRR），非法通道即抛', () => {
    const c = packRgba(10, 20, 30, 40);
    assert.deepEqual(unpackRgba(c), [10, 20, 30, 40]);
    assert.equal(c, 0x281e140a);
    assert.throws(() => packRgba(256, 0, 0), /channel r/);
    assert.throws(() => packRgba(0, 1.5, 0), /channel g/);
  });

  test('每种非空气内置瓦片都有颜色，且两两不同；未知 key 即抛', () => {
    const keys = BUILTIN_TILES.filter((t) => t.collision !== 'none').map((t) => t.key);
    const seen = new Set<string>();
    for (const k of keys) {
      const c = tileColor(k);
      seen.add(c.join(','));
    }
    assert.equal(seen.size, keys.length);
    assert.throws(() => tileColor('lava'), /no color registered for tile key 'lava'/);
    // 颜色语义：草偏绿、沙偏黄、石头偏冷灰（蓝 ≥ 红）。
    const [gr, gg, gb] = TILE_COLORS.grass as Rgb;
    assert.ok(gg > gr && gg > gb);
    const [sr, sg, sb] = TILE_COLORS.sand as Rgb;
    assert.ok(sr > sb && sg > sb);
    const [tr, , tb] = TILE_COLORS.stone as Rgb;
    assert.ok(tb >= tr);
  });

  test('注册表含未登记颜色的瓦片时创建栅格即抛', () => {
    const reg = createTileRegistry([...BUILTIN_TILES, { id: 20, key: 'lava', collision: 'solid' }]);
    const tiles = createTileMap(4, 4, reg);
    const fluid = createFluidMap(tiles);
    assert.throws(() => createMinimapRaster({ tiles, fluid, trees: [], structures: [] }), /'lava'/);
  });

  test('实心瓦片整格为材质色（noise=0），天空/洞穴背景', () => {
    const W = 8;
    const H = 6;
    const w = world(W, H, 2);
    const ids = [TILE_GRASS, TILE_STONE, TILE_SAND, TILE_TIMBER, TILE_ROOF];
    ids.forEach((id, i) => w.tiles.set(i, 1, id));
    w.tiles.set(6, 4, TILE_STONE); // 悬空：(6,2..3) 变成洞穴
    const r = createMinimapRaster(w.source, { noise: 0 });
    for (const [i, id] of ids.entries()) {
      const key = DEFAULT_TILES.byId(id).key;
      assert.deepEqual(new Set(tilePixels(r, H, i, 1)), new Set([opaque(tileColor(key))]), key);
    }
    assert.deepEqual(new Set(tilePixels(r, H, 7, 0)), new Set([opaque(TILE_COLORS.dirt as Rgb)]));
    // 地表以上：天空（按行渐变，同行同色）。
    assert.deepEqual(new Set(tilePixels(r, H, 0, 3)), new Set([opaque(skyColor(3, H))]));
    assert.notEqual(opaque(skyColor(5, H)), opaque(skyColor(2, H)));
    // 实心之下的空气：洞穴色（深度 = 地表 − 1 − ty）。
    assert.deepEqual(new Set(tilePixels(r, H, 6, 3)), new Set([opaque(caveColor(1))]));
    assert.deepEqual(new Set(tilePixels(r, H, 6, 2)), new Set([opaque(caveColor(2))]));
  });

  test('noise>0 时实心格亮度有扰动但接近基色', () => {
    const w = world(16, 4, 2);
    const r = createMinimapRaster(w.source);
    const base = TILE_COLORS.dirt as Rgb;
    const colors = new Set<number>();
    for (let tx = 0; tx < 16; tx++) {
      const c = unpackRgba(px(r, 4, tx, 0, 0, 0));
      colors.add(px(r, 4, tx, 0, 0, 0));
      for (let k = 0; k < 3; k++) assert.ok(Math.abs((c[k] as number) - (base[k] as number)) <= Math.ceil((base[k] as number) * 0.06) + 1);
    }
    assert.ok(colors.size > 1);
  });

  test('斜坡/半砖按形状画斜边，单向平台只画顶部薄层', () => {
    const H = 3;
    const w = world(4, H, 1);
    w.tiles.set(0, 1, TILE_STONE);
    w.tiles.setShape(0, 1, SHAPE_SLOPE_R);
    w.tiles.set(1, 1, TILE_STONE);
    w.tiles.setShape(1, 1, SHAPE_SLOPE_L);
    w.tiles.set(2, 1, TILE_STONE);
    w.tiles.setShape(2, 1, SHAPE_HALF);
    w.tiles.set(3, 1, TILE_PLATFORM);
    const r = createMinimapRaster(w.source, { noise: 0 });
    const stone = opaque(TILE_COLORS.stone as Rgb);
    const plat = opaque(TILE_COLORS.platform as Rgb);
    // 斜坡（左低右高）：左下有、左上无、右上有。
    assert.equal(px(r, H, 0, 1, 0, 3), stone);
    assert.notEqual(px(r, H, 0, 1, 0, 0), stone);
    assert.equal(px(r, H, 0, 1, 3, 0), stone);
    // 斜坡（左高右低）镜像。
    assert.equal(px(r, H, 1, 1, 0, 0), stone);
    assert.notEqual(px(r, H, 1, 1, 3, 0), stone);
    assert.equal(px(r, H, 1, 1, 3, 3), stone);
    // 半砖：下两行材质，上两行背景。
    for (let sx = 0; sx < P; sx++) {
      assert.notEqual(px(r, H, 2, 1, sx, 0), stone);
      assert.notEqual(px(r, H, 2, 1, sx, 1), stone);
      assert.equal(px(r, H, 2, 1, sx, 2), stone);
      assert.equal(px(r, H, 2, 1, sx, 3), stone);
    }
    // 平台：只有顶行。
    for (let sx = 0; sx < P; sx++) {
      assert.equal(px(r, H, 3, 1, sx, 0), plat);
      assert.notEqual(px(r, H, 3, 1, sx, 1), plat);
    }
  });

  test('水：按水量填充高度，越满越深；非法水量即抛', () => {
    const H = 4;
    const w = world(3, H, 1);
    w.fluid.set(0, 1, 255);
    w.fluid.set(1, 1, 64);
    w.fluid.set(2, 1, 3);
    const r = createMinimapRaster(w.source, { noise: 0 });
    const sky = skyColor(1, H);
    const full = opaque(waterOver(sky, 255));
    assert.deepEqual(new Set(tilePixels(r, H, 0, 1)), new Set([full]));
    // 64/255 ≈ .25：只有底行是水。
    assert.equal(px(r, H, 1, 1, 0, 3), opaque(waterOver(sky, 64)));
    assert.equal(px(r, H, 1, 1, 0, 2), opaque(sky));
    // 极少量的水也至少一行可见。
    assert.equal(px(r, H, 2, 1, 1, 3), opaque(waterOver(sky, 3)));
    assert.ok(lum(waterOver(sky, 255)) < lum(waterOver(sky, 32)), 'fuller water is darker');
    assert.ok(waterOver(sky, 255)[2] > waterOver(sky, 255)[0], 'water is blue');
    assert.throws(() => waterOver(sky, 0), /water amount/);
    assert.throws(() => waterOver(sky, 256), /water amount/);
  });

  test('树：树干与树冠颜色（冠按树种，dead 无冠），渔屋后墙', () => {
    const tree = (kind: TreeInstance['kind'], x: number): TreeInstance => ({
      id: x, kind, x, baseY: 1, trunkHeight: 4, trunkRadius: 0.35, canopyHalfWidth: 2, canopyHeight: 4, visualSeed: 1, crownDx: 0, platforms: [],
    });
    const hut: FishingHut = {
      id: 0, x0: 20, x1: 23, floorY: 1, doorRows: 2, roofY: 5, roofRows: 1, roofX0: 19, roofX1: 24, loftX0: 21, loftX1: 22, loftY: 3,
      lakeSide: 1, pierX0: 24, pierX1: 26, lake: 0,
    };
    const H = 12;
    const w = world(30, H, 1, { trees: [tree('oak', 3), tree('dead', 10), tree('sakura', 15)], structures: [hut] });
    const r = createMinimapRaster(w.source, { noise: 0 });
    // 树干中心列 x+.5：格 3 的中间两像素。
    assert.equal(px(r, H, 3, 2, 1, 2), opaque(TRUNK_COLOR));
    assert.equal(px(r, H, 3, 7, 1, 2), opaque(CANOPY_COLORS.oak as Rgb));
    assert.equal(px(r, H, 15, 7, 1, 2), opaque(CANOPY_COLORS.sakura as Rgb));
    assert.equal(px(r, H, 10, 2, 1, 2), opaque(TRUNK_COLOR));
    assert.equal(px(r, H, 10, 7, 1, 2), opaque(skyColor(7, H)), 'dead tree has no canopy');
    // 树之外是天空。
    assert.equal(px(r, H, 7, 2, 1, 2), opaque(skyColor(2, H)));
    // 渔屋内部（地板与屋顶之间）为后墙色。
    assert.equal(px(r, H, 21, 2, 1, 1), opaque(HUT_WALL_COLOR));
    assert.equal(px(r, H, 21, 6, 1, 1), opaque(skyColor(6, H)));
  });
});

describe('minimap 增量重绘', () => {
  test('chunkRect 贴边裁剪；行 0 为世界顶部', () => {
    const w = world(40, 20, 0);
    const r = createMinimapRaster(w.source, { chunkTiles: 16 });
    assert.equal(r.chunksX, 3);
    assert.equal(r.chunksY, 2);
    assert.deepEqual(r.chunkRect(0, 0), { x: 0, y: 4 * P, w: 16 * P, h: 16 * P });
    assert.deepEqual(r.chunkRect(2, 1), { x: 32 * P, y: 0, w: 8 * P, h: 4 * P });
    assert.throws(() => r.chunkRect(3, 0), /chunk cx/);
  });

  test('markTile 只标脏该区块（地表不变时），flush 重绘并清空', () => {
    const H = 32;
    const w = world(64, H, 4);
    const r = createMinimapRaster(w.source, { chunkTiles: 16, noise: 0 });
    assert.equal(r.dirtyCount, 0);
    w.tiles.set(20, 2, TILE_STONE); // 地表下的 dirt → stone：地表不变
    r.markTile(20, 2);
    assert.equal(r.dirtyCount, 1);
    const rects = r.flush();
    assert.deepEqual(rects, [r.chunkRect(1, 0)]);
    assert.equal(r.dirtyCount, 0);
    assert.equal(px(r, H, 20, 2, 0, 0), opaque(TILE_COLORS.stone as Rgb));
    assert.deepEqual(r.flush(), []);
    assert.throws(() => r.markTile(64, 0), /out of bounds/);
  });

  test('砍掉一棵树后 flush，像素与从未有过这棵树时一致', () => {
    const tree = (id: number, x: number): TreeInstance => ({
      id, kind: 'oak', x, baseY: 1, trunkHeight: 4, trunkRadius: 0.35, canopyHalfWidth: 2, canopyHeight: 4, visualSeed: 1, crownDx: 0, platforms: [],
    });
    // 被砍的树横跨两个区块，留下的树与它同在区块 0。
    const w = world(40, 12, 1, { trees: [tree(1, 15), tree(2, 4)] });
    const r = createMinimapRaster(w.source, { chunkTiles: 16, noise: 0 });
    r.removeTree(1);
    r.flush();
    const expected = createMinimapRaster({ ...w.source, trees: [tree(2, 4)] }, { chunkTiles: 16, noise: 0 });
    assert.deepEqual(r.pixels, expected.pixels);
  });

  test('地表高度变化时标脏该列从底到旧/新地表的全部区块（洞穴色随深度变化）', () => {
    const H = 48;
    const w = world(32, H, 4);
    const r = createMinimapRaster(w.source, { chunkTiles: 16, noise: 0 });
    w.tiles.set(5, 40, TILE_STONE);
    r.markTile(5, 40);
    const rects = r.flush();
    assert.deepEqual(rects, [r.chunkRect(0, 0), r.chunkRect(0, 1), r.chunkRect(0, 2)]);
    assert.equal(px(r, H, 5, 39, 0, 0), opaque(caveColor(1)));
    assert.equal(px(r, H, 6, 39, 0, 0), opaque(skyColor(39, H)));
  });

  test('scanFluid 比较区块水量哈希：无变化 0，变化的区块标脏一次', () => {
    const H = 32;
    const w = world(64, H, 2);
    const r = createMinimapRaster(w.source, { chunkTiles: 16, noise: 0 });
    assert.equal(r.scanFluid(), 0);
    w.fluid.set(40, 2, 255);
    w.fluid.set(41, 2, 128);
    assert.equal(r.scanFluid(), 1);
    assert.equal(r.scanFluid(), 0, 'hash updated');
    assert.deepEqual(r.flush(), [r.chunkRect(2, 0)]);
    assert.equal(px(r, H, 40, 2, 0, 0), opaque(waterOver(skyColor(2, H), 255)));
  });

  test('液体模拟流动后，小地图清除旧水格并显示新水格', () => {
    const H = 4;
    const w = world(4, H, 1);
    w.fluid.set(2, 3, 255);
    const r = createMinimapRaster(w.source, { noise: 0 });
    assert.equal(r.scanFluid(), 0);
    stepFluid(w.fluid, { maxCellsPerStep: 100, minSpread: 2 }, 0);
    assert.equal(r.scanFluid(), 1);
    r.flush();
    assert.equal(px(r, H, 2, 3, 0, 0), opaque(skyColor(3, H)));
    assert.equal(px(r, H, 2, 2, 0, 0), opaque(waterOver(skyColor(2, H), 255)));
  });

  test('栅格不消费 TileMap/FluidMap 的破坏性脏区块（tile-view/water-view 不受影响）', () => {
    const w = world(64, 64, 2);
    w.tiles.takeDirtyChunks();
    w.fluid.takeDirtyChunks();
    w.tiles.set(3, 5, TILE_STONE);
    w.fluid.set(10, 10, 200);
    const fake = createFakeDom();
    const mm = withDoc(fake, () => createMinimap(miniOptions(fake, w)));
    mm.update(frameAt(10, 10, 1));
    assert.equal(w.tiles.takeDirtyChunks().length, 1);
    assert.equal(w.fluid.takeDirtyChunks().length, 1);
    mm.dispose();
  });

  test('fail-fast：非法 tilePx/chunkTiles/noise/pixels 长度、水图尺寸不符', () => {
    const w = world(8, 8, 1);
    assert.throws(() => createMinimapRaster(w.source, { tilePx: 0 }), /tilePx/);
    assert.throws(() => createMinimapRaster(w.source, { tilePx: 2.5 }), /tilePx/);
    assert.throws(() => createMinimapRaster(w.source, { chunkTiles: 0 }), /chunkTiles/);
    assert.throws(() => createMinimapRaster(w.source, { noise: Number.NaN }), /noise/);
    assert.throws(() => createMinimapRaster(w.source, { pixels: new Uint32Array(3) }), /pixels length/);
    const other = world(9, 8, 1);
    assert.throws(() => createMinimapRaster({ ...w.source, fluid: other.fluid }), /must match/);
  });
});

describe('minimap 视窗与缩放', () => {
  const base = { viewW: 220, viewH: 140, scale: 2, worldW: 1200, worldH: 160 };

  test('跟随：中心在世界中部时以玩家为中心', () => {
    const r = followView({ ...base, centerX: 600, centerY: 80 });
    assert.deepEqual(r, { left: 545, top: 115, width: 110, height: 70 });
    const p = worldToView(r, 2, 600, 80);
    assert.deepEqual(p, { x: 110, y: 70 });
    assert.deepEqual(viewToWorld(r, 2, p.x, p.y), { x: 600, y: 80 });
  });

  test('地图边缘夹紧（左/右/下/上），世界比视窗小时居中', () => {
    assert.equal(followView({ ...base, centerX: 3, centerY: 80 }).left, 0);
    assert.equal(followView({ ...base, centerX: 1199, centerY: 80 }).left, 1200 - 110);
    const low = followView({ ...base, centerX: 600, centerY: 1 });
    assert.equal(low.top - low.height, 0);
    assert.equal(followView({ ...base, centerX: 600, centerY: 160 }).top, 160);
    const tiny = followView({ ...base, worldW: 50, worldH: 30, centerX: 10, centerY: 10 });
    assert.equal(tiny.left, (50 - 110) / 2);
    assert.equal(tiny.top, 30 + (70 - 30) / 2);
  });

  test('rasterBlit 裁剪到地图：完全在内、部分越界、无交集', () => {
    const inside = rasterBlit({ left: 10, top: 50, width: 20, height: 10 }, 2, 100, 60, 4);
    assert.deepEqual(inside, { sx: 40, sy: 40, sw: 80, sh: 40, dx: 0, dy: 0, dw: 40, dh: 20 });
    const clipped = rasterBlit({ left: -5, top: 70, width: 20, height: 20 }, 2, 100, 60, 4);
    assert.deepEqual(clipped, { sx: 0, sy: 0, sw: 60, sh: 40, dx: 10, dy: 20, dw: 30, dh: 20 });
    assert.equal(rasterBlit({ left: 200, top: 50, width: 20, height: 10 }, 2, 100, 60, 4), null);
  });

  test('缩放边界 [1,4]：stepZoom 逐档到顶/到底，clampZoom 夹紧，非法值即抛', () => {
    let z = 2;
    for (let i = 0; i < 20; i++) z = stepZoom(z, 1);
    assert.equal(z, MINIMAP_ZOOM_MAX);
    for (let i = 0; i < 20; i++) z = stepZoom(z, -1);
    assert.equal(z, MINIMAP_ZOOM_MIN);
    assert.equal(stepZoom(2, 0), 2);
    assert.equal(clampZoom(0.2), MINIMAP_ZOOM_MIN);
    assert.equal(clampZoom(9), MINIMAP_ZOOM_MAX);
    assert.throws(() => clampZoom(Number.NaN), /zoom/);
    assert.throws(() => clampZoom(0), /zoom/);
    assert.throws(() => clampZoom(2, 3, 1), /min 3 > max 1/);
    assert.throws(() => stepZoom(2, Number.POSITIVE_INFINITY), /dir/);
  });

  test('fail-fast：followView 非法尺寸/缩放/坐标', () => {
    assert.throws(() => followView({ ...base, centerX: 0, centerY: 0, viewW: 0 }), /viewW/);
    assert.throws(() => followView({ ...base, centerX: 0, centerY: 0, scale: -1 }), /scale/);
    assert.throws(() => followView({ ...base, centerX: Number.NaN, centerY: 0 }), /centerX/);
    assert.throws(() => followView({ ...base, centerX: 0, centerY: 0, worldH: 0 }), /worldH/);
  });
});

describe('minimap 大地图', () => {
  const L = { worldW: 1200, worldH: 160, screenW: 1600, screenH: 900 };

  test('适配：整个世界放进屏幕并居中', () => {
    const fit = bigMapFitScale(L);
    assert.ok(Math.abs(fit - (1600 * 0.9) / 1200) < 1e-9);
    const v = bigMapFit(L);
    assert.deepEqual(v, { centerX: 600, centerY: 80, scale: fit });
    const rect = bigMapRect(v, L);
    assert.ok(rect.left <= 0 && rect.left + rect.width >= 1200);
    assert.ok(rect.top >= 160 && rect.top - rect.height <= 0);
    assert.throws(() => bigMapFitScale({ ...L, screenW: 0 }), /screenW/);
  });

  test('缩放夹在 [fit, 16]；适配时平移无效；放大后平移夹在地图内', () => {
    const fit = bigMapFitScale(L);
    assert.equal(clampBigMap({ centerX: 600, centerY: 80, scale: 0.1 }, L).scale, fit);
    assert.equal(clampBigMap({ centerX: 600, centerY: 80, scale: 99 }, L).scale, BIG_MAP_MAX_SCALE);
    const v = bigMapFit(L);
    assert.deepEqual(panBigMap(v, 300, 0, L), v);
    const zoomed = { centerX: 600, centerY: 80, scale: 8 };
    const moved = panBigMap(zoomed, 160, 0, L);
    assert.equal(moved.centerX, 580);
    const far = panBigMap(zoomed, 1e6, -1e6, L);
    assert.equal(far.centerX, 1600 / 8 / 2);
    assert.equal(far.centerY, 900 / 8 / 2, 'dragging up moves the view down, clamped at the world bottom');
  });

  test('以光标为锚缩放：锚点下的世界点不动', () => {
    const v = { centerX: 600, centerY: 80, scale: 8 };
    const before = viewToWorld(bigMapRect(v, L), v.scale, 900, 400);
    const z = zoomBigMapAt(v, 1.25, 900, 400, L);
    assert.equal(z.scale, 10);
    const after = viewToWorld(bigMapRect(z, L), z.scale, 900, 400);
    assert.ok(Math.abs(after.x - before.x) < 1e-9 && Math.abs(after.y - before.y) < 1e-9);
    assert.throws(() => zoomBigMapAt(v, 0, 0, 0, L), /factor/);
  });
});

// ---------------------------------------------------------------- DOM（伪造）

interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
}

class FakeTarget {
  private readonly map = new Map<string, Set<(e: unknown) => void>>();
  addEventListener(type: string, fn: (e: unknown) => void): void {
    let s = this.map.get(type);
    if (!s) this.map.set(type, (s = new Set()));
    s.add(fn);
  }
  removeEventListener(type: string, fn: (e: unknown) => void): void {
    this.map.get(type)?.delete(fn);
  }
  dispatch(type: string, e: Record<string, unknown> = {}): { prevented: boolean } {
    const ev = { prevented: false, target: null, preventDefault() { this.prevented = true; }, ...e };
    for (const fn of [...(this.map.get(type) ?? [])]) fn(ev);
    return ev;
  }
  count(): number {
    let n = 0;
    for (const s of this.map.values()) n += s.size;
    return n;
  }
}

class FakeNode extends FakeElement {
  readonly events = new FakeTarget();
  width = 0;
  height = 0;
  readonly calls: Call[] = [];
  override addEventListener(type: string, fn: (e: unknown) => void): void {
    this.events.addEventListener(type, fn);
  }
  override removeEventListener(type: string, fn: (e: unknown) => void): void {
    this.events.removeEventListener(type, fn);
  }
  getContext(kind: string): unknown {
    assert.equal(kind, '2d');
    const calls = this.calls;
    const props: Record<string, unknown> = {};
    return new Proxy(props, {
      get(_t, name: string) {
        if (name === 'createImageData') {
          return (w: number, h: number) => {
            calls.push({ name, args: [w, h] });
            return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
          };
        }
        if (name in props) return props[name];
        return (...args: unknown[]) => calls.push({ name, args });
      },
      set(_t, name: string, value) {
        props[name] = value;
        return true;
      },
    });
  }
}

interface FakeDom {
  readonly body: FakeNode;
  readonly win: FakeTarget;
  readonly created: FakeNode[];
}

function createFakeDom(): FakeDom {
  return { body: new FakeNode('body'), win: new FakeTarget(), created: [] };
}

function withDoc<T>(fake: FakeDom, fn: () => T): T {
  const g = globalThis as { document?: unknown };
  const prev = g.document;
  g.document = {
    createElement: (tag: string) => {
      const n = new FakeNode(tag);
      fake.created.push(n);
      return n;
    },
  };
  try {
    return fn();
  } finally {
    g.document = prev;
  }
}

function miniOptions(fake: FakeDom, w: World, extra: Record<string, unknown> = {}) {
  return {
    parent: fake.body as unknown as HTMLElement,
    source: w.source,
    viewport: () => ({ width: 1600, height: 900 }),
    keyTarget: fake.win as unknown as EventTarget,
    tilePx: P,
    ...extra,
  };
}

const frameAt = (x: number, y: number, dt = 1 / 60) => ({ player: { x, y, facing: 1 as const }, dummies: [{ x: x + 3, y }], dt });

describe('minimap DOM', () => {
  test('隐藏小地图后仍可打开大地图，关闭大地图不改变隐藏偏好', () => {
    const fake = createFakeDom();
    const w = world(64, 32, 4);
    const mm = withDoc(fake, () => createMinimap(miniOptions(fake, w)));
    const mini = fake.body.find('minimap') as FakeNode;
    const canvas = fake.body.find('minimap-canvas') as FakeNode;
    mm.setVisible(false);
    mm.update(frameAt(30, 6));
    assert.equal(canvas.calls.filter(c => c.name === 'drawImage').length, 0);
    mm.toggleBigMap(true);
    mm.update(frameAt(30, 6));
    assert.equal((fake.body.find('minimap-big-canvas') as FakeNode).calls.filter(c => c.name === 'drawImage').length, 1);
    mm.toggleBigMap(false);
    assert.equal(mm.visible, false);
    assert.equal(mini.hidden, true);
    mm.setVisible(true);
    mm.update(frameAt(30, 6));
    assert.equal(canvas.calls.filter(c => c.name === 'drawImage').length, 1);
    mm.dispose();
  });

  test('创建：右上角小窗 + 隐藏的大地图，离屏底图一次生成', () => {
    const fake = createFakeDom();
    const w = world(64, 32, 4);
    const mm = withDoc(fake, () => createMinimap(miniOptions(fake, w)));
    assert.equal(fake.body.children.length, 2);
    const mini = fake.body.find('minimap') as FakeNode;
    assert.equal(mini.style.top, '12px');
    assert.equal(mini.style.right, '12px');
    assert.equal(mini.style.width, '288px');
    assert.equal((fake.body.find('minimap-big') as FakeNode).hidden, true);
    const base = fake.created[0] as FakeNode;
    assert.equal(base.width, 64 * P);
    assert.equal(base.height, 32 * P);
    assert.deepEqual(base.calls.filter((c) => c.name === 'putImageData').map((c) => c.args.length), [3]);
    assert.equal(mm.bigMapOpen, false);
    assert.ok(Math.abs(mm.zoom - 288 / 120) < 1e-9);
    mm.dispose();
  });

  test('update：小窗只 drawImage + 标记；瓦片变化后只回写脏区块', () => {
    const fake = createFakeDom();
    const w = world(64, 32, 4);
    const mm = withDoc(fake, () => createMinimap(miniOptions(fake, w)));
    const base = fake.created[0] as FakeNode;
    const miniCanvas = (fake.body.find('minimap-canvas') as FakeNode);
    mm.update(frameAt(30, 6));
    assert.equal(miniCanvas.calls.filter((c) => c.name === 'drawImage').length, 1);
    assert.equal(base.calls.filter((c) => c.name === 'putImageData').length, 1);
    w.tiles.set(40, 10, TILE_STONE);
    mm.update(frameAt(30, 6));
    const puts = base.calls.filter((c) => c.name === 'putImageData');
    assert.equal(puts.length, 2);
    assert.equal((puts[1] as Call).args.length, 7, 'dirty-rect putImageData');
    assert.throws(() => mm.update({ ...frameAt(0, 0), dt: -1 }), /dt/);
    mm.dispose();
  });

  test('水量按间隔扫描：未到间隔不重绘，到间隔后重绘变化区块', () => {
    const fake = createFakeDom();
    const w = world(64, 32, 4);
    const mm = withDoc(fake, () => createMinimap(miniOptions(fake, w, { fluidScanInterval: 0.5 })));
    const base = fake.created[0] as FakeNode;
    w.fluid.set(10, 5, 255);
    mm.update(frameAt(30, 6, 0.2));
    assert.equal(base.calls.filter((c) => c.name === 'putImageData').length, 1);
    mm.update(frameAt(30, 6, 0.4));
    assert.equal(base.calls.filter((c) => c.name === 'putImageData').length, 2);
    mm.dispose();
  });

  test('切换大地图：toggleKey、Esc 关闭；重复键/输入框/修饰键忽略；滚轮与 +/- 缩放', () => {
    const fake = createFakeDom();
    const w = world(64, 32, 4);
    const mm = withDoc(fake, () => createMinimap(miniOptions(fake, w, { toggleKey: 'KeyM' })));
    const big = fake.body.find('minimap-big') as FakeNode;
    fake.win.dispatch('keydown', { code: 'KeyM', repeat: true });
    assert.equal(mm.bigMapOpen, false);
    fake.win.dispatch('keydown', { code: 'KeyM', target: { tagName: 'input' } });
    assert.equal(mm.bigMapOpen, false);
    fake.win.dispatch('keydown', { code: 'KeyM', ctrlKey: true });
    assert.equal(mm.bigMapOpen, false);
    fake.win.dispatch('keydown', { code: 'KeyM' });
    assert.equal(mm.bigMapOpen, true);
    assert.equal(big.hidden, false);
    assert.deepEqual(mm.bigMapView, bigMapFit({ worldW: 64, worldH: 32, screenW: 1600, screenH: 900 }));
    mm.update(frameAt(30, 6));
    assert.equal((fake.body.find('minimap-big-canvas') as FakeNode).calls.filter((c) => c.name === 'drawImage').length, 1);
    fake.win.dispatch('keydown', { code: 'Escape' });
    assert.equal(mm.bigMapOpen, false);
    assert.equal(big.hidden, true);
    mm.toggleBigMap();
    assert.equal(mm.bigMapOpen, true);
    fake.win.dispatch('keydown', { code: 'KeyM' });
    assert.equal(mm.bigMapOpen, false);

    const mini = fake.body.find('minimap') as FakeNode;
    const z0 = mm.zoom;
    const ev = mini.events.dispatch('wheel', { deltaY: -100, clientX: 0, clientY: 0, button: 0 });
    assert.equal(ev.prevented, true);
    assert.ok(mm.zoom > z0);
    fake.win.dispatch('keydown', { code: 'Minus' });
    fake.win.dispatch('keydown', { code: 'Minus' });
    assert.ok(mm.zoom < z0);
    assert.throws(() => mm.setZoom(5), /zoom/);
    mm.setZoom(3);
    assert.equal(mm.zoom, 3);
    mm.dispose();
  });

  test('大地图拖动平移与滚轮缩放', () => {
    const fake = createFakeDom();
    const w = world(400, 100, 4);
    const mm = withDoc(fake, () => createMinimap(miniOptions(fake, w)));
    mm.toggleBigMap(true);
    const big = fake.body.find('minimap-big') as FakeNode;
    big.events.dispatch('wheel', { deltaY: -1, clientX: 800, clientY: 450, button: 0 });
    big.events.dispatch('wheel', { deltaY: -1, clientX: 800, clientY: 450, button: 0 });
    const zoomed = mm.bigMapView;
    assert.ok(zoomed && zoomed.scale > bigMapFitScale({ worldW: 400, worldH: 100, screenW: 1600, screenH: 900 }));
    big.events.dispatch('mousedown', { button: 0, clientX: 800, clientY: 450 });
    fake.win.dispatch('mousemove', { button: 0, clientX: 700, clientY: 450 });
    fake.win.dispatch('mouseup', { button: 0, clientX: 700, clientY: 450 });
    const panned = mm.bigMapView;
    assert.ok(panned && zoomed && panned.centerX > zoomed.centerX);
    fake.win.dispatch('mousemove', { button: 0, clientX: 0, clientY: 450 });
    assert.deepEqual(mm.bigMapView, panned, 'no pan after mouseup');
    mm.dispose();
  });

  test('dispose：移除元素与全部监听、退订 onChange；可重复调用；dispose 后 update 抛', () => {
    const fake = createFakeDom();
    const w = world(64, 32, 4);
    const mm = withDoc(fake, () => createMinimap(miniOptions(fake, w, { toggleKey: 'KeyM' })));
    assert.ok(fake.win.count() > 0);
    mm.dispose();
    mm.dispose();
    assert.equal(fake.body.children.length, 0);
    assert.equal(fake.win.count(), 0);
    w.tiles.set(5, 20, TILE_STONE);
    assert.equal(mm.raster.dirtyCount, 0, 'unsubscribed from TileMap.onChange');
    assert.throws(() => mm.update(frameAt(0, 0)), /after dispose/);
  });

  test('fail-fast：非法尺寸/扫描间隔/初始缩放、缺少依赖', () => {
    const fake = createFakeDom();
    const w = world(16, 16, 2);
    withDoc(fake, () => {
      assert.throws(() => createMinimap(miniOptions(fake, w, { width: 0 })), /width\/height/);
      assert.throws(() => createMinimap(miniOptions(fake, w, { height: 10.5 })), /width\/height/);
      assert.throws(() => createMinimap(miniOptions(fake, w, { fluidScanInterval: 0 })), /fluidScanInterval/);
      assert.throws(() => createMinimap(miniOptions(fake, w, { zoom: Number.NaN })), /zoom/);
      assert.throws(() => createMinimap({ ...miniOptions(fake, w), keyTarget: undefined as unknown as EventTarget }), /required/);
    });
  });
});

describe('minimap 分层', () => {
  const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/ui');
  test('minimap*.ts 不依赖 three/render/vendor/input/sim 运行时；world 运行时仅限纯常量模块', () => {
    for (const f of ['minimap.ts', 'minimap-model.ts']) {
      const code = readFileSync(path.join(SRC, f), 'utf8');
      const specs = [...code.matchAll(/^import\s+(type\s+)?[^'"]*from\s+'([^']+)'/gm)].map((m) => ({ type: Boolean(m[1]), spec: m[2] as string }));
      assert.ok(specs.length > 0);
      for (const { type, spec } of specs) {
        assert.ok(!/three|render|vendor|input|main/.test(spec), `${f} imports ${spec}`);
        if (!type && spec.startsWith('../world/')) assert.ok(['../world/tile-shapes.ts', '../world/fluid-map.ts'].includes(spec), `${f} runtime-imports ${spec}`);
        if (!type && spec.startsWith('../sim/')) assert.fail(`${f} runtime-imports ${spec}`);
      }
    }
  });
});

describe('minimap 按键：map 动作（M）', () => {
  test('默认绑定 KeyM → map，无冲突', async () => {
    const { DEFAULT_BINDINGS, GAME_ACTIONS, buildBindingLookup } = await import('../src/config/keybindings.ts');
    assert.ok(GAME_ACTIONS.includes('map'));
    assert.equal(buildBindingLookup(DEFAULT_BINDINGS).keys.get('KeyM'), 'map');
  });

  test('tracker.consumeUi：mapPressed 锁存一次，按住不重复，模拟 consume 不清除它', async () => {
    const { createActionTracker } = await import('../src/input/action-map.ts');
    const t = createActionTracker();
    assert.equal(t.consumeUi().mapPressed, false);
    t.press('map', 'keyboard', 'KeyM');
    t.consume(null);
    assert.equal(t.consumeUi().mapPressed, true, 'sim tick 不吃掉界面动作');
    assert.equal(t.consumeUi().mapPressed, false);
    t.press('map', 'keyboard', 'KeyM');
    assert.equal(t.consumeUi().mapPressed, false, '按住（自动重复）不重复锁存');
    t.release('map', 'KeyM');
    t.press('map', 'keyboard', 'KeyM');
    t.release('map', 'KeyM');
    assert.equal(t.consumeUi().mapPressed, true, '同帧按下又松开仍锁存');
  });
});
