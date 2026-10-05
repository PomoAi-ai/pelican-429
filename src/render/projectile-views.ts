/**
 * 非光球投射物的实体视图（任务 018）：水弹、吐出的鱼、敌弹（光球仍由 orb-view 负责）。
 * 同类视图共享几何与材质（对象池思路：创建/销毁只增删轻量 Group，不分配 GPU 资源），全部为 MeshStandard/Basic
 * 材质，由 light-texture 每帧遍历场景自动挂接瓦片光照（地下变暗）；敌弹/返还弹的光晕是加性 Sprite（不挂接，自发光）。
 * - 水弹（019 打磨）：饱满的果冻水团——近球形、沿速度方向略拉长（长宽比 ≤ WATER_SHOT_MAX_ASPECT，体积守恒）、
 *   顶点着色器按时间噪声沿法线抖动（WATER_JELLY）、菲涅尔边缘更实更亮（中心透、边缘厚 = 折射感）、内部偏蓝透镜核与底部焦散亮斑、
 *   固定朝上的高光点；尾部拖 3 个渐小水珠 + 一团细水雾（随速度显隐）；
 * - 鱼：卡通鱼（cartoon-fish.ts）+ 弧形速度线，见 fish-shot-view.ts（对象池）；
 * - 敌弹：紫色黏球 + 光晕脉动；返还弹（returned）换成金色、略大。
 * 视图原点放在弹体中心（body 以脚底为原点：中心 = y + height/2）。
 */
import * as THREE from 'three';
import { lerp } from '../core/math.ts';
import type { Entity, EntityKind } from '../entities/entity.ts';
import { createCartoonFishKit, createFishVariantRelay } from './cartoon-fish.ts';
import type { CartoonFish, FishVariantRelay } from './cartoon-fish.ts';
import { createFishShotPool } from './fish-shot-view.ts';
import { createGlowTexture } from './orb-view.ts';
import type { EntityView, EntityViewFactory } from './view-registry.ts';
import { createPhotonProjectileViews } from './photon-projectile-view.ts';
import { createDronePayloadViews } from './drone-payload-view.ts';

/** 投射物视图 z：在地形方块前表面（z=0.5）之前一点，避免被方块遮住。 */
export const PROJECTILE_Z = 0.15;
const WATER_COLOR = '#8fd3f4';
const ENEMY_COLOR = '#9b4dd6';
const ENEMY_GLOW = '#c27bff';
const RETURN_COLOR = '#ffc94a';
const RETURN_GLOW = '#ffd86e';

/** 水弹主体最大长宽比（沿速度方向 : 横截面）。 */
export const WATER_SHOT_MAX_ASPECT = 1.3;
/** 果冻抖动参数：顶点沿法线位移幅度（单位球半径的比例）、噪声空间频率、时间速度、整体呼吸角频率（rad/s）。 */
export const WATER_JELLY = Object.freeze({ amplitude: 0.07, frequency: 2.6, speed: 7.5, breath: 13 });
/** 尾部水珠个数与相对主体半径的大小。 */
const BEAD_SIZES = [0.3, 0.21, 0.14] as const;

/**
 * 水弹主体缩放（单位球 → 椭球）：速度越快沿速度方向略长，叠加小幅“呼吸”；长宽比夹在 [1, WATER_SHOT_MAX_ASPECT]，
 * 横截面保持圆（y = z），体积守恒（x·y·z = r³）。
 */
export function waterShotScale(r: number, speed: number, time: number): { x: number; y: number; z: number } {
  if (!(Number.isFinite(r) && r > 0 && Number.isFinite(speed) && Number.isFinite(time))) throw new Error(`waterShotScale: invalid r=${r} speed=${speed} time=${time}`);
  const stretch = 1 + Math.min(0.17, Math.abs(speed) * 0.012);
  const breathe = 1 + 0.04 * Math.sin(time * WATER_JELLY.breath);
  const k = Math.min(WATER_SHOT_MAX_ASPECT ** (2 / 3), Math.max(1, stretch * breathe));
  const side = r / Math.sqrt(k);
  return { x: r * k, y: side, z: side };
}

