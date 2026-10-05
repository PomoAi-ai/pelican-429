// 013：有机地形过渡（轮廓起伏、材质咬合、草垂挂、大尺度明暗）——着色器逻辑的 JS 镜像测试。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { ARC_SEGMENTS, EDGE_SEGMENTS } from '../src/render/tile-geometry.ts';
import { TILE_PROGRAM_KEY, TILE_SHADER_INJECTIONS, TILE_SHADER_PARAMS, createTileMaterial } from '../src/render/tile-material.ts';
import { glslCalls, glslConstantValues, glslDeclarations, glslFunctionNames, glslIdentifiers, glslNumericLiterals, injectedAfter } from './helpers/glsl.ts';
import {
  INTERLOCK_JAG,
  MACRO_AMP,
  ORGANIC_ARC_MID_MAX,
  ORGANIC_GLSL,
  ORGANIC_GLSL_FUNCTIONS,
  ORGANIC_PARAMS,
  hermiteAt,
  hermiteSlope,
  organicTaper,
  organicTopOffset,
  smoothTopY,
  ORGANIC_SIDE_AMP,
  ORGANIC_TOP_AMP,
  SEAM_AO_STRENGTH,
  edgeNoise,
  grassHang,
  interlockOffset,
  interlockOwner,
  interlockSigned,
  macroShade,
  organicBlockContour,
  organicHash,
  organicNoise2,
  seamShade,
} from '../src/render/tile-organic.ts';
import { TILE_TEXTURE_PERIOD, generateTileTextures } from '../src/render/tile-textures.ts';
import { CONVEX_RADIUS, MAX_CONTOUR_DEVIATION, contourDeviation } from '../src/render/tile-transitions.ts';
import { ORGANIC_FLAG, createTileView } from '../src/render/tile-view.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES, TILE_DIRT, TILE_GRASS, TILE_PLATFORM, TILE_TIMBER } from '../src/world/tile-types.ts';
import { L, texel } from './helpers/render-fixtures.ts';

/** 点到线段距离。 */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
const polyDist = (px: number, py: number, poly: ReadonlyArray<readonly [number, number]>): number => {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as readonly [number, number];
    const b = poly[(i + 1) % poly.length] as readonly [number, number];
    d = Math.min(d, segDist(px, py, a[0], a[1], b[0], b[1]));
  }
  return d;
};

