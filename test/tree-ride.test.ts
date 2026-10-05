// 015 追加：站在摇动的树上随动 —— JS 位移与着色器逐式一致、平台瓦片 → (树, 枝组) 索引、查询与跟随器（过渡平滑、离地不随动、
// 风为 0 时位移 0）、鹈鹕 / 假人视图整体随树平移与倾斜（脚贴枝、骑车随动、起跳后回到逻辑位置）、相机用逻辑位置。
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { TUNING } from '../src/config/tuning.ts';
import { TREE_KINDS } from '../src/config/worldgen-rules.ts';
import { DEFAULT_WEATHER } from '../src/config/weather-rules.ts';
import type { Entity } from '../src/entities/entity.ts';
import { createDummyViewFactory, createPelicanViewFactory } from '../src/render/entity-views.ts';
import { buildTreeGeometry } from '../src/render/tree-geometry.ts';
import type { TreeRideTile } from '../src/render/tree-geometry.ts';
import { createTreeRideFollower, createTreeRideQuery, TREE_RIDE } from '../src/render/tree-ride.ts';
import type { TreeRideQuery, TreeRideWind } from '../src/render/tree-ride.ts';
import { createTreeView } from '../src/render/tree-view.ts';
import { planTreeSkeleton } from '../src/render/tree-skeleton.ts';
import { planBranchGroups, planPlatformGroups, TREE_WIND, TREE_WIND_BODY, TREE_WIND_GLSL, treePointDisplacement, treePointTilt } from '../src/render/tree-wind.ts';
import { uniformSway, WIND_GLSL, windUniformValues } from '../src/render/wind.ts';
import { modeState } from '../src/world/wind.ts';
import type { WindUniformValues } from '../src/render/wind.ts';
import type { EntityView } from '../src/render/view-registry.ts';
import { pelicanRestPose } from '../src/render/pelican/pelican-pose.ts';
import { createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim } from '../src/sim/sim-world.ts';
import type { InputFrame, SimWorld } from '../src/sim/sim-world.ts';
import { LEVEL_LEGEND, parseLevel } from '../src/world/test-level.ts';
import { evalGlsl } from './helpers/glsl-eval.ts';
import { rig } from './helpers/pelican-fixtures.ts';
import { makeTree } from './helpers/render-fixtures.ts';

const W = DEFAULT_WEATHER;
const DT = TUNING.sim.step;
type Fn = (...a: (number | readonly number[])[]) => number | readonly number[];

/** 着色器 TREE_WIND_BODY（非实例化）在 JS 中逐式求值：树皮/叶顶点的 (x, y) → 风动后 (x, y)。 */
function gpuDisplace(u: WindUniformValues, x: number, y: number, tile: TreeRideTile): [number, number] {
  const fns = evalGlsl(`${WIND_GLSL}\n${TREE_WIND_GLSL}`, u);
  const rotate = fns.get('treeBranchRotate') as Fn;
  const bend = fns.get('treeMainBend') as Fn;
  const amount = fns.get('treeBendAmount') as Fn;
  const [rootX, rootY, H, flex] = tile.bend;
  const [ax, ay, amp, freq] = tile.branch;
  const t = u.uWeatherTime;
  const tp = rotate([x, y], [ax, ay], amp, ax, freq, t) as readonly number[];
  const out = bend(tp, [rootX, rootY], H, amount(rootX, flex, freq, t)) as readonly number[];
  return [out[0] as number, out[1] as number];
}

const allTiles = (): TreeRideTile[] => TREE_KINDS.flatMap((k) => [...buildTreeGeometry(makeTree(k, 3, 40, 30)).ride.tiles]);

