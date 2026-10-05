// 013 W6：渔屋渲染（手写 FishingHut 数据，不依赖世界生成）。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import {
  HUT_JAMB_WIDTH,
  HUT_PARTS,
  HUT_PROP_Z_MAX,
  HUT_SWAY_PARTS,
  HUT_ROOF_Z_MAX,
  HUT_ROOF_Z_MIN,
  bedHeightFromMap,
  buildHutGeometry,
  buildHutParts,
  buildHutSwayParts,
  hutRoofTop,
} from '../src/render/hut-geometry.ts';
import type { BedHeight } from '../src/render/hut-geometry.ts';
import { createStructureView } from '../src/render/structure-view.ts';
import { BLOCK_BACK_Z } from '../src/render/tile-geometry.ts';
import type { FishingHut } from '../src/world/level.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { SHAPE_SLOPE_L, SHAPE_SLOPE_R, shapeTopAt } from '../src/world/tile-shapes.ts';
import type { TileShape } from '../src/world/tile-shapes.ts';
import { DEFAULT_TILES, TILE_STONE } from '../src/world/tile-types.ts';

/** 按 DESIGN 2.4 的瓦片布局手写一座渔屋（墙宽 8、墙高 7、门洞 3、屋檐 1、屋顶 5 行、平台 3 宽、栈桥 len 格）。 */
function makeHut(x0: number, floorY: number, lakeSide: 1 | -1, pierLen = 6, id = 0): FishingHut {
  const x1 = x0 + 7;
  const pierX0 = lakeSide === 1 ? x1 + 1 : x0 - pierLen;
  return {
    id,
    x0,
    x1,
    floorY,
    doorRows: 3,
    roofY: floorY + 7,
    roofRows: 5,
    roofX0: x0 - 1,
    roofX1: x0 + 8,
    loftX0: lakeSide === 1 ? x0 + 1 : x1 - 3,
    loftX1: lakeSide === 1 ? x0 + 3 : x1 - 1,
    loftY: floorY + 3,
    lakeSide,
    pierX0,
    pierX1: pierX0 + pierLen - 1,
    lake: 0,
  };
}

/** 由瓦片布局（roof 斜坡格 + shapeTopAt）独立计算屋顶碰撞顶高，与几何实现无关。 */
function roofTilesTop(hut: FishingHut, x: number): number {
  const tiles: Array<{ tx: number; ty: number; shape: TileShape }> = [];
  for (let k = 0; k < hut.roofRows; k++) {
    tiles.push({ tx: hut.roofX0 + k, ty: hut.roofY + k, shape: SHAPE_SLOPE_R });
    tiles.push({ tx: hut.roofX1 - k, ty: hut.roofY + k, shape: SHAPE_SLOPE_L });
  }
  let top = -Infinity;
  for (const t of tiles) {
    if (x < t.tx || x > t.tx + 1) continue;
    top = Math.max(top, t.ty + shapeTopAt(t.shape, Math.min(1, Math.max(0, x - t.tx))));
  }
  return top;
}

const flatBed = (y: number): BedHeight => () => y;

function vertices(g: THREE.BufferGeometry): THREE.Vector3[] {
  const p = g.getAttribute('position');
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)));
  return out;
}

function box(g: THREE.BufferGeometry): THREE.Box3 {
  g.computeBoundingBox();
  return g.boundingBox as THREE.Box3;
}

const EPS = 1e-6;

