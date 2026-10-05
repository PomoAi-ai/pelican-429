// 013 追加：出生点在渔屋陆侧门外的平整地面（面朝门）、假人在更远处空地；多 seed 成立、确定性。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING } from '../src/config/tuning.ts';
import { createSimWorld } from '../src/sim/sim-world.ts';
import type { FishingHut } from '../src/world/level.ts';
import { reachableCells } from '../src/world/reachability.ts';
import { HOME_DUMMY_MAX, HOME_DUMMY_MIN, HOME_SPAWN_DOOR_MAX, HOME_SPAWN_DUMMY_GAP, pickHomeHut, planHomeSpawn } from '../src/world/spawn-home.ts';
import { SHAPE_FULL, shapeTopAt } from '../src/world/tile-shapes.ts';
import { HUT_YARD_FLAT } from '../src/world/structures.ts';
import { generateWorld } from '../src/world/worldgen.ts';
import { SPAWN_BODY, WALK_REACH } from '../src/world/worldgen-verify.ts';

const CFG = TUNING.worldgen;

function bodyInSolid(w: ReturnType<typeof generateWorld>, x: number, y: number): boolean {
  for (let ty = Math.floor(y); ty < Math.ceil(y + SPAWN_BODY.height); ty++) {
    for (let tx = Math.floor(x - SPAWN_BODY.halfWidth); tx <= Math.floor(x + SPAWN_BODY.halfWidth - 1e-9); tx++) if (w.map.collisionAt(tx, ty) === 'solid') return true;
  }
  return false;
}

