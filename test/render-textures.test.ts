// 012 W4：方块纹理/几何/材质（原 render-surface 拆分）。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { TILE_TEXTURE_LAYERS, TILE_TEXTURE_PERIOD, generateTileTextures } from '../src/render/tile-textures.ts';
import {
  BLOCK_BACK_Z,
  BLOCK_FRONT_Z,
  KIND_BACK,
  KIND_FRONT,
  KIND_WALL,
  createBlockGeometry,
  createFilletGeometry,
  createSlabGeometry,
} from '../src/render/tile-geometry.ts';
import { BLADE_SEGMENTS, TUFT_BLADES, createDaisyGeometry, createGrassTuftGeometry } from '../src/render/flora-geometry.ts';
import { TILE_INSTANCE_ATTRIBUTES, TILE_PROGRAM_KEY, TILE_SHADER_INJECTIONS, TILE_VERTEX_ATTRIBUTES, createTileMaterial } from '../src/render/tile-material.ts';
import { glslCalls, glslDeclarations, glslFunctionNames, injectedAfter } from './helpers/glsl.ts';
import { FILLET_RADIUS } from '../src/render/tile-transitions.ts';
import { L, layerStats, texel } from './helpers/render-fixtures.ts';

describe('tile-textures', () => {
  test('层表、尺寸与确定性；材质层不透明，grassSide 为 alpha 装饰带', () => {
    assert.deepEqual([...TILE_TEXTURE_LAYERS], ['dirt', 'grassSide', 'grassTop', 'stone', 'sand', 'planks', 'sandstone']);
    assert.equal(TILE_TEXTURE_PERIOD, 8);
    const a = generateTileTextures();
    assert.equal(a.size, 512, '64 px per tile over an 8-tile period');
    assert.equal(a.layers, 7);
    assert.equal(a.data.length, 7 * 512 * 512 * 4);
    assert.deepEqual(generateTileTextures(), a, 'same seed → identical bytes');
    assert.notDeepEqual(generateTileTextures(512, 2).data, a.data, 'different seed → different bytes');
    const n = a.size * a.size;
    for (const name of TILE_TEXTURE_LAYERS) {
      if (name === 'grassSide') continue;
      const off = L(name) * n * 4;
      for (let i = 0; i < n; i++) assert.equal(a.data[off + 4 * i + 3], 255, name);
    }
    assert.throws(() => generateTileTextures(3), /tile-textures/);
    assert.throws(() => generateTileTextures(100), /divisible/);
  });

  test('(d) 石头冷深灰：平均亮度 ∈ [.28,.42]，低于沙子与草顶，带冷色相（b>r）且色度 >.02', () => {
    const t = generateTileTextures();
    const stone = layerStats(t, 'stone');
    assert.ok(stone.lum >= 0.28 && stone.lum <= 0.42, `stone luminance ${stone.lum}`);
    assert.ok(stone.lum < layerStats(t, 'sand').lum);
    assert.ok(stone.lum < layerStats(t, 'grassTop').lum);
    assert.ok(stone.chroma > 0.02, `stone chroma ${stone.chroma}`);
    for (const name of TILE_TEXTURE_LAYERS) assert.ok(layerStats(t, name).chroma > 0.02, name);
  });

  test('沙纹柔和、尺度不一、无逐格周期：纵向亮度相对标准差 ∈ [1.5%, 7%]；没有单一主周期（各滞后自相关 |ρ| < .25，1 格处无峰）；行均值只占少量方差（不是一行行横条）；有细颗粒', () => {
    const t = generateTileTextures();
    const l = L('sand');
    const per = t.size / TILE_TEXTURE_PERIOD;
    const wrap = (v: number) => ((v % t.size) + t.size) % t.size;
    const lum = (x: number, y: number) => {
      const p = texel(t, l, wrap(x), wrap(y));
      return 0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b;
    };
    let relStd = 0;
    const cols = t.size / 8;
    for (let x = 0; x < t.size; x += 8) {
      let sum = 0;
      for (let y = 0; y < t.size; y++) sum += lum(x, y);
      const mean = sum / t.size;
      let v = 0;
      for (let y = 0; y < t.size; y++) v += (lum(x, y) - mean) ** 2;
      relStd += Math.sqrt(v / t.size) / mean;
    }
    relStd /= cols;
    assert.ok(relStd >= 0.015 && relStd <= 0.07, `soft, low-contrast ripples: ${relStd.toFixed(4)}`);
    const ac = (lag: number) => {
      let s = 0;
      let n = 0;
      for (let x = 0; x < t.size; x += 4) {
        let m = 0;
        for (let y = 0; y < t.size; y++) m += lum(x, y);
        m /= t.size;
        for (let y = 0; y < t.size; y++) {
          s += (lum(x, y) - m) * (lum(x, y + lag) - m);
          n += (lum(x, y) - m) ** 2;
        }
      }
      return s / n;
    };
    for (let lag = 6; lag <= 2 * per; lag += 2) assert.ok(Math.abs(ac(lag)) < 0.25, `no dominant ripple period (lag ${lag}: ${ac(lag).toFixed(3)})`);
    assert.ok(ac(per) <= Math.max(ac(per - 8), ac(per + 8)) + 0.05, 'no peak at one-tile lag');
    let mean = 0;
    for (let y = 0; y < t.size; y++) for (let x = 0; x < t.size; x++) mean += lum(x, y);
    mean /= t.size * t.size;
    let total = 0;
    let rows = 0;
    for (let y = 0; y < t.size; y++) {
      let m = 0;
      for (let x = 0; x < t.size; x++) {
        m += lum(x, y);
        total += (lum(x, y) - mean) ** 2;
      }
      rows += (m / t.size - mean) ** 2 * t.size;
    }
    assert.ok(rows / total < 0.3, `ripples are tilted/broken, not row stripes (${(rows / total).toFixed(3)})`);
    let grain = 0;
    for (let y = 0; y < t.size; y++) for (let x = 0; x < t.size; x++) grain += Math.abs(lum(x, y) - lum(x + 1, y));
    assert.ok(grain / (t.size * t.size) > 2, 'fine grains');
  });

  test('草边装饰带：v=1（暴露边）处全为不透明绿色，深于 .6 格处全透明；带内有垂挂草叶', () => {
    const t = generateTileTextures();
    const g = L('grassSide');
    let depthSum = 0;
    let maxDepth = 0;
    for (let x = 0; x < t.size; x++) {
      const edge = texel(t, g, x, t.size - 2);
      assert.equal(edge.a, 255);
      assert.ok(edge.g > edge.r, `x=${x} edge is green`);
      assert.equal(texel(t, g, x, Math.floor(t.size * 0.4)).a, 0, 'no grass deeper than .6 tile');
      let y = t.size - 1;
      while (y > 0 && texel(t, g, x, y).a > 0) y--;
      const depth = 1 - y / t.size;
      depthSum += depth;
      maxDepth = Math.max(maxDepth, depth);
    }
    const mean = depthSum / t.size;
    assert.ok(mean > 0.2 && mean < 0.4, `mean band depth ${mean}`);
    assert.ok(maxDepth > mean + 0.1, `drips hang below the band (max ${maxDepth})`);
  });

  test('草不僵硬：草带厚度沿 x 起伏、下缘 alpha 渐隐无硬边；草顶面有低频明暗（按格均值差 ≥ 8%）', () => {
    const t = generateTileTextures();
    const g = L('grassSide');
    const depths: number[] = [];
    let partial = 0;
    for (let x = 0; x < t.size; x++) {
      let y = t.size - 1;
      while (y > 0 && texel(t, g, x, y).a === 255) y--;
      depths.push(1 - y / t.size);
      for (let k = y; k > Math.max(0, y - 8); k--) {
        const a = texel(t, g, x, k).a;
        if (a > 0 && a < 255) partial++;
      }
    }
    const mean = depths.reduce((a, b) => a + b, 0) / depths.length;
    const std = Math.sqrt(depths.reduce((a, b) => a + (b - mean) ** 2, 0) / depths.length);
    assert.ok(std > 0.04, `band thickness varies (std ${std})`);
    assert.ok(partial > t.size, `soft alpha fade at the band's lower edge (${partial} partial texels)`);
    const top = L('grassTop');
    const per = t.size / TILE_TEXTURE_PERIOD;
    const cellLum: number[] = [];
    for (let cy = 0; cy < TILE_TEXTURE_PERIOD; cy++) {
      for (let cx = 0; cx < TILE_TEXTURE_PERIOD; cx++) {
        let sum = 0;
        for (let y = 0; y < per; y++) for (let x = 0; x < per; x++) {
          const p = texel(t, top, cx * per + x, cy * per + y);
          sum += p.r + p.g + p.b;
        }
        cellLum.push(sum / (per * per));
      }
    }
    const lo = Math.min(...cellLum);
    const hi = Math.max(...cellLum);
    assert.ok((hi - lo) / hi >= 0.08, `grass top low-frequency variation ${(hi - lo) / hi}`);
  });

  test('四方连续、无逐格边框：跨环绕边的色差与内部相邻像素相当；不再有边缘压暗', () => {
    const t = generateTileTextures();
    const per = t.size / TILE_TEXTURE_PERIOD;
    for (const name of ['dirt', 'stone', 'sand', 'grassTop'] as const) {
      const l = L(name);
      const lum = (x: number, y: number) => {
        const p = texel(t, l, x, y);
        return p.r + p.g + p.b;
      };
      let wrapDiff = 0;
      let innerDiff = 0;
      for (let y = 0; y < t.size; y++) {
        wrapDiff += Math.abs(lum(t.size - 1, y) - lum(0, y));
        innerDiff += Math.abs(lum(100, y) - lum(101, y));
      }
      assert.ok(wrapDiff < innerDiff * 2 + t.size * 6, `${name}: wrap seam ${wrapDiff} vs inner ${innerDiff}`);
      // 格边界（每 per 像素）不比格内暗：去掉了逐格假 AO。
      let border = 0;
      let inside = 0;
      for (let y = 0; y < t.size; y++) {
        border += lum(per, y) + lum(per - 1, y);
        inside += lum(per / 2, y) + lum(per / 2 + 1, y);
      }
      assert.ok(border > inside * 0.93, `${name}: tile borders are not darkened (${border} vs ${inside})`);
    }
  });
});