describe('JS 位移与着色器逐式一致', () => {
  test('着色器主体顺序：枝转动 → 主弯曲（JS 同序）；风相位取树根/枝基点世界 x', () => {
    const body = TREE_WIND_BODY;
    assert.ok(body.indexOf('treeBranchRotate( transformed.xy, aBranch.xy, aBranch.z, treeAnchorWX') < body.indexOf('treeMainBend( tp, aBend.xy'));
    assert.ok(body.includes('treeBendAmount( treeRootWX, aBend.w, aBranch.w, uWeatherTime )'));
  });

  test('uniformSway = GLSL windSway（多时刻、四种模式、两种风向）', () => {
    for (const w of [W, { ...W, direction: -1 as const, seed: 7 }]) {
      for (const mode of ['calm', 'breeze', 'storm', 'auto'] as const) {
        for (const t of [0.5, 13.7, 211.2]) {
          const u = windUniformValues(w, t, modeState(w, mode, t), 0);
          const glsl = evalGlsl(WIND_GLSL, u).get('windSway') as Fn;
          const js = uniformSway(u);
          for (const x of [-12, 0, 40.5, 333]) for (const tt of [t, t - 1.3]) assert.ok(Math.abs((glsl(x, 0, tt) as number) - js(x, tt)) < 1e-12, `${mode} x=${x} t=${tt}`);
        }
      }
    }
  });

  test('9 种树全部平台格：treePointDisplacement 与 GLSL 误差 < 1e-6（大风/自动、多时刻、平台面上多点）', () => {
    const tiles = allTiles();
    assert.ok(tiles.length > 20);
    let worst = 0;
    let moved = 0;
    for (const mode of ['storm', 'auto'] as const) {
      for (const t of [1.1, 7.25, 64.9]) {
        const u = windUniformValues(W, t, modeState(W, mode, t), 0);
        const sway = uniformSway(u);
        for (const tile of tiles) {
          for (const fx of [tile.tx + 0.1, tile.tx + 0.5, tile.tx + 0.9]) {
            const y = tile.ty + 1;
            const [gx, gy] = gpuDisplace(u, fx, y, tile);
            const [dx, dy] = treePointDisplacement(fx, y, tile.bend, tile.branch, t, sway);
            worst = Math.max(worst, Math.abs(fx + dx - gx), Math.abs(y + dy - gy));
            moved = Math.max(moved, Math.hypot(dx, dy));
          }
        }
      }
    }
    assert.ok(worst < 1e-6, `max |JS − GLSL| = ${worst}`);
    assert.ok(moved > 0.2, `storm moves the platforms visibly: ${moved}`);
  });

  test('风为 0 时位移与倾斜都为 0', () => {
    const u = { ...windUniformValues(W, 5, modeState(W, 'storm', 5), 0), uWindBase: 0, uWindGustAmp: 0 };
    const sway = uniformSway(u);
    for (const tile of allTiles()) {
      const [dx, dy] = treePointDisplacement(tile.tx + 0.5, tile.ty + 1, tile.bend, tile.branch, 5, sway);
      assert.equal(Math.hypot(dx, dy), 0);
      assert.equal(Math.abs(treePointTilt(tile.tx + 0.5, tile.ty + 1, tile.bend, tile.branch, 5, sway)), 0);
    }
  });

  test('倾斜 = 该高度的弯曲斜率：顺风弯曲时向下风倾（逆时针为正 → 风向 +x 时为负）', () => {
    const tile = buildTreeGeometry(makeTree('oak', 2, 40, 30)).ride.tiles[0] as TreeRideTile;
    const tilt = treePointTilt(tile.tx + 0.5, tile.ty + 1, tile.bend, tile.branch, 3, () => 1.2);
    assert.ok(tilt < -0.01 && tilt > -0.5, `${tilt}`);
    assert.ok(treePointTilt(tile.tx + 0.5, tile.ty + 1, tile.bend, tile.branch, 3, () => -1.2) > 0.01);
  });
});

