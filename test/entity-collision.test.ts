// 任务 017：实体间碰撞（physics/entity-collision + sim 接线 + 骑行撞实体 + 接触伤害接口）。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING, jumpVelocity, validateTuning } from '../src/config/tuning.ts';
import type { ContactDamageTuning, SolidTuning, Tuning } from '../src/config/tuning.ts';
import type { DismountEvent, HitEvent, SimEvent } from '../src/core/game-events.ts';
import type { Entity } from '../src/entities/entity.ts';
import { createBody } from '../src/physics/body.ts';
import { createSolid, resolveSolids, solidsCollide } from '../src/physics/entity-collision.ts';
import type { SolidAgent } from '../src/physics/entity-collision.ts';
import { displaceBody } from '../src/physics/tile-collision.ts';
import { LEVEL_LEGEND, parseLevel } from '../src/world/test-level.ts';
import { createSimWorld, getPlayer, stepSim, NEUTRAL_INPUT } from '../src/sim/sim-world.ts';
import type { InputFrame, SimWorld } from '../src/sim/sim-world.ts';

const P = TUNING.player;
const C = TUNING.collision;
const DT = TUNING.sim.step;

// ---------- 夹具 ----------

type Grid = string[][];

interface Marker {
  readonly x: number;
  readonly y: number;
  readonly ch: 'P' | 'D';
}

/** width×height：ty < groundTop 为泥土，左右石墙；markers 放置出生点/假人（格坐标，ty=0 为最下一行）。 */
function level(width: number, height: number, markers: readonly Marker[], groundTop = 1, edit: (g: Grid) => void = () => {}): string[] {
  const g: Grid = [];
  for (let ty = 0; ty < height; ty++) {
    const row: string[] = [];
    for (let tx = 0; tx < width; tx++) row.push(tx === 0 || tx === width - 1 ? '=' : ty < groundTop ? '#' : '.');
    g.push(row);
  }
  edit(g);
  for (const m of markers) (g[m.y] as string[])[m.x] = m.ch;
  return g.map((r) => r.join('')).reverse();
}

function world(rows: readonly string[], tuning: Tuning = TUNING): SimWorld {
  return createSimWorld({ level: parseLevel(rows, LEVEL_LEGEND), tuning });
}

function step(w: SimWorld, over: Partial<InputFrame> = {}): void {
  stepSim(w, { ...NEUTRAL_INPUT, ...over });
}

function steps(w: SimWorld, n: number, over: Partial<InputFrame> = {}, each: (w: SimWorld) => void = () => {}): void {
  for (let i = 0; i < n; i++) {
    step(w, over);
    each(w);
  }
}

function dummies(w: SimWorld): Entity[] {
  return w.entities.filter((e) => e.dummy);
}

function dummy(w: SimWorld): Entity {
  const d = dummies(w)[0];
  if (!d) throw new Error('no dummy');
  return d;
}

