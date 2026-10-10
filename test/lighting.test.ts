// 任务 015 光照：调参校验、画质解析、后期 pass 规划与资源释放、阴影相机拟合（纯函数）、大气透视、体积光束。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { TUNING, validateTuning } from '../src/config/tuning.ts';
import type { Tuning } from '../src/config/tuning.ts';
import { DEFAULT_LIGHTING, resolveAntialias, resolveQuality, validateLightingTuning } from '../src/config/lighting-rules.ts';
import type { LightingTuning } from '../src/config/lighting-rules.ts';
import { createPostFx, planPasses } from '../src/render/post-fx.ts';
import { fitShadowCamera, lightBasis, shadowReceiverBounds } from '../src/render/shadow-fit.ts';
import type { ShadowFitInput, Vec3Like } from '../src/render/shadow-fit.ts';
import { createBackdrop, hazeFactor } from '../src/render/stage.ts';
import { buildShaftAnchors, createLightShafts, selectVisibleShafts, shaftAxis } from '../src/render/light-shafts.ts';
import { makeTree } from './helpers/render-fixtures.ts';

function cloneLighting(): LightingTuning {
  return structuredClone(DEFAULT_LIGHTING) as LightingTuning;
}

// ---------- 调参 ----------

describe('render.lighting 调参校验', () => {
  test('默认值合法且挂在 TUNING.render.lighting', () => {
    assert.equal(TUNING.render.lighting.quality, 'high');
    validateLightingTuning(TUNING.render.lighting, 'render.lighting');
    validateTuning(TUNING);
  });

  const cases: ReadonlyArray<[string, (l: any) => void, RegExp]> = [
    ['quality 非法', (l) => (l.quality = 'ultra'), /render\.lighting\.quality/],
    ['maxPixelRatio 过大', (l) => (l.maxPixelRatio = 4), /render\.lighting\.maxPixelRatio/],
    ['msaa 非 0/2/4/8', (l) => (l.msaa = 3), /render\.lighting\.msaa/],
    ['antialias 非法', (l) => (l.antialias = 'fxaa'), /render\.lighting\.antialias/],
    ['toneMapping 非法', (l) => (l.toneMapping = 'filmic'), /render\.lighting\.toneMapping/],
    ['sun 在地平线下', (l) => (l.sun.direction.y = -0.2), /render\.lighting\.sun\.direction\.y/],
    ['rim 方向为零向量', (l) => (l.rim.direction = { x: 0, y: 0, z: 0 }), /render\.lighting\.rim\.direction/],
    ['颜色格式错误', (l) => (l.hemi.sky = 'blue'), /render\.lighting\.hemi\.sky/],
    ['shadow.mapSize 非 2 的幂', (l) => (l.shadow.mapSize = 1000), /render\.lighting\.shadow\.mapSize/],
    ['shadow.type 非法', (l) => (l.shadow.type = 'basic'), /render\.lighting\.shadow\.type/],
    ['shadow.zMax <= zMin', (l) => (l.shadow.zMax = l.shadow.zMin), /render\.lighting\.shadow\.zMax/],
    ['shadow.intensity 超出 [0,1]', (l) => (l.shadow.intensity = 1.5), /render\.lighting\.shadow\.intensity/],
    ['haze.far <= near', (l) => (l.haze.far = l.haze.near), /render\.lighting\.haze\.far/],
    ['ao.resolutionScale 为 0', (l) => (l.ao.resolutionScale = 0), /render\.lighting\.ao\.resolutionScale/],
    ['ao.samples 非整数', (l) => (l.ao.samples = 7.5), /render\.lighting\.ao\.samples/],
    ['ao.denoiseSamples 为 1', (l) => (l.ao.denoiseSamples = 1), /render\.lighting\.ao\.denoiseSamples/],
    ['bloom.resolutionScale 超过 1', (l) => (l.bloom.resolutionScale = 1.5), /render\.lighting\.bloom\.resolutionScale/],
    ['lightMap.solidDecay 为 1', (l) => (l.lightMap.solidDecay = 1), /render\.lighting\.lightMap\.solidDecay/],
    ['lightMap.dynamicMax 为 0', (l) => (l.lightMap.dynamicMax = 0), /render\.lighting\.lightMap\.dynamicMax/],
    ['bloom.strength 为 NaN', (l) => (l.bloom.strength = Number.NaN), /render\.lighting\.bloom\.strength/],
    ['grade.contrast 为 0', (l) => (l.grade.contrast = 0), /render\.lighting\.grade\.contrast/],
    ['shafts.maxCount 为 0', (l) => (l.shafts.maxCount = 0), /render\.lighting\.shafts\.maxCount/],
    ['shafts.width 非正', (l) => (l.shafts.width = 0), /render\.lighting\.shafts\.width/],
  ];
  for (const [name, mutate, re] of cases) {
    test(`非法：${name}`, () => {
      const t = structuredClone(TUNING) as Tuning;
      mutate((t.render as { lighting: unknown }).lighting);
      assert.throws(() => validateTuning(t), re);
    });
  }

  test('resolveQuality：缺省用调参值，合法覆盖，非法即抛', () => {
    assert.equal(resolveQuality(null, 'high'), 'high');
    assert.equal(resolveQuality('low', 'high'), 'low');
    assert.equal(resolveQuality('high', 'low'), 'high');
    assert.throws(() => resolveQuality('medium', 'high'), /quality=medium/);
    assert.throws(() => resolveQuality('', 'high'), /quality=/);
  });

  test('resolveAntialias：缺省用调参值（默认 smaa），合法覆盖，非法即抛', () => {
    assert.equal(DEFAULT_LIGHTING.antialias, 'smaa');
    assert.equal(resolveAntialias(null, 'smaa'), 'smaa');
    assert.equal(resolveAntialias('msaa', 'smaa'), 'msaa');
    assert.throws(() => resolveAntialias('fxaa', 'smaa'), /aa=fxaa/);
  });
});