describe('平台瓦片 → (树, 枝组) 索引', () => {
  test('每棵树的平台格一一登记；枝组来自带同一平台标记的叶团/枝；风参数与几何属性同值（Float32）', () => {
    for (const kind of TREE_KINDS) {
      const tree = makeTree(kind, 4, 40, 30);
      const g = buildTreeGeometry(tree);
      const expected = tree.platforms.flatMap((p) => Array.from({ length: p.x1 - p.x0 + 1 }, (_, i) => `${p.x0 + i},${p.ty}`));
      assert.deepEqual(g.ride.tiles.map((t) => `${t.tx},${t.ty}`), expected, `${kind}: all platform tiles`);
      const sk = planTreeSkeleton(tree);
      const groups = planBranchGroups(sk, TREE_WIND[kind]);
      const plan = planPlatformGroups(sk, groups, tree.platforms);
      const bend = g.bark.getAttribute('aBend');
      const leafBr = g.leaf.getAttribute('aBranch');
      const barkBr = g.bark.getAttribute('aBranch');
      const groupKeys = new Set<string>();
      for (const a of [leafBr, barkBr]) for (let i = 0; i < a.count; i++) groupKeys.add(`${a.getX(i)},${a.getY(i)},${a.getZ(i)}`);
      g.ride.tiles.forEach((t, i) => {
        assert.equal(t.treeId, tree.id);
        assert.deepEqual([...t.bend], [bend.getX(0), bend.getY(0), bend.getZ(0), bend.getW(0)], `${kind}: aBend`);
        assert.equal(t.branch[3], barkBr.getW(0), `${kind}: frequency`);
        const grp = plan[i]?.group ?? null;
        if (grp) assert.ok(groupKeys.has(`${t.branch[0]},${t.branch[1]},${t.branch[2]}`), `${kind} tile ${t.tx}: group exists on the mesh`);
        else assert.equal(t.branch[2], 0, `${kind}: follows the trunk`);
      });
      g.bark.dispose();
      g.leaf.dispose();
    }
  });

  test('冠顶平台的枝组 = 冠顶叶团所在的枝（橡树/阔冠/樱花有枝转动）', () => {
    for (const kind of ['oak', 'broad', 'sakura'] as const) {
      const g = buildTreeGeometry(makeTree(kind, 5, 40, 30));
      assert.ok(g.ride.tiles.some((t) => t.branch[2] !== 0), `${kind}: canopy rides a branch group`);
    }
  });

  test('tree-view.rideAt：上屏后可查，非平台格为 null，桶卸载后删除', () => {
    const a = makeTree('oak', 1, 10, 30);
    const b = makeTree('broad', 2, 90, 30);
    const view = createTreeView([a, b], { bucketWidth: 16, margin: 0, keep: 0 });
    view.update({ x: 0, y: 20, w: 20, h: 20 }, 0);
    const p = a.platforms[0]!;
    const tile = view.rideAt(p.x0, p.ty);
    assert.ok(tile && tile.treeId === a.id && tile.tx === p.x0 && tile.ty === p.ty);
    assert.equal(view.rideAt(p.x0, p.ty + 1), null, 'above the platform');
    assert.equal(view.rideAt(p.x1 + 1, p.ty), null, 'beside the platform');
    assert.equal(view.rideAt(b.platforms[0]!.x0, b.platforms[0]!.ty), null, 'tree b not loaded yet');
    view.update({ x: 80, y: 20, w: 20, h: 20 }, 0);
    assert.equal(view.rideAt(p.x0, p.ty), null, 'unloaded with its bucket');
    assert.ok(view.rideAt(b.platforms[0]!.x0, b.platforms[0]!.ty)?.treeId === b.id);
    view.dispose();
  });

  test('手工摆放的重叠平台：归树根更近的树（确定性，不抛）', () => {
    const a = makeTree('broad', 1, 10, 30);
    const b = makeTree('broad', 2, 12, 30);
    const view = createTreeView([a, b], { bucketWidth: 64 });
    view.update({ x: 0, y: 20, w: 30, h: 20 }, 0);
    const p = a.platforms[0]!;
    for (let tx = p.x0; tx <= p.x1; tx++) {
      const tile = view.rideAt(tx, p.ty)!;
      const near = Math.abs(tx + 0.5 - 10.5) <= Math.abs(tx + 0.5 - 12.5) ? a.id : b.id;
      assert.equal(tile.treeId, near, `tile ${tx}`);
    }
    view.dispose();
  });
});

// ---------- 查询与跟随器（合成树格，风可控） ----------