describe('hut-geometry', () => {
  for (const lakeSide of [1, -1] as const) {
    test(`屋顶板上表面贴 roof 斜坡线（z=0 处竖直向下射线：木瓦锯齿在线下 ≤ .08，屋脊盖瓦处高出 ≤ .1；lakeSide=${lakeSide}）`, () => {
      const hut = makeHut(20, 30, lakeSide);
      const mesh = new THREE.Mesh(buildHutGeometry(hut, flatBed(25)), new THREE.MeshBasicMaterial());
      mesh.updateMatrixWorld(true);
      const ray = new THREE.Raycaster();
      const x0 = hut.roofX0;
      const x1 = hut.roofX1 + 1;
      let samples = 0;
      for (let x = x0 + 0.02; x <= x1 - 0.02; x += 0.07) {
        const expected = roofTilesTop(hut, x);
        assert.ok(Math.abs(hutRoofTop(hut, x) - expected) < EPS, `hutRoofTop(${x})`);
        for (const z of [0, 0.4, -0.45]) {
          ray.set(new THREE.Vector3(x, hut.roofY + hut.roofRows + 5, z), new THREE.Vector3(0, -1, 0));
          const hit = ray.intersectObject(mesh)[0];
          assert.ok(hit, `no roof hit at x=${x} z=${z}`);
          const nearRidge = Math.abs(x - (hut.roofX0 + hut.roofRows)) < 0.2;
          const d = hit.point.y - expected;
          assert.ok(d >= -0.08 && d <= (nearRidge ? 0.13 : 0.001), `x=${x.toFixed(2)} z=${z}: roof ${hit.point.y} vs slope ${expected}`);
          assert.ok((hit.face as THREE.Face).normal.y > 0.5, `roof face at x=${x} faces up`);
        }
        samples++;
      }
      assert.ok(samples > 100);
    });
  }

  test('屋顶板：竖直厚 .8，z ∈ [BLOCK_BACK_Z − .2, .7]，覆盖屋檐到屋脊', () => {
    const hut = makeHut(20, 30, 1);
    const roof = buildHutParts(hut, flatBed(25)).get('roof') as THREE.BufferGeometry;
    const b = box(roof);
    assert.ok(Math.abs(b.min.z - HUT_ROOF_Z_MIN) < EPS && Math.abs(b.max.z - HUT_ROOF_Z_MAX) < EPS, `roof z ${b.min.z}..${b.max.z}`);
    assert.ok(Math.abs(HUT_ROOF_Z_MIN - (BLOCK_BACK_Z - 0.2)) < EPS && HUT_ROOF_Z_MAX === 0.7);
    assert.ok(Math.abs(b.min.x - hut.roofX0) < EPS && Math.abs(b.max.x - (hut.roofX1 + 1)) < EPS, `roof x ${b.min.x}..${b.max.x}`);
    assert.ok(Math.abs(b.max.y - (hut.roofY + hut.roofRows)) < EPS, `ridge ${b.max.y}`);
    assert.ok(Math.abs(b.min.y - (hut.roofY - 0.8)) < EPS, `eave underside ${b.min.y}`);
    for (const v of vertices(roof)) {
      const top = hutRoofTop(hut, Math.min(hut.roofX1 + 1, Math.max(hut.roofX0, v.x)));
      assert.ok(v.y <= top + 1e-5 && v.y >= top - 0.8 - 1e-5, `roof vertex (${v.x},${v.y}) within .8 under slope ${top}`);
    }
  });

  test('背墙板 z ∈ [BLOCK_BACK_Z, BLOCK_BACK_Z+.1]，覆盖墙内并收在屋顶线下；前墙剖切（室内前方无几何）', () => {
    const hut = makeHut(20, 30, 1);
    const parts = buildHutParts(hut, flatBed(25));
    const wall = parts.get('backWall') as THREE.BufferGeometry;
    const b = box(wall);
    assert.ok(b.min.z >= BLOCK_BACK_Z - EPS && b.max.z <= BLOCK_BACK_Z + 0.1 + EPS, `back wall z ${b.min.z}..${b.max.z}`);
    assert.ok(Math.abs(b.min.x - hut.x0) < 0.05 && Math.abs(b.max.x - (hut.x1 + 1)) < 0.05, `back wall x ${b.min.x}..${b.max.x}`);
    assert.ok(Math.abs(b.min.y - hut.floorY) < EPS, `back wall from floor ${b.min.y}`);
    for (const v of vertices(wall)) assert.ok(v.y <= hutRoofTop(hut, v.x) + EPS, `back wall below roof at x=${v.x}`);
    // 剖切：室内（地板到屋顶起始行、墙内侧之间）所有顶点都在鹈鹕身后。
    const all = buildHutGeometry(hut, flatBed(25));
    for (const v of vertices(all)) {
      if (v.x > hut.x0 + 1 + EPS && v.x < hut.x1 - EPS && v.y > hut.floorY + EPS && v.y < hut.roofY - EPS) {
        assert.ok(v.z <= HUT_PROP_Z_MAX + EPS, `interior vertex (${v.x},${v.y},${v.z}) in front of the cut`);
      }
    }
    assert.ok(HUT_PROP_Z_MAX <= -0.5);
  });

  test('门洞两侧通透：门洞行内墙列只有两条窄门框（≤ HUT_JAMB_WIDTH）在鹈鹕前方', () => {
    for (const lakeSide of [1, -1] as const) {
      const hut = makeHut(20, 30, lakeSide);
      for (const v of vertices(buildHutGeometry(hut, flatBed(25)))) {
        for (const c of [hut.x0, hut.x1]) {
          const inJamb = v.x <= c + HUT_JAMB_WIDTH + EPS || v.x >= c + 1 - HUT_JAMB_WIDTH - EPS;
          if (!inJamb && v.x > c + EPS && v.x < c + 1 - EPS && v.y > hut.floorY + EPS && v.y < hut.floorY + hut.doorRows - EPS) {
            assert.ok(v.z <= HUT_PROP_Z_MAX + EPS, `door ${c} blocked by (${v.x},${v.y},${v.z})`);
          }
        }
      }
    }
  });

  test('栈桥桩从桥面下伸到湖床（按 bedY(x) 逐桩取值），远端有系船柱', () => {
    for (const lakeSide of [1, -1] as const) {
      const hut = makeHut(20, 30, lakeSide, 7);
      // 湖床向湖心变深：离岸越远越低。
      const shore = lakeSide === 1 ? hut.pierX0 : hut.pierX1 + 1;
      const bedY: BedHeight = (x) => 27 - 0.4 * Math.abs(x - shore);
      const piles = buildHutParts(hut, bedY).get('piles') as THREE.BufferGeometry;
      const vs = vertices(piles);
      // 按桩中心 x 聚类（桩中心小数部分为 .3/.7，半径 ≤ .13，间距 2）。
      const groups = new Map<number, THREE.Vector3[]>();
      for (const v of vs) {
        const key = Math.round(v.x);
        let list = groups.get(key);
        if (!list) groups.set(key, (list = []));
        list.push(v);
      }
      assert.ok(groups.size >= 3, `pile columns ${groups.size}`);
      let reachesFar = false;
      for (const list of groups.values()) {
        const cx = list.reduce((s, v) => s + v.x, 0) / list.length;
        const minY = Math.min(...list.map((v) => v.y));
        const maxY = Math.max(...list.map((v) => v.y));
        assert.ok(cx >= hut.pierX0 - EPS && cx <= hut.pierX1 + 1 + EPS, `pile x ${cx} under the pier`);
        assert.ok(minY <= bedY(cx) + 0.05 && minY >= bedY(cx) - 0.6, `pile at ${cx.toFixed(2)} bottom ${minY} vs bed ${bedY(cx)}`);
        assert.ok(maxY >= hut.floorY - 0.25 - EPS, `pile at ${cx} reaches deck (${maxY})`);
        if (maxY > hut.floorY + 0.8) reachesFar = true;
      }
      assert.ok(reachesFar, 'mooring post rises above the deck');
    }
  });

  test('包含门框、窗、烟囱、室内与随风部件；烟囱/门框/室内/挂件在鹈鹕身后', () => {
    const hut = makeHut(20, 30, -1);
    const parts = buildHutParts(hut, flatBed(25));
    for (const name of HUT_PARTS) {
      const g = parts.get(name);
      assert.ok(g && g.getAttribute('position').count > 0, `part ${name}`);
    }
    for (const name of ['chimney', 'doorFrame', 'interior', 'props'] as const) {
      const b = box(parts.get(name) as THREE.BufferGeometry);
      assert.ok(b.max.z <= HUT_PROP_Z_MAX + EPS, `${name} z max ${b.max.z}`);
    }
    const sway = buildHutSwayParts(hut, flatBed(25));
    for (const name of HUT_SWAY_PARTS) {
      const g = sway.get(name);
      assert.ok(g && g.getAttribute('position').count > 0, `sway part ${name}`);
      if (name !== 'flowers') assert.ok(box(g).max.z <= HUT_PROP_Z_MAX + EPS, `${name} z max ${box(g).max.z}`);
    }
    // 烟囱在背湖一侧的坡上、高出屋脊。
    const ch = box(parts.get('chimney') as THREE.BufferGeometry);
    const ridgeX = hut.roofX0 + hut.roofRows;
    assert.ok(ch.min.x > ridgeX, 'chimney on the side away from the lake (lake left → chimney right)');
    assert.ok(ch.max.y > hut.roofY + hut.roofRows, 'chimney above the ridge');
    // 窗在背墙前方紧贴。
    const win = box(parts.get('window') as THREE.BufferGeometry);
    assert.ok(win.min.z >= BLOCK_BACK_Z && win.max.z <= BLOCK_BACK_Z + 0.32, `window z ${win.min.z}..${win.max.z}`);
  });

  test('单个合并几何：顶点色 + 法线，三角形数在预算内，确定性', () => {
    const hut = makeHut(40, 22, 1, 8, 3);
    const g = buildHutGeometry(hut, flatBed(17));
    assert.ok(g.getAttribute('color') && g.getAttribute('normal'));
    assert.equal(g.index, null);
    const tris = g.getAttribute('position').count / 3;
    assert.ok(tris >= 4000 && tris <= 40000, `triangles ${tris}`);
    assert.deepEqual(buildHutGeometry(hut, flatBed(17)).getAttribute('position').array, g.getAttribute('position').array);
    assert.deepEqual(buildHutGeometry(hut, flatBed(17)).getAttribute('color').array, g.getAttribute('color').array);
  });

  test('非法数据即抛：屋顶两坡不在屋脊相接、栈桥不贴湖侧、湖床非有限或高于桥面', () => {
    const hut = makeHut(20, 30, 1);
    assert.throws(() => buildHutGeometry({ ...hut, roofX1: hut.roofX1 + 1 }, flatBed(25)), /roof/);
    assert.throws(() => buildHutGeometry({ ...hut, pierX0: hut.x0 - 5, pierX1: hut.x0 - 1 }, flatBed(25)), /pier/);
    assert.throws(() => buildHutGeometry({ ...hut, floorY: 30.5 }, flatBed(25)), /floorY/);
    assert.throws(() => buildHutGeometry(hut, () => Number.NaN), /bed/);
    assert.throws(() => buildHutGeometry(hut, flatBed(hut.floorY)), /bed/);
    assert.throws(() => hutRoofTop(hut, hut.roofX0 - 0.5), /outside/);
  });
});