const JELLY_VERTEX_PARS = /* glsl */ `
uniform float uJellyTime;
uniform float uJellyAmp;
uniform float uJellyFreq;
uniform float uJellySpeed;
`;
// 顶点噪声：三个方向的正弦积叠加（模型空间位置 × 频率 + 世界位置相位，使不同水弹/不同位置的抖动不同步）。
const JELLY_VERTEX = /* glsl */ `
{
  vec3 jw = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float jt = uJellyTime * uJellySpeed;
  vec3 jp = position * uJellyFreq;
  float jn = sin(jp.x + jt + jw.x * 1.7) * sin(jp.y * 1.13 - jt * 1.21 + jw.y * 1.3)
    + 0.5 * sin(jp.z * 0.87 + jp.x * 0.5 + jt * 0.77);
  transformed += normal * (jn * uJellyAmp);
}
`;
const JELLY_FRAGMENT = /* glsl */ `
{
  float jellyFresnel = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.2);
  diffuseColor.a = mix(diffuseColor.a, 0.96, jellyFresnel);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.96, 1.0), jellyFresnel * 0.55);
}
`;

/** 给水弹主体材质挂上果冻抖动 + 菲涅尔（链式 onBeforeCompile，缓存键加标签；与光照图/云影注入顺序无关）。 */
function applyJelly(material: THREE.Material, uniforms: Record<string, THREE.IUniform<number>>): void {
  const prev = material.onBeforeCompile;
  const baseKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    for (const chunk of ['#include <common>', '#include <begin_vertex>']) {
      if (!shader.vertexShader.includes(chunk)) throw new Error(`projectile-views: water jelly vertex shader lacks '${chunk}'`);
    }
    if (!shader.fragmentShader.includes('#include <emissivemap_fragment>')) throw new Error("projectile-views: water jelly fragment shader lacks '#include <emissivemap_fragment>'");
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${JELLY_VERTEX_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${JELLY_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${JELLY_FRAGMENT}`);
  };
  material.customProgramCacheKey = () => `${baseKey}|water-jelly-v1`;
}

/** 一条鱼模型（卡通鱼，共享几何/材质，身长 1、朝 +X）。 */
export type FishModel = CartoonFish;

export interface ProjectileViews {
  /** 注册到 view-registry 的工厂（按 kind）。 */
  readonly factories: Readonly<Partial<Record<EntityKind, EntityViewFactory>>>;
  /** 新建一条鱼模型（落地蹦跳特效复用同一套几何/材质；随 dispose 统一释放）。variant 见 FISH_VARIANTS。 */
  makeFish(variant?: number): FishModel;
  /** 飞行鱼视图对象池已创建的槽数（只增不减，= 历史最大同时在飞数）。 */
  readonly fishPoolSize: number;
  /** 配色接力：鹈鹕视图（嘴里露出的鱼）peek，飞鱼视图 take。 */
  readonly fishRelay: FishVariantRelay;
  /** 某条飞鱼（实体 id）的配色，供落地蹦跳特效沿用。 */
  fishVariant(id: number): number;
  dispose(): void;
}

const centerX = (e: Entity, alpha: number): number => lerp(e.body.prevX, e.body.x, alpha);
const centerY = (e: Entity, alpha: number): number => lerp(e.body.prevY, e.body.y, alpha) + e.body.height / 2;

function requireKind(e: Entity, kind: EntityKind): number {
  if (e.kind !== kind || !e.projectile) throw new Error(`projectile view: entity ${e.id} is not a ${kind} projectile`);
  return e.projectile.def.radius;
}

export function createProjectileViews(): ProjectileViews {
  const photons = createPhotonProjectileViews();
  const drones = createDronePayloadViews();
  // ---- 水弹 ----
  const waterGeo = new THREE.SphereGeometry(1, 24, 18);
  const waterMat = new THREE.MeshStandardMaterial({ color: WATER_COLOR, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.5, depthWrite: false, emissive: '#2a6f9a', emissiveIntensity: 0.18 });
  waterMat.name = 'water-shot';
  const jellyUniforms: Record<string, THREE.IUniform<number>> = {
    uJellyTime: { value: 0 },
    uJellyAmp: { value: WATER_JELLY.amplitude },
    uJellyFreq: { value: WATER_JELLY.frequency },
    uJellySpeed: { value: WATER_JELLY.speed },
  };
  applyJelly(waterMat, jellyUniforms);
  /** 共享果冻时钟：由最早存活的一颗水弹推进（每帧一次；dt = 0 时冻结）。 */
  let jellyClockOwner: number | null = null;
  // 内部透镜核（偏深蓝、偏后下 = 折射感）、底部焦散亮斑、固定朝上的高光点、尾部水珠、水雾。
  const waterCoreMat = new THREE.MeshStandardMaterial({ color: '#3f9fd6', roughness: 0.1, transparent: true, opacity: 0.32, depthWrite: false });
  waterCoreMat.name = 'water-shot-core';
  const causticMat = new THREE.MeshBasicMaterial({ color: '#e9fbff', transparent: true, opacity: 0.55, depthWrite: false });
  causticMat.name = 'water-shot-caustic';
  const highlightMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false });
  highlightMat.name = 'water-shot-highlight';
  const beadMat = new THREE.MeshStandardMaterial({ color: WATER_COLOR, roughness: 0.06, transparent: true, opacity: 0.72, depthWrite: false, emissive: '#2a6f9a', emissiveIntensity: 0.18 });
  beadMat.name = 'water-shot-bead';
  const mistGeo = new THREE.PlaneGeometry(1, 1);

  // ---- 鱼：卡通鱼 kit（对象池）----
  const fishKit = createCartoonFishKit();
  const fishRelay = createFishVariantRelay();
  const fishPool = createFishShotPool(fishKit, fishRelay, PROJECTILE_Z);

  // ---- 敌弹 / 返还弹 ----
  const goGeo = new THREE.IcosahedronGeometry(1, 2);
  const enemyMat = new THREE.MeshStandardMaterial({ color: ENEMY_COLOR, roughness: 0.3, emissive: ENEMY_COLOR, emissiveIntensity: 1.2 });
  enemyMat.name = 'enemy-shot';
  const returnMat = new THREE.MeshStandardMaterial({ color: RETURN_COLOR, roughness: 0.3, emissive: RETURN_COLOR, emissiveIntensity: 1.6 });
  returnMat.name = 'returned-shot';
  const glowTex = createGlowTexture();
  const mistMat = new THREE.MeshBasicMaterial({ map: glowTex, color: '#dff3ff', transparent: true, opacity: 0.32, depthWrite: false });
  mistMat.name = 'water-shot-mist';
  const glowMat = (color: string): THREE.SpriteMaterial =>
    new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
  const enemyGlow = glowMat(ENEMY_GLOW);
  const returnGlow = glowMat(RETURN_GLOW);

  const water: EntityViewFactory = (entity) => {
    const r = requireKind(entity, 'waterShot');
    const returned = entity.projectile?.returned === true;
    const group = new THREE.Group();
    group.name = `water-shot-${entity.id}`;
    // spin 随速度方向旋转（主体拉长、水珠/水雾拖在后面）；高光挂在 group 上，始终在左上前方。
    const spin = new THREE.Group();
    const body = new THREE.Mesh(waterGeo, returned ? returnMat : waterMat);
    body.name = 'water-shot-body';
    const core = new THREE.Mesh(waterGeo, waterCoreMat);
    core.scale.setScalar(0.55);
    core.position.set(-0.12, -0.14, -0.1);
    const caustic = new THREE.Mesh(waterGeo, causticMat);
    caustic.scale.set(0.34, 0.12, 0.3);
    caustic.position.set(0.05, -0.62, 0.42);
    body.add(core, caustic);
    const beads = BEAD_SIZES.map(() => {
      const bead = new THREE.Mesh(waterGeo, returned ? returnMat : beadMat);
      bead.name = 'water-shot-bead';
      spin.add(bead);
      return bead;
    });
    const mist = new THREE.Mesh(mistGeo, mistMat);
    mist.name = 'water-shot-mist';
    spin.add(body, mist);
    const highlight = new THREE.Mesh(waterGeo, highlightMat);
    highlight.name = 'water-shot-highlight';
    group.add(spin, highlight);
    let time = entity.id * 0.37;
    return {
      object: group,
      sync(e, alpha, frameDt) {
        time += frameDt;
        if (jellyClockOwner === null) jellyClockOwner = e.id;
        if (jellyClockOwner === e.id) (jellyUniforms.uJellyTime as THREE.IUniform<number>).value += frameDt;
        group.position.set(centerX(e, alpha), centerY(e, alpha), PROJECTILE_Z);
        const speed = Math.hypot(e.body.vx, e.body.vy);
        if (speed > 1e-6) spin.rotation.z = Math.atan2(e.body.vy, e.body.vx);
        const s = waterShotScale(r, speed, time);
        body.scale.set(s.x, s.y, s.z);
        // 高光：左上前方的小亮点（不随速度方向转）。
        highlight.scale.set(r * 0.2, r * 0.13, r * 0.1);
        highlight.position.set(-r * 0.28, r * 0.42, r * 0.72);
        // 尾迹：越快越明显；水珠沿速度反方向依次变小，轻微上下摆。
        const trail = Math.min(1, Math.max(0.25, speed / 6));
        let x = -s.x * 0.95;
        BEAD_SIZES.forEach((k, i) => {
          const bead = beads[i] as THREE.Mesh;
          const size = r * k * (0.75 + 0.25 * trail);
          x -= size * 1.6 + r * 0.22 * trail;
          bead.position.set(x, r * 0.14 * Math.sin(time * 9 + i * 1.7), 0);
          bead.scale.set(size * 1.08, size, size);
        });
        mist.position.set(-s.x * 1.9, 0, -0.02);
        mist.scale.set(r * 4.2 * trail, r * 1.8 * (0.6 + 0.4 * trail), 1);
        mist.visible = !returned;
      },
      dispose() {
        if (jellyClockOwner === entity.id) jellyClockOwner = null;
        group.clear();
      },
    };
  };

  const fish: EntityViewFactory = (entity) => {
    requireKind(entity, 'fishShot');
    return fishPool.acquire(entity);
  };

  const enemy: EntityViewFactory = (entity) => {
    const r = requireKind(entity, 'enemyShot');
    const returned = entity.projectile?.returned === true;
    const group = new THREE.Group();
    group.name = `enemy-shot-${entity.id}`;
    const ball = new THREE.Mesh(goGeo, returned ? returnMat : enemyMat);
    ball.scale.setScalar(r);
    const glow = new THREE.Sprite(returned ? returnGlow : enemyGlow);
    group.add(ball, glow);
    let time = entity.id * 0.53;
    return {
      object: group,
      sync(e, alpha, frameDt) {
        time += frameDt;
        group.position.set(centerX(e, alpha), centerY(e, alpha), PROJECTILE_Z);
        // 黏球：不规则搏动 + 自转。
        ball.scale.set(r * (1 + 0.12 * Math.sin(time * 9)), r * (1 + 0.12 * Math.sin(time * 9 + 2)), r);
        ball.rotation.z = time * 3;
        glow.scale.setScalar(r * (returned ? 9 : 7) * (1 + 0.15 * Math.sin(time * 6)));
      },
      dispose() {
        group.clear();
      },
    };
  };

  return {
    factories: { waterShot: water, fishShot: fish, enemyShot: enemy, ...photons.factories, ...drones.factories },
    makeFish: (variant = 0) => fishKit.create(variant),
    fishRelay,
    fishVariant: (id) => fishPool.variantOf(id),
    get fishPoolSize() {
      return fishPool.size;
    },
    dispose() {
      photons.dispose();
      drones.dispose();
      fishPool.dispose();
      fishKit.dispose();
      for (const g of [waterGeo, mistGeo, goGeo]) g.dispose();
      for (const m of [waterMat, waterCoreMat, causticMat, highlightMat, beadMat, mistMat, enemyMat, returnMat, enemyGlow, returnGlow]) m.dispose();
      glowTex.dispose();
    },
  };
}
