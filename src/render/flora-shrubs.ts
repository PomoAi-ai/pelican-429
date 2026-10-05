/**
 * 灌木层（比树矮的中间层植物，高 SHRUB_HEIGHT_RANGE = .8–3 格）：圆冠绿篱、开花杜鹃/绣球、浆果丛、高蕨丛、幼树、香蒲、野玫瑰、竹丛、滨草、沙棘。
 * 确定性规划（planShrubs，纯函数）；每区块一个 InstancedMesh（变体图集 = 1 draw call），随 tile-view 区块帧切片构建；
 * 风格与树一致：木本种用树的叶团+叶卡管线（shrub-woody），材质 = 树叶材质（tree-material.createLeafMaterial：叶片图集、alphaTest、
 * 球面化法线、树风摆；实例化分支按实例世界坐标取风相位）+ 草地扰动场（鹈鹕经过/啄击/光球时轻微被推开）+ 变体塌缩；
 * 草本种（高蕨、香蒲、竹、滨草）保持草/芦苇式细叶条带，转成同一属性集并入图集。不参与碰撞。
 *
 * 生境（SHRUB_RULES，集中调参、加载时 fail-fast）：
 * - 每格的生境分量：open（空旷草地）、edge（树林边缘 = 4·荫·(1−荫)，树与树之间）、wood（树下）、shore（湖岸近水）；
 *   λ = density × 群落（低频噪声，成丛）× Σ(亲和·分量) × 地表亲和（草/泥/沙）。每格至多 1 株。
 * - 树林边缘与树间多灌木；草地零星成丛；湖岸芦苇香蒲；沙地滨草、沙棘。
 * - z 在背景一层（SHRUB_Z，地表装饰带之后、靠近树的深度），前景只留矮草（不挡平台与角色可读性）；z 向厚度压到 SHRUB_MAX_DEPTH。
 */
import * as THREE from 'three';
import { fbm1D, hash01 } from '../core/rng.ts';
import { SHAPE_FULL } from '../world/tile-shapes.ts';
import type { CoverGround, CoverSite } from './flora-cover.ts';
import { siteTopY } from './flora.ts';
import type { FloraEnv } from './flora.ts';
import { DISTURB_GLSL, sharedDisturbUniforms } from './grass-disturb.ts';
import { createBambooGeometry, createCattailGeometry, createMarramGeometry, createTallFernGeometry, herbToLeafGeometry } from './shrub-geometry.ts';
import { WOODY_SPECS, buildWoody } from './shrub-woody.ts';
import { BLOCK_BACK_Z, GROUND_DECOR_Z_MIN } from './tile-geometry.ts';
import { createLeafMaterial } from './tree-material.ts';
import { addVariantCollapse, mergeIndexedVariants, variantInstanceGeometry } from './variant-atlas.ts';

export const SHRUB_KINDS = ['hedge', 'azalea', 'berry', 'fernclump', 'sapling', 'cattail', 'rose', 'bamboo', 'marram', 'buckthorn'] as const;
export type ShrubKind = (typeof SHRUB_KINDS)[number];

export const SHRUB_HEIGHT_RANGE: readonly [number, number] = [0.8, 3];
/** 灌木 z（背景一层）与 z 向最大半厚（世界格；冠团 z 缩放上限）。 */
export const SHRUB_Z: readonly [number, number] = [BLOCK_BACK_Z + 0.2, GROUND_DECOR_Z_MIN + 0.22];
export const SHRUB_MAX_DEPTH = 0.45;
/** 每区块实例上限（超出即抛）。 */
export const SHRUB_CHUNK_BUDGET = 400;
/** 近水范围（格，自湖岸沙滩外缘起算）。 */
export const SHRUB_SHORE_RANGE = 4;
const SHORE_SAND = 2;
/** 林缘范围（格）：树荫外这么远内仍算"林缘/树间"。 */
export const SHRUB_EDGE_RANGE = 5;
/** 根部下沉（格，冠底贴地不悬空）。 */
export const SHRUB_SINK = 0.08;
/** 草地扰动对灌木的倍数（乘 aSway：叶团 .15、叶卡 .25、草本叶梢 1）。 */
export const SHRUB_DISTURB_SCALE = 1.6;
export const SHRUB_PROGRAM_KEY = 'shrub-leaf-v1';

/** 几何本体高（格），与 shrub-geometry 一致。 */
export const SHRUB_NATIVE_HEIGHT: Readonly<Record<ShrubKind, number>> = Object.freeze({
  hedge: 1.07,
  azalea: 0.93,
  berry: 0.88,
  fernclump: 0.78,
  sapling: 1.75,
  cattail: 1.45,
  rose: 0.91,
  bamboo: 2.29,
  marram: 0.94,
  buckthorn: 1.14,
});

