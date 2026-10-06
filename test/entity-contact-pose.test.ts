// 019 打磨 B（任务 017 追加）：实体接触的渲染贴合。
// - 假人视觉头顶（平顶圆角回转体）与碰撞盒顶对齐；
// - 站在假人头上：脚底贴合假人顶面（含圆角曲面），假人移动时锁地的脚随之移动不打滑；
// - 贴实体/墙、骑车低速顶住：喙尖不进入障碍（≥ gap）；啄击照常前伸（避让让位）。
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { TUNING, validateTuning } from '../src/config/tuning.ts';
import type { SolidTuning, Tuning } from '../src/config/tuning.ts';
import type { Entity } from '../src/entities/entity.ts';
import { createDummyViewFactory, createPelicanViewFactory } from '../src/render/entity-views.ts';
import type { EntityView } from '../src/render/view-registry.ts';
import { createDummyBodyGeometry, dummyBodyProfile, dummyTopAt, DUMMY_TOP_CORNER_SHARE } from '../src/render/dummy-shape.ts';
import { collectObstacleBoxes, supportTopAt } from '../src/render/entity-surroundings.ts';
import { createPelicanBeakAvoid, DEFAULT_BEAK_AVOID } from '../src/render/pelican/pelican-beak-avoid.ts';
import { pelicanRestPose } from '../src/render/pelican/pelican-pose.ts';
import { LEVEL_LEGEND, parseLevel } from '../src/world/test-level.ts';
import { createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim } from '../src/sim/sim-world.ts';
import type { InputFrame, SimWorld } from '../src/sim/sim-world.ts';
import { beakTip, GEO, REST, rig } from './helpers/pelican-fixtures.ts';

const DT = TUNING.sim.step;
const P = TUNING.player;
const D = TUNING.dummy;
/** 允许误差（世界单位）。 */
const TOL = 0.03;
const GAP = DEFAULT_BEAK_AVOID.gap;

// ---------- 夹具 ----------

interface Marker {
  readonly x: number;
  readonly y: number;
  readonly ch: 'P' | 'D';
}

/** width×height：ty < 1 为泥土，左右石墙；edit 可加墙。 */
function level(width: number, height: number, markers: readonly Marker[], edit: (g: string[][]) => void = () => {}): string[] {
  const g: string[][] = [];
  for (let ty = 0; ty < height; ty++) {
    const row: string[] = [];
    for (let tx = 0; tx < width; tx++) row.push(tx === 0 || tx === width - 1 ? '=' : ty < 1 ? '#' : '.');
    g.push(row);
  }
  edit(g);
  for (const m of markers) (g[m.y] as string[])[m.x] = m.ch;
  return g.map((r) => r.join('')).reverse();
}

function world(rows: readonly string[], tuning: Tuning = TUNING): SimWorld {
  return createSimWorld({ level: parseLevel(rows, LEVEL_LEGEND), tuning });
}

function dummy(w: SimWorld): Entity {
  const d = w.entities.find((e) => e.dummy);
  if (!d) throw new Error('no dummy');
  return d;
}

function withDummy(over: Partial<SolidTuning>): Tuning {
  const t: Tuning = { ...TUNING, collision: { ...TUNING.collision, dummy: { ...TUNING.collision.dummy, ...over } } };
  validateTuning(t);
  return t;
}

interface Harness {
  w: SimWorld;
  view: EntityView;
  player: Entity;
}

const live: EntityView[] = [];
after(() => live.forEach((v) => v.dispose()));

function harness(w: SimWorld, withActors = true): Harness {
  const factory = createPelicanViewFactory({ windAt: () => 0, rig: rig(), tuning: w.tuning, terrain: w.map, ...(withActors ? { actors: () => w.entities } : {}) });
  const player = getPlayer(w);
  const view = factory(player);
  live.push(view);
  return { w, view, player };
}

function dispose(h: Harness): void {
  h.view.dispose();
  live.splice(live.indexOf(h.view), 1);
  rig().applyPose(pelicanRestPose(rig().animGeometry));
}

/** 推进一个 sim tick 并以 alpha=1 同步视图。 */
function tick(h: Harness, over: Partial<InputFrame> = {}): void {
  stepSim(h.w, { ...NEUTRAL_INPUT, ...over });
  h.w.events.drain();
  h.view.sync(h.player, 1, DT);
}

