import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TERRAIN_COMPOSITIONS } from '../src/config/terrain-compositions.ts';
import { TUNING } from '../src/config/tuning.ts';
import { WORLDGEN_RULES } from '../src/config/worldgen-rules.ts';
import { bodyRect, createBody } from '../src/physics/body.ts';
import { moveAndCollide, overlapsSolid } from '../src/physics/tile-collision.ts';
import { stepFluid } from '../src/world/fluid-sim.ts';
import { SHAPE_HALF, SHAPE_SLOPE_L, SHAPE_SLOPE_R } from '../src/world/tile-shapes.ts';
import { TILE_ROOF } from '../src/world/tile-types.ts';
import { createTerrainCompositionLevel } from '../src/world/terrain-compositions.ts';
import { generateWorld } from '../src/world/worldgen.ts';
import { compositionSpan } from '../src/world/worldgen-compositions.ts';
import type { GeneratedWorld } from '../src/world/worldgen.ts';
import type { WorldComposition } from '../src/world/worldgen-compositions.ts';
import { floaterMask } from './helpers/cave-island.ts';

const CFG = TUNING.worldgen;
const DT = 1 / 60;
const playerAt = (x: number, y: number) => createBody({ x, y, halfWidth: TUNING.player.halfWidth, height: TUNING.player.height, stepUp: TUNING.player.stepUp, groundSnap: TUNING.player.groundSnap });
const sample = generateWorld(CFG.seed, CFG);

function required(kind: WorldComposition['kind']): WorldComposition {
  const composition = sample.compositions.find((c) => c.kind === kind);
  assert.ok(composition, `normal world is missing ${kind}`);
  return composition;
}

function shapeSnapshot(world: GeneratedWorld): Uint8Array {
  return Uint8Array.from({ length: world.map.width * world.map.height }, (_, i) => world.map.shapeAt(i % world.map.width, Math.floor(i / world.map.width)));
}

test('普通世界实际包含全部八种组合，同种子复现地形和布局，换种子改变布局', () => {
  assert.deepEqual(new Set(sample.compositions.map((c) => c.kind)), new Set(TERRAIN_COMPOSITIONS.map((c) => c.id)));
  const again = generateWorld(CFG.seed, CFG);
  const other = generateWorld(CFG.seed + 1, CFG);
  try {
    assert.deepEqual(again.compositions, sample.compositions);
    assert.deepEqual(shapeSnapshot(again), shapeSnapshot(sample));
    assert.deepEqual(again.fluid.cells, sample.fluid.cells);
    assert.deepEqual(again.trees, sample.trees);
    assert.notDeepEqual(other.compositions, sample.compositions);
  } finally { again.fluid.dispose(); other.fluid.dispose(); }
});

test('随机地形与展示关卡逐格共享碰撞轮廓，组合及连接带不覆盖出生地、建筑或其他组合', () => {
  const floating = floaterMask(sample);
  const sx = Math.floor(CFG.width / 2);
  const meadowMargin = CFG.spawnHalfWidth + WORLDGEN_RULES.SPAWN_RAMP;
  for (const composition of sample.compositions) {
    const [lo, hi] = compositionSpan(composition);
    assert.ok(hi < sx - meadowMargin || lo > sx + meadowMargin, `${composition.kind}: central meadow`);
    assert.ok(sample.spawn.x < lo || sample.spawn.x > hi, `${composition.kind}: player spawn`);
    for (const hut of sample.structures) {
      const hutLo = Math.min(hut.roofX0, hut.pierX0);
      const hutHi = Math.max(hut.roofX1, hut.pierX1);
      assert.ok(hi < hutLo || lo > hutHi, `${composition.kind}: hut ${hut.id}`);
    }
    for (const other of sample.compositions) {
      if (other === composition) continue;
      const [otherLo, otherHi] = compositionSpan(other);
      assert.ok(hi < otherLo || lo > otherHi, `${composition.kind}/${other.kind}: overlap`);
    }
    for (const lake of sample.lakes) {
      if (composition.kind === 'pond' && lake.x0 >= lo && lake.x1 <= hi) continue;
      assert.ok(hi < lake.x0 - 1 || lo > lake.x1 + 1, `${composition.kind}: existing water body`);
    }
    const preview = createTerrainCompositionLevel(composition.kind, CFG.seed, 'grass', 'surface');
    try {
      const previewLeft = preview.frame.x - 10;
      for (let x = composition.x0; x <= composition.x1; x++) for (let y = composition.baseY - 4; y <= composition.baseY + 6; y++) {
        if (floating[y * sample.map.width + x] === 1) continue;
        const px = previewLeft + x - composition.x0;
        const py = preview.groundY + y - composition.baseY;
        const solid = sample.map.collisionAt(x, y) === 'solid';
        const at = `${composition.kind} ${x},${y}`;
        assert.equal(solid, preview.level.map.collisionAt(px, py) === 'solid', `${at}: collision`);
        if (solid) assert.equal(sample.map.shapeAt(x, y), preview.level.map.shapeAt(px, py), `${at}: shape`);
      }
    } finally { preview.level.fluid.dispose(); }
  }
});

