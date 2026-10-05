// 013 W4：地面厚度常量、视觉地面轮廓、斜坡/半砖几何与瓦片视图。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import {
  BLOCK_BACK_Z,
  BLOCK_FRONT_Z,
  GROUND_DECOR_Z_MAX,
  GROUND_DECOR_Z_MIN,
  EDGE_SEGMENTS,
  KIND_FRONT,
  KIND_SLOPE_TOP,
  SHAPE_TOP_VERTEX,
  createShapeGeometry,
} from '../src/render/tile-geometry.ts';
import { TILE_PROGRAM_KEY, createTileMaterial } from '../src/render/tile-material.ts';
import { glslDeclarations, glslFunctionNames, glslIdentifiers } from './helpers/glsl.ts';
import { createMapSurfaceQuery, surfaceHermite } from '../src/render/surface-smooth.ts';
import { generateTileTextures } from '../src/render/tile-textures.ts';
import { createTileView } from '../src/render/tile-view.ts';
import { createGroundProfile } from '../src/render/ground-profile.ts';
import { groundSurface } from '../src/render/stage.ts';
import { CONVEX_RADIUS, EDGE_EXPOSED_FRINGE, FILLET_RADIUS, TILE_TRANSITIONS, contourStyle } from '../src/render/tile-transitions.ts';
import { ORGANIC_TOP_AMP, hermiteAt, organicTopOffset, smoothTopY } from '../src/render/tile-organic.ts';
import { SHAPE_FULL, SHAPE_HALF, SHAPE_SLOPE_L, SHAPE_SLOPE_R, shapeTopAt } from '../src/world/tile-shapes.ts';
import { L } from './helpers/render-fixtures.ts';
import { ROUND_RINGS, WALL_RINGS } from '../src/render/tile-relief.ts';
import { slopeLevel } from './helpers/slope-fixtures.ts';

describe('地面厚度常量', () => {
  test('BLOCK_BACK_Z = −1，地表装饰 z 范围从它推导且在顶面内', () => {
    assert.equal(BLOCK_BACK_Z, -1);
    assert.ok(Math.abs(GROUND_DECOR_Z_MIN - (BLOCK_BACK_Z + 0.15)) < 1e-12);
    assert.equal(GROUND_DECOR_Z_MAX, 0.2);
    assert.ok(GROUND_DECOR_Z_MIN > BLOCK_BACK_Z && GROUND_DECOR_Z_MAX < BLOCK_FRONT_Z);
  });
});