function ticks(h: Harness, n: number, over: Partial<InputFrame> = {}, each: () => void = () => {}): void {
  for (let i = 0; i < n; i++) {
    tick(h, over);
    each();
  }
}

/** 两只脚的鞋底原点（世界）。 */
function feet(): THREE.Vector3[] {
  const r = rig();
  r.root.updateMatrixWorld(true);
  return [1, -1].map((side) => r.root.getObjectByName(`standing-foot-${side}`)!.getWorldPosition(new THREE.Vector3()));
}

/** 上喙尖与下颌尖（世界）。 */
function billTips(): THREE.Vector3[] {
  const r = rig();
  return [beakTip(r, 'standing-pouch'), beakTip(r, 'pelican-jaw')];
}

/** 点 p 到盒子的“进入量”：> −gap 表示离盒子不足 gap（水平和竖直都在盒内扩展范围）。 */
function intrusion(p: THREE.Vector3, box: { x0: number; x1: number; y0: number; y1: number }): number {
  return Math.min(p.x - box.x0, box.x1 - p.x, p.y - box.y0, box.y1 - p.y);
}

function dummyBox(d: Entity): { x0: number; x1: number; y0: number; y1: number } {
  const b = d.body;
  return { x0: b.x - b.halfWidth, x1: b.x + b.halfWidth, y0: b.y, y1: b.y + b.height };
}

// ---------- 假人外形 ----------

describe('假人视觉头顶与碰撞盒顶对齐', () => {
  test('几何最高点 = 碰撞盒顶，平顶区域覆盖中心', () => {
    const geo = createDummyBodyGeometry(D.halfWidth, D.height);
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    assert.ok(Math.abs(box.max.y - D.height) <= TOL, `视觉顶 ${box.max.y} vs 碰撞顶 ${D.height}`);
    assert.ok(Math.abs(box.max.x - D.halfWidth) <= TOL, `视觉半宽 ${box.max.x} vs ${D.halfWidth}`);
    // 平顶：半径 (1 − corner) · halfWidth 内的顶面顶点都在碰撞盒顶。
    const flat = D.halfWidth * (1 - DUMMY_TOP_CORNER_SHARE);
    const pos = geo.getAttribute('position');
    let topVerts = 0;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      if (r <= flat + 1e-6 && pos.getY(i) > D.height - 0.5) {
        assert.ok(Math.abs(pos.getY(i) - D.height) < 1e-6, `平顶顶点 r=${r} y=${pos.getY(i)}`);
        topVerts++;
      }
    }
    assert.ok(topVerts > 0);
    geo.dispose();
  });

  test('dummyTopAt：平顶为 height，圆角内单调下降，超出半宽为 null；与轮廓一致', () => {
    assert.equal(dummyTopAt(0, D.halfWidth, D.height), D.height);
    assert.equal(dummyTopAt(D.halfWidth * 0.5, D.halfWidth, D.height), D.height);
    let last = D.height;
    for (let a = D.halfWidth * (1 - DUMMY_TOP_CORNER_SHARE); a <= D.halfWidth; a += 0.01) {
      const h = dummyTopAt(a, D.halfWidth, D.height)!;
      assert.ok(h <= last + 1e-9, `单调 a=${a}`);
      last = h;
    }
    assert.equal(dummyTopAt(D.halfWidth + 0.01, D.halfWidth, D.height), null);
    // 轮廓上的圆角点落在曲面上。
    for (const p of dummyBodyProfile(D.halfWidth, D.height)) {
      if (p.y < D.height - D.halfWidth * DUMMY_TOP_CORNER_SHARE) continue;
      assert.ok(Math.abs(dummyTopAt(p.x, D.halfWidth, D.height)! - p.y) < 1e-6, `轮廓 (${p.x}, ${p.y})`);
    }
    assert.throws(() => dummyTopAt(0, 0.5, 1), /height/);
  });

  test('假人视图：身体网格的世界最高点 = 碰撞盒顶', () => {
    const w = world(level(20, 10, [{ x: 10, y: 1, ch: 'D' }, { x: 3, y: 1, ch: 'P' }]));
    for (let i = 0; i < 30; i++) stepSim(w, NEUTRAL_INPUT);
    const d = dummy(w);
    const view = createDummyViewFactory({ tuning: TUNING, terrain: w.map })(d);
    view.sync(d, 1, DT);
    view.object.updateMatrixWorld(true);
    const box = new THREE.Box3();
    // 血条悬在头顶，承托角色的身体边界只包含实体材质网格。
    view.object.traverse((node) => {
      if (node instanceof THREE.Mesh && node.material instanceof THREE.MeshStandardMaterial) {
        box.union(new THREE.Box3().setFromObject(node));
      }
    });
    assert.ok(Math.abs(box.max.y - (d.body.y + d.body.height)) <= TOL, `视觉顶 ${box.max.y} vs ${d.body.y + d.body.height}`);
    view.dispose();
  });
});

