/**
 * 光球视图：所有光球共享一个球体几何 + 自发光材质 + 加性混合光晕 sprite（程序生成 DataTexture，不依赖 document）。
 * 照明：启动即向场景加入固定数量（tuning.render.orbLights）的 PointLight，强度 0；
 * 每帧把灯分配给离玩家最近的光球，不动态增删灯（避免着色器因灯数变化重编译）。
 * 光球 body 以脚底为原点（与其他实体一致），视图原点放在球心：y + height/2。
 */
import * as THREE from 'three';
import type { Tuning } from '../config/tuning.ts';
import { lerp } from '../core/math.ts';
import type { Entity } from '../entities/entity.ts';
import type { EntityView, EntityViewFactory } from './view-registry.ts';

const CORE_COLOR = '#fff1c4';
const EMISSIVE_COLOR = '#ffb43c';
const GLOW_COLOR = '#ffae3a';
const LIGHT_COLOR = '#ffc070';
/** 光晕 sprite 直径 / 光球半径。 */
const GLOW_SCALE = 9;
const LIGHT_INTENSITY = 24;
const LIGHT_DISTANCE = 10;
const PULSE_HZ = 6;

/**
 * 径向衰减光晕贴图（RGBA，白色 + 平滑衰减 alpha）。加性混合时颜色由材质 color 决定。
 * 供 orb-view 与 orb-fx 共用生成逻辑（各自持有实例、各自释放）。
 */
export function createGlowTexture(size = 64): THREE.DataTexture {
  if (!(Number.isInteger(size) && size >= 4)) throw new Error(`orb view: invalid glow texture size ${size}`);
  const data = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.min(1, Math.hypot(x - c, y - c) / c);
      // 核心亮、边缘平滑归零：(1-d)^2 叠一点高斯感的中心增强。
      const f = (1 - d) * (1 - d);
      const a = Math.min(1, f * 0.85 + (d < 0.25 ? (0.25 - d) * 2 : 0));
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export interface OrbViewsOptions {
  readonly tuning: Tuning;
  readonly scene: THREE.Object3D;
}

export interface OrbViews {
  /** 注册到 view-registry 的 'orb' 工厂。 */
  readonly factory: EntityViewFactory;
  /** 每帧在 views.sync 之后调用：把固定光源池分配给离玩家最近的光球。 */
  update(entities: readonly Entity[], alpha: number): void;
  dispose(): void;
}

const centerX = (e: Entity, alpha: number): number => lerp(e.body.prevX, e.body.x, alpha);
const centerY = (e: Entity, alpha: number): number => lerp(e.body.prevY, e.body.y, alpha) + e.body.height / 2;

export function createOrbViews(options: OrbViewsOptions): OrbViews {
  const { tuning, scene } = options;
  const radius = tuning.attacks.orb.radius;
  const lightCount = tuning.render.orbLights;
  if (!(radius > 0)) throw new Error(`orb view: invalid orb radius ${radius}`);
  if (!(Number.isInteger(lightCount) && lightCount >= 0)) throw new Error(`orb view: invalid render.orbLights ${lightCount}`);

  const geometry = new THREE.SphereGeometry(radius, 20, 14);
  const material = new THREE.MeshStandardMaterial({
    color: CORE_COLOR,
    emissive: EMISSIVE_COLOR,
    emissiveIntensity: 2.4,
    roughness: 0.4,
    metalness: 0,
  });
  material.name = 'orb-core';
  const glowTexture = createGlowTexture();
  const glowMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    color: GLOW_COLOR,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  glowMaterial.name = 'orb-glow';

  const lights: THREE.PointLight[] = [];
  for (let i = 0; i < lightCount; i++) {
    const light = new THREE.PointLight(LIGHT_COLOR, 0, LIGHT_DISTANCE, 2);
    light.name = `orb-light-${i}`;
    light.castShadow = false;
    scene.add(light);
    lights.push(light);
  }

  const factory: EntityViewFactory = (entity) => {
    if (entity.kind !== 'orb' || !entity.projectile) throw new Error(`orb view: entity ${entity.id} is not an orb`);
    const group = new THREE.Group();
    group.name = `orb-${entity.id}`;
    const core = new THREE.Mesh(geometry, material);
    core.castShadow = false;
    core.receiveShadow = false;
    const glow = new THREE.Sprite(glowMaterial);
    glow.scale.setScalar(radius * GLOW_SCALE);
    group.add(core, glow);
    let time = 0;
    // 蓄力光球（任务 018）：按实际半径整体放大，高档脉动更强。
    const sizeK = entity.projectile.def.radius / radius;
    const level = entity.projectile.level;
    core.scale.setScalar(sizeK);
    const view: EntityView = {
      object: group,
      sync(e, alpha, frameDt) {
        group.position.set(centerX(e, alpha), centerY(e, alpha), 0);
        time += frameDt;
        const pulse = 1 + (0.08 + 0.05 * (level - 1)) * Math.sin(time * PULSE_HZ * Math.PI * 2);
        glow.scale.setScalar(radius * sizeK * GLOW_SCALE * pulse);
      },
      dispose() {
        // 几何/材质/贴图为共享资源，随 OrbViews.dispose 释放。
        group.clear();
      },
    };
    return view;
  };

  const orbs: Entity[] = [];
  const dist = new Map<Entity, number>();

  return {
    factory,
    update(entities, alpha) {
      if (lights.length === 0) return;
      orbs.length = 0;
      dist.clear();
      let player: Entity | null = null;
      for (const e of entities) {
        if (e.removed) continue;
        if (e.kind === 'orb') orbs.push(e);
        else if (e.kind === 'pelican' && player === null) player = e;
      }
      const px = player ? centerX(player, alpha) : 0;
      const py = player ? centerY(player, alpha) : 0;
      for (const o of orbs) {
        dist.set(o, player ? (centerX(o, alpha) - px) ** 2 + (centerY(o, alpha) - py) ** 2 : o.id);
      }
      orbs.sort((a, b) => (dist.get(a) as number) - (dist.get(b) as number) || a.id - b.id);
      for (let i = 0; i < lights.length; i++) {
        const light = lights[i] as THREE.PointLight;
        const o = orbs[i];
        if (o) {
          light.position.set(centerX(o, alpha), centerY(o, alpha), 0.6);
          light.intensity = LIGHT_INTENSITY;
        } else {
          light.intensity = 0;
        }
      }
    },
    dispose() {
      for (const l of lights) {
        l.removeFromParent();
        l.dispose();
      }
      lights.length = 0;
      geometry.dispose();
      material.dispose();
      glowMaterial.dispose();
      glowTexture.dispose();
    },
  };
}