describe('ground-profile', () => {
  const level = slopeLevel();
  const ground = groundSurface(level.map);
  const h = createGroundProfile(level.map, ground);

  /** 未起伏的视觉高度 base 加上有机顶边偏移（与着色器同一函数）。 */
  const exp = (x: number, base: number) => base + organicTopOffset(x, base);
  const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) < tol;
  const q = createMapSurfaceQuery(level.map, (id) => level.map.registry.byId(id)?.collision === 'solid' && contourStyle(TILE_TRANSITIONS, level.map.registry.byId(id)?.key ?? '') === 'smooth', (tx, ty) => level.map.collisionAt(tx, ty + 1) === 'solid');
  /** 平滑位移 D（surface-smooth，与瓦片 aTop 同一份）。 */
  const D = (x: number, ty: number) => hermiteAt(surfaceHermite(q, Math.floor(x), ty), x - Math.floor(x));

  test('斜坡/半砖格：视觉高度 = 碰撞顶 + 平滑位移 D + 收窄有机起伏（tile-organic.smoothTopY）', () => {
    for (const f of [0, 0.25, 0.5, 0.75, 0.999]) {
      assert.ok(close(h(4 + f), smoothTopY(4 + f, 3 + f, D(4 + f, 3), true)), `slope R at ${4 + f}: ${h(4 + f)}`);
      assert.ok(close(h(8 + f), smoothTopY(8 + f, 4 - f, D(8 + f, 3), true)), `slope L at ${8 + f}: ${h(8 + f)}`);
      // 半砖：左接坡顶（3）、右接平地（3），两侧都是半格台阶 → 与斜坡同式，由平滑位移接管、不再按圆角下弯。
      assert.ok(close(h(9 + f), smoothTopY(9 + f, 3.5, D(9 + f, 3), true)), `half at ${9 + f}: ${h(9 + f)}`);
    }
  });

  test('平地为整数高度 ± 有机起伏；斜坡与相邻平地连续、凸角下弯凹角上填（无硬折角，坡脚无填角、坡顶无圆角片）', () => {
    assert.ok(close(h(1.5), exp(1.5, 3)), 'chain end next to the wall: unsmoothed');
    const offs: number[] = [];
    // x=1 左侧是石墙（填角到 1.4）；1.45..2 之间只有有机起伏。
    for (let x = 1.45; x < 2; x += 0.02) offs.push(h(x) - 3);
    assert.ok(offs.every((o) => Math.abs(o) <= ORGANIC_TOP_AMP + 1e-12));
    assert.ok(Math.max(...offs) - Math.min(...offs) > 0.02, 'top edge is not a straight line');
    assert.ok(D(4, 3) > 0.08, 'concave foot filled upward');
    assert.ok(D(5, 3) < -0.08, 'convex top rounded downward');
    for (let x = 1.5; x < 8.98; x += 0.01) assert.ok(Math.abs(h(x) - h(x + 0.01)) < 0.05, `continuous at ${x.toFixed(2)}`);
  });

  test('整砖台阶：上沿外凸圆角向下弯，下沿内凹填角向上弯（半径同瓦片视图）', () => {
    // x=11 顶 4，两侧 3：上沿圆角。
    assert.ok(close(h(11), 4 - CONVEX_RADIUS + organicTopOffset(11, 4)), `convex left corner ${h(11)}`);
    assert.ok(h(11.2) < 4 && h(11.2) > 3.5);
    assert.ok(close(h(11.5), exp(11.5, 4)));
    // x=10、x=12 顶 3，紧邻高列：填角向上弯，角点处高 3 + FILLET_RADIUS。
    assert.ok(Math.abs(h(10.9999) - (3 + FILLET_RADIUS + organicTopOffset(10.9999, 3))) < 0.02, `fillet ${h(10.9999)}`);
    assert.ok(Math.abs(h(12.0001) - (3 + FILLET_RADIUS + organicTopOffset(12.0001, 3))) < 0.02);
    // x=10 左接半格台阶：顶边随平滑位移（无圆角/填角）；半砖右端不圆角，台阶两侧连续。
    assert.ok(close(h(10.5), smoothTopY(10.5, 3, D(10.5, 2), true)));
    assert.ok(close(h(9.9), smoothTopY(9.9, 3.5, D(9.9, 3), true)));
    assert.ok(close(h(10.05), smoothTopY(10.05, 3, D(10.05, 2), true)));
    assert.ok(Math.abs(h(9.9999) - h(10.0001)) < 0.01, `half step continuous: ${h(9.9999)} → ${h(10.0001)}`);
  });

  test('越界列按边缘列延伸；ground 长度不符或 x 非有限即抛', () => {
    // 越界列按边缘列延伸（同列高度，仅有机起伏不同）。
    assert.ok(Math.abs(h(-3) - (ground[0] as number)) <= ORGANIC_TOP_AMP + 1e-12 && Math.abs(h(0.5) - (ground[0] as number)) <= ORGANIC_TOP_AMP + 1e-12);
    assert.throws(() => createGroundProfile(level.map, new Int16Array(3)), /ground-profile/);
    assert.throws(() => h(Number.NaN), /ground-profile/);
  });

  test('SHAPE 常量与夹具一致（守护夹具）', () => {
    assert.equal(level.map.shapeAt(4, 3), SHAPE_SLOPE_R);
    assert.equal(level.map.shapeAt(8, 3), SHAPE_SLOPE_L);
    assert.equal(level.map.shapeAt(9, 3), SHAPE_HALF);
  });
});

// ---------- 斜坡/半砖几何 ----------

function layered(root: THREE.Object3D, prefix: string) {
  const out: Array<{ x: number; y: number; key: string; shape: number; top: number; layersTop: number }> = [];
  const mat = new THREE.Matrix4();
  const p = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.InstancedMesh;
    if (!m.isInstancedMesh || !m.name.startsWith(prefix)) return;
    const shape = m.geometry.getAttribute('aShape');
    const code = m.geometry.getAttribute('aCode');
    const layers = m.geometry.getAttribute('aLayers');
    for (let i = 0; i < m.count; i++) {
      m.getMatrixAt(i, mat);
      p.setFromMatrixPosition(mat);
      out.push({ x: p.x - 0.5, y: p.y - 0.5, key: (m.userData.tileKeys as string[])[i] as string, shape: shape.getX(i) % 8, top: code.getW(i), layersTop: layers.getY(i) });
    }
  });
  return out;
}