describe('bedHeightFromMap', () => {
  test('沿列向下找第一个实心格顶边（跳过栈桥平台与水/空气）；找不到即抛', () => {
    const map = createTileMap(64, 40, DEFAULT_TILES);
    for (let x = 0; x < 64; x++) for (let y = 0; y < 20; y++) map.set(x, y, TILE_STONE);
    map.set(30, 20, TILE_STONE);
    const hut = makeHut(20, 26, 1);
    const bed = bedHeightFromMap(map, hut);
    assert.equal(bed(29.4), 20);
    assert.equal(bed(30.5), 21);
    const empty = createTileMap(64, 40, DEFAULT_TILES);
    assert.throws(() => bedHeightFromMap(empty, hut)(29.4), /bed/);
  });
});

describe('structure-view', () => {
  test('每座房子一个 Mesh（hut-<id>），投射/接收阴影；dispose 释放并移除', () => {
    const map = createTileMap(80, 40, DEFAULT_TILES);
    for (let x = 0; x < 80; x++) for (let y = 0; y < 20; y++) map.set(x, y, TILE_STONE);
    const huts = [makeHut(10, 24, 1, 5, 0), makeHut(50, 24, -1, 5, 1)];
    const view = createStructureView(huts, { map });
    const meshes = view.root.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh);
    assert.deepEqual(meshes.map((m) => m.name), ['hut-0', 'hut-1']);
    assert.deepEqual(meshes[0]?.children.map((c) => c.name), ['hut-0-sway', 'hut-0-smoke']);
    for (const m of meshes) {
      assert.ok(m.castShadow && m.receiveShadow);
      const mat = m.material as THREE.MeshStandardMaterial;
      assert.ok(mat.vertexColors && mat.flatShading);
    }
    assert.equal(meshes[0]?.material, meshes[1]?.material);
    const scene = new THREE.Scene();
    scene.add(view.root);
    view.dispose();
    assert.equal(view.root.parent, null);
    assert.equal(view.root.children.length, 0);
  });

  test('空列表合法；重复 id、桩下无湖床即抛', () => {
    const map = createTileMap(80, 40, DEFAULT_TILES);
    assert.equal(createStructureView([], { map }).root.children.length, 0);
    assert.throws(() => createStructureView([makeHut(10, 24, 1)], { map }), /bed/);
    for (let x = 0; x < 80; x++) map.set(x, 0, TILE_STONE);
    assert.throws(() => createStructureView([makeHut(10, 24, 1, 5, 2), makeHut(50, 24, 1, 5, 2)], { map }), /duplicate/);
  });
});
