// 013 追加：渔屋细节（部件存在与数量、立面分层、风/光照挂接、draw call 上限、纹理、只改渲染不改碰撞）。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { TUNING } from '../src/config/tuning.ts';
import { isCloudShadowable } from '../src/render/cloud-shadow.ts';
import { HUT_LAYER } from '../src/render/hut-builder.ts';
import { HUT_FACADE_Z_MAX, HUT_PARTS, HUT_PROP_Z_MAX, HUT_SWAY_PARTS, buildHutGeometry, buildHutParts, buildHutSwayParts, hutSmokeOrigin } from '../src/render/hut-geometry.ts';
import type { BedHeight } from '../src/render/hut-geometry.ts';
import { HUT_SMOKE_PUFFS, buildSmokeGeometry, createHutMaterials } from '../src/render/hut-material.ts';
import { HUT_TEXTURE_LAYERS, HUT_TEXTURE_SIZE, generateHutTextures } from '../src/render/hut-textures.ts';
import { injectLightMap, isLightMappable } from '../src/render/light-texture.ts';
import type { LightMapUniforms } from '../src/render/light-texture.ts';
import { HUT_MESHES_PER_HUT, createStructureView } from '../src/render/structure-view.ts';
import { BLOCK_FRONT_Z } from '../src/render/tile-geometry.ts';
import { sharedWindUniforms } from '../src/render/wind.ts';
import type { FishingHut } from '../src/world/level.ts';
import { generateWorld } from '../src/world/worldgen.ts';

function makeHut(x0: number, floorY: number, lakeSide: 1 | -1, pierLen = 9, id = 0): FishingHut {
  const x1 = x0 + 7;
  const pierX0 = lakeSide === 1 ? x1 + 1 : x0 - pierLen;
  return { id, x0, x1, floorY, doorRows: 3, roofY: floorY + 7, roofRows: 5, roofX0: x0 - 1, roofX1: x0 + 8, loftX0: x0 + 1, loftX1: x0 + 3, loftY: floorY + 3, lakeSide, pierX0, pierX1: pierX0 + pierLen - 1, lake: 0 };
}
const flatBed = (y: number): BedHeight => () => y;
const EPS = 1e-5;

function attr(g: THREE.BufferGeometry, name: string): ArrayLike<number> {
  const a = g.getAttribute(name);
  assert.ok(a, `attribute ${name}`);
  return a.array as ArrayLike<number>;
}
function layersOf(g: THREE.BufferGeometry): Set<number> {
  const uv = attr(g, 'aHutUv');
  const out = new Set<number>();
  for (let i = 2; i < uv.length; i += 3) out.add(uv[i] as number);
  return out;
}
function count(g: THREE.BufferGeometry, name: string, pred: (v: number) => boolean): number {
  const a = attr(g, name);
  let n = 0;
  for (let i = 0; i < a.length; i++) if (pred(a[i] as number)) n++;
  return n;
}
function shaderOf(lib: { vertexShader: string; fragmentShader: string }) {
  return { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} as Record<string, THREE.IUniform>, defines: {} as Record<string, unknown> };
}