describe('斜坡几何（半砖见 render-relief-steps）', () => {
  for (const shape of [SHAPE_SLOPE_R, SHAPE_SLOPE_L] as const) {
    test(`形状 ${shape}：截面顶线与 shapeTopAt 一致，z ∈ [BLOCK_BACK_Z, BLOCK_FRONT_Z]，不参与圆角，三角形朝外`, () => {
      const g = createShapeGeometry(shape);
      const pos = g.getAttribute('position');
      const nrm = g.getAttribute('normal');
      const vert = g.getAttribute('aVert');
      const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
      assert.ok(Math.abs(box.min.z - BLOCK_BACK_Z) < 1e-9 && Math.abs(box.max.z - BLOCK_FRONT_Z) < 1e-9);
      let slopeVerts = 0;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        // 不参与圆角：只有 −1（不位移）或 SHAPE_TOP_VERTEX（顶线上，着色器做顶边有机/平滑位移）；
        // 顶线与底边共用的斜坡低端拆成两个重合顶点（底边端 −1，顶线端 SHAPE_TOP_VERTEX）。
        const onLine = Math.abs(y + 0.5 - shapeTopAt(shape, x + 0.5)) < 1e-9;
        if (!onLine) assert.equal(vert.getX(i), -1, `vertex (${x},${y}) tag`);
        else assert.ok(vert.getX(i) === SHAPE_TOP_VERTEX || (Math.abs(y + 0.5) < 1e-9 && vert.getX(i) === -1), `vertex (${x},${y}) tag`);
        // 截面内：y 不超过形状顶线。
        assert.ok(y + 0.5 <= shapeTopAt(shape, x + 0.5) + 1e-9, `vertex (${x},${y}) inside profile`);
        if (vert.getW(i) === KIND_SLOPE_TOP) {
          slopeVerts++;
          assert.ok(Math.abs(y + 0.5 - shapeTopAt(shape, x + 0.5)) < 1e-9, 'slope face lies on shapeTopAt');
          // 前沿滚圆环上法线 = 斜面外法线·sinφ + z·cosφ：xy 分量方向为 45° 斜上（φ=0 的前沿环为纯 +z）。
          const hx = nrm.getX(i);
          const hy = nrm.getY(i);
          const hl = Math.hypot(hx, hy);
          if (hl > 1e-6) assert.ok(hy / hl > 0.7 && Math.abs(Math.abs(hx / hl) - Math.SQRT1_2) < 1e-6, 'slope normal points up-out at 45°');
          else assert.ok(nrm.getZ(i) > 0.99, 'front ring of the roll faces +z');
        }
      }
      // 低端拆分：前面环上同一位置有一对不同标记的顶点。
      const lowX = shape === SHAPE_SLOPE_R ? -0.5 : 0.5;
      const lowTags = new Set<number>();
      for (let i = 0; i < pos.count; i++) if (vert.getW(i) === KIND_FRONT && Math.abs(pos.getX(i) - lowX) < 1e-9 && Math.abs(pos.getY(i) + 0.5) < 1e-9) lowTags.add(vert.getX(i));
      assert.deepEqual([...lowTags].sort(), [-1, SHAPE_TOP_VERTEX], 'low corner split into bottom/top vertices');
      assert.equal(slopeVerts, 2 * EDGE_SEGMENTS * (ROUND_RINGS + WALL_RINGS + 1), 'slope face subdivided for the organic outline and relief rings');
      // 顶线逐点：前面最高点 = shapeTopAt。
      for (const fx of [0, 0.25, 0.5, 0.75, 1]) {
        let top = -Infinity;
        const idx = g.getIndex() as THREE.BufferAttribute;
        for (let t = 0; t < idx.count; t += 3) {
          const tri = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)];
          if (!tri.every((k) => vert.getW(k) === KIND_FRONT)) continue;
          for (let a = 0; a < 3; a++) {
            const p = tri[a] as number;
            const q = tri[(a + 1) % 3] as number;
            const [x0, y0, x1, y1] = [pos.getX(p) + 0.5, pos.getY(p) + 0.5, pos.getX(q) + 0.5, pos.getY(q) + 0.5];
            if ((fx - x0) * (fx - x1) > 1e-12 || Math.abs(x1 - x0) < 1e-12) continue;
            top = Math.max(top, y0 + ((y1 - y0) * (fx - x0)) / (x1 - x0));
          }
        }
        assert.ok(Math.abs(top - shapeTopAt(shape, fx)) < 1e-9, `front top at ${fx}: ${top}`);
      }
      const idx = g.getIndex() as THREE.BufferAttribute;
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c = new THREE.Vector3();
      for (let t = 0; t < idx.count; t += 3) {
        a.fromBufferAttribute(pos, idx.getX(t));
        b.fromBufferAttribute(pos, idx.getX(t + 1));
        c.fromBufferAttribute(pos, idx.getX(t + 2));
        const n = b.sub(a).cross(c.sub(a));
        if (n.lengthSq() < 1e-12) continue; // 低端拆分的零长边（平滑位移抬起时才张开）
        const vn = new THREE.Vector3();
        for (let k = 0; k < 3; k++) vn.add(new THREE.Vector3().fromBufferAttribute(nrm, idx.getX(t + k)));
        assert.ok(n.dot(vn) > 0, `triangle ${t / 3} faces outward`);
      }
    });
  }

  test('整砖/半砖不是合法输入（半砖走 createHalfGeometry）', () => {
    assert.throws(() => createShapeGeometry(SHAPE_FULL), /tile-geometry/);
    assert.throws(() => createShapeGeometry(SHAPE_HALF), /createHalfGeometry/);
  });
});