export interface ShrubRule {
  readonly density: number;
  readonly habitat: Readonly<{ open: number; edge: number; wood: number; shore: number }>;
  readonly ground: Readonly<Record<CoverGround, number>>;
  readonly height: readonly [number, number];
  /** 群落噪声尺度、盐值、阈值（低于阈值不长 → 成丛、丛间留空）。 */
  readonly scale: number;
  readonly salt: number;
  readonly threshold: number;
  /** 实例色（整丛相乘：只做叶色的微小明度/冷暖变化，花色在几何里）。 */
  readonly palette: readonly number[];
}

const hab = (open: number, edge: number, wood: number, shore: number) => ({ open, edge, wood, shore });
const gr = (grass: number, dirt: number, sand: number): Readonly<Record<CoverGround, number>> => ({ grass, dirt, sand });

export const SHRUB_RULES: Readonly<Record<ShrubKind, ShrubRule>> = Object.freeze({
  hedge: { density: 0.36, habitat: hab(0.35, 1.6, 0.5, 0), ground: gr(1, 0.5, 0), height: [0.9, 1.6], scale: 11, salt: 1601, threshold: 0.4, palette: [0xffffff, 0xe8f4d0, 0xd8ecc0] },
  azalea: { density: 0.24, habitat: hab(0.45, 1.2, 0.25, 0), ground: gr(1, 0.4, 0), height: [0.8, 1.4], scale: 13, salt: 1607, threshold: 0.45, palette: [0xffffff, 0xeef6e4, 0xf6f6ee] },
  berry: { density: 0.22, habitat: hab(0.25, 1.3, 0.5, 0), ground: gr(1, 0.6, 0), height: [0.8, 1.3], scale: 12, salt: 1613, threshold: 0.45, palette: [0xffffff, 0xe0f0c8] },
  fernclump: { density: 0.3, habitat: hab(0.05, 0.8, 2.0, 0.2), ground: gr(1, 0.6, 0), height: [0.9, 1.6], scale: 10, salt: 1619, threshold: 0.35, palette: [0xffffff, 0xe6f5d0, 0xd0e8b8] },
  sapling: { density: 0.16, habitat: hab(0.25, 1.2, 0.7, 0), ground: gr(1, 0.5, 0), height: [1.6, 3], scale: 14, salt: 1621, threshold: 0.4, palette: [0xffffff, 0xe8f4c8, 0xf0f0c0] },
  cattail: { density: 0.9, habitat: hab(0, 0, 0, 3), ground: gr(1, 1, 0.6), height: [1.2, 2.2], scale: 6, salt: 1627, threshold: 0.15, palette: [0xffffff, 0xeaf6d0] },
  rose: { density: 0.18, habitat: hab(0.6, 0.8, 0.1, 0), ground: gr(1, 0.3, 0), height: [0.8, 1.3], scale: 12, salt: 1631, threshold: 0.5, palette: [0xffffff, 0xeef4e2] },
  bamboo: { density: 0.1, habitat: hab(0.15, 0.6, 0.5, 0.3), ground: gr(1, 0.3, 0), height: [2, 3], scale: 15, salt: 1637, threshold: 0.55, palette: [0xffffff, 0xe8f0c8] },
  marram: { density: 0.6, habitat: hab(1, 0.3, 0, 0.6), ground: gr(0, 0, 1), height: [0.8, 1.3], scale: 7, salt: 1643, threshold: 0.2, palette: [0xffffff, 0xf0ecd0, 0xe8e0b8] },
  buckthorn: { density: 0.35, habitat: hab(1, 0.3, 0, 0.4), ground: gr(0, 0.2, 1), height: [1, 1.6], scale: 10, salt: 1649, threshold: 0.3, palette: [0xffffff, 0xe0e8e0] },
});

const fail = (what: string, v: unknown): never => {
  throw new Error(`flora-shrubs: invalid ${what} ${String(v)}`);
};