describe('噪声基础', () => {
  test('哈希/噪声确定、范围正确、负坐标可用', () => {
    for (let i = -50; i < 50; i++) {
      const h = organicHash(i * 37, -i * 11, 7);
      assert.ok(h >= 0 && h < 1);
      assert.equal(h, organicHash(i * 37, -i * 11, 7));
      const n = edgeNoise(i * 0.37, i * -0.21 + 300);
      assert.ok(n >= -1 && n <= 1);
      const v = organicNoise2(i * 0.13, 1200 + i, 3);
      assert.ok(v >= 0 && v <= 1);
    }
    assert.notEqual(organicHash(1, 2, 3), organicHash(2, 1, 3));
  });

  test('GLSL 与 JS 同表：着色器常量由 ORGANIC_PARAMS 生成且逐项相等；函数体只引用表中常量（无表外数字）；表中每项都被用到', () => {
    const consts = glslConstantValues(ORGANIC_GLSL);
    for (const [name, v] of Object.entries(ORGANIC_PARAMS)) {
      assert.ok(consts.has(name), `GLSL declares ${name}`);
      const expected = name.startsWith('HASH_') ? v >>> 0 : v;
      assert.equal(consts.get(name), expected, `${name}: GLSL ${consts.get(name)} vs JS ${expected}`);
    }
    // 函数体的数字字面量只允许结构常数（smoothstep 的 2/3、Hermite 的 2/3/4/6、哈希位移 15/16、2^32 归一化、0/0.5/1、边序 2）。
    const allowed = new Set(['0.0', '0.5', '1.0', '2.0', '3.0', '4.0', '6.0', '1', '2', '15u', '16u', '4294967296.0']);
    const stray = glslNumericLiterals(ORGANIC_GLSL_FUNCTIONS).filter((n) => !allowed.has(n));
    assert.deepEqual(stray, [], `tunable numbers must come from ORGANIC_PARAMS: ${stray.join(', ')}`);
    const used = new Set([...glslIdentifiers(ORGANIC_GLSL_FUNCTIONS), ...TILE_SHADER_INJECTIONS.flatMap((j) => [...glslIdentifiers(j.code)])]);
    for (const name of Object.keys(ORGANIC_PARAMS)) assert.ok(used.has(name), `${name} is used by the shader`);
    for (const fn of ['tOrgHash', 'tOrgNoise2', 'tEdgeNoise', 'tOrgTaper', 'tHerm', 'tHermD', 'tInterlock', 'tSpeckle', 'tSeamShade', 'tMacroShade', 'tGrassHang']) {
      assert.ok(glslFunctionNames(ORGANIC_GLSL).has(fn), `defines ${fn}`);
    }
    // tile-material 的参数表同样生成常量。
    const mconsts = glslConstantValues(TILE_SHADER_INJECTIONS[0]?.code ?? '');
    for (const [name, v] of Object.entries(TILE_SHADER_PARAMS)) assert.equal(mconsts.get(name), v, `material constant ${name}`);
    assert.equal(ORGANIC_PARAMS.ORG_DEV_LIMIT, MAX_CONTOUR_DEVIATION, 'taper limit equals the contour deviation budget');
  });

  test('Hermite 与收窄：端点值/斜率与系数一致；收窄后 |D| + 起伏 ≤ ORG_DEV_LIMIT；smoothTopY 在 D=0 时退化为原有机顶边', () => {
    const h = [0.2, -0.1, 0.5, -0.3] as const;
    assert.ok(Math.abs(hermiteAt(h, 0) - 0.2) < 1e-12 && Math.abs(hermiteAt(h, 1) + 0.1) < 1e-12);
    assert.ok(Math.abs(hermiteSlope(h, 0) - 0.5) < 1e-12 && Math.abs(hermiteSlope(h, 1) + 0.3) < 1e-12);
    const e = 1e-6;
    for (const f of [0.1, 0.4, 0.8]) assert.ok(Math.abs((hermiteAt(h, f + e) - hermiteAt(h, f - e)) / (2 * e) - hermiteSlope(h, f)) < 1e-6);
    for (let d = -0.3; d <= 0.3; d += 0.01) {
      for (let x = 0; x < 20; x += 0.37) {
        const y = smoothTopY(x, 5, d, true);
        assert.ok(Math.abs(y - 5) <= Math.max(Math.abs(d), ORGANIC_PARAMS.ORG_DEV_LIMIT) + 1e-12, `deviation at d=${d}`);
      }
    }
    assert.equal(organicTaper(0), 1);
    assert.equal(organicTaper(ORGANIC_PARAMS.ORG_DEV_LIMIT), 0);
    for (let x = 0; x < 10; x += 0.3) assert.equal(smoothTopY(x, 3, 0, true), 3 + organicTopOffset(x, 3));
  });
});

