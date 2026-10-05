// 019 打磨 A：渔屋屋顶为沿坡面连续排布的分层木瓦（不是阶梯状体素），檐口连续斜边 + 封檐板，屋脊盖瓦连续。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { HUT_LAYER } from '../src/render/hut-builder.ts';
import { buildHutParts } from '../src/render/hut-geometry.ts';
import type { BedHeight } from '../src/render/hut-geometry.ts';
import { HUT_ROOF_Z_MAX, HUT_ROOF_Z_MIN, hutRoofTop } from '../src/render/hut-layout.ts';
import { ROOF_COURSES_PER_TILE, ROOF_SHINGLES_MIN_PER_COURSE } from '../src/render/hut-roof.ts';
import type { FishingHut } from '../src/world/level.ts';

function makeHut(lakeSide: 1 | -1): FishingHut {
  const x0 = 30;
  const floorY = 40;
  const x1 = x0 + 7;
  const pierX0 = lakeSide === 1 ? x1 + 1 : x0 - 9;
  return { id: 0, x0, x1, floorY, doorRows: 3, roofY: floorY + 7, roofRows: 5, roofX0: x0 - 1, roofX1: x0 + 8, loftX0: x0 + 1, loftX1: x0 + 3, loftY: floorY + 3, lakeSide, pierX0, pierX1: pierX0 + 8, lake: 0 };
}
const flatBed = (y: number): BedHeight => () => y;

interface Tri {
  readonly n: THREE.Vector3;
  readonly c: THREE.Vector3;
  readonly layer: number;
}
function triangles(g: THREE.BufferGeometry): Tri[] {
  const p = g.getAttribute('position');
  const uv = g.getAttribute('aHutUv');
  const out: Tri[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (n.lengthSq() < 1e-14) continue;
    out.push({ n: n.normalize(), c: new THREE.Vector3().add(a).add(b).add(c).divideScalar(3), layer: uv.getZ(i) });
  }
  return out;
}

describe('渔屋屋顶：沿坡面连续的分层木瓦', () => {
  for (const lakeSide of [1, -1] as const) {
    test(`木瓦没有竖直台阶面（只有沿坡面/垂直坡面/±z 的面）；lakeSide=${lakeSide}`, () => {
      const hut = makeHut(lakeSide);
      const roof = buildHutParts(hut, flatBed(33)).get('roof')!;
      const shingles = triangles(roof).filter((t) => t.layer === HUT_LAYER.shingle);
      assert.ok(shingles.length > 0);
      for (const t of shingles) {
        // 体素阶梯会产生法线 ≈ (±1,0,0) 的竖直面或 (0,±1,0) 的水平台面。
        const vertical = Math.abs(t.n.x) > 0.95;
        const flatTop = Math.abs(t.n.y) > 0.95;
        assert.ok(!vertical && !flatTop, `shingle face normal (${t.n.x.toFixed(2)},${t.n.y.toFixed(2)},${t.n.z.toFixed(2)}) at (${t.c.x.toFixed(2)},${t.c.y.toFixed(2)})`);
      }
    });
  }

  test('木瓦顶面沿坡面连续：z=0 剖面上各处顶面距坡线 ≤ .08、每格 ≥ 3 道瓦下沿；每排沿 z 分成多片', () => {
    const hut = makeHut(1);
    const roof = buildHutParts(hut, flatBed(33)).get('roof')!;
    const mesh = new THREE.Mesh(roof, new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const ridgeX = hut.roofX0 + hut.roofRows;
    let prevD = 0;
    let lips = 0;
    for (let x = hut.roofX0 + 0.01; x < ridgeX - 0.3; x += 0.005) {
      ray.set(new THREE.Vector3(x, hut.roofY + hut.roofRows + 3, 0.1), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObject(mesh)[0];
      assert.ok(hit, `hit at ${x}`);
      const d = hutRoofTop(hut, x) - hit.point.y;
      assert.ok(d >= -1e-6 && d <= 0.08, `x=${x.toFixed(3)} depth ${d}`);
      if (prevD > 0.035 && d < 0.012) lips++;
      prevD = d;
    }
    assert.ok(lips >= ROOF_COURSES_PER_TILE * (hut.roofRows - 1), `shingle lips along slope ${lips}`);
    assert.ok(ROOF_SHINGLES_MIN_PER_COURSE >= 3);
    const shingleSides = triangles(roof).filter((t) => t.layer === HUT_LAYER.shingle && Math.abs(t.n.z) > 0.95);
    // 每片 2 个侧面（各 2 三角形）；2 坡 × 5 格 × 3 排 × ≥3 片。
    assert.ok(shingleSides.length >= 2 * 5 * ROOF_COURSES_PER_TILE * ROOF_SHINGLES_MIN_PER_COURSE * 4, `shingle side faces ${shingleSides.length}`);
  });

  test('檐口封檐板：沿两坡的连续斜板贴在屋顶最前（z = HUT_ROOF_Z_MAX），屋脊盖瓦贯通 z', () => {
    const hut = makeHut(-1);
    const roof = buildHutParts(hut, flatBed(33)).get('roof')!;
    const ridgeX = hut.roofX0 + hut.roofRows;
    const ridgeY = hut.roofY + hut.roofRows;
    const front = triangles(roof).filter((t) => t.n.z > 0.95 && Math.abs(t.c.z - HUT_ROOF_Z_MAX) < 1e-6 && Math.abs(t.c.x - ridgeX) > 0.35);
    // 前脸（屋脊盖瓦端头除外）只能是两条封檐斜板：每个三角形的质心都在坡线下 .1..0.8 的带内，且覆盖檐口到屋脊。
    assert.ok(front.length >= 4);
    let minX = Infinity;
    let maxX = -Infinity;
    for (const t of front) {
      const d = hutRoofTop(hut, t.c.x) - t.c.y;
      assert.ok(d > 0.1 && d < 0.8, `barge board centroid depth ${d}`);
      minX = Math.min(minX, t.c.x);
      maxX = Math.max(maxX, t.c.x);
    }
    assert.ok(minX < hut.roofX0 + 2 && maxX > hut.roofX1 - 1, `barge boards span ${minX}..${maxX}`);
    const p = roof.getAttribute('position');
    let capMin = Infinity;
    let capMax = -Infinity;
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(p.getX(i) - ridgeX) < 1e-6 && Math.abs(p.getY(i) - ridgeY) < 1e-6) {
        capMin = Math.min(capMin, p.getZ(i));
        capMax = Math.max(capMax, p.getZ(i));
      }
    }
    assert.ok(Math.abs(capMin - HUT_ROOF_Z_MIN) < 1e-6 && Math.abs(capMax - HUT_ROOF_Z_MAX) < 1e-6, `ridge cap z ${capMin}..${capMax}`);
  });
});