/** 两实体身体盒的重叠面积（0 表示不重叠/相接）。 */
function overlapArea(a: Entity, b: Entity): number {
  const ox = Math.min(a.body.x + a.body.halfWidth, b.body.x + b.body.halfWidth) - Math.max(a.body.x - a.body.halfWidth, b.body.x - b.body.halfWidth);
  const oy = Math.min(a.body.y + a.body.height, b.body.y + b.body.height) - Math.max(a.body.y, b.body.y);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

function assertNoOverlap(w: SimWorld, tag: string): void {
  const p = getPlayer(w);
  for (const d of dummies(w)) assert.ok(overlapArea(p, d) < 1e-4, `${tag}: tick ${w.tick} 鹈鹕与假人重叠 ${overlapArea(p, d)}`);
}

function withSolid(which: 'pelican' | 'dummy', over: Partial<SolidTuning>, extra: Partial<Tuning['collision']> = {}): Tuning {
  const t: Tuning = { ...TUNING, collision: { ...TUNING.collision, ...extra, [which]: { ...TUNING.collision[which], ...over } } };
  validateTuning(t);
  return t;
}

/** 平地：鹈鹕在 px 格，假人在 dx 格。 */
function flat(px: number, dx: number, width = 40, tuning: Tuning = TUNING): SimWorld {
  return world(level(width, 12, [{ x: px, y: 1, ch: 'P' }, { x: dx, y: 1, ch: 'D' }]), tuning);
}

function settle(w: SimWorld): void {
  steps(w, 5);
  w.events.drain();
}

// ---------- 调参 ----------

describe('collision 调参 fail-fast', () => {
  test('默认调参通过；鹈鹕与假人互相碰撞，假人可站、较重', () => {
    validateTuning(TUNING);
    assert.ok(solidsCollide(createSolid(C.pelican), createSolid(C.dummy)));
    assert.equal(C.dummy.standable, true);
    assert.ok(C.dummy.mass > C.pelican.mass * 3, '假人明显更重');
    assert.equal(C.dummy.contactDamage, undefined, '假人不启用接触伤害');
  });

  test('非法参数抛错', () => {
    const bad = (over: Partial<SolidTuning>, extra: Partial<Tuning['collision']> = {}) => () => withSolid('dummy', over, extra);
    assert.throws(bad({ mass: 0 }), /collision\.dummy\.mass/);
    assert.throws(bad({ layer: 0 }), /collision\.dummy\.layer/);
    assert.throws(bad({ mask: 1.5 }), /collision\.dummy\.mask/);
    assert.throws(bad({}, { separateSpeed: 0 }), /collision\.separateSpeed/);
    assert.throws(bad({}, { iterations: 0 }), /collision\.iterations/);
    assert.throws(bad({}, { landTolerance: 0.8 }), /collision\.landTolerance/);
    const cd: ContactDamageTuning = { hit: { id: 'touch', damage: 5, knockback: { x: 4, y: 3 }, hitstun: 6, hitstop: 0 }, invulnTicks: 30, margin: 1 };
    assert.throws(bad({ contactDamage: cd }), /contactDamage\.margin/);
  });
});

// ---------- 底层 ----------

describe('displaceBody / resolveSolids 底层', () => {
  const rows = level(12, 6, [{ x: 3, y: 1, ch: 'P' }]);
  const map = parseLevel(rows, LEVEL_LEGEND).map;

  test('displaceBody 不进墙、不改速度与接触状态', () => {
    const b = createBody({ x: 10, y: 1, halfWidth: 0.4, height: 2, vx: 3, vy: -1 });
    b.onGround = true;
    const moved = displaceBody(b, map, 5, 0);
    assert.ok(Math.abs(b.x + 0.4 - 11) < 1e-9, `贴右墙，x=${b.x}`);
    assert.ok(moved.dx < 5);
    assert.equal(b.vx, 3);
    assert.equal(b.vy, -1);
    assert.equal(b.wallContact, 0);
    assert.equal(b.onGround, true);
  });

  test('层/掩码不匹配不碰撞', () => {
    const a = createSolid({ ...C.pelican });
    const b = createSolid({ ...C.dummy, mask: 2 });
    assert.equal(solidsCollide(a, b), false, '假人不再与玩家层碰撞');
    const ghost: SolidAgent = { id: 1, body: createBody({ x: 5, y: 1, halfWidth: 0.4, height: 2 }), solid: a, left: 0.4, right: 0.4 };
    const other: SolidAgent = { id: 2, body: createBody({ x: 5.2, y: 1, halfWidth: 0.5, height: 2 }), solid: b, left: 0.5, right: 0.5 };
    resolveSolids([ghost, other], map, C, DT);
    assert.equal(ghost.body.x, 5);
    assert.equal(other.body.x, 5.2);
  });

  test('重复 id fail-fast', () => {
    const s = createSolid(C.pelican);
    const a: SolidAgent = { id: 1, body: createBody({ x: 5, y: 1, halfWidth: 0.4, height: 2 }), solid: s, left: 0.4, right: 0.4 };
    assert.throws(() => resolveSolids([a, a], map, C, DT), /duplicate agent id 1/);
  });
});

// ---------- 水平 ----------

describe('水平阻挡与推动', () => {
  test('走向假人被挡住，不穿过；可缓慢推动（远慢于跑速）', () => {
    const w = flat(5, 12);
    settle(w);
    const p = getPlayer(w);
    const d = dummy(w);
    const d0 = d.body.x;
    steps(w, 150, { moveX: 1, runHeld: true }, (w) => assertNoOverlap(w, '走路'));
    assert.ok(p.body.x < d.body.x, '始终在假人左侧');
    assert.ok(d.body.x > d0 + 0.05, `假人被推动（${(d.body.x - d0).toFixed(3)}）`);
    const pushSpeed = (d.body.x - d0) / (150 * DT);
    assert.ok(pushSpeed < P.runSpeed * 0.35, `推动速度 ${pushSpeed.toFixed(2)} 远慢于跑速`);
    assert.equal(p.solid?.contact, 1, '鹈鹕记录右侧实体接触');
    assert.equal(d.solid?.contact, -1);
    assert.ok(Math.abs(p.body.vx) < P.runSpeed * 0.5, '指向假人的速度被吸收');
  });

  test('质量比：推不动（pushable=false）< 重 < 轻', () => {
    const pushed = (t: Tuning): number => {
      const w = flat(5, 12, 40, t);
      settle(w);
      const d = dummy(w);
      const d0 = d.body.x;
      steps(w, 120, { moveX: 1, runHeld: true }, (w) => assertNoOverlap(w, '质量比'));
      return d.body.x - d0;
    };
    const fixed = pushed(withSolid('dummy', { pushable: false }));
    const heavy = pushed(TUNING);
    const light = pushed(withSolid('dummy', { mass: 1 }));
    assert.equal(fixed, 0);
    assert.ok(heavy > 0 && light > heavy * 2, `heavy=${heavy.toFixed(3)} light=${light.toFixed(3)}`);
  });

  test('把假人推到墙边：假人不进墙，鹈鹕也不重叠', () => {
    const w = flat(14, 17, 20, withSolid('dummy', { mass: 1 }));
    settle(w);
    const d = dummy(w);
    steps(w, 200, { moveX: 1, runHeld: true }, (w) => assertNoOverlap(w, '推墙'));
    assert.ok(d.body.x + d.body.halfWidth <= 19 + 1e-6, `假人右沿 ${d.body.x + d.body.halfWidth} 不进墙`);
    assert.ok(Math.abs(d.body.x + d.body.halfWidth - 19) < 1e-3, '假人贴墙');
  });

  test('初始重叠（生成在一起）以有限速度分离，不瞬移', () => {
    const w = world(level(30, 10, [{ x: 10, y: 1, ch: 'D' }, { x: 5, y: 1, ch: 'P' }]));
    // 同格无法放两个标记：手动把鹈鹕放到与假人重叠的位置（同脚底）。
    const p = getPlayer(w);
    const d = dummy(w);
    p.body.x = d.body.x + 0.1;
    p.body.prevX = p.body.x;
    p.body.y = d.body.y;
    p.body.prevY = p.body.y;
    let gap = p.body.x - d.body.x;
    const limit = C.separateSpeed * DT + 1e-6;
    let ticks = 0;
    while (overlapArea(p, d) > 1e-4 && ticks < 120) {
      step(w);
      const g = p.body.x - d.body.x;
      assert.ok(g - gap <= limit, `tick ${w.tick} 分离 ${(g - gap).toFixed(4)} ≤ ${limit.toFixed(4)}`);
      assert.ok(g >= gap - 1e-9, '只会分开不会靠近');
      gap = g;
      ticks++;
    }
    assert.ok(ticks > 5 && ticks < 120, `${ticks} tick 内分离完毕（渐进）`);
  });
});

// ---------- 竖直 ----------

describe('站在假人头上', () => {
  /** 鹈鹕出生在假人正上方空中。 */
  function above(tuning: Tuning = TUNING): SimWorld {
    return world(level(30, 14, [{ x: 10, y: 1, ch: 'D' }, { x: 10, y: 7, ch: 'P' }]), tuning);
  }

  test('从上方落下站在头上：onGround、idle、supportId；可起跳', () => {
    const w = above();
    steps(w, 60);
    const p = getPlayer(w);
    const d = dummy(w);
    assert.ok(Math.abs(p.body.y - (d.body.y + d.body.height)) < 1e-6, `脚底 ${p.body.y} = 头顶 ${d.body.y + d.body.height}`);
    assert.equal(p.body.onGround, true);
    assert.equal(p.pelican?.state, 'idle');
    assert.equal(p.solid?.supportId, d.id);
    step(w, { jumpPressed: true, jumpHeld: true });
    assert.ok(Math.abs(p.body.vy - (jumpVelocity(TUNING.physics.gravity, P.jumpHeight) - TUNING.physics.gravity * DT)) < 1e-6, `起跳 vy=${p.body.vy}`);
    assert.equal(p.solid?.supportId, null);
  });

  test('在头上随假人水平移动与下落', () => {
    const w = above();
    steps(w, 60);
    const p = getPlayer(w);
    const d = dummy(w);
    const off = p.body.x - d.body.x;
    d.body.vx = 4; // 模拟被击退滑动
    for (let i = 0; i < 20; i++) {
      step(w);
      assert.ok(Math.abs(p.body.x - d.body.x - off) < 1e-6, `tick ${w.tick} 随动偏移 ${p.body.x - d.body.x}`);
      assert.equal(p.body.onGround, true);
    }
    // 假人被抛起后落下：鹈鹕一直站在头上。
    d.body.vy = 6;
    d.body.onGround = false;
    steps(w, 60, {}, () => assert.ok(overlapArea(p, d) < 1e-4));
    assert.ok(Math.abs(p.body.y - (d.body.y + d.body.height)) < 1e-6);
    assert.equal(p.solid?.supportId, d.id);
  });

  test('走下头顶边缘有土狼时间', () => {
    const w = above();
    steps(w, 60);
    const p = getPlayer(w);
    let airTick = -1;
    for (let i = 0; i < 60 && airTick < 0; i++) {
      step(w, { moveX: 1, runHeld: true });
      if (!p.body.onGround) airTick = w.tick;
    }
    assert.ok(airTick > 0, '已走下边缘');
    assert.ok((p.pelican?.coyoteTicks ?? 0) > 0, '离开头顶后有土狼时间');
    step(w, { moveX: 1, runHeld: true, jumpPressed: true, jumpHeld: true });
    assert.ok(p.body.vy > 5, `土狼时间内起跳 vy=${p.body.vy}`);
  });

  test('不可站立（standable=false）时从上方落下被侧向挤开', () => {
    const w = above(withSolid('dummy', { standable: false }));
    steps(w, 120, {}, (w) => assertNoOverlap(w, '不可站立'));
    const p = getPlayer(w);
    assert.ok(Math.abs(p.body.y - 1) < 1e-6, '最终落到地面');
  });

  test('飞行/滑翔：空中被挡，滑翔降落到头上', () => {
    const w = world(level(40, 20, [{ x: 16, y: 1, ch: 'D' }, { x: 8, y: 5, ch: 'P' }]));
    const p = getPlayer(w);
    steps(w, 2);
    // 先起飞到一定高度，再朝假人滑翔下降。
    step(w, { jumpPressed: true, jumpHeld: true });
    steps(w, 50, { jumpHeld: true });
    let landed = false;
    for (let i = 0; i < 400 && !landed; i++) {
      const d = dummy(w);
      const dx = d.body.x - p.body.x;
      step(w, { moveX: dx > 0.2 ? 1 : dx < -0.2 ? -1 : 0 });
      assertNoOverlap(w, '滑翔');
      landed = p.solid?.supportId === d.id;
    }
    assert.ok(landed, '滑翔降落到假人头上');
    assert.equal(p.body.onGround, true);
    // 低空飞行横撞：保持在假人身高范围内向右飞，被挡住。
    const w2 = world(level(40, 20, [{ x: 16, y: 1, ch: 'D' }, { x: 8, y: 1, ch: 'P' }]));
    const p2 = getPlayer(w2);
    settle(w2);
    step(w2, { jumpPressed: true, jumpHeld: true, moveX: 1, runHeld: true });
    steps(w2, 120, { moveX: 1, runHeld: true, jumpHeld: false }, (w) => assertNoOverlap(w, '低空'));
    assert.ok(p2.body.x < dummy(w2).body.x, '没有穿过');
  });
});

// ---------- 水中 / 击退 ----------

describe('水中与击退', () => {
  test('游泳同样被挡', () => {
    const rows = level(30, 10, [{ x: 14, y: 1, ch: 'D' }, { x: 6, y: 1, ch: 'P' }], 1, (g) => {
      for (let ty = 1; ty <= 4; ty++) for (let tx = 1; tx <= 28; tx++) (g[ty] as string[])[tx] = '~';
    });
    const w = world(rows);
    steps(w, 60);
    const p = getPlayer(w);
    assert.equal(p.pelican?.inWater, true);
    steps(w, 180, { moveX: 1, runHeld: true }, (w) => assertNoOverlap(w, '游泳'));
    assert.ok(p.body.x < dummy(w).body.x);
  });

  test('啄击击退：命中照旧，之后不穿透', () => {
    const w = flat(10, 12);
    settle(w);
    const d = dummy(w);
    const hp0 = d.health?.hp ?? 0;
    step(w, { attackPressed: true, attackSource: 'keyboard' });
    const events: SimEvent[] = [];
    steps(w, 90, {}, (w) => {
      events.push(...w.events.drain());
      assertNoOverlap(w, '击退');
    });
    assert.ok(events.some((e) => e.type === 'hit' && e.targetId === d.id), '啄击命中');
    assert.ok((d.health?.hp ?? 0) < hp0);
  });

  test('击退把假人推向贴墙的鹈鹕：不穿透、不卡住、鹈鹕不进墙', () => {
    const w = flat(1, 4, 20);
    settle(w);
    const p = getPlayer(w);
    const d = dummy(w);
    d.body.vx = -12;
    d.body.vy = 3;
    d.body.onGround = false;
    steps(w, 60, {}, (w) => assertNoOverlap(w, '推向鹈鹕'));
    assert.ok(p.body.x - p.body.halfWidth >= 1 - 1e-6, `鹈鹕左沿 ${p.body.x - p.body.halfWidth} 不进墙`);
    assert.ok(d.body.x > p.body.x);
  });
});

// ---------- 骑车 ----------

describe('骑车撞实体', () => {
  function mountAndRide(w: SimWorld, max: number, each: (w: SimWorld) => void = () => {}): DismountEvent[] {
    settle(w);
    step(w, { mountPressed: true });
    steps(w, P.bike.mountTicks);
    assert.equal(getPlayer(w).pelican?.ride.mode, 'riding');
    const out: DismountEvent[] = [];
    for (let i = 0; i < max; i++) {
      step(w, { moveX: 1, runHeld: true });
      each(w);
      for (const e of w.events.drain()) if (e.type === 'dismount') out.push(e);
      if (out.length > 0) break;
    }
    return out;
  }

  test('高速撞假人 → crash 下车并弹开', () => {
    const w = flat(3, 40, 60);
    let maxSpeed = 0;
    const ev = mountAndRide(w, 400, (w) => {
      maxSpeed = Math.max(maxSpeed, getPlayer(w).pelican?.ride.preMoveVx ?? 0);
    });
    const p = getPlayer(w);
    assert.equal(ev[0]?.cause, 'crash');
    assert.ok(maxSpeed >= P.bike.crashSpeed);
    assert.ok(p.body.vx < 0 && p.body.vy > 0, '弹开');
    assert.equal(p.pelican?.ride.lockTicks, P.bike.crashLockTicks);
    const front = p.body.x + P.bike.bumperReach;
    assert.ok(front <= dummy(w).body.x - dummy(w).body.halfWidth + 1e-3, '车头没有插进假人');
  });

  test('低速被挡住：不下车，车头顶住', () => {
    const w = flat(5, 8, 40, withSolid('dummy', { pushable: false }));
    const ev = mountAndRide(w, 120);
    const p = getPlayer(w);
    const d = dummy(w);
    assert.deepEqual(ev, [], '没有下车');
    assert.equal(p.pelican?.ride.mode, 'riding');
    assert.ok(Math.abs(p.body.x + P.bike.bumperReach - (d.body.x - d.body.halfWidth)) < 1e-3, '车头贴住假人');
    assert.equal(p.solid?.contact, 1);
  });
});

// ---------- 层 / 鱼 / 确定性 ----------

describe('层、鱼与确定性', () => {
  test('鱼与光球没有碰撞组件；mask 排除时直接穿过', () => {
    const w = world(level(30, 10, [{ x: 12, y: 1, ch: 'D' }, { x: 5, y: 1, ch: 'P' }], 1, (g) => {
      for (let tx = 18; tx <= 24; tx++) for (let ty = 1; ty <= 3; ty++) (g[ty] as string[])[tx] = '~';
    }));
    for (const f of w.fish.fish) assert.equal('solid' in f, false);
    step(w, { shootPressed: true, shootHeld: true });
    // 任务 018：默认武器为嘴囊喷水（windup 后出手）。
    steps(w, TUNING.weapons.water.windupTicks);
    const orb = w.entities.find((e) => e.projectile);
    assert.ok(orb, '已发射投射物');
    assert.equal(orb.solid, undefined);

    const ghost = flat(5, 12, 40, withSolid('pelican', { mask: 0 }));
    settle(ghost);
    steps(ghost, 120, { moveX: 1, runHeld: true });
    assert.ok(getPlayer(ghost).body.x > dummy(ghost).body.x + 1, 'mask=0 时穿过假人');
  });

  test('结果与实体插入顺序无关', () => {
    const make = (reverse: boolean): SimWorld => {
      const w = world(level(30, 12, [{ x: 10, y: 1, ch: 'D' }, { x: 11, y: 1, ch: 'D' }, { x: 9, y: 1, ch: 'P' }]));
      // 三者初始挤在一起（假人互相也碰撞）。
      const [a, b] = dummies(w) as [Entity, Entity];
      b.body.x = a.body.x + 0.3;
      b.body.prevX = b.body.x;
      getPlayer(w).body.x = a.body.x - 0.2;
      getPlayer(w).body.prevX = getPlayer(w).body.x;
      if (reverse) w.entities.reverse();
      return w;
    };
    const w1 = make(false);
    const w2 = make(true);
    const snap = (w: SimWorld) =>
      [...w.entities].sort((p, q) => p.id - q.id).map((e) => [e.id, e.body.x, e.body.y, e.body.vx, e.body.vy, e.solid?.contact, e.solid?.supportId]);
    for (let i = 0; i < 120; i++) {
      const input = { moveX: (i % 40 < 25 ? 1 : -1) as 1 | -1, jumpPressed: i === 50, jumpHeld: i >= 50 && i < 60 };
      step(w1, input);
      step(w2, input);
      assert.deepEqual(snap(w1), snap(w2), `tick ${i} 一致`);
    }
    const [a, b] = dummies(w1) as [Entity, Entity];
    assert.ok(overlapArea(a, b) < 1e-4, '假人之间也已分开');
  });
});

// ---------- 接触伤害接口 ----------

describe('contactDamage 接口（默认不启用）', () => {
  const cd: ContactDamageTuning = { hit: { id: 'touch', damage: 5, knockback: { x: 4, y: 3 }, hitstun: 6, hitstop: 0 }, invulnTicks: 30, margin: 0.05 };

  test('默认：撞假人不受伤', () => {
    const w = flat(5, 12);
    settle(w);
    steps(w, 120, { moveX: 1, runHeld: true });
    assert.equal(getPlayer(w).health?.hp, P.maxHp);
  });

  test('启用后：接触即命中、背离击退、无敌帧限制频率', () => {
    const w = flat(5, 12, 40, withSolid('dummy', { contactDamage: cd }));
    settle(w);
    const p = getPlayer(w);
    const hits: { tick: number; ev: HitEvent }[] = [];
    let knockedLeft = false;
    for (let i = 0; i < 150; i++) {
      step(w, { moveX: 1, runHeld: true });
      for (const e of w.events.drain()) {
        if (e.type === 'hit' && e.targetId === p.id) {
          hits.push({ tick: w.tick, ev: e });
          if (p.body.vx < 0) knockedLeft = true;
        }
      }
    }
    assert.ok(hits.length >= 2, `命中 ${hits.length} 次`);
    assert.ok(knockedLeft, '击退背离假人');
    for (let i = 1; i < hits.length; i++) assert.ok((hits[i]?.tick ?? 0) - (hits[i - 1]?.tick ?? 0) >= cd.invulnTicks, '无敌帧内不重复命中');
    assert.equal(p.health?.hp, P.maxHp - cd.hit.damage * hits.length);
    assert.ok(hits.every((h) => h.ev.attackerId === dummy(w).id));
  });
});