// ---------- 后期 ----------

/** SMAAPass 构造时用 Image 装载查找表（浏览器 API）；node 下给一个只记录 src 的替身。 */
if (typeof (globalThis as { Image?: unknown }).Image === 'undefined') {
  (globalThis as { Image?: unknown }).Image = class {
    src = '';
    onload: (() => void) | null = null;
  };
}

/** EffectComposer 构造与 setSize 只需要 getPixelRatio/getSize（不触碰 GL）。 */
function stubRenderer(): THREE.WebGLRenderer {
  return {
    getPixelRatio: () => 1,
    getSize: (v: THREE.Vector2) => v.set(800, 600),
  } as unknown as THREE.WebGLRenderer;
}

describe('post-fx', () => {
  test('planPasses：high 全开；low 只留阴影与调色', () => {
    assert.deepEqual(planPasses('high'), { ao: true, bloom: true, shafts: true, grade: true, shadows: true });
    assert.deepEqual(planPasses('low'), { ao: false, bloom: false, shafts: false, grade: true, shadows: true });
    assert.throws(() => planPasses('mid' as never), /quality/);
  });

  test('画质开关决定启用的 pass（运行时切换不重建）', () => {
    const fx = createPostFx({ renderer: stubRenderer(), scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), lighting: cloneLighting(), quality: 'high' });
    assert.deepEqual(fx.enabledPasses(), ['render', 'ao', 'bloom', 'grade', 'smaa']);
    const passes = [...fx.composer.passes];
    fx.setQuality('low');
    assert.equal(fx.quality, 'low');
    assert.deepEqual(fx.enabledPasses(), ['render', 'grade', 'smaa']);
    assert.deepEqual(fx.composer.passes, passes, 'same pass objects');
    fx.setQuality('high');
    assert.deepEqual(fx.enabledPasses(), ['render', 'ao', 'bloom', 'grade', 'smaa']);
    assert.throws(() => fx.setQuality('ultra' as never), /quality/);
    fx.dispose();
  });

  test('msaa 模式：场景目标多重采样 + 深度纹理，Grade 直写画布不交换；AO/bloom 降分辨率', () => {
    const lighting = cloneLighting();
    const fx = createPostFx({ renderer: stubRenderer(), scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), lighting, quality: 'high', antialias: 'msaa' });
    assert.equal(fx.antialias, 'msaa');
    assert.deepEqual(fx.enabledPasses(), ['render', 'ao', 'bloom', 'grade']);
    fx.setSize(800, 600, 1.5);
    const rt = fx.sceneTarget;
    assert.equal(rt, fx.composer.readBuffer, '场景渲染进 composer.readBuffer');
    assert.ok(rt.depthTexture, 'depth texture for GTAO');
    assert.equal(rt.samples, lighting.msaa);
    assert.equal(rt.width, 1200);
    assert.equal(rt.height, 900);
    assert.equal(fx.composer.writeBuffer.samples, 0, '另一个缓冲不多重采样');
    assert.equal(fx.composer.writeBuffer.depthTexture, null);
    const ao = fx.composer.passes[1] as unknown as { width: number; height: number; needsSwap: boolean; gtaoMap: THREE.Texture };
    // AO/bloom 按 CSS 像素（800×600）定分辨率（019 修复轮：像素比 1.5 不再放大 AO/bloom 工作量）。
    assert.equal(ao.width, Math.round(800 * lighting.ao.resolutionScale));
    assert.equal(ao.height, Math.round(600 * lighting.ao.resolutionScale));
    assert.equal(ao.needsSwap, false, 'AO 只产出 AO 图，不改画面');
    const bloom = fx.composer.passes[2] as unknown as { renderTargetBright: THREE.WebGLRenderTarget; needsSwap: boolean; bloomTexture: THREE.Texture };
    assert.equal(bloom.renderTargetBright.width, Math.round(Math.round(800 * lighting.bloom.resolutionScale) / 2), 'bloom 降分辨率');
    assert.equal(bloom.needsSwap, false);
    const gradePass = fx.composer.passes[3] as unknown as { material: THREE.ShaderMaterial; needsSwap: boolean };
    assert.equal(gradePass.needsSwap, false, '最后一个 pass 不交换缓冲：场景始终渲染进同一个 MSAA 目标');
    const grade = gradePass.material.uniforms;
    assert.equal(grade.tAO?.value, ao.gtaoMap, 'Grade 合成 AO 图');
    assert.equal(grade.tBloom?.value, bloom.bloomTexture, 'Grade 在色调映射前加 bloom 图');
    assert.equal(grade.uAoIntensity?.value, lighting.ao.intensity);
    assert.equal(grade.uBloom?.value, 1);
    assert.ok(grade.toneMappingExposure, '色调映射曝光由 OutputPass 维护');
    assert.equal(rt.resolveDepthBuffer, true, 'AO 开时 resolve 深度');
    fx.setQuality('low');
    assert.equal(grade.uAoIntensity?.value, 0, 'low 不乘 AO');
    assert.equal(grade.uBloom?.value, 0, 'low 不加 bloom');
    assert.equal(rt.resolveDepthBuffer, false, 'AO 关时不 resolve 深度');
    assert.throws(() => fx.setSize(0, 600, 1), /post-fx/);
    fx.dispose();
  });

  test('smaa 模式（默认）：场景不多重采样；Grade 写 8 位显示缓冲并交换，SMAA 输出画布并换回（每帧偶数次交换）', () => {
    const lighting = cloneLighting();
    const fx = createPostFx({ renderer: stubRenderer(), scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), lighting, quality: 'high' });
    assert.equal(fx.antialias, 'smaa');
    fx.setSize(800, 600, 2);
    assert.equal(fx.sceneTarget.samples, 0);
    assert.ok(fx.sceneTarget.depthTexture);
    assert.equal(fx.sceneTarget.texture.type, THREE.HalfFloatType);
    const display = fx.composer.writeBuffer;
    assert.equal(display.texture.type, THREE.UnsignedByteType, 'Grade 输出已是显示空间，8 位足够');
    assert.equal(display.depthTexture, null);
    assert.equal(display.width, 1600);
    const passes = fx.composer.passes as unknown as Array<{ needsSwap: boolean }>;
    const swaps = passes.filter((p) => p.needsSwap).length;
    assert.equal(swaps % 2, 0, '偶数次交换：场景目标与 AO 深度纹理每帧不变');
    assert.equal(passes[3]?.needsSwap, true);
    const smaa = fx.composer.passes[4] as unknown as { _edgesRT: THREE.WebGLRenderTarget; _weightsRT: THREE.WebGLRenderTarget };
    assert.equal(smaa._edgesRT.texture.type, THREE.UnsignedByteType, 'SMAA 中间目标 8 位');
    assert.equal(smaa._weightsRT.texture.type, THREE.UnsignedByteType);
    assert.throws(() => createPostFx({ renderer: stubRenderer(), scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), lighting, quality: 'high', antialias: 'fxaa' as never }), /antialias/);
    fx.dispose();
  });

  test('setAntialias 运行时切换：SMAA 通道增删、场景目标采样数、Grade 交换、尺寸与读写缓冲正确；与画质切换互不影响', () => {
    const lighting = cloneLighting();
    const fx = createPostFx({ renderer: stubRenderer(), scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), lighting, quality: 'high' });
    fx.setSize(800, 600, 2);
    const rt = fx.sceneTarget;
    const display = fx.composer.writeBuffer;
    const [render, ao, bloom, grade] = fx.composer.passes;
    let rtDisposed = 0;
    rt.addEventListener('dispose', () => rtDisposed++);
    const oldSmaa = fx.composer.passes[4] as unknown as { dispose(): void };
    let smaaDisposed = 0;
    const origDispose = oldSmaa.dispose.bind(oldSmaa);
    oldSmaa.dispose = () => {
      smaaDisposed++;
      origDispose();
    };

    fx.setAntialias('msaa');
    assert.equal(fx.antialias, 'msaa');
    assert.deepEqual(fx.enabledPasses(), ['render', 'ao', 'bloom', 'grade']);
    assert.deepEqual(fx.composer.passes, [render, ao, bloom, grade], '同一组通道对象，只移除 SMAA');
    assert.equal(smaaDisposed, 1, '移除的 SMAA 通道释放资源');
    assert.equal(rt.samples, lighting.msaa);
    assert.equal(rtDisposed, 1, '采样数变化：释放 GPU 缓冲，下次渲染按新采样数重建');
    assert.equal(fx.sceneTarget, rt, '场景目标对象不变（AO 深度纹理引用不变）');
    assert.equal(rt.width, 1600);
    assert.equal(rt.height, 1200);
    assert.equal((grade as unknown as { needsSwap: boolean }).needsSwap, false, 'msaa：Grade 直写画布');
    assert.equal(fx.composer.readBuffer, rt);
    assert.equal(fx.composer.writeBuffer, display);

    fx.setQuality('low');
    fx.setAntialias('smaa');
    assert.equal(fx.antialias, 'smaa');
    assert.deepEqual(fx.enabledPasses(), ['render', 'grade', 'smaa'], '画质 low 保持');
    assert.equal(rt.samples, 0);
    assert.equal(rtDisposed, 2);
    assert.equal((grade as unknown as { needsSwap: boolean }).needsSwap, true);
    const passes = fx.composer.passes as unknown as Array<{ needsSwap: boolean; enabled: boolean }>;
    assert.equal(passes.filter((p) => p.needsSwap).length % 2, 0, '偶数次交换');
    const smaa = fx.composer.passes[4] as unknown as { _edgesRT: THREE.WebGLRenderTarget };
    assert.notEqual(smaa, oldSmaa, '新建 SMAA 通道');
    assert.equal(smaa._edgesRT.width, 1600, '新 SMAA 通道按当前尺寸');
    assert.equal(smaa._edgesRT.height, 1200);
    assert.equal(smaa._edgesRT.texture.type, THREE.UnsignedByteType);
    assert.equal(fx.composer.readBuffer, rt);
    assert.equal(fx.composer.writeBuffer, display);

    fx.setAntialias('smaa'); // 同值不重建
    assert.equal(rtDisposed, 2);
    assert.throws(() => fx.setAntialias('fxaa' as never), /antialias/);
    fx.dispose();
    assert.throws(() => fx.setAntialias('msaa'), /after dispose/);
  });

  test('Grade 着色器：bloom 按 AdditiveBlending(SRC_ALPHA, ONE) 同式在色调映射前相加，之后 sRGB 与调色', () => {
    const fx = createPostFx({ renderer: stubRenderer(), scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), lighting: cloneLighting(), quality: 'high' });
    const src = (fx.composer.passes[3] as unknown as { material: THREE.ShaderMaterial }).material.fragmentShader;
    const add = src.indexOf('src.rgb += b.rgb * b.a');
    const tone = src.indexOf('NeutralToneMapping( src.rgb )');
    const srgb = src.indexOf('sRGBTransferOETF');
    const ao = src.indexOf('texture2D( tAO');
    assert.ok(add > 0 && tone > add && srgb > tone && ao > srgb, 'bloom → 色调映射 → sRGB → AO/调色');
    fx.dispose();
  });

  test('dispose 释放全部 pass、渲染目标与深度纹理；之后 render 即抛', () => {
    for (const antialias of ['smaa', 'msaa'] as const) {
      const fx = createPostFx({ renderer: stubRenderer(), scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), lighting: cloneLighting(), quality: 'low', antialias });
      let passDisposed = 0;
      for (const p of fx.composer.passes) {
        const orig = p.dispose.bind(p);
        p.dispose = () => {
          passDisposed++;
          orig();
        };
      }
      const disposed: string[] = [];
      const watch = (o: THREE.EventDispatcher<{ dispose: object }>, name: string): void => o.addEventListener('dispose', () => disposed.push(name));
      watch(fx.sceneTarget as never, 'scene');
      watch(fx.composer.writeBuffer as never, 'display');
      watch(fx.sceneTarget.depthTexture as never, 'depth');
      fx.dispose();
      assert.equal(passDisposed, antialias === 'smaa' ? 5 : 4);
      assert.deepEqual(disposed.sort(), ['depth', 'display', 'scene']);
      assert.throws(() => fx.render(), /after dispose/);
      fx.dispose(); // 幂等
    }
  });
});

