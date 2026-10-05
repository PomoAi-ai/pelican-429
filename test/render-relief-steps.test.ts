/**
 * 013 用户追加（单格凸起仍是立方体）：所有暴露台阶都走浮雕（前沿滚圆、侧壁内收、圆角、填角）——
 * 半砖（1 格宽凸起上的形状）改用带圆角/浮雕的轮廓几何；草/土/沙/石各类地表、区块边界两侧都生效。
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { createGroundProfile } from '../src/render/ground-profile.ts';
import { groundSurface } from '../src/render/stage.ts';
import { BLOCK_BACK_Z, BLOCK_FRONT_Z, createBlockGeometry, createHalfGeometry, createShapeGeometry } from '../src/render/tile-geometry.ts';
import { TILE_SHADER_INJECTIONS } from '../src/render/tile-material.ts';
import { reliefRings } from '../src/render/tile-relief.ts';
import { EDGE_EXPOSED } from '../src/render/tile-transitions.ts';
import { ORGANIC_FLAG, createTileView } from '../src/render/tile-view.ts';
import { LEVEL_LEGEND, parseLevel } from '../src/world/test-level.ts';
import type { LevelLegend } from '../src/world/test-level.ts';
import { CHUNK_SIZE } from '../src/world/tile-map.ts';
import { SHAPE_HALF } from '../src/world/tile-shapes.ts';

const LEGEND: LevelLegend = Object.freeze({
  ...LEVEL_LEGEND,
  g: { tile: 'grass' },
  d: { tile: 'dirt' },
  s: { tile: 'sand' },
  o: { tile: 'stone' },
  h: { tile: 'grass', shape: SHAPE_HALF },
});

/**
 * 40×8：地表顶 y=3（行 2 为草）；行 3 上的凸起：x=5..6 两格宽泥土、x=20 草半砖、x=31 沙（区块 0 最后一列，右邻 x=32 在区块 1）、
 * x=35 石。
 */
function bumps() {
  const row3 = [...'=......................................='];
  row3[5] = 'd';
  row3[6] = 'd';
  row3[20] = 'h';
  row3[31] = 's';
  row3[35] = 'o';
  const air = '=......................................=';
  const rows = [air, air, air, '=.P....................................=', row3.join(''), `=${'g'.repeat(38)}=`, `=${'#'.repeat(38)}=`, '='.repeat(40)];
  return parseLevel(rows, LEGEND).map;
}

interface Inst {
  x: number;
  y: number;
  round: number[];
  code: number[];
  shape: number;
}

function instances(root: THREE.Object3D, prefix: string): Inst[] {
  const out: Inst[] = [];
  const mat = new THREE.Matrix4();
  const p = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.InstancedMesh;
    if (!m.isInstancedMesh || !m.name.startsWith(prefix)) return;
    const round = m.geometry.getAttribute('aRound');
    const code = m.geometry.getAttribute('aCode');
    const shape = m.geometry.getAttribute('aShape');
    for (let i = 0; i < m.count; i++) {
      m.getMatrixAt(i, mat);
      p.setFromMatrixPosition(mat);
      out.push({
        x: Math.round(p.x - 0.5),
        y: Math.round(p.y - 0.5),
        round: [round.getX(i), round.getY(i), round.getZ(i), round.getW(i)],
        code: [code.getX(i), code.getY(i), code.getZ(i), code.getW(i)],
        shape: shape.getX(i),
      });
    }
  });
  return out;
}

function fillets(root: THREE.Object3D): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const mat = new THREE.Matrix4();
  const p = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.InstancedMesh;
    if (!m.isInstancedMesh || !m.name.startsWith('tiles-fillet')) return;
    for (let i = 0; i < m.count; i++) {
      m.getMatrixAt(i, mat);
      p.setFromMatrixPosition(mat);
      out.push([Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100]);
    }
  });
  return out;
}

describe('半砖几何：带圆角与浮雕的轮廓几何（不再是硬直角截面）', () => {
  test('1 × .5 截面（y ∈ [−.5, 0]），z ∈ [BLOCK_BACK_Z, BLOCK_FRONT_Z]；轮廓点带角序/边序（着色器据此圆角、滚圆、侧壁内收），环编码与方块一致', () => {
    const g = createHalfGeometry();
    const pos = g.getAttribute('position');
    const vert = g.getAttribute('aVert');
    const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
    assert.ok(Math.abs(box.min.y + 0.5) < 1e-9 && Math.abs(box.max.y) < 1e-9, `y range ${box.min.y}..${box.max.y}`);
    assert.ok(Math.abs(box.min.x + 0.5) < 1e-9 && Math.abs(box.max.x - 0.5) < 1e-9);
    assert.ok(Math.abs(box.min.z - BLOCK_BACK_Z) < 1e-9 && Math.abs(box.max.z - BLOCK_FRONT_Z) < 1e-9);
    const tags = new Set<number>();
    const codes = new Set<number>();
    for (let i = 0; i < vert.count; i++) {
      tags.add(vert.getX(i));
      if (vert.getW(i) === 1 || vert.getW(i) === 2) codes.add(Math.round(vert.getZ(i) * 1e6) / 1e6);
    }
    for (const t of [0, 1, 2, 3, 4, 5, 6, 7]) assert.ok(tags.has(t), `outline tag ${t}`);
    assert.ok([...tags].every((t) => t === -1 || (t >= 0 && t <= 7)), `tags ${[...tags]}`);
    const expected = new Set(reliefRings(BLOCK_FRONT_Z, BLOCK_BACK_Z).map((r) => Math.round(r.code * 1e6) / 1e6));
    assert.deepEqual([...codes].sort(), [...expected].sort());
    assert.equal(vert.count, createBlockGeometry().getAttribute('aVert').count, 'same vertex budget as a block');
    assert.throws(() => createShapeGeometry(SHAPE_HALF), /createHalfGeometry/);
  });
});

