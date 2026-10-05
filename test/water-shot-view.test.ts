// 019 打磨 A：水弹是饱满的果冻水团（不是压扁的飞盘）——长宽比 ≤ 1.35、顶点噪声随时间抖动、菲涅尔半透明 + 高光、拖 2–4 个小水珠与水雾。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { TUNING } from '../src/config/tuning.ts';
import { createProjectileEntity } from '../src/entities/projectile.ts';
import type { Entity } from '../src/entities/entity.ts';
import { injectLightMap, isLightMappable } from '../src/render/light-texture.ts';
import type { LightMapUniforms } from '../src/render/light-texture.ts';
import { WATER_JELLY, WATER_SHOT_MAX_ASPECT, createProjectileViews, waterShotScale } from '../src/render/projectile-views.ts';

const DT = 1 / 60;

function waterShot(id: number, vx: number, vy: number): Entity {
  const e = createProjectileEntity(id, { def: TUNING.weapons.water.projectile, x: 5, y: 3, dirX: 1, dirY: 0, ownerId: 1, team: 'player', level: 1, returned: false });
  e.body.vx = vx;
  e.body.vy = vy;
  return e;
}

function find(root: THREE.Object3D, name: string): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o.name === name) out.push(o);
  });
  return out;
}

describe('水弹外形', () => {
  test(`waterShotScale：任意速度/时刻长宽比 ∈ [1, ${WATER_SHOT_MAX_ASPECT}]，横截面圆（y = z），体积近似守恒`, () => {
    assert.ok(WATER_SHOT_MAX_ASPECT <= 1.35);
    const r = 0.3;
    for (const speed of [0, 2, 8, 20, 40, 80, 400]) {
      for (let t = 0; t < 3; t += 0.037) {
        const s = waterShotScale(r, speed, t);
        const aspect = s.x / s.y;
        assert.ok(aspect >= 1 - 1e-9 && aspect <= WATER_SHOT_MAX_ASPECT + 1e-9, `speed ${speed} t ${t.toFixed(2)} aspect ${aspect}`);
        assert.equal(s.y, s.z);
        const vol = (s.x * s.y * s.z) / r ** 3;
        assert.ok(vol > 0.9 && vol < 1.1, `volume ${vol}`);
      }
    }
    assert.ok(waterShotScale(r, 40, 0).x / waterShotScale(r, 40, 0).y > waterShotScale(r, 0, 0).x / waterShotScale(r, 0, 0).y, '越快略长');
    assert.throws(() => waterShotScale(r, Number.NaN, 0), /waterShotScale/);
  });

  test('视图：主体不压扁（长宽比 ≤ 1.35）、2–4 个尾部水珠在速度反方向、带水雾；全部网格可挂接光照', () => {
    const views = createProjectileViews();
    const e = waterShot(3, 18, -6);
    const view = views.factories.waterShot!(e);
    for (let i = 0; i < 30; i++) view.sync(e, 1, DT);
    const body = find(view.object, 'water-shot-body')[0] as THREE.Mesh;
    assert.ok(body);
    assert.ok(body.scale.x / body.scale.y <= WATER_SHOT_MAX_ASPECT + 1e-9 && body.scale.x / body.scale.y >= 1, `aspect ${body.scale.x / body.scale.y}`);
    assert.ok(Math.abs(body.scale.y - body.scale.z) < 1e-9, '不是盘状（y = z）');
    const beads = find(view.object, 'water-shot-bead');
    assert.ok(beads.length >= 2 && beads.length <= 4, `beads ${beads.length}`);
    view.object.updateMatrixWorld(true);
    const dir = new THREE.Vector2(18, -6).normalize();
    const center = new THREE.Vector3();
    view.object.getWorldPosition(center);
    for (const b of beads) {
      const p = new THREE.Vector3();
      b.getWorldPosition(p);
      const along = (p.x - center.x) * dir.x + (p.y - center.y) * dir.y;
      assert.ok(along < 0, '水珠拖在后面');
      assert.ok(b.scale.x < body.scale.y * 0.5, '小水珠');
    }
    assert.equal(find(view.object, 'water-shot-mist').length, 1);
    view.object.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if ((o as THREE.Mesh).isMesh && m) assert.ok(isLightMappable(m), `${m.name} 可挂接光照`);
    });
    view.dispose();
    views.dispose();
  });

  test('果冻抖动：顶点着色器按时间噪声沿法线位移（幅度见 WATER_JELLY），时钟随 frameDt 推进、dt=0 冻结；与光照图注入可叠加', () => {
    assert.ok(WATER_JELLY.amplitude > 0 && WATER_JELLY.amplitude <= 0.12, 'amplitude 轻微');
    assert.ok(WATER_JELLY.frequency > 0 && WATER_JELLY.speed > 0);
    const views = createProjectileViews();
    const e = waterShot(4, 10, 0);
    const view = views.factories.waterShot!(e);
    const body = find(view.object, 'water-shot-body')[0] as THREE.Mesh;
    const mat = body.material as THREE.MeshStandardMaterial;
    const shader = { vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader, uniforms: {} as Record<string, THREE.IUniform>, defines: {} as Record<string, unknown> };
    mat.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    assert.match(shader.vertexShader, /uJellyTime/);
    assert.match(shader.vertexShader, /transformed \+= /);
    assert.match(shader.fragmentShader, /jellyFresnel/);
    const uniforms = shader.uniforms as Record<string, THREE.IUniform<number>>;
    assert.equal(uniforms.uJellyAmp!.value, WATER_JELLY.amplitude);
    const t0 = uniforms.uJellyTime!.value;
    view.sync(e, 1, DT);
    view.sync(e, 1, DT);
    assert.ok(Math.abs(uniforms.uJellyTime!.value - t0 - 2 * DT) < 1e-9, '时钟推进');
    const t1 = uniforms.uJellyTime!.value;
    view.sync(e, 1, 0);
    assert.equal(uniforms.uJellyTime!.value, t1, 'hitstop 冻结');
    // 第二颗水弹同帧同步不重复推进共享时钟。
    const e2 = waterShot(5, 10, 0);
    const view2 = views.factories.waterShot!(e2);
    view.sync(e, 1, DT);
    view2.sync(e2, 1, DT);
    assert.ok(Math.abs(uniforms.uJellyTime!.value - t1 - DT) < 1e-9, '共享时钟每帧只推进一次');
    // 光照图注入叠加在果冻注入之后仍成立。
    const lmUniforms = { uLightMap: { value: null }, uLightMapSize: { value: new THREE.Vector2(1, 1) } } as unknown as LightMapUniforms;
    injectLightMap(shader, lmUniforms, 4, mat.name);
    assert.match(shader.vertexShader, /uJellyTime/);
    view.dispose();
    view2.dispose();
    views.dispose();
  });
});