/** 合成树：根 (14.5, 1)、高 6、平台行 ty=4 列 8..20（同一枝组）。 */
const ROOT_X = 14.5;
const TILE_TY = 4;
const fakeTile = (tx: number): TreeRideTile => ({ treeId: 7, tx, ty: TILE_TY, bend: [ROOT_X, 1, 6, 0.04], branch: [12, 3, 0.05, 0.3] });
const lookup = (tx: number, ty: number): TreeRideTile | null => (ty === TILE_TY && tx >= 8 && tx <= 20 ? fakeTile(tx) : null);

interface Clock {
  t: number;
  strength: number;
}
function ride(clock: Clock): TreeRideQuery {
  return createTreeRideQuery(lookup, (): TreeRideWind => ({ t: clock.t, sway: (x, t) => clock.strength * (1 + 0.3 * Math.sin(0.7 * t - 0.1 * x)) }));
}

describe('查询与跟随器', () => {
  test('站在树平台上：位移 = 树在脚底点的位移；倾斜夹到 ±0.15；离开平台/悬空/非整格高度为 null', () => {
    const clock = { t: 2, strength: 1.4 };
    const q = ride(clock);
    const s = q.sample(12.3, TILE_TY + 1, 0.4);
    assert.ok(s);
    const sway = (x: number, t: number) => clock.strength * (1 + 0.3 * Math.sin(0.7 * t - 0.1 * x));
    const [dx, dy] = treePointDisplacement(12.3, TILE_TY + 1, fakeTile(12).bend, fakeTile(12).branch, 2, sway);
    assert.equal(s.dx, dx);
    assert.equal(s.dy, dy);
    assert.ok(Math.abs(s.tilt) <= TREE_RIDE.maxTilt);
    assert.equal(q.sample(12.3, TILE_TY + 1.3, 0.4), null, 'airborne above the platform');
    assert.equal(q.sample(30, TILE_TY + 1, 0.4), null, 'not a tree tile');
    assert.ok(q.sample(20.95 + 0.3, TILE_TY + 1, 0.4), 'one foot still on the edge tile');
    assert.throws(() => q.sample(Number.NaN, 1, 0.4), /tree-ride/);
    // 夹倾斜：极端风下
    const strong = createTreeRideQuery(lookup, () => ({ t: 1, sway: () => 40 }));
    assert.equal(Math.abs(strong.sample(19.5, TILE_TY + 1, 0.4)!.tilt), TREE_RIDE.maxTilt);
  });

  test('风为 0：站在树上位移为 0', () => {
    const q = ride({ t: 3, strength: 0 });
    const s = q.sample(15, TILE_TY + 1, 0.4)!;
    assert.deepEqual([s.dx, s.dy, s.tilt].map(Math.abs), [0, 0, 0]);
  });

  test('跟随器：站上后 0.15 s 内平滑升到全量（无跳变），离地后 0.15 s 内平滑降到 0；全量时 = 树位移', () => {
    const clock = { t: 0, strength: 1.2 };
    const q = ride(clock);
    const follow = createTreeRideFollower(q);
    const body = { onGround: true, halfWidth: 0.4 };
    const dt = 1 / 120;
    let prev = { x: 0, y: 0 };
    let maxStep = 0;
    const weights: number[] = [];
    for (let i = 0; i < 60; i++) {
      clock.t += dt;
      const o = follow(body, 13, TILE_TY + 1, dt);
      weights.push(o.weight);
      maxStep = Math.max(maxStep, Math.hypot(o.x - prev.x, o.y - prev.y));
      prev = { x: o.x, y: o.y };
    }
    const full = q.sample(13, TILE_TY + 1, 0.4)!;
    assert.ok(Math.abs(prev.x - full.dx) < 1e-12 && Math.abs(prev.y - full.dy) < 1e-12, 'full weight = tree displacement');
    assert.ok(weights[Math.round(TREE_RIDE.blend / dt) - 2]! < 1 && weights[Math.round(TREE_RIDE.blend / dt)]! >= 1 - 1e-9, 'ramp takes 0.15 s');
    const mag = Math.hypot(full.dx, full.dy);
    assert.ok(mag > 0.1);
    // 平滑：每帧位移增量 ≤ 平滑阶跃的最大斜率（1.5/blend）× dt × 幅值 + 树本身的运动余量。
    assert.ok(maxStep <= (1.5 / TREE_RIDE.blend) * dt * mag * 1.1 + 0.01, `max per-frame step ${maxStep}`);
    // 起跳：不再采样，0.15 s 后归零。
    body.onGround = false;
    let o = follow(body, 13, TILE_TY + 1.5, dt);
    assert.ok(o.weight < 1 && Math.hypot(o.x, o.y) > 0, 'fades, does not snap');
    for (let i = 0; i < 20; i++) o = follow(body, 13, TILE_TY + 2, dt);
    assert.deepEqual([o.x, o.y, o.tilt, o.weight].map(Math.abs), [0, 0, 0, 0]);
  });

  test('无查询（未接入树）时恒为 0；非法 frameDt 即抛', () => {
    const f = createTreeRideFollower(undefined);
    assert.deepEqual({ ...f({ onGround: true, halfWidth: 0.4 }, 12, 5, 0.1) }, { x: 0, y: 0, tilt: 0, weight: 0 });
    assert.throws(() => createTreeRideFollower(ride({ t: 0, strength: 1 }))({ onGround: true, halfWidth: 0.4 }, 12, 5, -1), /tree-ride/);
  });
});

