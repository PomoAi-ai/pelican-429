// 021 验收修复 A：洞口可骑行。洞口坡道（露天段 + 有顶段）每个车身位置的净空 ≥ 骑行高（verify 同 ride-probe 的车身/前探口径），
// 骑行包络与 tuning 交叉校验，多 seed 用真实 sim 骑车从地表骑到所连洞室不下车。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { CAVE_RULES, rampRideClearance, validateCaveRules } from '../src/config/cave-island-rules.ts';
import { TUNING, validateTuning } from '../src/config/tuning.ts';
import type { Tuning } from '../src/config/tuning.ts';
import { createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim } from '../src/sim/sim-world.ts';
import { entranceRideBlock } from '../src/world/cave-features.ts';
import type { CaveEntrance } from '../src/world/level.ts';
import type { LevelData } from '../src/world/level.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES, TILE_DIRT } from '../src/world/tile-types.ts';
import { SHAPE_FULL, SHAPE_SLOPE_L } from '../src/world/tile-shapes.ts';
import { generateWorld } from '../src/world/worldgen.ts';
import type { GeneratedWorld } from '../src/world/worldgen.ts';

const CFG = TUNING.worldgen;
const SEEDS = [CFG.seed, ...Array.from({ length: 99 }, (_, i) => (i * 2654435761 + 17) >>> 0)];
const BIKE = TUNING.player.bike;

const cache = new Map<number, GeneratedWorld>();
const world = (seed: number): GeneratedWorld => {
  let w = cache.get(seed);
  if (!w) cache.set(seed, (w = generateWorld(seed, CFG)));
  return w;
};

const clone = (): Tuning => structuredClone(TUNING) as Tuning;

/**
 * 真实 sim 骑车：口部外 3 列（站在该列地表上）上车，按住方向键骑下坡道；到坡底列（或从坡面断口落进下方洞穴）后转向所连洞室，
 * 被台阶挡住时跳一下；车速保持在撞墙下车速度以下（玩家正常骑行，撞墙下车是另一条规则）。进入洞室包围盒即成功。
 * 返回失败描述或 null。
 */
function rideIntoCave(level: LevelData, e: CaveEntrance): string | null {
  const w = createSimWorld({ level, tuning: TUNING });
  w.entities.splice(0, w.entities.length, ...w.entities.filter((x) => x.kind === 'pelican'));
  const p = getPlayer(w);
  const b = p.body;
  b.x = e.x + 0.5 - e.dir * 3;
  let ty = e.surfaceY - 3;
  while (level.map.collisionAt(Math.floor(b.x), ty) === 'solid') ty++;
  b.y = ty + 0.01;
  b.vx = 0;
  b.vy = 0;
  p.facing = e.dir;
  for (let i = 0; i < 20; i++) stepSim(w, NEUTRAL_INPUT);
  stepSim(w, { ...NEUTRAL_INPUT, mountPressed: true });
  for (let i = 0; i < BIKE.mountTicks + 10; i++) stepSim(w, NEUTRAL_INPUT);
  const ride = p.pelican!.ride;
  if (ride.mode !== 'riding') return `could not mount at the mouth (mode ${ride.mode})`;
  const room = level.caves.rooms[e.room]!;
  const len = Math.abs(e.innerX - e.x);
  let past = false;
  let stuck = 0;
  let jumpHeld = 0;
  for (let i = 0; i < 2400; i++) {
    const k = (b.x - e.x - 0.5) * e.dir;
    if (!past && b.onGround && (k >= len - 0.5 || b.y < e.surfaceY - Math.max(0, k) - 1.5)) past = true;
    const dir: -1 | 1 = !past ? e.dir : room.cx + 0.5 > b.x ? 1 : -1;
    const coast = Math.abs(b.vx) > BIKE.crashSpeed - 2.5;
    const jump = stuck >= 8 && b.onGround;
    if (jump) {
      stuck = 0;
      jumpHeld = 14;
    }
    stepSim(w, { ...NEUTRAL_INPUT, moveX: coast ? 0 : dir, jumpPressed: jump, jumpHeld: jump || jumpHeld > 0 });
    w.events.drain();
    if (jumpHeld > 0) jumpHeld--;
    if (Math.abs(b.x - (room.cx + 0.5)) <= room.rx + 1 && b.y >= room.cy - room.ry - 1 && b.y <= room.cy + room.ry) return null;
    if (ride.mode !== 'riding') return `dismounted (${ride.cause}) at (${b.x.toFixed(2)},${b.y.toFixed(2)})`;
    stuck = b.onGround && Math.abs(b.vx) < 0.5 ? stuck + 1 : 0;
  }
  return `timed out at (${b.x.toFixed(2)},${b.y.toFixed(2)})`;
}

