/**
 * 013 用户追加：暴露台阶去“方块感”——前沿滚圆（截面圆角）、侧壁后收与沿 z 起伏、侧壁渐暗（tile-relief）。
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { BLOCK_BACK_Z, BLOCK_FRONT_Z, FILLET_RING_BASE, GROUND_DECOR_Z_MAX, createBlockGeometry, createFilletGeometry } from '../src/render/tile-geometry.ts';
import { TILE_SHADER_INJECTIONS, TILE_SHADER_PARAMS } from '../src/render/tile-material.ts';
import { RELIEF_PARAMS, ROUND_RINGS, WALL_RINGS, edgeInset, reliefFactors, reliefRings, sideShade, wallNormalZ } from '../src/render/tile-relief.ts';
import { MAX_CONTOUR_DEVIATION } from '../src/render/tile-transitions.ts';

const P = RELIEF_PARAMS;
const ZEND = BLOCK_FRONT_Z - P.FRONT_ROUND_DEPTH;
const WALL_LEN = ZEND - BLOCK_BACK_Z;

/** 侧/顶暴露边在任意 z 处的内缩（按几何环的插值方式：滚圆段按圆周、侧壁段线性）。 */
function insetAtZ(edge: 0 | 3, z: number, wobble = 0.5): number {
  let f = 0;
  let u = 0;
  if (z >= ZEND) {
    const c = Math.min(1, (z - ZEND) / P.FRONT_ROUND_DEPTH);
    f = 1 - Math.sqrt(1 - c * c);
  } else u = (ZEND - z) / WALL_LEN;
  return edgeInset(edge, f, u, wobble, true, 0.06);
}

describe('tile-relief：环与内缩', () => {
  test('环：前沿 z=正面、编码 0、法线 +z；滚圆在 FRONT_ROUND_DEPTH 内沿四分之一圆结束（编码 1）；侧壁环编码 1+u 单调到背面', () => {
    const rings = reliefRings(BLOCK_FRONT_Z, BLOCK_BACK_Z);
    assert.equal(rings.length, ROUND_RINGS + WALL_RINGS + 1);
    const first = rings[0]!;
    assert.ok(first.z === BLOCK_FRONT_Z && first.code === 0 && first.nz === 1 && first.nxy === 0);
    const end = rings[ROUND_RINGS]!;
    assert.ok(Math.abs(end.z - ZEND) < 1e-12 && end.code === 1 && end.nz < 1e-12);
    for (const r of rings.slice(0, ROUND_RINGS + 1)) {
      // 圆周：内缩比例 f = 1 − sinφ、深度 = D(1 − cosφ)。
      const { f } = reliefFactors(r.code);
      const depth = BLOCK_FRONT_Z - r.z;
      assert.ok(Math.abs((1 - f) ** 2 + (1 - depth / P.FRONT_ROUND_DEPTH) ** 2 - 1) < 1e-9, `ring at z ${r.z} lies on the quarter circle`);
    }
    for (let i = ROUND_RINGS + 1; i < rings.length; i++) {
      assert.ok(rings[i]!.z < rings[i - 1]!.z && rings[i]!.code > rings[i - 1]!.code);
    }
    assert.equal(rings.at(-1)!.z, BLOCK_BACK_Z);
    assert.equal(rings.at(-1)!.code, 2);
    assert.throws(() => reliefRings(0.5, 0.3), /tile-relief/);
  });

  test('前沿滚圆：正面上侧边内缩 ROUND_SIDE、顶边 ROUND_TOP；角色平面 z=0 与地表装饰前沿处轮廓几乎不变（碰撞偏差约束不受影响）', () => {
    assert.ok(ZEND > GROUND_DECOR_Z_MAX - 0.05 && ZEND > 0, 'roll finishes in front of the actor plane');
    assert.ok(Math.abs(insetAtZ(0, BLOCK_FRONT_Z) - P.ROUND_SIDE) < 1e-12);
    assert.ok(Math.abs(insetAtZ(3, BLOCK_FRONT_Z) - P.ROUND_TOP) < 1e-12);
    for (const w of [0, 0.5, 1]) assert.ok(Math.abs(insetAtZ(0, 0, w)) <= 0.03, `side inset at z=0 (wobble ${w}): ${insetAtZ(0, 0, w)}`);
    assert.ok(insetAtZ(3, GROUND_DECOR_Z_MAX) <= 0.01, 'grass top under the decor plane stays at full height');
    assert.ok(insetAtZ(3, 0) === 0 && insetAtZ(3, BLOCK_BACK_Z) === 0, 'top edge never tapers (flat grass top)');
    assert.ok(P.ROUND_TOP <= MAX_CONTOUR_DEVIATION, 'slope/brick junction notch within the contour budget');
    // 非有机（木料/薄板）：保持小倒角。
    assert.equal(edgeInset(0, 1, 0, 0.5, false, 0.06), 0.06);
    assert.equal(edgeInset(0, 0, 1, 0.5, false, 0.06), 0);
  });

  test('侧壁后收：向后单调内收到 WALL_TAPER（± 起伏），法线朝后（透视下侧壁被正面遮住，不再露出立方体侧面）', () => {
    let prev = -Infinity;
    for (let k = 0; k <= 10; k++) {
      const z = ZEND - (k / 10) * WALL_LEN;
      const v = insetAtZ(0, z);
      assert.ok(v >= prev - 1e-12, `monotonic at ${z}`);
      prev = v;
    }
    assert.ok(Math.abs(insetAtZ(0, BLOCK_BACK_Z) - P.WALL_TAPER) < 1e-12);
    assert.ok(Math.abs(insetAtZ(0, BLOCK_BACK_Z, 1) - insetAtZ(0, BLOCK_BACK_Z, 0) - 2 * P.WALL_WOBBLE) < 1e-12, 'earthy undulation along z');
    assert.ok(P.WALL_TAPER + P.WALL_WOBBLE < 0.5, 'a 1-wide column never pinches through');
    assert.ok(Math.abs(wallNormalZ(0, WALL_LEN)) < 1e-12);
    assert.ok(wallNormalZ(1, WALL_LEN) < -0.4, `back of the wall faces away: ${wallNormalZ(1, WALL_LEN)}`);
    // 视线偏离 12° 内：侧壁后半段（u ≥ .5）法线与视线点积 < 0（背向），即被正面挡住。
    const nz = wallNormalZ(0.5, WALL_LEN);
    assert.ok(Math.tan((12 * Math.PI) / 180) + nz < 0, 'tapered wall hidden within ±12°');
  });

  test('侧壁渐暗：滚圆内不压暗，向后平滑压暗到 1 − SIDE_SHADE', () => {
    assert.equal(sideShade(0), 1);
    assert.equal(sideShade(P.FRONT_ROUND_DEPTH), 1);
    assert.ok(Math.abs(sideShade(10) - (1 - P.SIDE_SHADE)) < 1e-12);
    for (let d = 0; d < 2; d += 0.1) assert.ok(sideShade(d + 0.1) <= sideShade(d) + 1e-12);
  });
});