// ---------- 实体视图 ----------

/** 宽 30 × 高 14：ty=0 泥土；ty=4 单向平台 8..20（作为“树平台”）；P 在 (12, 5)。 */
function rows(): string[] {
  const g: string[][] = [];
  for (let ty = 0; ty < 14; ty++) {
    const row: string[] = [];
    for (let tx = 0; tx < 30; tx++) row.push(tx === 0 || tx === 29 ? '=' : ty < 1 ? '#' : ty === TILE_TY && tx >= 8 && tx <= 20 ? '-' : '.');
    g.push(row);
  }
  (g[TILE_TY + 1] as string[])[12] = 'P';
  (g[TILE_TY + 1] as string[])[17] = 'D';
  return g.map((r) => r.join('')).reverse();
}

const live: EntityView[] = [];
after(() => {
  live.forEach((v) => v.dispose());
  rig().applyPose(pelicanRestPose(rig().animGeometry));
});

interface Harness {
  w: SimWorld;
  clock: Clock;
  query: TreeRideQuery;
  view: EntityView;
  player: Entity;
}

function harness(): Harness {
  const w = createSimWorld({ level: parseLevel(rows(), LEVEL_LEGEND), tuning: TUNING });
  const clock = { t: 0, strength: 1.3 };
  const query = ride(clock);
  const player = getPlayer(w);
  const view = createPelicanViewFactory({ rig: rig(), tuning: TUNING, terrain: w.map, actors: () => w.entities, treeRide: query })(player);
  live.push(view);
  return { w, clock, query, view, player };
}

function done(h: Harness): void {
  h.view.dispose();
  live.splice(live.indexOf(h.view), 1);
  rig().applyPose(pelicanRestPose(rig().animGeometry));
}

function tick(h: Harness, over: Partial<InputFrame> = {}): void {
  stepSim(h.w, { ...NEUTRAL_INPUT, ...over });
  h.w.events.drain();
  h.clock.t += DT;
  h.view.sync(h.player, 1, DT);
}

function feet(): THREE.Vector3[] {
  const r = rig();
  r.root.updateMatrixWorld(true);
  return [1, -1].map((side) => r.root.getObjectByName(`standing-foot-${side}`)!.getWorldPosition(new THREE.Vector3()));
}