// ---------- 站在假人头上 ----------

describe('站在假人头上：脚贴合、随动不打滑', () => {
  /** 鹈鹕出生在假人正上方空中，落到头上站稳。 */
  function onHead(offsetX = 0, withActors = true): Harness {
    const w = world(level(30, 14, [{ x: 10, y: 1, ch: 'D' }, { x: 10, y: 7, ch: 'P' }]));
    const h = harness(w, withActors);
    h.player.body.x += offsetX;
    h.player.body.prevX = h.player.body.x;
    ticks(h, 90);
    assert.equal(h.player.solid?.supportId, dummy(w).id, '站在假人头上');
    return h;
  }

  /** 每只脚：脚底 − 假人在该 x 的顶面；在假人范围外为 null。 */
  function footGaps(h: Harness): Array<number | null> {
    const d = dummy(h.w);
    return feet().map((f) => {
      const top = supportTopAt(d, d.body.x, d.body.y, f.x, TUNING);
      return top === null ? null : f.y - top;
    });
  }

  test('正中站立：两脚底与假人顶间隙 ≤ .03', () => {
    const h = onHead();
    for (const g of footGaps(h)) {
      assert.notEqual(g, null);
      assert.ok(Math.abs(g!) <= TOL, `脚底间隙 ${g}`);
    }
    dispose(h);
  });

  test('偏到圆角上站立：脚按曲面高度贴合', () => {
    const h = onHead(0.32);
    const gaps = footGaps(h);
    let onCorner = 0;
    const d = dummy(h.w);
    feet().forEach((f, i) => {
      const g = gaps[i];
      if (g === null || g === undefined) return;
      assert.ok(Math.abs(g) <= TOL, `脚 ${i} x=${(f.x - d.body.x).toFixed(3)} 间隙 ${g}`);
      if (Math.abs(f.x - d.body.x) > D.halfWidth * (1 - DUMMY_TOP_CORNER_SHARE)) onCorner++;
    });
    assert.ok(onCorner > 0, '至少一只脚在圆角上');
    dispose(h);
  });

  test('假人被击退滑动：脚相对假人不滑（≤ .02），关闭实体查询时会滑', () => {
    const run = (withActors: boolean): number => {
      const h = onHead(0, withActors);
      const d = dummy(h.w);
      const rel0 = feet().map((f) => f.x - d.body.x);
      const x0 = d.body.x;
      let worst = 0;
      for (let i = 0; i < 20; i++) {
        d.body.vx = 4; // 模拟持续被击退滑动
        tick(h);
        feet().forEach((f, k) => (worst = Math.max(worst, Math.abs(f.x - d.body.x - rel0[k]!))));
      }
      assert.ok(d.body.x > x0 + 1, `假人确实移动了 ${d.body.x - x0}`);
      assert.equal(h.player.solid?.supportId, d.id, '仍站在头上');
      dispose(h);
      return worst;
    };
    const carried = run(true);
    assert.ok(carried <= 0.02, `随动时脚相对假人滑动 ${carried}`);
    const legacy = run(false);
    assert.ok(legacy > 0.05, `对照：无支撑参考系时脚滑动 ${legacy}`);
  });
});

// ---------- 喙避让 ----------