describe('tile-relief：几何与着色器接线', () => {
  test('方块：每个轮廓点在每个环上一个共享顶点（aVert.z 为环编码），顶点数受控', () => {
    const g = createBlockGeometry();
    const vert = g.getAttribute('aVert');
    const codes = new Set<number>();
    for (let i = 0; i < vert.count; i++) if (vert.getW(i) === 1 || vert.getW(i) === 2) codes.add(Math.round(vert.getZ(i) * 1e6) / 1e6);
    const expected = reliefRings(BLOCK_FRONT_Z, BLOCK_BACK_Z).map((r) => Math.round(r.code * 1e6) / 1e6);
    assert.deepEqual([...codes].sort((a, b) => a - b), [...new Set(expected)].sort((a, b) => a - b));
    assert.ok(vert.count <= 520, `block vertices ${vert.count}`);
  });

  test('填角：aVert.x = FILLET_RING_BASE − 环编码（≤ −2，不与方块角序/边序/形状顶线冲突），前沿 0、背面 2', () => {
    const g = createFilletGeometry();
    const vert = g.getAttribute('aVert');
    const pos = g.getAttribute('position');
    for (let i = 0; i < vert.count; i++) {
      const code = FILLET_RING_BASE - vert.getX(i);
      assert.ok(code >= -1e-9 && code <= 2 + 1e-9, `vertex ${i} code ${code}`);
      if (Math.abs(pos.getZ(i) - BLOCK_FRONT_Z) < 1e-9) assert.ok(Math.abs(code) < 1e-9);
      if (Math.abs(pos.getZ(i) - BLOCK_BACK_Z) < 1e-9) assert.ok(Math.abs(code - 2) < 1e-9);
    }
    assert.equal(TILE_SHADER_PARAMS.FILLET_RING_BASE, FILLET_RING_BASE);
    assert.ok(Math.abs(TILE_SHADER_PARAMS.RELIEF_WALL_LEN - WALL_LEN) < 1e-12);
  });

  test('着色器：顶点按 tEdgeInset/tWallWobble 内缩起伏、法线随后收倾斜；片元侧壁展开与渐暗、侧壁垂草；常量来自参数表', () => {
    const code = (stage: 'vertex' | 'fragment', include: string) => TILE_SHADER_INJECTIONS.find((j) => j.stage === stage && j.include === include)?.code ?? '';
    const decl = code('vertex', 'common');
    for (const name of Object.keys(RELIEF_PARAMS)) assert.match(decl, new RegExp(`\\b${name}\\b\\s*=`), `constant ${name}`);
    assert.match(decl, /tCornerDelta\([^)]*float f, float u, float wob, float org/);
    const main = code('vertex', 'begin_vertex');
    for (const fn of ['tEdgeInset', 'tWallWobble', 'tReliefF', 'tReliefU', 'tCornerDelta']) assert.ok(main.includes(`${fn}(`), `vertex main uses ${fn}`);
    assert.match(code('vertex', 'beginnormal_vertex'), /WALL_TAPER \/ RELIEF_WALL_LEN/);
    const frag = code('fragment', 'common');
    assert.ok(frag.includes('tSideShade( TILE_FRONT_Z - w.z )'), 'side walls darken with depth');
    assert.ok(frag.includes('sign( n.x ) * ( TILE_FRONT_Z - w.z )'), 'front/side share one unwrapped texture space');
    assert.ok(frag.includes('tGrassHang( vTileCell.x + float( si )'), 'grass hangs down the side walls');
    assert.ok(frag.includes('TOP_LOD_BIAS'), 'grass top sampled with a sharpening LOD bias');
  });
});