describe('鹈鹕 / 假人视图随树', () => {
  test('站在树平台上：根节点 = 逻辑位置 + 树位移、倾斜 = 树斜率；逻辑位置不变（相机跟随逻辑位置）；脚贴着摇动的树枝', () => {
    const h = harness();
    for (let i = 0; i < 40; i++) tick(h);
    const b = h.player.body;
    assert.ok(b.onGround && Math.abs(b.y - (TILE_TY + 1)) < 1e-6, 'standing on the platform');
    const s = h.query.sample(b.x, b.y, b.halfWidth)!;
    const root = rig().root;
    assert.ok(Math.abs(root.position.x - (b.x + s.dx)) < 1e-9 && Math.abs(root.position.y - (b.y + s.dy)) < 1e-9, 'root follows the tree');
    assert.ok(Math.abs(root.rotation.z - s.tilt) < 1e-12 && s.tilt !== 0, 'tilts with the bend');
    assert.ok(Math.hypot(s.dx, s.dy) > 0.1, `visible offset ${s.dx},${s.dy}`);
    for (const f of feet()) {
      const [fdx, fdy] = treePointDisplacement(f.x - s.dx, TILE_TY + 1, fakeTile(12).bend, fakeTile(12).branch, h.clock.t, (x, t) => h.clock.strength * (1 + 0.3 * Math.sin(0.7 * t - 0.1 * x)));
      assert.ok(Math.abs(f.y - (TILE_TY + 1 + fdy)) < 0.04, `foot on the swaying branch: ${f.y} vs ${TILE_TY + 1 + fdy}`);
      assert.ok(Math.abs(fdx - s.dx) < 0.05);
    }
    done(h);
  });

  test('起跳后不随动：0.15 s 内淡出，空中根节点 = 逻辑位置、无倾斜；落回平台再次跟随', () => {
    const h = harness();
    for (let i = 0; i < 30; i++) tick(h);
    tick(h, { jumpPressed: true, jumpHeld: true });
    let airborne = 0;
    for (let i = 0; i < 40 && airborne * DT < TREE_RIDE.blend + 0.05; i++) {
      tick(h, { jumpHeld: true });
      if (!h.player.body.onGround) airborne++;
    }
    assert.ok(airborne * DT >= TREE_RIDE.blend, 'in the air long enough');
    const b = h.player.body;
    assert.equal(b.onGround, false);
    const root = rig().root;
    assert.ok(Math.abs(root.position.x - b.x) < 1e-9 && Math.abs(root.position.y - b.y) < 1e-9 && root.rotation.z === 0, 'airborne: no ride offset');
    for (let i = 0; i < 90; i++) tick(h);
    assert.ok(h.player.body.onGround);
    assert.ok(Math.abs(root.position.x - h.player.body.x) > 0.05, 'riding the tree again after landing');
    done(h);
  });

  test('骑车站在树平台上同样随动', () => {
    const h = harness();
    for (let i = 0; i < 10; i++) tick(h);
    tick(h, { mountPressed: true });
    for (let i = 0; i < TUNING.player.bike.mountTicks + 20; i++) tick(h);
    assert.equal(h.player.pelican!.ride.mode, 'riding');
    const b = h.player.body;
    assert.ok(b.onGround);
    const s = h.query.sample(b.x, b.y, b.halfWidth)!;
    const root = rig().root;
    assert.ok(Math.abs(root.position.x - (b.x + s.dx)) < 1e-9 && Math.abs(root.rotation.z - s.tilt) < 1e-12);
    done(h);
  });

  test('假人站在树平台上随树平移与倾斜；未接入时不动', () => {
    const w = createSimWorld({ level: parseLevel(rows(), LEVEL_LEGEND), tuning: TUNING });
    const d = w.entities.find((e) => e.kind === 'trainingDummy')!;
    const clock = { t: 0, strength: 1.3 };
    const q = ride(clock);
    const view = createDummyViewFactory({ tuning: TUNING, terrain: w.map, treeRide: q })(d);
    const plain = createDummyViewFactory({ tuning: TUNING, terrain: w.map })(d);
    for (let i = 0; i < 30; i++) {
      stepSim(w, NEUTRAL_INPUT);
      w.events.drain();
      clock.t += DT;
      view.sync(d, 1, DT);
      plain.sync(d, 1, DT);
    }
    const s = q.sample(d.body.x, d.body.y, d.body.halfWidth)!;
    assert.ok(Math.abs(view.object.position.x - (d.body.x + s.dx)) < 1e-9 && Math.abs(view.object.rotation.z - s.tilt) < 1e-12);
    assert.equal(plain.object.position.x, d.body.x);
    view.dispose();
    plain.dispose();
  });

});