describe('渔屋细节：部件', () => {
  for (const lakeSide of [1, -1] as const) {
    test(`静态 ${HUT_PARTS.length} 部件与随风 ${HUT_SWAY_PARTS.length} 部件都非空；纹理层各就各位（lakeSide=${lakeSide}）`, () => {
      const hut = makeHut(30, 40, lakeSide);
      const parts = buildHutParts(hut, flatBed(33));
      for (const p of HUT_PARTS) assert.ok((parts.get(p)?.getAttribute('position').count ?? 0) > 0, `part ${p}`);
      const sway = buildHutSwayParts(hut, flatBed(33));
      for (const p of HUT_SWAY_PARTS) assert.ok((sway.get(p)?.getAttribute('position').count ?? 0) > 0, `sway ${p}`);
      assert.ok(layersOf(parts.get('backWall')!).has(HUT_LAYER.wood), 'wall planks use wood grain');
      assert.ok(layersOf(parts.get('roof')!).has(HUT_LAYER.shingle), 'roof uses shingles');
      assert.ok(layersOf(parts.get('foundation')!).has(HUT_LAYER.stone), 'foundation uses stone');
      assert.ok(layersOf(parts.get('chimney')!).has(HUT_LAYER.stone), 'chimney is stone');
      assert.ok(layersOf(parts.get('props')!).has(HUT_LAYER.weave), 'fish basket is woven');
    });
  }

  test('数量：桥面板按栈桥长度（每 .3 一块）；屋顶每格 3 排木瓦；灯笼 5 盏发光；炉火发光；随风顶点占多数', () => {
    const hut = makeHut(30, 40, -1, 9);
    const parts = buildHutParts(hut, flatBed(33));
    const sway = buildHutSwayParts(hut, flatBed(33));
    // 桥面：每块板是 12 三角形的盒子 + 4 个钉子（各 2 三角形）= 20 三角形。
    const deckTris = parts.get('deck')!.getAttribute('position').count / 3;
    const boards = Math.floor((9 + 0.3 - 0.07) / 0.3);
    assert.ok(deckTris >= boards * 20, `deck ${deckTris} tris for ${boards} boards`);
    // 屋顶（019 打磨）：每坡每格 3 排木瓦，每排沿 z 分成多片独立木瓦（见 render-hut-roof.test）。
    assert.ok(parts.get('roof')!.getAttribute('position').count / 3 > 2 * 5 * 3 * 3 * 10, 'roof has individual shingles');
    const lanterns = sway.get('lanterns')!;
    const glowVerts = count(lanterns, 'aGlow', (v) => v > 1);
    // 6 棱柱：顶/底各 4 三角形 + 6 侧面 × 2 = 20 三角形 = 60 顶点。
    assert.equal(glowVerts % 60, 0, 'lantern glass = 6-sided prisms');
    assert.equal(glowVerts / 60, 5, 'eaves ×2 + pier head + mooring post + ceiling lamp');
    assert.ok(count(parts.get('interior')!, 'aGlow', (v) => v > 1) > 0, 'stove fire glows');
    for (const p of HUT_SWAY_PARTS) {
      const g = sway.get(p)!;
      assert.ok(count(g, 'aSway', (v) => v > 0.05) > g.getAttribute('position').count * 0.4, `${p} mostly sways`);
      assert.equal(count(g, 'aSway', (v) => v < 0 || v > 1.5), 0, `${p} sway weight in [0,1.5]`);
    }
    for (const p of HUT_PARTS) assert.equal(count(parts.get(p)!, 'aSway', (v) => v !== 0), 0, `${p} is static`);
  });

  test('立面层只贴在实心格前：z ∈ [BLOCK_FRONT_Z, HUT_FACADE_Z_MAX]，墙顶以下的立面顶点都在两侧墙列内', () => {
    for (const lakeSide of [1, -1] as const) {
      const hut = makeHut(30, 40, lakeSide);
      const facade = buildHutParts(hut, flatBed(33)).get('facade')!;
      const p = facade.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const y = p.getY(i);
        const z = p.getZ(i);
        assert.ok(z >= BLOCK_FRONT_Z - EPS && z <= HUT_FACADE_Z_MAX + EPS, `facade z ${z}`);
        if (y < hut.roofY - EPS) {
          const inCol = (c: number): boolean => x >= c - 0.2 && x <= c + 1.2;
          assert.ok(inCol(hut.x0) || inCol(hut.x1), `facade vertex (${x},${y}) in front of the interior`);
          assert.ok(!(x > hut.x0 + 1 + EPS && x < hut.x1 - EPS), `facade vertex (${x},${y}) over the open interior`);
        }
      }
    }
  });

  test('随风部件：除立面花箱外都在鹈鹕身后；室内（墙内、地板到墙顶）随风顶点也在身后', () => {
    const hut = makeHut(30, 40, 1);
    const sway = buildHutSwayParts(hut, flatBed(33));
    for (const name of HUT_SWAY_PARTS) {
      const pos = sway.get(name)!.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const interior = x > hut.x0 + 1 && x < hut.x1 && y > hut.floorY && y < hut.roofY;
        if (name !== 'flowers' || interior) assert.ok(z <= HUT_PROP_Z_MAX + EPS, `${name} vertex (${x},${y},${z})`);
      }
    }
  });

  test('三角形预算与确定性：静态 + 随风 ≤ 20000，同输入逐字节一致', () => {
    const hut = makeHut(30, 40, -1, 11, 2);
    const a = buildHutGeometry(hut, flatBed(33));
    const sway = buildHutSwayParts(hut, flatBed(33));
    let tris = a.getAttribute('position').count / 3;
    for (const g of sway.values()) tris += g.getAttribute('position').count / 3;
    assert.ok(tris > 6000 && tris <= 20000, `triangles ${tris}`);
    const b = buildHutGeometry(hut, flatBed(33));
    for (const n of ['position', 'color', 'aHutUv', 'aGlow']) assert.deepEqual(attr(a, n), attr(b, n));
  });
});