describe('tile-view：各类地表的暴露台阶都圆角 + 有机浮雕，区块边界两侧一致', () => {
  const map = bumps();
  const view = createTileView(map);
  view.update();
  const blocks = instances(view.root, 'tiles-block');
  const halves = instances(view.root, 'tiles-half');
  const at = (list: Inst[], x: number, y: number) => {
    const r = list.find((p) => p.x === x && p.y === y);
    assert.ok(r, `instance at (${x},${y})`);
    return r;
  };

  test('夹具：x=31 与 x=32 分属两个区块', () => {
    assert.equal(Math.floor(31 / CHUNK_SIZE), 0);
    assert.equal(Math.floor(32 / CHUNK_SIZE), 1);
  });

  test('单格宽凸起（沙、石）两侧顶角都圆、有机标记；两格宽（泥土）外侧两角圆', () => {
    for (const x of [31, 35]) {
      const b = at(blocks, x, 3);
      assert.deepEqual(b.round, [0, 0, 1, 1], `bump at ${x}: both top corners round`);
      assert.ok(b.code[0]! >= EDGE_EXPOSED && b.code[1]! >= EDGE_EXPOSED && b.code[3]! >= EDGE_EXPOSED, `bump at ${x}: left/right/top exposed`);
      assert.ok(b.shape >= ORGANIC_FLAG, `bump at ${x}: organic relief`);
    }
    assert.deepEqual(at(blocks, 5, 3).round, [0, 0, 0, 1]);
    assert.deepEqual(at(blocks, 6, 3).round, [0, 0, 1, 0]);
  });

  test('平地上的半砖：两侧都是半格台阶 → 侧边不暴露、顶角不圆（由平滑地表接成土坎），仍是有机浮雕', () => {
    const h = at(halves, 20, 3);
    assert.deepEqual(h.round, [0, 0, 0, 0]);
    assert.ok(h.code[0]! < EDGE_EXPOSED && h.code[1]! < EDGE_EXPOSED && h.code[3]! >= EDGE_EXPOSED, `code ${h.code}`);
    assert.ok(h.shape >= ORGANIC_FLAG && h.shape % ORGANIC_FLAG === SHAPE_HALF);
  });

  test('区块边界：x=31 凸起右侧的地面格（区块 1）顶边暴露、两侧墙脚都有填角', () => {
    assert.ok(at(blocks, 32, 2).code[3]! >= EDGE_EXPOSED, 'ground right of the bump (chunk 1) has an exposed top');
    const f = fillets(view.root);
    for (const [x, y] of [[31, 3], [32, 3], [35, 3], [36, 3]] as const) {
      assert.ok(f.some(([fx, fy]) => fx === x && fy === y), `fillet at the bump foot (${x},${y}): ${JSON.stringify(f.filter(([fx]) => Math.abs(fx - x) < 2))}`);
    }
  });

  test('视觉地面轮廓：平地上的半砖是连续隆起（两端在台阶处与地面相接，无断口），中段接近半砖顶', () => {
    const h = createGroundProfile(map, groundSurface(map));
    const mid = h(20.5);
    assert.ok(Math.abs(mid - 3.5) < 0.2, `half top ${mid}`);
    for (const x of [20, 21]) {
      assert.ok(Math.abs(h(x - 1e-4) - h(x + 1e-4)) < 0.01, `continuous across the half step at ${x}: ${h(x - 1e-4)} → ${h(x + 1e-4)}`);
      assert.ok(h(x) < mid - 0.1 && h(x) > 3.1, `step midway at ${x}: ${h(x)}`);
    }
  });

  test('着色器：圆角草边按形状顶高定位（半砖顶 .5）；半砖侧边也垂草；斜坡暴露竖边按浮雕内缩', () => {
    const frag = TILE_SHADER_INJECTIONS.find((j) => j.stage === 'fragment' && j.include === 'common')?.code ?? '';
    assert.ok(!frag.includes('if ( vTileShape > 0.5 && i < 2 ) continue;'), 'half bricks keep side grass');
    const main = TILE_SHADER_INJECTIONS.find((j) => j.stage === 'vertex' && j.include === 'begin_vertex')?.code ?? '';
    assert.ok(main.includes('tShapeSideInset('), 'slope vertical sides use the relief inset');
    view.dispose();
  });
});
