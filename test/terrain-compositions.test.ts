import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TERRAIN_COMPOSITIONS } from '../src/config/terrain-compositions.ts';
import { TUNING } from '../src/config/tuning.ts';
import { bodyRect, createBody } from '../src/physics/body.ts';
import { moveAndCollide, overlapsSolid } from '../src/physics/tile-collision.ts';
import { createTerrainCompositionLevel } from '../src/world/terrain-compositions.ts';
import { stepFluid } from '../src/world/fluid-sim.ts';

const DT = 1 / 60;
const playerAt = (x: number, y: number) => createBody({ x, y, halfWidth: TUNING.player.halfWidth, height: TUNING.player.height, stepUp: TUNING.player.stepUp, groundSnap: TUNING.player.groundSnap });

test('组合关卡在两种环境中确定生成，出生角色保持落地且不与地形重叠', () => {
  for (const composition of TERRAIN_COMPOSITIONS) for (const environment of ['surface', 'underground'] as const) {
    const first = createTerrainCompositionLevel(composition.id, 429, 'grass', environment);
    const second = createTerrainCompositionLevel(composition.id, 429, 'grass', environment);
    const a = first.level;
    const b = second.level;
    try {
      for (let y = 0; y < a.map.height; y++) for (let x = 0; x < a.map.width; x++) {
        assert.equal(a.map.get(x, y), b.map.get(x, y));
        assert.equal(a.map.shapeAt(x, y), b.map.shapeAt(x, y));
      }
      assert.deepEqual(a.trees, b.trees);
      assert.deepEqual(a.fluid.cells, b.fluid.cells);
      assert.deepEqual(a.caves, b.caves);
      const body = playerAt(a.spawn.x, a.spawn.y);
      assert.equal(overlapsSolid(bodyRect(body), a.map), false);
      for (let tick = 0; tick < 90; tick++) {
        body.vy -= 70 * DT;
        moveAndCollide(body, a.map, DT);
      }
      assert.equal(body.onGround, true, `${composition.id}/${environment}`);
      assert.ok(Math.abs(body.y - a.spawn.y) < 0.001, `${composition.id}/${environment}: spawn ${body.y}`);
    } finally { a.fluid.dispose(); b.fluid.dispose(); }
  }
});

test('正式角色碰撞体不跳跃即可走完整格半格阶梯并返回地面', () => {
  const { level, groundY } = createTerrainCompositionLevel('terraces', 429, 'grass', 'surface');
  try {
    const body = playerAt(level.spawn.x, level.spawn.y);
    let high = body.y;
    for (let tick = 0; tick < 300; tick++) {
      body.vx = 4;
      body.vy -= 70 * DT;
      moveAndCollide(body, level.map, DT);
      high = Math.max(high, body.y);
    }
    assert.ok(body.x > level.spawn.x + 19, `stalled at ${body.x}`);
    assert.ok(Math.abs(high - (groundY + 2)) < 0.001, `missed raised terrace: ${high}`);
    assert.ok(Math.abs(body.y - groundY) < 0.001, `did not descend: ${body.y}`);
    assert.equal(body.onGround, true);
  } finally { level.fluid.dispose(); }
});

test('角色下坡进入盲洞并原路返回，厚顶盖通过右壁连到地基', () => {
  const { level, groundY, frame } = createTerrainCompositionLevel('cave', 429, 'grass', 'surface');
  try {
    const body = playerAt(level.spawn.x, level.spawn.y);
    let lowest = body.y;
    for (let tick = 0; tick < 140; tick++) {
      body.vx = 4;
      body.vy -= 70 * DT;
      moveAndCollide(body, level.map, DT);
      lowest = Math.min(lowest, body.y);
    }
    assert.ok(body.x > frame.x, `blocked before central chamber at ${body.x}`);
    assert.equal(overlapsSolid(bodyRect(body), level.map), false);
    assert.ok(Math.abs(lowest - (groundY - 3)) < 0.001, `did not enter underground passage: ${lowest}`);
    assert.ok(Math.abs(body.y - (groundY - 3)) < 0.001, `not standing on chamber floor: ${body.y}`);
    for (let y = groundY - 4; y < groundY + 4; y++) {
      assert.equal(level.map.collisionAt(frame.x + 3, y), 'solid', `broken supporting wall at y=${y}`);
    }
    for (let x = frame.x - 2; x <= frame.x + 2; x++) for (let y = groundY + 1; y < groundY + 4; y++) {
      assert.equal(level.map.collisionAt(x, y), 'solid', `broken cap at ${x},${y}`);
    }
    assert.ok(level.caves.mask[(groundY - 1) * level.map.width + frame.x]! > 0);
    for (let tick = 0; tick < 140; tick++) {
      body.vx = -4;
      body.vy -= 70 * DT;
      moveAndCollide(body, level.map, DT);
      assert.equal(overlapsSolid(bodyRect(body), level.map), false);
    }
    assert.ok(Math.abs(body.x - level.spawn.x) < 0.001, `did not return through entrance: ${body.x}`);
    assert.ok(Math.abs(body.y - groundY) < 0.001, `did not climb out: ${body.y}`);
  } finally { level.fluid.dispose(); }
});

test('地下不同树高的全部平台都能容纳站立角色，不穿入石顶', () => {
  for (const seed of [429, 430, 431, 432]) {
    const { level } = createTerrainCompositionLevel('roots', seed, 'grass', 'underground');
    try {
      for (const tree of level.trees) for (const platform of tree.platforms) {
        const body = playerAt((platform.x0 + platform.x1 + 1) / 2, platform.ty + 1);
        assert.equal(overlapsSolid(bodyRect(body), level.map), false, `seed=${seed}, platform y=${platform.ty}`);
        for (let tick = 0; tick < 30; tick++) {
          body.vy -= 70 * DT;
          moveAndCollide(body, level.map, DT);
        }
        assert.equal(body.onGround, true);
        assert.ok(Math.abs(body.y - (platform.ty + 1)) < 0.001);
        assert.equal(overlapsSolid(bodyRect(body), level.map), false);
      }
    } finally { level.fluid.dispose(); }
  }
});

test('浅水盆在液体模拟后保持水量和盆内范围，水不穿入地形', () => {
  const { level } = createTerrainCompositionLevel('pond', 431, 'sand', 'surface');
  try {
    const mass = level.fluid.totalMass();
    assert.ok(mass > 0);
    for (let tick = 0; tick < 120; tick++) stepFluid(level.fluid, { maxCellsPerStep: 4096, minSpread: 2 }, tick);
    assert.equal(level.fluid.totalMass(), mass);
    assert.equal(level.fluid.lostMass, 0);
    const lake = level.lakes[0]!;
    for (let y = 0; y < level.map.height; y++) for (let x = 0; x < level.map.width; x++) {
      if (level.fluid.amountAt(x, y) === 0) continue;
      assert.ok(x >= lake.x0 && x <= lake.x1 && y < lake.level, `leak at ${x},${y}`);
      assert.notEqual(level.map.collisionAt(x, y), 'solid');
    }
  } finally { level.fluid.dispose(); }
});