// ---------- 阴影相机拟合 ----------

const dot = (a: Vec3Like, b: Vec3Like): number => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a: Vec3Like, b: Vec3Like): Vec3Like => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

function fitInput(over: Partial<ShadowFitInput> = {}): ShadowFitInput {
  const s = DEFAULT_LIGHTING.shadow;
  return {
    centerX: 100.3,
    centerY: 47.8,
    halfWidth: 13.8,
    halfHeight: 8.04,
    margin: s.margin,
    zMin: s.zMin,
    zMax: s.zMax,
    casterReach: s.casterReach,
    direction: DEFAULT_LIGHTING.sun.direction,
    mapSize: s.mapSize,
    ...over,
  };
}

describe('shadow-fit', () => {
  test('侧面与背面镜头的阴影范围覆盖视野内实体，旋转不会生成负范围', () => {
    for (const position of [[40, 10, 0], [0, 10, -40], [0, 40, 0]]) {
      const camera = new THREE.PerspectiveCamera(40, 1.5, 0.5, 100);
      camera.position.fromArray(position);
      camera.lookAt(0, 10, 0);
      camera.updateMatrixWorld();
      const corners = Array.from({ length: 8 }, (_, index) => new THREE.Vector3(
        index & 1 ? 1 : -1, index & 2 ? 1 : -1, index & 4 ? 1 : -1,
      ).unproject(camera));
      const bounds = shadowReceiverBounds(corners, -1, 1);
      assert.ok(bounds);
      const input = fitInput({ ...bounds, zMin: -1, zMax: 1, direction: { x: 1, y: 1, z: 0.35 } });
      const fit = fitShadowCamera(input);
      const { r, u } = lightBasis(input.direction);
      let visible = 0;
      for (let x = -40; x <= 40; x += 5) for (let y = -20; y <= 40; y += 5) for (const z of [-1, 0, 1]) {
        const point = new THREE.Vector3(x, y, z);
        const screen = point.clone().project(camera);
        if (Math.abs(screen.x) > 1 || Math.abs(screen.y) > 1 || Math.abs(screen.z) > 1) continue;
        visible++;
        const rel = sub(point, fit.target);
        assert.ok(Math.abs(dot(rel, r)) <= fit.halfRight + 1e-8, 'visible receiver inside shadow width');
        assert.ok(Math.abs(dot(rel, u)) <= fit.halfUp + 1e-8, 'visible receiver inside shadow height');
      }
      assert.ok(visible > 0);
    }
  });

  test('光照基正交归一，且与 lookAt 约定一致（right 无 y 分量）', () => {
    const { d, r, u } = lightBasis({ x: -0.55, y: 0.78, z: 0.3 });
    for (const v of [d, r, u]) assert.ok(Math.abs(Math.hypot(v.x, v.y, v.z) - 1) < 1e-9);
    assert.ok(Math.abs(dot(d, r)) < 1e-9 && Math.abs(dot(d, u)) < 1e-9 && Math.abs(dot(r, u)) < 1e-9);
    assert.ok(Math.abs(r.y) < 1e-12);
    // 与 three 的 lookAt 基比较
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(d.x, d.y, d.z), new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
    const xr = new THREE.Vector3().setFromMatrixColumn(m, 0);
    const yu = new THREE.Vector3().setFromMatrixColumn(m, 1);
    assert.ok(xr.distanceTo(new THREE.Vector3(r.x, r.y, r.z)) < 1e-9);
    assert.ok(yu.distanceTo(new THREE.Vector3(u.x, u.y, u.z)) < 1e-9);
    // 竖直光不退化
    const v = lightBasis({ x: 0, y: 1, z: 0 });
    assert.ok(Number.isFinite(v.r.x + v.r.y + v.r.z) && Math.abs(Math.hypot(v.r.x, v.r.y, v.r.z) - 1) < 1e-9);
    assert.throws(() => lightBasis({ x: 0, y: 0, z: 0 }), /shadow-fit/);
  });

  test('正交盒覆盖可视矩形（含外扩）× z 范围的全部角点', () => {
    const input = fitInput();
    const fit = fitShadowCamera(input);
    const { d, r, u } = lightBasis(input.direction);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const z of [input.zMin, input.zMax]) {
          const p = { x: input.centerX + sx * (input.halfWidth + input.margin), y: input.centerY + sy * (input.halfHeight + input.margin), z };
          const rel = sub(p, fit.target);
          assert.ok(Math.abs(dot(rel, r)) <= fit.halfRight + 1e-9, 'right extent');
          assert.ok(Math.abs(dot(rel, u)) <= fit.halfUp + 1e-9, 'up extent');
          const depth = dot(sub(fit.position, p), d); // 沿光线从光源到点的距离
          assert.ok(depth >= fit.near + input.casterReach - 1e-6 && depth <= fit.far, `depth ${depth} within [near+reach, far]`);
        }
      }
    }
  });

  test('相机平移：尺寸不变，中心按纹素对齐（亚纹素移动不改变光照空间位置）', () => {
    const a = fitShadowCamera(fitInput());
    const b = fitShadowCamera(fitInput({ centerX: 100.3 + 37.21, centerY: 47.8 - 5.5 }));
    assert.equal(a.halfRight, b.halfRight);
    assert.equal(a.halfUp, b.halfUp);
    assert.equal(a.far, b.far);
    const { r, u } = lightBasis(DEFAULT_LIGHTING.sun.direction);
    for (const f of [a, b]) {
      const kr = dot(f.target, r) / f.texelRight;
      const ku = dot(f.target, u) / f.texelUp;
      assert.ok(Math.abs(kr - Math.round(kr)) < 1e-6, 'right component on texel grid');
      assert.ok(Math.abs(ku - Math.round(ku)) < 1e-6, 'up component on texel grid');
    }
    // 亚纹素移动（沿光线方向的平移不影响 r/u）：r/u 坐标保持在网格上，且变化量为纹素整数倍
    const c = fitShadowCamera(fitInput({ centerX: 100.3 + a.texelRight * 0.2 }));
    const dr = (dot(c.target, r) - dot(a.target, r)) / a.texelRight;
    assert.ok(Math.abs(dr - Math.round(dr)) < 1e-6 && Math.abs(dr) <= 1 + 1e-6);
  });

  test('非法输入即抛', () => {
    assert.throws(() => fitShadowCamera(fitInput({ halfWidth: 0 })), /shadow-fit/);
    assert.throws(() => fitShadowCamera(fitInput({ centerX: Number.NaN })), /shadow-fit/);
    assert.throws(() => fitShadowCamera(fitInput({ zMax: -5 })), /shadow-fit/);
    assert.throws(() => fitShadowCamera(fitInput({ mapSize: 0 })), /shadow-fit/);
  });
});

