// 013 W8：默认世界装配（render/world-views）——渔屋、鱼、水草、花草、树、花瓣都挂进场景且可见；draw call 预算；dispose 清场。
// （render-integration.test.ts 已近 800 行上限，默认世界装配用例放在此文件。）
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { TUNING } from '../src/config/tuning.ts';
import type { Rect } from '../src/core/math.ts';
import { FLORA_SPECIES, createFloraEnv } from '../src/render/flora.ts';
import { createTileView } from '../src/render/tile-view.ts';
import { createWorldViews, floraStats } from '../src/render/world-views.ts';
import type { WorldViews } from '../src/render/world-views.ts';
import { createSimWorld } from '../src/sim/sim-world.ts';
import type { SimWorld } from '../src/sim/sim-world.ts';
import { generateWorld } from '../src/world/worldgen.ts';
import type { LevelData } from '../src/world/level.ts';

/** 典型 16:9 视野（fov 30、距离 30）外扩 2 格的可视矩形，与 main 的 cameraRig.visibleRect(2) 同量级。 */
const VIEW_W = 33;
const VIEW_H = 20;
/**
 * 每帧 draw call 预算（世界视图里可见、非空的网格数，含视野外预加载区块、未计视锥剔除；阴影 pass 另计）。013 默认种子实测最坏约 119。
 * 021：浮空岛把瓦片区块多加载一行（岛顶花草按物种分网格，约 +30，均在余量区块里、渲染时多数被视锥剔除），洞穴让地下区块出现暴露面；
 * 洞穴/浮岛自身的视图（背景墙/装饰/特效/岛饰/根须/薄雾/远景）全局合批 ≤ 10（见下方单独断言）。预算 160 → 180。
 */
const DRAW_CALL_BUDGET = 180;
/** 021 洞穴/浮空岛视图每屏新增 draw call 上限。 */
const CAVE_ISLAND_BUDGET = 10;
const CAVE_ISLAND_ROOTS = ['cave-wall', 'cave-decor', 'cave-fx', 'sky-islands', 'sky-island-backdrop'];

function viewAt(cx: number, cy: number): Rect {
  return { x: cx - VIEW_W / 2, y: cy - VIEW_H / 2, w: VIEW_W, h: VIEW_H };
}

/** 场景中会产生 draw call 的对象：自身与祖先都可见、实例数 > 0 的 Mesh/InstancedMesh/Points/Line。 */
function drawCalls(root: THREE.Object3D): number {
  let n = 0;
  const visit = (o: THREE.Object3D): void => {
    if (!o.visible) return;
    const r = o as THREE.Mesh & { isInstancedMesh?: boolean; count?: number };
    if ((r.isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine) && !(r.isInstancedMesh && (r.count ?? 0) === 0)) n++;
    for (const c of o.children) visit(c);
  };
  visit(root);
  return n;
}

let shared: { level: LevelData; world: SimWorld; scene: THREE.Scene; views: WorldViews } | null = null;
function setup() {
  if (shared) return shared;
  const level = generateWorld(TUNING.worldgen.seed, TUNING.worldgen);
  const world = createSimWorld({ level, tuning: TUNING });
  const scene = new THREE.Scene();
  const views = createWorldViews({ caveBackground: new THREE.Texture(), scene, level, fish: world.fish });
  shared = { level, world, scene, views };
  return shared;
}