// ---------- 几何 / 材质 ----------

describe('tile-geometry / tile-material', () => {
  test('方块：原始位置为直角方块 x/y ∈ [−.5,.5]、z ∈ [BLOCK_BACK_Z,.5]；轮廓顶点带角序/圆弧角；前面朝 +z、背面朝 −z', () => {
    const g = createBlockGeometry();
    const posAttr = g.getAttribute('position') as THREE.BufferAttribute;
    const box = new THREE.Box3().setFromBufferAttribute(posAttr);
    assert.ok(Math.abs(box.max.x - 0.5) < 1e-6 && Math.abs(box.min.y + 0.5) < 1e-6, 'unit profile');
    assert.ok(Math.abs(box.max.z - BLOCK_FRONT_Z) < 1e-6 && Math.abs(box.min.z - BLOCK_BACK_Z) < 1e-6, 'extruded backwards');
    const vert = g.getAttribute('aVert');
    const normal = g.getAttribute('normal');
    assert.equal(vert.itemSize, 4);
    const kinds = new Set<number>();
    for (let i = 0; i < vert.count; i++) {
      const corner = vert.getX(i);
      const kind = vert.getW(i);
      kinds.add(kind);
      if (corner >= 4 && corner <= 7) {
        // 直边细分点：位于边 e（角 e → 角 e+1）上，参数 t ∈ (0,1)。
        const e = corner - 4;
        const at = (c: number) => [c === 1 || c === 2 ? 0.5 : -0.5, c >= 2 ? 0.5 : -0.5] as const;
        const [ax, ay] = at(e);
        const [bx, by] = at((e + 1) % 4);
        const t = vert.getY(i);
        assert.ok(t > 0 && t < 1);
        assert.ok(Math.abs(posAttr.getX(i) - (ax + (bx - ax) * t)) < 1e-6 && Math.abs(posAttr.getY(i) - (ay + (by - ay) * t)) < 1e-6, `edge vertex ${i}`);
      }
      if (corner >= 0 && corner <= 3) {
        // 原始位置在角点（圆角/倒角都由着色器按实例属性展开）。
        const sx = corner === 1 || corner === 2 ? 0.5 : -0.5;
        const sy = corner >= 2 ? 0.5 : -0.5;
        assert.ok(Math.abs(posAttr.getX(i) - sx) < 1e-6 && Math.abs(posAttr.getY(i) - sy) < 1e-6, `vertex ${i} at its corner`);
      }
      if (kind === KIND_FRONT) assert.ok(normal.getZ(i) > 0.99);
      if (kind === KIND_BACK) assert.ok(normal.getZ(i) < -0.99);
      if (kind === KIND_WALL && corner <= 3) {
        // 侧壁法线 = 圆弧角方向（直边段端点即边的外法线）。
        const th = vert.getY(i);
        assert.ok(Math.abs(normal.getX(i) - Math.cos(th)) < 1e-6 && Math.abs(normal.getY(i) - Math.sin(th)) < 1e-6);
      }
    }
    assert.deepEqual([...kinds].sort(), [0, 1, 2, 3]);
    const slab = createSlabGeometry();
    const sbox = new THREE.Box3().setFromBufferAttribute(slab.getAttribute('position') as THREE.BufferAttribute);
    assert.ok(Math.abs(sbox.max.y - 0.125) < 1e-6 && Math.abs(sbox.min.z + 0.5) < 1e-6, 'slab is thin and not extended');
    const tuft = createGrassTuftGeometry();
    const pos = tuft.getAttribute('position');
    const color = tuft.getAttribute('color');
    const tipAttr = tuft.getAttribute('aTip');
    const perBlade = (BLADE_SEGMENTS - 1) * 6 + 3;
    assert.equal(pos.count, TUFT_BLADES * perBlade, `${TUFT_BLADES} curved blades × ${BLADE_SEGMENTS} segments`);
    const heights: number[] = [];
    for (let bl = 0; bl < TUFT_BLADES; bl++) {
      const base = bl * perBlade;
      let tip = base;
      let root = base;
      for (let k = base; k < base + perBlade; k++) {
        if (tipAttr.getX(k) > tipAttr.getX(tip)) tip = k;
        if (tipAttr.getX(k) < tipAttr.getX(root)) root = k;
      }
      assert.equal(tipAttr.getX(tip), 1);
      assert.equal(tipAttr.getX(root), 0);
      assert.ok(color.getY(tip) > color.getY(root), 'blade tip lighter than root');
      assert.ok(color.getX(tip) / color.getY(tip) > color.getX(root) / color.getY(root), 'tip is more yellow');
      // 多段条带（≥ 段数+1 个不同高度）。
      const ys = new Set<number>();
      for (let k = base; k < base + perBlade; k++) ys.add(Math.round(pos.getY(k) * 1e4));
      assert.ok(ys.size >= BLADE_SEGMENTS + 1, 'multi-segment blade');
      heights.push(pos.getY(tip));
    }
    assert.ok(Math.max(...heights) / Math.min(...heights) > 1.3, 'blade heights vary');
    const flower = createDaisyGeometry();
    assert.ok(flower.getAttribute('aTip') && flower.getAttribute('color').count === flower.getAttribute('position').count);
  });

  test('填角：位于 [0,R]² 且不进入以 (R,R) 为心的圆；凹弧法线指向圆心；三角形朝外', () => {
    const R = FILLET_RADIUS;
    const g = createFilletGeometry();
    const pos = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      assert.ok(x >= -1e-6 && x <= R + 1e-6 && y >= -1e-6 && y <= R + 1e-6);
      assert.ok(Math.hypot(x - R, y - R) >= R - 1e-6, 'outside the disc');
      const nx = nrm.getX(i);
      const ny = nrm.getY(i);
      if (nx > 0.01 && ny > 0.01) {
        // 滚圆环上法线 = 指向圆心·sinφ + z·cosφ：比较 xy 方向。
        const d = new THREE.Vector2(R - x, R - y).normalize();
        const h = Math.hypot(nx, ny);
        assert.ok(Math.abs(d.x - nx / h) < 1e-6 && Math.abs(d.y - ny / h) < 1e-6, 'arc normal points at the centre');
      }
    }
    // 每个三角形的几何法线与顶点法线同向（绕序朝外）。
    const idx = g.getIndex();
    assert.ok(idx);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let t = 0; t < idx.count; t += 3) {
      const i0: number = idx.getX(t);
      const i1: number = idx.getX(t + 1);
      const i2: number = idx.getX(t + 2);
      a.fromBufferAttribute(pos, i0);
      b.fromBufferAttribute(pos, i1);
      c.fromBufferAttribute(pos, i2);
      const n = b.sub(a).cross(c.sub(a));
      if (n.lengthSq() < 1e-12) continue;
      // 顶点法线之和（滚圆前沿环的法线为 +z，与侧面几何法线正交，单个顶点不足以判定朝向）。
      const vn = new THREE.Vector3().fromBufferAttribute(nrm, i0).add(new THREE.Vector3().fromBufferAttribute(nrm, i1)).add(new THREE.Vector3().fromBufferAttribute(nrm, i2));
      assert.ok(n.dot(vn) > 0, `triangle ${t / 3} faces outward`);
    }
  });

  test('材质：DataArrayTexture sRGB + mipmap + REPEAT，着色器注入轮廓变形与过渡着色；缺少片段即抛', () => {
    const tex = generateTileTextures(32);
    const mat = createTileMaterial(tex);
    assert.ok(mat instanceof THREE.MeshStandardMaterial);
    assert.equal(mat.roughness, 0.95);
    assert.equal(mat.envMapIntensity, 0.35);
    assert.ok(mat.customProgramCacheKey().includes('tile'));
    const shader = {
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
      uniforms: {} as Record<string, THREE.IUniform>,
    };
    mat.onBeforeCompile(shader as never, null as never);
    // 结构断言：注入点、属性声明、uniform 都存在（不按字面匹配表达式）。
    for (const j of TILE_SHADER_INJECTIONS) assert.ok(injectedAfter(j.stage === 'vertex' ? shader.vertexShader : shader.fragmentShader, j.include, j.code), `${j.stage} injection after <${j.include}>`);
    const vdecl = glslDeclarations(shader.vertexShader);
    for (const [name, type] of Object.entries({ ...TILE_VERTEX_ATTRIBUTES, ...TILE_INSTANCE_ATTRIBUTES })) assert.equal(vdecl.get(name)?.type, type, `attribute ${name}`);
    for (const stage of [shader.vertexShader, shader.fragmentShader]) {
      for (const [name, d] of glslDeclarations(stage)) if (d.qualifier === 'uniform' && name.startsWith('uTile')) assert.ok(shader.uniforms[name], `uniform ${name} provided`);
    }
    assert.ok(glslFunctionNames(shader.fragmentShader).has('tileShade') && glslCalls(shader.fragmentShader).has('tileShade'), 'fragment shades via tileShade()');
    assert.ok(glslCalls(shader.vertexShader).has('tCornerDelta') && glslCalls(shader.vertexShader).has('tHerm'), 'vertex deforms corners and the smoothed top');
    assert.equal(mat.customProgramCacheKey(), TILE_PROGRAM_KEY);
    const t = shader.uniforms.uTiles?.value as THREE.DataArrayTexture;
    assert.ok(t instanceof THREE.DataArrayTexture);
    assert.equal(t.colorSpace, THREE.SRGBColorSpace);
    assert.equal(t.generateMipmaps, true);
    assert.equal(t.wrapS, THREE.RepeatWrapping);
    assert.equal(t.image.depth, 7);
    assert.equal(shader.uniforms.uTilePeriod?.value, TILE_TEXTURE_PERIOD);
    const broken = { vertexShader: 'void main(){}', fragmentShader: shader.fragmentShader, uniforms: {} };
    assert.throws(() => mat.onBeforeCompile(broken as never, null as never), /tile-material: .*#include <common>/);
    mat.dispose();
  });
});