// ---------- 远景大气透视 ----------

describe('大气透视', () => {
  test('hazeFactor：near 前为 0，far 后为 max，单调', () => {
    const h = { near: 35, far: 90, max: 0.55 };
    assert.equal(hazeFactor(10, h), 0);
    assert.equal(hazeFactor(35, h), 0);
    assert.ok(Math.abs(hazeFactor(90, h) - 0.55) < 1e-12);
    assert.ok(Math.abs(hazeFactor(200, h) - 0.55) < 1e-12);
    let prev = -1;
    for (let d = 30; d <= 95; d += 5) {
      const v = hazeFactor(d, h);
      assert.ok(v >= prev);
      prev = v;
    }
    assert.throws(() => hazeFactor(50, { near: 10, far: 10, max: 1 }), /haze/);
  });

  test('远山顶点色：远层比近层更接近雾色；山脚比山顶更接近雾色', () => {
    const width = 120;
    const surface = new Int16Array(width).fill(40);
    const haze = { ...DEFAULT_LIGHTING.haze, cameraDistance: 30 };
    const backdrop = createBackdrop({ width, height: 100, surface, haze });
    const hazeColor = new THREE.Color(haze.color);
    const meshes: THREE.Mesh[] = [];
    backdrop.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    const stats = (m: THREE.Mesh): { mean: number; low: number; high: number } => {
      const col = m.geometry.getAttribute('color');
      const pos = m.geometry.getAttribute('position');
      assert.ok(col, `${m.name} has vertex colors`);
      assert.ok((m.material as THREE.MeshBasicMaterial).vertexColors);
      let sum = 0;
      let lowD = 0;
      let highD = Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        minY = Math.min(minY, pos.getY(i));
        maxY = Math.max(maxY, pos.getY(i));
      }
      for (let i = 0; i < col.count; i++) {
        const dist = Math.hypot(col.getX(i) - hazeColor.r, col.getY(i) - hazeColor.g, col.getZ(i) - hazeColor.b);
        sum += dist;
        if (pos.getY(i) === maxY) highD = Math.min(highD, dist);
        if (pos.getY(i) === minY) lowD = Math.max(lowD, dist);
      }
      return { mean: sum / col.count, low: lowD, high: highD };
    };
    const far = stats(meshes.find((m) => m.name === 'backdrop-hills-far') as THREE.Mesh);
    const near = stats(meshes.find((m) => m.name === 'backdrop-hills-near') as THREE.Mesh);
    assert.ok(far.mean < near.mean, `far layer hazier (${far.mean} < ${near.mean})`);
    assert.ok(near.low <= near.high + 1e-9, 'hill foot hazier than summit');
    backdrop.dispose();
  });
});