describe('tile-view 斜坡', () => {
  test('斜坡/半砖进各自的实例网格（aShape 对应形状），整砖 aShape=0；草坡顶为草顶层 + 草边装饰带', () => {
    const view = createTileView(slopeLevel().map);
    view.update();
    const r = layered(view.root, 'tiles-slopeR');
    const l = layered(view.root, 'tiles-slopeL');
    const h = layered(view.root, 'tiles-half');
    assert.deepEqual(r.map((p) => [p.x, p.y, p.shape]), [[4, 3, SHAPE_SLOPE_R]]);
    assert.deepEqual(l.map((p) => [p.x, p.y, p.shape]), [[8, 3, SHAPE_SLOPE_L]]);
    assert.deepEqual(h.map((p) => [p.x, p.y, p.shape]), [[9, 3, SHAPE_HALF]]);
    for (const p of [...r, ...l, ...h]) {
      assert.equal(p.key, 'grass');
      assert.equal(p.layersTop, L('grassTop'), 'exposed grass slope uses the grass top layer');
      assert.equal(p.top, EDGE_EXPOSED_FRINGE, 'grass edge band along the slope');
    }
    assert.ok(layered(view.root, 'tiles-block').every((p) => p.shape === SHAPE_FULL));
    view.dispose();
  });

  test('坡脚与坡顶无填角；整砖台阶仍有填角', () => {
    const view = createTileView(slopeLevel().map);
    view.update();
    const fillets: Array<{ x: number; y: number }> = [];
    const mat = new THREE.Matrix4();
    const p = new THREE.Vector3();
    view.root.traverse((o) => {
      const m = o as THREE.InstancedMesh;
      if (!m.isInstancedMesh || !m.name.startsWith('tiles-fillet')) return;
      for (let i = 0; i < m.count; i++) {
        m.getMatrixAt(i, mat);
        p.setFromMatrixPosition(mat);
        fillets.push({ x: p.x, y: p.y });
      }
    });
    // 角点：斜坡 R 坡脚 (4,3)、坡顶 (5,4)；斜坡 L 坡顶 (8,4)、坡脚 (9,3)。
    for (const [x, y] of [[4, 3], [5, 4], [8, 4], [9, 3], [9, 4], [10, 3]]) {
      assert.ok(!fillets.some((f) => f.x === x && f.y === y), `no fillet at (${x},${y})`);
    }
    assert.ok(fillets.some((f) => f.x === 11 && f.y === 3) && fillets.some((f) => f.x === 12 && f.y === 3), 'full-brick step keeps fillets');
    view.dispose();
  });

  test('材质（结构）：aShape/aTop 实例属性；斜面（KIND_SLOPE_TOP）走顶面层分支；草边按平滑顶线距离；缓存键 = 源码哈希', () => {
    const mat = createTileMaterial(generateTileTextures(32));
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} as Record<string, THREE.IUniform> };
    mat.onBeforeCompile(shader as never, null as never);
    const decl = glslDeclarations(shader.vertexShader);
    assert.equal(decl.get('aShape')?.type, 'float');
    assert.equal(decl.get('aTop')?.type, 'vec4');
    assert.equal(glslDeclarations(shader.fragmentShader).get('vTileTop')?.qualifier, 'flat varying');
    const fns = glslFunctionNames(shader.fragmentShader);
    for (const fn of ['tileShapeTop', 'tileShapeSlope', 'tileTopLine', 'tileTopDist']) assert.ok(fns.has(fn), `defines ${fn}`);
    assert.ok(glslIdentifiers(shader.fragmentShader).has('vTileKind'), 'slope faces branch on the vertex kind');
    assert.equal(mat.customProgramCacheKey(), TILE_PROGRAM_KEY);
    assert.equal(KIND_SLOPE_TOP, 5);
    mat.dispose();
  });
});