/** 调参校验（加载时执行）。 */
export function validateShrubRules(rules: Readonly<Record<ShrubKind, ShrubRule>>): void {
  for (const k of SHRUB_KINDS) {
    const r = rules[k];
    if (!r) fail(`rule for '${k}'`, 'missing');
    if (!(r.density >= 0 && Number.isFinite(r.density))) fail(`${k}.density`, r.density);
    for (const [h, v] of Object.entries(r.habitat)) if (!(v >= 0 && Number.isFinite(v))) fail(`${k}.habitat.${h}`, v);
    for (const [g, v] of Object.entries(r.ground)) if (!(v >= 0 && Number.isFinite(v))) fail(`${k}.ground.${g}`, v);
    if (!(r.height[0] >= SHRUB_HEIGHT_RANGE[0] - 1e-9 && r.height[1] >= r.height[0] && r.height[1] <= SHRUB_HEIGHT_RANGE[1] + 1e-9)) fail(`${k}.height`, r.height.join('..'));
    if (!(r.scale > 0 && r.threshold >= 0 && r.threshold < 1)) fail(`${k}.scale/threshold`, `${r.scale}/${r.threshold}`);
    if (r.palette.length === 0) fail(`${k}.palette`, '[]');
    if (!(SHRUB_NATIVE_HEIGHT[k] > 0)) fail(`${k}.nativeHeight`, SHRUB_NATIVE_HEIGHT[k]);
  }
  if (!(SHRUB_Z[0] < SHRUB_Z[1] && SHRUB_Z[1] < GROUND_DECOR_Z_MIN + 0.5)) fail('SHRUB_Z', SHRUB_Z.join('..'));
  if (!(SHRUB_MAX_DEPTH > 0 && SHRUB_CHUNK_BUDGET > 0 && SHRUB_SHORE_RANGE > 0)) fail('shrub limits', `${SHRUB_MAX_DEPTH}/${SHRUB_CHUNK_BUDGET}/${SHRUB_SHORE_RANGE}`);
}
validateShrubRules(SHRUB_RULES);