test('普通世界中的半格台阶可步行穿越，盲洞可下坡进入并原路返回，树平台可站立', () => {
  for (const kind of ['terraces', 'cave'] as const) {
    const c = required(kind);
    const body = playerAt(c.x0 + 1.5, c.baseY);
    let high = body.y;
    let low = body.y;
    const ticks = kind === 'terraces' ? 300 : 140;
    for (let tick = 0; tick < ticks; tick++) {
      body.vx = 4;
      body.vy -= 70 * DT;
      moveAndCollide(body, sample.map, DT);
      high = Math.max(high, body.y);
      low = Math.min(low, body.y);
      assert.equal(overlapsSolid(bodyRect(body), sample.map), false, `${kind}: collision at ${body.x}`);
    }
    assert.ok(body.x > c.x0 + (kind === 'terraces' ? 20 : 10), `${kind}: stalled at ${body.x}`);
    assert.ok(Math.abs((kind === 'terraces' ? high : low) - (c.baseY + (kind === 'terraces' ? 2 : -3))) < 0.001);
    if (kind === 'cave') {
      for (let tick = 0; tick < ticks; tick++) {
        body.vx = -4;
        body.vy -= 70 * DT;
        moveAndCollide(body, sample.map, DT);
      }
      assert.ok(Math.abs(body.x - (c.x0 + 1.5)) < 0.001);
      assert.ok(Math.abs(body.y - c.baseY) < 0.001);
    }
    assert.equal(body.onGround, true);
  }
  const c = required('roots');
  const tree = sample.trees.find((t) => t.x === c.x0 + 10 && t.baseY === c.baseY + 2);
  assert.ok(tree, 'root slope needs its actual tree');
  assert.ok(tree.platforms.length > 0);
  for (const platform of tree.platforms) {
    const body = playerAt((platform.x0 + platform.x1 + 1) / 2, platform.ty + 1);
    for (let tick = 0; tick < 30; tick++) {
      body.vy -= 70 * DT;
      moveAndCollide(body, sample.map, DT);
    }
    assert.equal(overlapsSolid(bodyRect(body), sample.map), false);
    assert.equal(body.onGround, true);
    assert.ok(Math.abs(body.y - (platform.ty + 1)) < 0.001);
  }
});

test('普通世界浅水盆经过真实液体模拟后保持盆内水量和完整岸壁', () => {
  const world = generateWorld(CFG.seed, CFG);
  try {
    const c = world.compositions.find((item) => item.kind === 'pond');
    assert.ok(c);
    const lake = world.lakes.find((item) => item.x0 >= c.x0 && item.x1 <= c.x1);
    assert.ok(lake);
    const mass = (): number => {
      let amount = 0;
      for (let x = c.x0; x <= c.x1; x++) for (let y: number = c.baseY - 3; y <= c.baseY; y++) amount += world.fluid.amountAt(x, y);
      return amount;
    };
    const before = mass();
    assert.ok(before > 0, 'pond must contain actual water');
    for (let tick = 0; tick < 120; tick++) stepFluid(world.fluid, { maxCellsPerStep: 4096, minSpread: 2 }, tick);
    assert.equal(mass(), before);
    for (let x = c.x0; x <= c.x1; x++) for (let y: number = c.baseY - 3; y <= c.baseY; y++) {
      if (world.fluid.amountAt(x, y) === 0) continue;
      assert.ok(x >= lake.x0 && x <= lake.x1 && y < lake.level, `leak at ${x},${y}`);
      assert.notEqual(world.map.collisionAt(x, y), 'solid');
    }
  } finally { world.fluid.dispose(); }
});

test('低于组合基准面的连接坡也计入形状统计', () => {
  const world = generateWorld(3, CFG);
  try {
    const floating = floaterMask(world);
    let slopes = 0;
    let halves = 0;
    for (let y = 0; y < world.map.height; y++) for (let x = 0; x < world.map.width; x++) {
      if (floating[y * world.map.width + x] === 1 || world.map.get(x, y) === TILE_ROOF) continue;
      const shape = world.map.shapeAt(x, y);
      if (shape === SHAPE_SLOPE_L || shape === SHAPE_SLOPE_R) slopes++;
      if (shape === SHAPE_HALF) halves++;
    }
    assert.equal(world.stats.slopes + world.stats.caves.slopes, slopes);
    assert.equal(world.stats.halves, halves);
  } finally { world.fluid.dispose(); }
});