describe('world-views 默认世界装配', () => {
  test('渔屋视野：渔屋网格、鱼（每湖 ≥ 2）、水草、花草、树都进场景', () => {
    const { level, scene, views } = setup();
    assert.ok(level.structures.length >= 1, 'default seed has a fishing hut');
    const hut = level.structures[0]!;
    const cx = (hut.x0 + hut.pierX1) / 2;
    views.update(viewAt(cx, hut.floorY), 0.5, 1 / 60, 0);
    const hutMesh = scene.getObjectByName(`hut-${hut.id}`) as THREE.Mesh | undefined;
    assert.ok(hutMesh?.isMesh && hutMesh.visible, 'hut mesh is in the scene');
    assert.ok(hutMesh.geometry.getAttribute('position').count > 0);
    const stats = views.stats();
    assert.equal(stats.structures, level.structures.length);
    assert.ok(stats.weeds > 0, 'lakes have water weeds');
    // 每个湖 ≥ 2 条鱼（世界生成 fishPerLakeMin），开局没有鱼死亡。
    assert.equal(stats.fish.total, level.fishSpawns.length);
    for (let i = 0; i < level.lakes.length; i++) {
      if (level.lakes[i]!.perched) continue;
      const n = level.fishSpawns.filter((f) => f.lake === i).length;
      assert.ok(n === 0 || n >= 2, `lake ${i} has ${n} fish`);
    }
    assert.ok(level.lakes.some((_, i) => level.fishSpawns.filter((f) => f.lake === i).length >= 2), 'some lake holds ≥ 2 fish');
    const fishMeshes: THREE.InstancedMesh[] = [];
    views.fish.root.traverse((o) => (o as THREE.InstancedMesh).isInstancedMesh && fishMeshes.push(o as THREE.InstancedMesh));
    assert.equal(fishMeshes.reduce((s, m) => s + m.count, 0), stats.fish.total, 'every live fish is drawn');
    const weedMeshes = views.weeds.root.children.filter((o) => (o as THREE.InstancedMesh).isInstancedMesh);
    assert.ok(weedMeshes.length >= 1);
    assert.ok(stats.flora.instances > 100, `flora instances ${stats.flora.instances}`);
    assert.ok(views.trees.root.children.length > 0 || level.trees.every((t) => Math.abs(t.x - cx) > VIEW_W), 'trees streamed in');
  });

  test('全图逐屏扫过：花草出现 ≥ 12 种，樱花有花瓣落下', () => {
    const { level, views } = setup();
    const seen = new Set<string>();
    let maxPetals = 0;
    let time = 1;
    const sakura = level.trees.filter((t) => t.kind === 'sakura');
    assert.ok(sakura.length > 0, 'default seed has sakura');
    for (let x = VIEW_W / 2; x < level.map.width; x += VIEW_W) {
      const y = views.ground(x);
      views.update(viewAt(x, y), time, 0, 0);
      for (const s of Object.keys(floraStats(views.tiles.root).species)) seen.add(s);
      time += 0.5;
    }
    const t = sakura[0]!;
    for (let i = 0; i < 120; i++) {
      views.update(viewAt(t.x, t.baseY + 4), time + i / 30, 1 / 30, 0);
      maxPetals = Math.max(maxPetals, views.petals.active);
    }
    assert.ok(seen.size >= 12, `flora species seen: ${[...seen].join(',')}`);
    for (const s of seen) assert.ok((FLORA_SPECIES as readonly string[]).includes(s), `unknown flora mesh species ${s}`);
    assert.ok(maxPetals > 0, 'sakura sheds petals');
  });

  test(`draw call 预算：任意屏幕 ≤ ${DRAW_CALL_BUDGET}`, () => {
    const { level, scene, views } = setup();
    let worst = 0;
    let at = 0;
    for (let x = VIEW_W / 2; x < level.map.width; x += VIEW_W / 2) {
      views.update(viewAt(x, views.ground(x)), 2, 0, 0);
      const n = drawCalls(scene);
      if (n > worst) {
        worst = n;
        at = x;
      }
    }
    assert.ok(worst <= DRAW_CALL_BUDGET, `worst screen at x=${at} has ${worst} draw calls`);
  });

  test(`021 洞穴/浮空岛视图：任意屏幕（含洞内）新增 draw call ≤ ${CAVE_ISLAND_BUDGET}`, () => {
    const { level, scene, views } = setup();
    let worst = 0;
    let at = '';
    const probe = (x: number, y: number, tag: string): void => {
      views.update(viewAt(x, y), 3, 1 / 60, 0);
      const n = CAVE_ISLAND_ROOTS.reduce((a, name) => a + drawCalls(scene.getObjectByName(name) ?? new THREE.Group()), 0);
      if (n > worst) {
        worst = n;
        at = tag;
      }
    };
    for (let x = VIEW_W / 2; x < level.map.width; x += VIEW_W / 2) probe(x, views.ground(x), `surface x=${x}`);
    for (const r of level.caves.rooms) probe(r.cx, r.cy, `cave room ${r.cx},${r.cy}`);
    for (const s of level.islands) probe((s.x0 + s.x1 + 1) / 2, s.top, `island ${s.id}`);
    assert.ok(worst > 0, 'cave/island views draw something');
    assert.ok(worst <= CAVE_ISLAND_BUDGET, `worst ${worst} at ${at}`);
  });

  test('tile-view 用 floraEnv 规划花草：湖岸芦苇明显多于无环境时', () => {
    const level = generateWorld(TUNING.worldgen.seed, TUNING.worldgen);
    // 取前 3 个湖（任一湖岸可能被渔屋/出生区占用，按合计判定）。
    const lakes = level.lakes.filter((l) => !l.perched && l.x1 - l.x0 >= 4).slice(0, 3);
    const reeds = (env: boolean): number => {
      let n = 0;
      for (const lake of lakes) {
        const tiles = createTileView(level.map, env ? { floraEnv: createFloraEnv({ lakes: level.lakes, trees: level.trees }) } : {});
        tiles.update(viewAt((lake.x0 + lake.x1) / 2, lake.level));
        n += floraStats(tiles.root).species.reed ?? 0;
        tiles.dispose();
      }
      return n;
    };
    const withEnv = reeds(true);
    assert.ok(withEnv > reeds(false) + 5, `reeds with env ${withEnv}`);
  });

  test('小型植物：地被与水生小植物进场景、被云影挂接、统计可读；新增可见 draw call ≤ 8；灌木层每屏 ≤ 4', () => {
    const { level, scene, views } = setup();
    const lake = level.lakes.find((l) => !l.perched && l.x1 - l.x0 >= 10)!;
    const screens = [viewAt((lake.x0 + lake.x1) / 2, lake.level), viewAt(level.spawn.x, views.ground(level.spawn.x))];
    for (const [k, r] of screens.entries()) {
      for (let i = 0; i <= 31; i++) views.update(r, 3 + k + i / 60, 1 / 60, 0);
      // 视锥剔除的近似：区块地被网格按包围球与可视矩形相交计数；水生网格按 visible。
      let added = 0;
      let shrubs = 0;
      const inView = (m: THREE.InstancedMesh): boolean => {
        const bs = m.boundingSphere!;
        return bs.center.x + bs.radius >= r.x && bs.center.x - bs.radius <= r.x + r.w && bs.center.y + bs.radius >= r.y && bs.center.y - bs.radius <= r.y + r.h;
      };
      scene.traverse((o) => {
        const m = o as THREE.InstancedMesh;
        if (!m.isInstancedMesh || !m.visible || m.count === 0) return;
        if (m.name.startsWith('water-flora-')) added++;
        if (m.name.startsWith('tiles-cover-') && inView(m)) added++;
        if (m.name.startsWith('tiles-shrub-') && inView(m)) shrubs++;
      });
      assert.ok(added > 0 && added <= 8, `screen ${k}: ${added} new draw calls`);
      assert.ok(shrubs <= 4, `screen ${k}: ${shrubs} shrub draw calls`);
    }
    const keys: string[] = [];
    scene.traverse((o) => {
      if (!(o.name.startsWith('tiles-cover-') || o.name.startsWith('tiles-shrub-') || o.name.startsWith('water-flora-') || o.name.startsWith('water-weeds-'))) return;
      keys.push(((o as THREE.Mesh).material as THREE.Material).customProgramCacheKey());
    });
    assert.ok(keys.length >= 4 && keys.every((k) => k.includes('cloudshadow')), `cloud shadow on new materials: ${keys.join(' / ')}`);
    const st = views.stats();
    // 020：默认世界出生点附近有沙漠（地被按干旱度变稀），阈值相应放宽。
    assert.ok(st.cover.instances > 50, `cover ${st.cover.instances}`);
    assert.ok(Object.keys(st.aquatic.bed).length === 5 && Object.keys(st.aquatic.float).length === 5 && st.aquatic.motes > 0);
  });

  test('dispose 后场景清空；缺输入即抛', () => {
    const { scene, views } = setup();
    views.dispose();
    assert.equal(scene.children.length, 0, `left: ${scene.children.map((c) => c.name).join(',')}`);
    shared = null;
    const level = generateWorld(1, TUNING.worldgen);
    assert.throws(() => createWorldViews({ caveBackground: new THREE.Texture(), scene, level, fish: undefined as never }), /fish school/);
  });
});