describe('渔屋细节：纹理', () => {
  test('程序化纹理：层数/尺寸、确定性、每层有细节（非常数）、plain 层为均值', () => {
    const t = generateHutTextures();
    assert.equal(t.layers, HUT_TEXTURE_LAYERS.length);
    assert.equal(t.size, HUT_TEXTURE_SIZE);
    assert.equal(t.data.length, t.layers * t.size * t.size * 4);
    assert.deepEqual(generateHutTextures().data, t.data);
    HUT_TEXTURE_LAYERS.forEach((name, li) => {
      let lo = 255;
      let hi = 0;
      for (let i = 0; i < t.size * t.size; i++) {
        const v = t.data[(li * t.size * t.size + i) * 4] as number;
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
      if (name === 'plain') assert.equal(lo, hi);
      else assert.ok(hi - lo > 40, `${name} has detail (${lo}..${hi})`);
    });
    assert.throws(() => generateHutTextures(100), /power of two/);
  });
});

describe('渔屋细节：材质挂接', () => {
  test('随风材质与烟材质引用共享风 uniform（同一对象），着色器含 windSway / aSway / aPuff', () => {
    const m = createHutMaterials();
    const wind = sharedWindUniforms();
    const sh = shaderOf(THREE.ShaderLib.standard);
    m.sway.onBeforeCompile(sh as never, {} as THREE.WebGLRenderer);
    assert.equal(sh.uniforms.uWeatherTime, wind.uWeatherTime);
    assert.equal(sh.uniforms.uWindBase, wind.uWindBase);
    assert.match(sh.vertexShader, /attribute float aSway/);
    assert.match(sh.vertexShader, /windSway\( hw\.x/);
    assert.match(sh.fragmentShader, /uHutTex/);
    const smoke = shaderOf(THREE.ShaderLib.standard);
    m.smoke.onBeforeCompile(smoke as never, {} as THREE.WebGLRenderer);
    assert.equal(smoke.uniforms.uWeatherTime, wind.uWeatherTime);
    assert.match(smoke.vertexShader, /attribute vec2 aPuff/);
    assert.match(smoke.fragmentShader, /vSmokeFade/);
    const solid = shaderOf(THREE.ShaderLib.standard);
    m.solid.onBeforeCompile(solid as never, {} as THREE.WebGLRenderer);
    assert.equal(solid.uniforms.uWindBase, undefined, 'static parts do not sway');
    assert.match(solid.fragmentShader, /totalEmissiveRadiance \+= diffuseColor\.rgb \* vHutGlow/);
    m.dispose();
  });

  test('光照图与云影：三种材质都可挂接，且在本材质注入之后链式注入不丢片段', () => {
    const m = createHutMaterials();
    const uniforms: LightMapUniforms = {
      uLightMap: { value: new THREE.Texture() },
      uLightMapSize: { value: new THREE.Vector2(10, 10) },
      uLightMin: { value: 0.1 },
      uDynLights: { value: [new THREE.Vector4()] },
      uDynCount: { value: 0 },
      uWaterShallow: { value: new THREE.Color() },
      uWaterDeep: { value: new THREE.Color() },
      uWaterAlpha: { value: new THREE.Vector2() },
      uWaterRange: { value: 1 },
      uAura: { value: new THREE.Vector4(0, 0, 1, 0) },
      uAuraColor: { value: new THREE.Color(1, 1, 1) },
    };
    for (const mat of [m.solid, m.sway, m.smoke]) {
      assert.ok(isLightMappable(mat), `${mat.name} light-mappable`);
      assert.ok(isCloudShadowable(mat), `${mat.name} cloud-shadowable`);
      const sh = shaderOf(THREE.ShaderLib.standard);
      mat.onBeforeCompile(sh as never, {} as THREE.WebGLRenderer);
      injectLightMap(sh, uniforms, 1, mat.name);
      assert.match(sh.fragmentShader, /lmSample/);
      assert.ok(mat.customProgramCacheKey().startsWith(mat.name), 'own cache key');
    }
    m.dispose();
  });

  test('烟团几何：HUT_SMOKE_PUFFS 个球、相位均布、包围球覆盖整条烟柱', () => {
    const g = buildSmokeGeometry(3);
    const puff = attr(g, 'aPuff');
    const phases = new Set<number>();
    for (let i = 0; i < puff.length; i += 2) phases.add(Math.round((puff[i] as number) * 100));
    assert.equal(phases.size, HUT_SMOKE_PUFFS);
    assert.ok((g.boundingSphere?.radius ?? 0) > 3);
  });
});

describe('渔屋细节：视图与世界', () => {
  test(`每座渔屋 ${HUT_MESHES_PER_HUT} 个网格（静态/随风/烟），共享 3 个材质；默认世界新增 draw call ≤ 15`, () => {
    const level = generateWorld(TUNING.worldgen.seed, TUNING.worldgen);
    const view = createStructureView(level.structures, { map: level.map });
    const meshes: THREE.Mesh[] = [];
    view.root.traverse((n) => {
      if ((n as THREE.Mesh).isMesh) meshes.push(n as THREE.Mesh);
    });
    assert.equal(meshes.length, level.structures.length * HUT_MESHES_PER_HUT);
    assert.ok(meshes.length <= 15, `draw calls ${meshes.length}`);
    assert.equal(new Set(meshes.map((m) => m.material)).size, 3);
    const hut = level.structures[0]!;
    const smoke = view.root.getObjectByName(`hut-${hut.id}-smoke`)!;
    assert.deepEqual(smoke.position.toArray(), hutSmokeOrigin(hut));
    view.dispose();
  });

  test('只改渲染：构建渔屋视图不改地图（碰撞/形状不变）', () => {
    const level = generateWorld(5, TUNING.worldgen);
    const snap = (): string => {
      const parts: number[] = [];
      for (let y = 0; y < level.map.height; y++) for (let x = 0; x < level.map.width; x++) parts.push(level.map.get(x, y), level.map.shapeAt(x, y));
      return parts.join(',');
    };
    const before = snap();
    createStructureView(level.structures, { map: level.map }).dispose();
    assert.equal(snap(), before);
  });
});