describe('021 洞口可骑行（验收修复 A）', () => {
  test('骑行包络：45° 坡 + 台阶顶的最小净空 = 洞口高 − 2·半宽 ≥ 骑行高；tuning 骑行高/半宽超出 CAVE_RULES.RIDE 即抛', () => {
    assert.equal(rampRideClearance(5, 0.4), 4.2);
    assert.ok(rampRideClearance(CAVE_RULES.ENTRANCE_HEIGHT.min, CAVE_RULES.RIDE.halfWidth) >= CAVE_RULES.RIDE.height);
    // 旧规则（洞口高 4）车身跨列时只剩 3.2 < 3.3：骑不进去。
    assert.ok(rampRideClearance(4, 0.4) < BIKE.rideHeight);
    assert.throws(() => validateCaveRules({ ...CAVE_RULES, ENTRANCE_HEIGHT: { min: 4, max: 5 } }), /ENTRANCE_HEIGHT/);
    assert.ok(BIKE.rideHeight <= CAVE_RULES.RIDE.height && TUNING.player.halfWidth <= CAVE_RULES.RIDE.halfWidth);
    const tall = clone();
    (tall.player.bike as { rideHeight: number }).rideHeight = CAVE_RULES.RIDE.height + 0.2;
    assert.throws(() => validateTuning(tall), /player\.bike\.rideHeight/);
    const wide = clone();
    (wide.player as { halfWidth: number }).halfWidth = CAVE_RULES.RIDE.halfWidth + 0.05;
    assert.throws(() => validateTuning(wide), /player\.halfWidth/);
  });

  test('verify 口径：旧坡道（洞口高 4、整砖平台列接有顶段）判为不可骑；全斜坡 + 洞口高 5 可骑', () => {
    const build = (h: number, flatAt: number): ReturnType<typeof createTileMap> => {
      // 口部 x=10 地表 30，向右每列降 1，共 10 列；第 4 列起有顶（顶 = 坡面 + h）。
      const map = createTileMap(40, 50, DEFAULT_TILES);
      for (let x = 0; x < 40; x++) for (let y = 0; y < 30; y++) map.set(x, y, TILE_DIRT);
      for (let k = 0; k <= 10; k++) {
        const x = 10 + k;
        const f = 30 - k;
        for (let y = f; y < 30; y++) map.set(x, y, 0);
        if (k >= 4) for (let y = f + h; y < 35; y++) map.set(x, y, TILE_DIRT);
        if (k !== flatAt && k < 10) map.setShape(x, f - 1, SHAPE_SLOPE_L);
      }
      for (let x = 21; x < 30; x++) for (let y = 20; y < 25; y++) map.set(x, y, 0);
      return map;
    };
    const e = { x: 10, dir: 1, surfaceY: 30, height: 4, x0: 10, x1: 20, innerX: 20, innerY: 20, room: 0 } as CaveEntrance;
    const ride = CAVE_RULES.RIDE;
    assert.ok(entranceRideBlock(build(4, 3), e, ride) !== null, 'old ramp (h=4, flat open column next to the roof) blocks');
    assert.equal(entranceRideBlock(build(4, -1), e, ride)?.check, 'box', 'h=4 with slopes still blocks (body straddling a roof step)');
    // 抬高到 5 行但仍留一列整砖平台：车身越过平台后前探地面跟踪掉进"坑"（下一列坡面低于 g − 1），骑行高度窗口撞顶。
    assert.equal(entranceRideBlock(build(5, 6), { ...e, height: 5 }, ride)?.check, 'probe', 'flat step under the roof blocks the head probe');
    assert.equal(entranceRideBlock(build(5, -1), { ...e, height: 5 }, ride), null);
  });

  test('多 seed 生成：每个入口坡道 verify 口径可骑；下一列坡面恰低 1 格的坡道列（含口部、露天段与有顶段交界）都是斜坡顶砖', () => {
    let ramps = 0;
    for (const seed of SEEDS.slice(0, 40)) {
      const w = world(seed);
      const solid = (x: number, y: number): boolean => w.map.collisionAt(x, y) === 'solid';
      for (const e of w.caves.entrances) {
        const block = entranceRideBlock(w.map, e, CAVE_RULES.RIDE);
        assert.equal(block, null, `seed ${seed} entrance x=${e.x}: ${JSON.stringify(block)}`);
        for (let k = 0; k < Math.abs(e.innerX - e.x); k++) {
          const x = e.x + e.dir * k;
          const f = e.surfaceY - k;
          if (!solid(x, f - 1) || solid(x, f) || !solid(x, f - 2) || solid(x + e.dir, f - 1) || !solid(x + e.dir, f - 2)) continue;
          assert.notEqual(w.map.shapeAt(x, f - 1), SHAPE_FULL, `seed ${seed} entrance x=${e.x}: ramp column ${x} is a flat step`);
          ramps++;
        }
      }
    }
    assert.ok(ramps > 40 * 3 * 8, `sloped ramp columns ${ramps}`);
  });

  test('多 seed（24 个）：所有洞口骑车从地表骑到所连洞室不下车（真实 sim）', () => {
    let rides = 0;
    for (const seed of SEEDS.slice(0, 24)) {
      const w = world(seed);
      for (const e of w.caves.entrances) {
        const fail = rideIntoCave(w, e);
        assert.equal(fail, null, `seed ${seed} entrance x=${e.x} dir=${e.dir} h=${e.height} → room ${e.room}: ${fail}`);
        rides++;
      }
    }
    assert.ok(rides >= 24 * CAVE_RULES.ENTRANCE_COUNT.min, `rides ${rides}`);
  });
});