describe('喙避让：贴实体/贴墙/骑车顶住时喙尖不进入障碍', () => {
  function assertBillClear(box: { x0: number; x1: number; y0: number; y1: number }, tag: string): number {
    let worst = -Infinity;
    for (const t of billTips()) worst = Math.max(worst, intrusion(t, box));
    assert.ok(worst <= -GAP + 1e-3, `${tag}: 喙尖进入/贴近障碍 ${worst.toFixed(3)}（需 ≤ −${GAP}）`);
    return worst;
  }

  test('走向假人被挡：全程喙尖与假人保持 ≥ gap', () => {
    const w = world(level(30, 10, [{ x: 5, y: 1, ch: 'P' }, { x: 9, y: 1, ch: 'D' }]), withDummy({ pushable: false }));
    const h = harness(w);
    const d = dummy(w);
    let contactFrames = 0;
    ticks(h, 150, { moveX: 1 }, () => {
      assertBillClear(dummyBox(d), `tick ${w.tick}`);
      if (h.player.solid?.contact === 1) contactFrames++;
    });
    assert.ok(contactFrames > 30, `确实顶住了假人（${contactFrames} 帧）`);
    dispose(h);
  });

  test('关闭避让对照：同场景喙会插进假人（证明测试有效）', () => {
    const w = world(level(30, 10, [{ x: 5, y: 1, ch: 'P' }, { x: 9, y: 1, ch: 'D' }]), withDummy({ pushable: false }));
    const h = harness(w, false);
    ticks(h, 150, { moveX: 1 });
    const box = dummyBox(dummy(w));
    const tip = beakTip(rig(), 'standing-pouch');
    assert.ok(tip.x > box.x0 + 0.5 && tip.y < box.y1, `无实体查询时喙穿过假人：喙尖 (${tip.x.toFixed(2)}, ${tip.y.toFixed(2)})，假人 [${box.x0}, ${box.x1}] 顶 ${box.y1}`);
    dispose(h);
  });

  test('贴墙站立：喙尖不进墙', () => {
    // x = 12..13 一堵 6 格高的墙。
    const w = world(level(30, 10, [{ x: 5, y: 1, ch: 'P' }], (g) => {
      for (let ty = 1; ty <= 6; ty++) for (const tx of [12, 13]) (g[ty] as string[])[tx] = '=';
    }));
    const h = harness(w);
    let wallFrames = 0;
    ticks(h, 300, { moveX: 1 }, () => {
      assertBillClear({ x0: 12, x1: 14, y0: 1, y1: 7 }, `tick ${w.tick}`);
      if (h.player.body.wallContact === 1) wallFrames++;
    });
    assert.ok(wallFrames > 30, `确实贴墙（${wallFrames} 帧）`);
    // 停下站立后依旧不进墙。
    ticks(h, 60, {}, () => assertBillClear({ x0: 12, x1: 14, y0: 1, y1: 7 }, `站立 tick ${w.tick}`));
    dispose(h);
  });

  test('骑车低速顶住假人：喙尖不进入假人', () => {
    const w = world(level(40, 10, [{ x: 5, y: 1, ch: 'P' }, { x: 8, y: 1, ch: 'D' }]), withDummy({ pushable: false }));
    const h = harness(w);
    ticks(h, 5);
    tick(h, { mountPressed: true });
    ticks(h, P.bike.mountTicks + 2);
    assert.equal(h.player.pelican?.ride.mode, 'riding');
    const d = dummy(w);
    let pushing = 0;
    ticks(h, 120, { moveX: 1 }, () => {
      assert.equal(h.player.pelican?.ride.mode, 'riding', '低速不下车');
      if (h.player.solid?.contact === 1) {
        pushing++;
        assertBillClear(dummyBox(d), `骑车 tick ${w.tick}`);
      }
    });
    assert.ok(pushing > 30, `确实顶住（${pushing} 帧）`);
    dispose(h);
  });

  test('啄击照常前伸：贴着假人啄击时喙尖比避让姿态更靠前', () => {
    const w = world(level(30, 10, [{ x: 5, y: 1, ch: 'P' }, { x: 9, y: 1, ch: 'D' }]), withDummy({ pushable: false }));
    const h = harness(w);
    ticks(h, 150, { moveX: 1 });
    ticks(h, 20);
    const blocked = beakTip(rig(), 'standing-pouch').x;
    tick(h, { attackPressed: true, attackSource: 'keyboard' });
    let reach = -Infinity;
    for (let i = 0; i < 30 && h.player.attack; i++) {
      tick(h);
      reach = Math.max(reach, beakTip(rig(), 'standing-pouch').x);
    }
    assert.ok(reach > blocked + 0.3, `啄击喙尖 ${reach.toFixed(3)} 明显前伸于避让姿态 ${blocked.toFixed(3)}`);
    dispose(h);
  });
});