export interface ShrubInstance {
  readonly kind: ShrubKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  /** 世界高度（格）。 */
  readonly height: number;
  readonly tint: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const NO_ENV: FloraEnv = Object.freeze({ waterDistance: () => Infinity, shade: () => 0 });

/** 生境分量（纯函数）。 */
export function shrubHabitat(site: CoverSite, env: FloraEnv): { open: number; edge: number; wood: number; shore: number } {
  const s = clamp01(env.shade(site.tx, site.ty));
  // 树荫只覆盖冠下；"林缘/树间" = 附近 SHRUB_EDGE_RANGE 格内有树荫（随距离衰减）而本格不全荫。
  let near = 0;
  for (let d = 1; d <= SHRUB_EDGE_RANGE; d++) {
    const k = 1 - (d - 1) / SHRUB_EDGE_RANGE;
    for (const dy of [-1, 0, 1]) near = Math.max(near, k * clamp01(env.shade(site.tx - d, site.ty + dy)), k * clamp01(env.shade(site.tx + d, site.ty + dy)));
  }
  const wd = env.waterDistance(site.tx, site.ty);
  const shore = Number.isFinite(wd) ? clamp01(1 - Math.max(0, wd - SHORE_SAND) / SHRUB_SHORE_RANGE) : 0;
  const edge = clamp01(Math.max(4 * s * (1 - s), near * (1 - s)));
  return { open: (1 - s) * (1 - shore) * (1 - edge), edge, wood: s * s, shore };
}

/** 各种类在生长点的期望株数。 */
export function shrubLambdas(site: CoverSite, env: FloraEnv = NO_ENV): Map<ShrubKind, number> {
  const h = shrubHabitat(site, env);
  const out = new Map<ShrubKind, number>();
  for (const k of SHRUB_KINDS) {
    const r = SHRUB_RULES[k];
    const v = clamp01(0.5 + 0.9 * fbm1D(site.tx / r.scale, r.salt, 2, 0.5));
    const community = clamp01((v - r.threshold) / (1 - r.threshold));
    const aff = r.habitat.open * h.open + r.habitat.edge * h.edge + r.habitat.wood * h.wood + r.habitat.shore * h.shore;
    // 020：沙漠里没有滨草/沙棘等灌木（干旱度 → 乘 1 − arid，过渡带渐少）。
    out.set(k, r.density * community * aff * r.ground[site.ground] * (site.shape === SHAPE_FULL ? 1 : 0.5) * (1 - clamp01(env.arid?.(site.tx) ?? 0)));
  }
  return out;
}

/** 规划灌木（纯函数、确定性；每格至多 1 株：λ 总和作概率，再按 λ 比例选种）。 */
export function planShrubs(sites: readonly CoverSite[], env: FloraEnv = NO_ENV): ShrubInstance[] {
  const out: ShrubInstance[] = [];
  for (const site of sites) {
    if (!Number.isInteger(site.tx) || !Number.isInteger(site.ty)) throw new Error(`flora-shrubs: site must have integer coordinates, got (${site.tx},${site.ty})`);
    const lambdas = shrubLambdas(site, env);
    let total = 0;
    for (const v of lambdas.values()) total += v;
    const h = (k: number): number => hash01(site.tx, site.ty, 2600 + k);
    if (total <= 0 || h(0) >= Math.min(0.9, total)) continue;
    let pick = h(1) * total;
    let kind: ShrubKind = SHRUB_KINDS[0];
    for (const k of SHRUB_KINDS) {
      pick -= lambdas.get(k) as number;
      if (pick <= 0) {
        kind = k;
        break;
      }
    }
    const rule = SHRUB_RULES[kind];
    const fx = 0.2 + 0.6 * h(2);
    out.push({
      kind,
      x: site.tx + fx,
      y: siteTopY(site, fx) - SHRUB_SINK,
      z: SHRUB_Z[0] + (SHRUB_Z[1] - SHRUB_Z[0]) * h(3),
      yaw: (h(4) - 0.5) * 1.2,
      height: rule.height[0] + (rule.height[1] - rule.height[0]) * h(5),
      tint: rule.palette[Math.floor(h(6) * rule.palette.length)] as number,
    });
  }
  return out;
}

/** 图集几何（变体序 = SHRUB_KINDS 序）：木本种 = 树式叶团+叶卡，草本种 = 细叶条带（转树式属性）。 */
export function createShrubAtlas(): THREE.BufferGeometry {
  const parts: Record<ShrubKind, () => THREE.BufferGeometry> = {
    hedge: () => buildWoody(WOODY_SPECS.hedge),
    azalea: () => buildWoody(WOODY_SPECS.azalea),
    berry: () => buildWoody(WOODY_SPECS.berry),
    fernclump: () => herbToLeafGeometry(createTallFernGeometry()),
    sapling: () => buildWoody(WOODY_SPECS.sapling),
    cattail: () => herbToLeafGeometry(createCattailGeometry()),
    rose: () => buildWoody(WOODY_SPECS.rose),
    bamboo: () => herbToLeafGeometry(createBambooGeometry(), 0.8),
    marram: () => herbToLeafGeometry(createMarramGeometry()),
    buckthorn: () => buildWoody(WOODY_SPECS.buckthorn),
  };
  const geoms = SHRUB_KINDS.map((k) => parts[k]());
  const atlas = mergeIndexedVariants(geoms, 'flora-shrubs');
  for (const g of geoms) g.dispose();
  return atlas;
}

/** 草地扰动（世界空间位移经实例矩阵逆变换回局部，乘 aSway）。 */
const SHRUB_DISTURB_BODY = [
  '#ifdef USE_INSTANCING',
  '{',
  '  vec3 dw = ( modelMatrix * instanceMatrix * vec4( position, 1.0 ) ).xyz;',
  '  transformed += inverse( mat3( instanceMatrix ) ) * ( aSway * uDisturbScale * grassDisturb( dw ) );',
  '}',
  '#endif',
].join('\n');

/** 灌木材质 = 树叶材质（同图集/alphaTest/风摆）+ 草地扰动 + 变体塌缩。 */
export function createShrubMaterial(uTime: THREE.IUniform<number>): THREE.MeshStandardMaterial {
  const mat = createLeafMaterial(uTime, {
    name: 'flora-shrubs',
    cacheKey: SHRUB_PROGRAM_KEY,
    vertexDecl: `uniform float uDisturbScale;\n${DISTURB_GLSL}`,
    vertexBody: SHRUB_DISTURB_BODY,
    uniforms: { ...sharedDisturbUniforms(), uDisturbScale: { value: SHRUB_DISTURB_SCALE } },
  });
  return addVariantCollapse(mat, 'flora-shrubs');
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export function shrubMatrix(s: ShrubInstance, out: THREE.Matrix4): THREE.Matrix4 {
  const k = s.height / SHRUB_NATIVE_HEIGHT[s.kind];
  _e.set(0, s.yaw, 0);
  _q.setFromEuler(_e);
  // z 向厚度压到 SHRUB_MAX_DEPTH（冠团本体半厚约 .45），不伸进前景平面。
  return out.compose(_p.set(s.x, s.y, s.z), _q, _s.set(k, k, Math.min(k, SHRUB_MAX_DEPTH / 0.45)));
}

/** 区块灌木网格（名 `tiles-shrub-<chunkName>`）；空计划返回 null；超预算即抛。几何为私有拷贝，卸载时释放。 */
export function createShrubMesh(plan: readonly ShrubInstance[], atlas: THREE.BufferGeometry, material: THREE.Material, chunkName: string): THREE.InstancedMesh | null {
  if (plan.length > SHRUB_CHUNK_BUDGET) throw new Error(`flora-shrubs: chunk ${chunkName} has ${plan.length} shrubs (budget ${SHRUB_CHUNK_BUDGET})`);
  if (plan.length === 0) return null;
  const mesh = new THREE.InstancedMesh(variantInstanceGeometry(atlas, plan.map((s) => SHRUB_KINDS.indexOf(s.kind))), material, plan.length);
  mesh.name = `tiles-shrub-${chunkName}`;
  const counts: Partial<Record<ShrubKind, number>> = {};
  plan.forEach((s, i) => {
    mesh.setMatrixAt(i, shrubMatrix(s, _m));
    mesh.setColorAt(i, _c.setHex(s.tint));
    counts[s.kind] = (counts[s.kind] ?? 0) + 1;
  });
  mesh.userData.shrubCounts = counts;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