describe('有机轮廓', () => {
  test('孤立方块（四边暴露、四角圆角）：轮廓与碰撞方格的偏差 ≤ MAX_CONTOUR_DEVIATION；顶边起伏 ≤ ORGANIC_TOP_AMP，侧边 ≤ ORGANIC_SIDE_AMP', () => {
    assert.ok(contourDeviation(CONVEX_RADIUS) + ORGANIC_ARC_MID_MAX <= MAX_CONTOUR_DEVIATION);
    assert.ok(ORGANIC_TOP_AMP <= 0.06 + 1e-12 && ORGANIC_SIDE_AMP <= 0.15);
    let maxDev = 0;
    let topSpread = 0;
    for (let cx = -20; cx < 60; cx += 3) {
      for (const cy of [3, 17, 40]) {
        const poly = organicBlockContour(cx, cy, [true, true, true, true], [true, true, true, true], CONVEX_RADIUS, ARC_SEGMENTS, EDGE_SEGMENTS);
        const square: Array<[number, number]> = [[cx, cy], [cx + 1, cy], [cx + 1, cy + 1], [cx, cy + 1]];
        // 轮廓点 → 方格边界、方格边界采样点 → 轮廓（双向 Hausdorff）。
        for (const [x, y] of poly) maxDev = Math.max(maxDev, polyDist(x, y, square));
        for (let k = 0; k <= 40; k++) {
          const t = k / 40;
          for (const [x, y] of [[cx + t, cy], [cx + t, cy + 1], [cx, cy + t], [cx + 1, cy + t]] as const) maxDev = Math.max(maxDev, polyDist(x, y, poly));
        }
        // 顶边直线段（圆角之间）：只沿 y 起伏。
        const tops = poly.filter(([x, y]) => x > cx + CONVEX_RADIUS + 1e-6 && x < cx + 1 - CONVEX_RADIUS - 1e-6 && y > cy + 0.8);
        for (const [, y] of tops) assert.ok(Math.abs(y - (cy + 1)) <= ORGANIC_TOP_AMP + 1e-9);
        const sides = poly.filter(([x, y]) => y > cy + CONVEX_RADIUS + 1e-6 && y < cy + 1 - CONVEX_RADIUS - 1e-6 && x < cx + 0.3);
        for (const [x] of sides) assert.ok(Math.abs(x - cx) <= ORGANIC_SIDE_AMP + 1e-9);
        topSpread = Math.max(topSpread, Math.max(...tops.map((p) => p[1])) - Math.min(...tops.map((p) => p[1])));
      }
    }
    assert.ok(maxDev <= MAX_CONTOUR_DEVIATION, `max deviation ${maxDev}`);
    assert.ok(topSpread > 0.02, 'the top edge actually undulates');
  });

  test('相邻同行草顶：共享角点位移一致（无裂缝）；不暴露的边不位移（同材质内部无缝）', () => {
    for (let x = 0; x < 40; x++) {
      // A 在左、B 在右，两者只有顶边暴露（左右为实心邻居），角不圆。
      const A = organicBlockContour(x, 5, [false, false, false, true], [false, false, false, false], CONVEX_RADIUS, ARC_SEGMENTS, EDGE_SEGMENTS);
      const B = organicBlockContour(x + 1, 5, [false, false, false, true], [false, false, false, false], CONVEX_RADIUS, ARC_SEGMENTS, EDGE_SEGMENTS);
      const perCorner = ARC_SEGMENTS + EDGE_SEGMENTS; // 每角 ARC+1 点 + 其后一条边 EDGE−1 点
      const aTopRight = A[2 * perCorner] as [number, number];
      const bTopLeft = B[3 * perCorner] as [number, number];
      assert.ok(Math.abs(aTopRight[0] - bTopLeft[0]) < 1e-12 && Math.abs(aTopRight[1] - bTopLeft[1]) < 1e-12, `shared corner at x=${x + 1}`);
      // 右边（不暴露）细分点 x 恒为格边。
      const right = A.slice(perCorner + ARC_SEGMENTS + 1, 2 * perCorner);
      for (const [px] of right) assert.ok(Math.abs(px - (x + 1)) < 1e-12);
    }
  });
});

describe('材质咬合', () => {
  const WIDTH = 0.3;
  const SCALE = 1.3;

  test('竖直分界：两侧用同一世界函数（左格 s = −右格 s），分界不是直线，交界两侧都有对方材质像素与碎块', () => {
    const edgeX = 10;
    let leftOther = 0;
    let rightOther = 0;
    let leftSpeck = 0;
    let rightSpeck = 0;
    const offs: number[] = [];
    for (let py = 0; py < 600; py++) {
      const wy = 3 + py / 40;
      for (let px = 0; px < 40; px++) {
        const dx = (px + 0.5) / 40; // 0..1
        // 左格（右边 i=1）像素 x = edgeX − dx；右格（左边 i=0）像素 x = edgeX + dx。
        const xl = edgeX - dx;
        const xr = edgeX + dx;
        const Fl = interlockOffset(1, edgeX, wy, WIDTH, SCALE, xl, wy);
        const Fr = interlockOffset(0, edgeX, wy, WIDTH, SCALE, xl, wy);
        assert.equal(Fl, Fr, 'same boundary function on both sides');
        assert.ok(Math.abs(interlockSigned(1, dx, Fl) + interlockSigned(0, -dx, Fr)) < 1e-12);
        if (px === 0) offs.push(Fl);
        if (interlockOwner(1, dx, edgeX, wy, WIDTH, SCALE, xl, wy) === 'other') {
          leftOther++;
          if (interlockSigned(1, dx, Fl) > 0) leftSpeck++;
        }
        if (interlockOwner(0, dx, edgeX, wy, WIDTH, SCALE, xr, wy) === 'other') {
          rightOther++;
          if (interlockSigned(0, dx, interlockOffset(0, edgeX, wy, WIDTH, SCALE, xr, wy)) > 0) rightSpeck++;
        }
      }
    }
    assert.ok(leftOther > 0 && rightOther > 0, `both sides show the other material (${leftOther}, ${rightOther})`);
    assert.ok(leftSpeck > 0 && rightSpeck > 0, `detached clumps on both sides (${leftSpeck}, ${rightSpeck})`);
    assert.ok(Math.max(...offs) - Math.min(...offs) > 0.25, 'jagged, not a straight seam');
    assert.ok(Math.max(...offs.map(Math.abs)) <= WIDTH + INTERLOCK_JAG + 1e-12, 'bounded within the band');
  });

  test('分界暗边：分界线处压暗 SEAM_AO_STRENGTH，离开分界恢复；确定性', () => {
    assert.ok(Math.abs(seamShade(0) - (1 - SEAM_AO_STRENGTH)) < 1e-12);
    assert.equal(seamShade(0.2), 1);
    assert.equal(seamShade(-0.2), 1);
    assert.equal(interlockOwner(2, 0.1, 7, 3.3, WIDTH, SCALE, 3.3, 7.1), interlockOwner(2, 0.1, 7, 3.3, WIDTH, SCALE, 3.3, 7.1));
  });
});