describe('spawn-home：出生在渔屋门外', () => {
  test('默认 seed + 30 seed：出生点在家（离中心最近的渔屋）陆侧门外 1–3 列的平整地面（整砖、两侧齐平）、不嵌墙、面朝门；假人在更远处、间距 ≥ 4、可走到', () => {
    for (const seed of [CFG.seed, ...Array.from({ length: 30 }, (_, i) => i + 1)]) {
      const w = generateWorld(seed, CFG);
      const home = pickHomeHut(w.structures, CFG.width);
      const sp = w.spawn;
      const landFace = home.lakeSide === 1 ? home.x0 - 1 : home.x1 + 1;
      const out = -home.lakeSide; // 指向陆侧（远离渔屋）
      const sd = (Math.floor(sp.x) - landFace) * out;
      assert.ok(sd >= 0 && sd < HOME_SPAWN_DOOR_MAX, `seed ${seed}: spawn ${sd} columns beyond the landward door`);
      assert.equal(sp.y, home.floorY, `seed ${seed}: spawn on the ground level of the door`);
      // 平整：脚下及左右邻列顶面都与出生点齐平、整砖实心（无孤立台阶、无斜坡）。
      const sx = Math.floor(sp.x);
      assert.equal(w.map.shapeAt(sx, sp.y - 1), SHAPE_FULL, `seed ${seed}: full brick under the spawn`);
      for (const tx of [sx - 1, sx, sx + 1]) {
        assert.equal(w.map.collisionAt(tx, sp.y - 1), 'solid', `seed ${seed}: ground under column ${tx}`);
        assert.equal(w.map.collisionAt(tx, sp.y), 'none', `seed ${seed}: column ${tx} level with the spawn`);
        // 邻列贴着出生列的边满高（整砖或向外下降的斜坡）：出生列两侧没有台阶。
        if (tx !== sx) assert.equal(shapeTopAt(w.map.shapeAt(tx, sp.y - 1), tx < sx ? 1 : 0), 1, `seed ${seed}: step beside the spawn at ${tx}`);
      }
      assert.equal(bodyInSolid(w, sp.x, sp.y), false, `seed ${seed}: spawn body in solid`);
      // 门前院子（门外 HUT_YARD_FLAT 列）与地板齐平。
      for (let k = 0; k < HUT_YARD_FLAT; k++) {
        const tx = landFace + out * k;
        assert.ok(w.map.collisionAt(tx, home.floorY - 1) === 'solid' && w.map.collisionAt(tx, home.floorY) === 'none', `seed ${seed}: yard column ${tx} level with the floor`);
      }
      assert.equal(w.spawnFacing, home.lakeSide, `seed ${seed}: facing the door (hut and lake side)`);
      const d = w.dummies[0]!;
      const dist = (Math.floor(d.x) - landFace) * -home.lakeSide;
      assert.ok(dist >= HOME_DUMMY_MIN - 1 && dist < HOME_DUMMY_MAX, `seed ${seed}: dummy ${dist} beyond the door`);
      // 假人在出生点更远的一侧（不挡出生点与门之间的路线），间距 ≥ HOME_SPAWN_DUMMY_GAP。
      assert.ok((d.x - sp.x) * out >= HOME_SPAWN_DUMMY_GAP, `seed ${seed}: dummy ${d.x} vs spawn ${sp.x}`);
      assert.equal(w.map.collisionAt(Math.floor(d.x), d.y - 1), 'solid');
      assert.equal(bodyInSolid(w, d.x, d.y), false, `seed ${seed}: dummy body in solid`);
      const reach = reachableCells(w.map, { x: Math.floor(sp.x), y: sp.y }, WALK_REACH);
      assert.ok(reach.has(Math.floor(d.x), d.y), `seed ${seed}: dummy reachable on foot`);
      // 假人附近无树枝平台（禁树带随出生点迁移）。
      for (const t of w.trees) assert.ok(Math.abs(t.x - d.x) > 2, `seed ${seed}: tree at ${t.x} next to the dummy`);
    }
  });

  test('参数：门外列数与假人间距', () => {
    assert.ok(HOME_SPAWN_DOOR_MAX >= 1 && HOME_SPAWN_DOOR_MAX <= 3);
    assert.ok(HOME_SPAWN_DUMMY_GAP >= 4);
  });

  test('确定性：同 seed 两次生成出生点、朝向、假人一致', () => {
    const a = generateWorld(17, CFG);
    const b = generateWorld(17, CFG);
    assert.deepEqual([a.spawn, a.spawnFacing, a.dummies], [b.spawn, b.spawnFacing, b.dummies]);
  });

  test('模拟世界：鹈鹕在出生点、面朝门（湖侧）', () => {
    const level = generateWorld(CFG.seed, CFG);
    const sim = createSimWorld({ level });
    const p = sim.entities.find((e) => e.id === sim.playerId)!;
    assert.deepEqual([p.body.x, p.body.y], [level.spawn.x, level.spawn.y]);
    assert.equal(p.facing, level.spawnFacing);
  });

  test('hutCount=0：退回中央草甸出生（显式配置，非静默降级）；pickHomeHut 空列表即抛', () => {
    const w = generateWorld(CFG.seed, { ...CFG, hutCount: 0 });
    const sx = Math.floor(CFG.width / 2);
    assert.deepEqual(w.spawn, { x: sx + 0.5, y: w.surface[sx] });
    assert.equal(w.spawnFacing, undefined);
    assert.throws(() => pickHomeHut([], 100), /no fishing hut/);
  });

  test('多座渔屋时取离地图中心最近的一座', () => {
    const w = generateWorld(CFG.seed, { ...CFG, hutCount: 2 });
    const mid = CFG.width / 2;
    const home = pickHomeHut(w.structures, CFG.width);
    for (const h of w.structures) assert.ok(Math.abs((home.x0 + home.x1 + 1) / 2 - mid) <= Math.abs((h.x0 + h.x1 + 1) / 2 - mid));
    const plan = planHomeSpawn(w.structures, w.map);
    assert.equal(plan.hut.id, home.id);
    assert.deepEqual(plan.spawn, w.spawn);
    const fake = { ...home, x0: home.x0 } as FishingHut;
    assert.equal(pickHomeHut([fake], CFG.width), fake);
  });
});
