// 019 修复轮：AO 降采样 G-Buffer 预处理（post-fx DepthGTAOPass）。
// GTAO 与泊松降噪原本每个 AO 像素从全分辨率深度纹理读 ~54 次（降噪的每个采样都由深度重建法线），
// 改为先在 AO 分辨率写一张 法线 + 深度 的 Float32 缓冲（每像素读全分辨率深度 9 次，同一重建公式），GTAO/降噪只读它。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { DEFAULT_LIGHTING } from '../src/config/lighting-rules.ts';
import type { LightingTuning } from '../src/config/lighting-rules.ts';
import { AO_PREPASS_FRAGMENT, createPostFx } from '../src/render/post-fx.ts';

const stubRenderer = (): THREE.WebGLRenderer => ({ getPixelRatio: () => 1, getSize: (v: THREE.Vector2) => v.set(800, 600) }) as unknown as THREE.WebGLRenderer;

interface AoInternals {
  width: number;
  height: number;
  prepassTarget: THREE.WebGLRenderTarget;
  gtaoMaterial: THREE.ShaderMaterial;
  pdMaterial: THREE.ShaderMaterial;
}

describe('AO 预处理（降采样法线 + 深度）', () => {
  test('预处理目标 = AO 分辨率、Float32、最近邻、无深度缓冲；GTAO/降噪读它（法线 rgb 打包、深度在 a 通道）', () => {
    const lighting = structuredClone(DEFAULT_LIGHTING) as LightingTuning;
    const fx = createPostFx({ renderer: stubRenderer(), scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), lighting, quality: 'high', antialias: 'msaa' });
    fx.setSize(800, 600, 2);
    const ao = fx.composer.passes[1] as unknown as AoInternals;
    const rt = ao.prepassTarget;
    // AO 分辨率按 CSS 像素（800×600）× resolutionScale，与像素比无关。
    assert.equal(rt.width, Math.round(800 * lighting.ao.resolutionScale));
    assert.equal(rt.height, Math.round(600 * lighting.ao.resolutionScale));
    assert.equal(rt.width, ao.width);
    assert.equal(rt.texture.type, THREE.FloatType, '深度需要 32 位精度');
    assert.equal(rt.texture.minFilter, THREE.NearestFilter);
    assert.equal(rt.texture.magFilter, THREE.NearestFilter);
    assert.equal(rt.depthBuffer, false);
    for (const m of [ao.gtaoMaterial, ao.pdMaterial]) {
      assert.equal(m.uniforms.tDepth!.value, rt.texture);
      assert.equal(m.uniforms.tNormal!.value, rt.texture);
      assert.equal(m.defines.NORMAL_VECTOR_TYPE, 1);
    }
    assert.equal(ao.gtaoMaterial.defines.DEPTH_SWIZZLING, 'w');
    assert.equal(ao.pdMaterial.defines.DEPTH_VALUE_SOURCE, 1, '降噪着色器按 DEPTH_VALUE_SOURCE 取 a 通道');
    fx.dispose();
  });

  test('AO/bloom 分辨率按 CSS 像素：像素比 1 / 1.5 / 2 下缓冲尺寸相同（高像素比不再多算 AO）', () => {
    const lighting = structuredClone(DEFAULT_LIGHTING) as LightingTuning;
    const sizes = [1, 1.5, 2].map((pr) => {
      const fx = createPostFx({ renderer: stubRenderer(), scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), lighting, quality: 'high', antialias: 'msaa' });
      fx.setSize(800, 600, pr);
      const ao = fx.composer.passes[1] as unknown as AoInternals;
      const bloom = fx.composer.passes[2] as unknown as { renderTargetBright: THREE.WebGLRenderTarget };
      const out = [ao.width, ao.height, bloom.renderTargetBright.width, bloom.renderTargetBright.height, fx.sceneTarget.width];
      fx.dispose();
      return out;
    });
    assert.deepEqual(sizes[1]!.slice(0, 4), sizes[0]!.slice(0, 4));
    assert.deepEqual(sizes[2]!.slice(0, 4), sizes[0]!.slice(0, 4));
    assert.deepEqual(sizes.map((s) => s[4]), [800, 1200, 1600], '场景目标仍按物理像素');
    assert.equal(sizes[0]![0], Math.round(800 * lighting.ao.resolutionScale));
  });

  test('预处理着色器：与 GTAO 同一法线重建（全分辨率深度 texelFetch 9 次），输出 vec4(法线×.5+.5, 深度)；天空深度 1 原样', () => {
    const src = AO_PREPASS_FRAGMENT;
    assert.equal((src.match(/fetchDepth\(/g) ?? []).length, 10, '1 个定义 + 9 次读取');
    assert.match(src, /gl_FragColor = vec4\(\s*n \* 0\.5 \+ 0\.5,\s*depth\s*\)/);
    assert.match(src, /if \(depth >= 1\.0\)/);
  });
});