// ---------- 纯逻辑层 ----------

describe('喙避让层（纯函数）', () => {
  const r = rig();
  const bill = { tip: r.diagnostics.mouth.tip, center: r.diagnostics.mouth.center, rideOffset: [0, 0.58] as [number, number] };

  test('采样点与 rig 的喙尖一致（静止姿态）', () => {
    const avoid = createPelicanBeakAvoid(GEO, bill);
    r.root.position.set(0, 0, 0);
    r.applyPose(REST);
    const [tip] = avoid.samples(pelicanRestPose(GEO), 0, 0, 1);
    const real = beakTip(r, 'standing-pouch');
    assert.ok(Math.hypot(tip!.x - real.x, tip!.y - real.y) < 0.01, `采样 ${JSON.stringify(tip)} vs rig ${real.x},${real.y}`);
  });

  test('无障碍为 0；有障碍时立即生效、离开后平滑退出；啄击时快速让位', () => {
    const avoid = createPelicanBeakAvoid(GEO, bill);
    const boxes = [{ x0: 0.9, x1: 1.9, y0: 0, y1: 2.2 }];
    const pose = (): ReturnType<typeof pelicanRestPose> => pelicanRestPose(GEO);
    assert.equal(avoid.apply(pose(), { x: 0, y: 0, facing: 1, boxes: [], pecking: false }, DT), 0);
    const s1 = avoid.apply(pose(), { x: 0, y: 0, facing: 1, boxes, pecking: false }, DT);
    assert.ok(s1 > 0 && s1 <= 1, `立即生效 s=${s1}`);
    const s2 = avoid.apply(pose(), { x: 0, y: 0, facing: 1, boxes: [], pecking: false }, DT);
    assert.ok(s2 > 0 && s2 < s1, `平滑退出 ${s2}`);
    avoid.apply(pose(), { x: 0, y: 0, facing: 1, boxes, pecking: false }, DT);
    let s = 1;
    for (let i = 0; i < 12; i++) s = avoid.apply(pose(), { x: 0, y: 0, facing: 1, boxes, pecking: true }, DT);
    assert.ok(s < 0.02, `啄击让位 s=${s}`);
  });

  test('姿态合法（follow 限幅内），朝左镜像', () => {
    const avoid = createPelicanBeakAvoid(GEO, bill);
    const p = pelicanRestPose(GEO);
    avoid.apply(p, { x: 0, y: 0, facing: -1, boxes: [{ x0: -1.9, x1: -0.9, y0: 0, y1: 3 }], pecking: false }, DT);
    assert.ok(p.lean > 0 && p.follow.head > 0 && p.follow.headShift[0] < 0, '后仰、抬头、缩颈');
    assert.doesNotThrow(() => r.applyPose(p));
    r.applyPose(REST);
  });

  test('collectObstacleBoxes：只取朝向一侧范围内的实心瓦片与可碰撞实体', () => {
    const w = world(level(30, 10, [{ x: 5, y: 1, ch: 'P' }, { x: 7, y: 1, ch: 'D' }], (g) => {
      (g[2] as string[])[3] = '=';
    }));
    for (let i = 0; i < 10; i++) stepSim(w, NEUTRAL_INPUT);
    const p = getPlayer(w);
    const out = collectObstacleBoxes([], p, p.body.x, p.body.y, w.entities, w.map, TUNING, 1);
    assert.ok(out.some((b) => b.x0 === dummy(w).body.x - dummy(w).body.halfWidth), '含前方假人');
    assert.ok(!out.some((b) => b.x0 === 3), '不含身后的墙');
    assert.ok(!out.some((b) => b.y1 <= p.body.y + 0.6 && b.x1 - b.x0 === 1), '不含脚下的地面');
  });
});
