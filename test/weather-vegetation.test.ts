// 015 风吹天气：植被接入全局风（花草/水草风材质、树皮/树叶、蝴蝶、花瓣）——共享 uniform 同一对象、着色器调用 windSway；花瓣随风飘。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { mulberry32 } from '../src/core/rng.ts';
import { createWindMaterial } from '../src/render/flora.ts';
import { createPetalFx } from '../src/render/petal-fx.ts';
import { createTreeMaterials } from '../src/render/tree-material.ts';
import { WIND_UNIFORM_NAMES, sharedWindUniforms } from '../src/render/wind.ts';
import { glslCalls, glslDeclarations, glslFunctionNames } from './helpers/glsl.ts';

type Shader = { vertexShader: string; fragmentShader: string; uniforms: Record<string, THREE.IUniform> };
function compile(mat: THREE.Material): Shader {
  const shader: Shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  mat.onBeforeCompile(shader as never, null as never);
  return shader;
}

function assertGlobalWind(shader: Shader, label: string): void {
  const shared = sharedWindUniforms();
  const decl = glslDeclarations(shader.vertexShader);
  for (const n of WIND_UNIFORM_NAMES) {
    if (n.startsWith('uCloud')) continue;
    assert.equal(decl.get(n)?.type, 'float', `${label}: declares ${n}`);
    assert.equal(shader.uniforms[n], shared[n], `${label}: ${n} is the shared uniform object`);
  }
  assert.ok(glslFunctionNames(shader.vertexShader).has('windSway'), `${label}: defines windSway`);
  const main = shader.vertexShader.slice(shader.vertexShader.indexOf('void main()'));
  assert.ok(glslCalls(main).has('windSway'), `${label}: main samples the global wind`);
}

describe('植被统一使用全局风', () => {
  test('花草风材质（含水草）：共享风 uniform、main 内调用 windSway；保留本地时间 uWindTime 与阵风变量', () => {
    const t = { value: 0 };
    const mat = createWindMaterial(t);
    const s = compile(mat);
    assertGlobalWind(s, 'flora');
    assert.equal(s.uniforms.uWindTime, t);
    const weeds = createWindMaterial(t, { amplitude: 0.22, speed: 0.45, windScale: 0.35, name: 'water-weeds' });
    assertGlobalWind(compile(weeds), 'weeds');
    assert.throws(() => createWindMaterial(t, { windScale: -1 }), /flora/);
    mat.dispose();
    weeds.dispose();
  });

  test('树皮与树叶材质：共享风 uniform、main 内调用 windSway', () => {
    const mats = createTreeMaterials({ value: 0 });
    assertGlobalWind(compile(mats.bark), 'tree-bark');
    assertGlobalWind(compile(mats.leaf), 'tree-leaf');
    mats.dispose();
  });

  test('花瓣随风飘：顺风（+x）时平均 x 位移大于逆风（−x）', () => {
    const emitter = { x: 10, y: 40, w: 4, h: 3 };
    const meanX = (wind: (x: number) => number): number => {
      const fx = createPetalFx({ scene: new THREE.Group(), max: 60, rng: mulberry32(5) });
      for (let i = 0; i < 240; i++) fx.update(1 / 60, [emitter], () => 0, wind);
      const m = new THREE.Matrix4();
      const p = new THREE.Vector3();
      let sum = 0;
      for (let i = 0; i < fx.active; i++) {
        fx.mesh.getMatrixAt(i, m);
        sum += p.setFromMatrixPosition(m).x;
      }
      const n = fx.active;
      fx.dispose();
      return sum / n;
    };
    const right = meanX(() => 1.2);
    const left = meanX(() => -1.2);
    assert.ok(right - left > 1, `downwind drift ${left} → ${right}`);
    const fx = createPetalFx({ scene: new THREE.Group(), max: 10, rng: mulberry32(1) });
    assert.throws(() => {
      for (let i = 0; i < 60; i++) fx.update(1 / 60, [emitter], () => 0, () => Number.NaN);
    }, /petal-fx/);
    fx.dispose();
  });
});