describe('草垂挂与大尺度明暗', () => {
  test('侧边草自顶边垂挂：边缘处 .3–.8 格（含草丝抖动），离边 ≥ .45 只剩草丝', () => {
    const hangs: number[] = [];
    for (let x = 0; x < 300; x++) {
      const h = grassHang(x, 12, 0, x + 0.01);
      assert.ok(h >= 0.3 - 0.12 - 1e-9 && h <= 0.8 + 0.12 + 1e-9, `hang ${h}`);
      hangs.push(h);
      assert.ok(grassHang(x, 12, 0.5, x + 0.3) <= 0.12 + 1e-9);
    }
    const mean = hangs.reduce((a, b) => a + b, 0) / hangs.length;
    assert.ok(mean > 0.4 && mean < 0.7, `mean ${mean}`);
    assert.ok(Math.max(...hangs) - Math.min(...hangs) > 0.3, 'ragged hang lengths');
  });

  test('大尺度明暗 ±MACRO_AMP（10–15%），低频；最终正面亮度在 1 格滞后处没有自相关峰（无逐格周期）', () => {
    assert.ok(MACRO_AMP >= 0.1 && MACRO_AMP <= 0.15);
    let lo = Infinity;
    let hi = -Infinity;
    for (let x = 0; x < 400; x += 0.5) {
      const m = macroShade(x, 7.3);
      lo = Math.min(lo, m);
      hi = Math.max(hi, m);
      assert.ok(m >= 1 - MACRO_AMP - 1e-12 && m <= 1 + MACRO_AMP + 1e-12);
    }
    assert.ok(hi - lo > 0.12, `macro range ${lo}..${hi}`);
    // 合成亮度：泥土纹理（世界连续，PERIOD 格一周期）× 大尺度明暗；每格 16 个采样。
    const PER = 16;
    const tex = generateTileTextures(PER * TILE_TEXTURE_PERIOD);
    const row = 21;
    const lum: number[] = [];
    for (let i = 0; i < 256 * PER; i++) {
      const px = i % tex.size;
      const t = texel(tex, L('dirt'), px, row);
      const base = (0.2126 * t.r + 0.7152 * t.g + 0.0722 * t.b) / 255;
      lum.push(base * macroShade(i / PER, 5.5));
    }
    const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
    const v = lum.map((x) => x - mean);
    const ac = (lag: number) => {
      let s = 0;
      let n = 0;
      for (let i = 0; i + lag < v.length; i++) {
        s += (v[i] as number) * (v[i + lag] as number);
        n += (v[i] as number) ** 2;
      }
      return s / n;
    };
    const at1 = ac(PER);
    assert.ok(at1 <= Math.max(ac(PER - 4), ac(PER + 4)) + 0.05, `no peak at one-tile lag: ${at1.toFixed(3)} vs ${ac(PER - 4).toFixed(3)}/${ac(PER + 4).toFixed(3)}`);
    assert.ok(at1 < 0.5, `weak one-tile correlation ${at1.toFixed(3)}`);
  });
});