// ---------- 体积光束 ----------

describe('light-shafts', () => {
  const lighting = DEFAULT_LIGHTING;
  const ground = new Int16Array(400).fill(30);

  test('光束轴沿主光反方向向下；锚点确定、落在地表', () => {
    const axis = shaftAxis(lighting.sun.direction);
    assert.ok(axis.y < 0 && Math.abs(Math.hypot(axis.x, axis.y) - 1) < 1e-12);
    assert.ok(Math.sign(axis.x) === -Math.sign(lighting.sun.direction.x));
    assert.throws(() => shaftAxis({ x: 1, y: -1, z: 0 }), /light-shafts/);
    const trees = [makeTree('oak', 1, 50, 30), makeTree('pine', 2, 120, 30), makeTree('sakura', 3, 260, 30)];
    const a = buildShaftAnchors(trees, ground, lighting.shafts, lighting.sun.direction);
    const b = buildShaftAnchors(trees, ground, lighting.shafts, lighting.sun.direction);
    assert.deepEqual(a, b);
    assert.ok(a.length > 0);
    for (const s of a) {
      assert.ok(Math.abs(s.topY + axis.y * s.length - s.bottomY) < 1e-9, 'beam reaches its ground point');
      assert.ok(Math.abs(s.topX + axis.x * s.length - s.bottomX) < 1e-9);
      assert.equal(s.bottomY, 30);
    }
    for (let i = 1; i < a.length; i++) assert.ok((a[i] as { bottomX: number }).bottomX >= (a[i - 1] as { bottomX: number }).bottomX);
    assert.ok(a.some((s) => s.source === 'sky'), 'sky shafts exist on a long map');
  });

  test('只选与视野相交的锚点，最多 maxCount 个，近中心优先', () => {
    const anchors = buildShaftAnchors([], ground, { ...lighting.shafts, skyChance: 1 }, lighting.sun.direction);
    const view = { x: 100, y: 20, w: 30, h: 20 };
    const all = selectVisibleShafts(anchors, view, 100, lighting.shafts.width);
    for (const s of all) assert.ok(Math.max(s.topX, s.bottomX) + lighting.shafts.width >= 100 && Math.min(s.topX, s.bottomX) - lighting.shafts.width <= 130);
    const one = selectVisibleShafts(anchors, view, 1, lighting.shafts.width);
    assert.equal(one.length, Math.min(1, all.length));
    assert.equal(selectVisibleShafts(anchors, { x: 1000, y: 20, w: 30, h: 20 }, 8, 1).length, 0);
  });

  test('InstancedMesh：update 写入可见光束，关闭后 active=0，dispose 释放', () => {
    const shafts = createLightShafts({ trees: [makeTree('oak', 1, 50, 30)], ground, lighting: { ...lighting, shafts: { ...lighting.shafts, skyChance: 1 } } });
    const mesh = shafts.root as THREE.InstancedMesh;
    assert.equal(mesh.isInstancedMesh, true);
    assert.equal(mesh.castShadow, false);
    const mat = mesh.material as THREE.ShaderMaterial;
    assert.equal(mat.blending, THREE.AdditiveBlending);
    assert.equal(mat.depthWrite, false);
    shafts.update({ x: 30, y: 20, w: 60, h: 30 }, 1.5);
    assert.ok(shafts.active > 0 && shafts.active <= lighting.shafts.maxCount);
    assert.equal(mat.uniforms.uTime?.value, 1.5);
    shafts.setEnabled(false);
    assert.equal(shafts.active, 0);
    assert.equal(mesh.visible, false);
    let disposed = 0;
    mesh.geometry.addEventListener('dispose', () => disposed++);
    mat.addEventListener('dispose', () => disposed++);
    shafts.dispose();
    assert.equal(disposed, 2);
    assert.throws(() => shafts.update({ x: 0, y: 0, w: 1, h: 1 }, 0), /after dispose/);
  });
});