describe('瓦片视图有机标记与着色器', () => {
  test('smooth 材质（草/泥土）有机标记 1（aShape ≥ ORGANIC_FLAG）；木料（hard）与平台 0；填角为 1 且 aScale.x=角序', () => {
    const map = createTileMap(32, 16, DEFAULT_TILES);
    for (let x = 0; x < 32; x++) map.set(x, 0, TILE_DIRT);
    for (let x = 0; x < 6; x++) map.set(x, 1, TILE_GRASS);
    map.set(3, 2, TILE_GRASS); // 台阶 → 两侧填角
    map.set(20, 1, TILE_TIMBER);
    map.set(25, 5, TILE_PLATFORM);
    const view = createTileView(map);
    view.update();
    const seen = new Map<string, Set<number>>();
    view.root.traverse((o) => {
      const m = o as THREE.InstancedMesh;
      if (!m.isInstancedMesh || !m.name.startsWith('tiles-') || m.name.startsWith('tiles-flora-') || m.name.startsWith('tiles-cover-') || m.name.startsWith('tiles-shrub-') || m.name.startsWith('tiles-climb-')) return;
      const shape = m.geometry.getAttribute('aShape');
      const keys = m.userData.tileKeys as string[];
      for (let i = 0; i < m.count; i++) {
        const key = m.name.startsWith('tiles-fillet') ? 'fillet' : (keys[i] as string);
        if (!seen.has(key)) seen.set(key, new Set());
        seen.get(key)?.add(shape.getX(i) >= ORGANIC_FLAG ? 1 : 0);
      }
      if (m.name.startsWith('tiles-fillet')) {
        const sc = m.geometry.getAttribute('aScale');
        const corners = m.userData.corners as number[];
        for (let i = 0; i < m.count; i++) assert.equal(sc.getX(i), corners[i]);
      }
    });
    assert.deepEqual([...(seen.get('grass') ?? [])], [1]);
    assert.deepEqual([...(seen.get('dirt') ?? [])], [1]);
    assert.deepEqual([...(seen.get('timber') ?? [])], [0]);
    assert.deepEqual([...(seen.get('platform') ?? [])], [0]);
    assert.deepEqual([...(seen.get('fillet') ?? [])], [1]);
    view.dispose();
  });

  test('材质注入（结构）：五个注入点就位；aTop/aShape 实例属性；顶点用 Hermite 位移与法线旋转、有机噪声；片元调用咬合/碎块/暗边/草垂挂/淤泥/楔形；缓存键由源码哈希得到', () => {
    const mat = createTileMaterial(generateTileTextures(32));
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} as Record<string, THREE.IUniform> };
    mat.onBeforeCompile(shader as never, null as never);
    assert.deepEqual(TILE_SHADER_INJECTIONS.map((j) => `${j.stage}:${j.include}`), ['vertex:common', 'vertex:beginnormal_vertex', 'vertex:begin_vertex', 'fragment:common', 'fragment:map_fragment']);
    for (const j of TILE_SHADER_INJECTIONS) assert.ok(injectedAfter(j.stage === 'vertex' ? shader.vertexShader : shader.fragmentShader, j.include, j.code), `${j.stage}:${j.include}`);
    const decl = glslDeclarations(shader.vertexShader);
    assert.equal(decl.get('aTop')?.type, 'vec4');
    assert.equal(decl.get('aShape')?.type, 'float');
    const code = (stage: 'vertex' | 'fragment', include: string) => TILE_SHADER_INJECTIONS.find((j) => j.stage === stage && j.include === include)?.code ?? '';
    const normalCalls = glslCalls(code('vertex', 'beginnormal_vertex'));
    assert.ok(normalCalls.has('tHermD') && normalCalls.has('atan'), 'normals follow the smoothed slope');
    const mainCalls = glslCalls(code('vertex', 'begin_vertex'));
    for (const fn of ['tHerm', 'tEdgeNoise', 'tOrgTaper', 'tTopWeight', 'tPackOrganic']) assert.ok(mainCalls.has(fn), `vertex main calls ${fn}`);
    const fragCalls = glslCalls(code('fragment', 'common'));
    for (const fn of ['tInterlock', 'tSpeckle', 'tSeamShade', 'tGrassHang', 'tMacroShade', 'tileTopLine', 'tileTopDist', 'tileMud', 'tileWedge', 'tileFringe']) assert.ok(fragCalls.has(fn), `fragment calls ${fn}`);
    assert.match(mat.customProgramCacheKey(), /^tile-layers-[0-9a-f]{8}$/);
    assert.equal(mat.customProgramCacheKey(), TILE_PROGRAM_KEY);
    assert.equal(createTileMaterial(generateTileTextures(32)).customProgramCacheKey(), TILE_PROGRAM_KEY, 'stable across instances');
    mat.dispose();
  });
});
