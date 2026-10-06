/**
 * 跟随相机：死区 + 朝向前瞻 + 指数平滑，夹紧在地图范围内（下边界可抬高到 bounds.minY，不展示深层地下）；
 * 相机固定在 z=distance 平视 z=0 平面；开场取景（startIntro，见 camera-intro）期间按 introBlend 从取景（更远、对准渔屋）
 * 平滑过渡到跟随位置与常规距离。
 * 主光与其 target 跟随相机注视点，保持相对偏移（阴影相机始终覆盖可视区域）。
 */
import * as THREE from 'three';
import type { Tuning } from '../config/tuning.ts';
import { clamp, damp, lerp } from '../core/math.ts';
import { introBlend } from './camera-intro.ts';
import type { CameraShot } from './camera-intro.ts';
import type { Rect, Vec2 } from '../core/math.ts';

/** 注视点比角色脚底高出的基础距离；实际再加 tuning.camera.framingOffsetY（见 focusHeight）。 */
export const FOCUS_HEIGHT = 2;

/** 注视点高出脚底的总距离 = FOCUS_HEIGHT + framingOffsetY（角色处于画面偏下，多看天空、少看地下）。 */
export function focusHeight(tuning: Tuning): number {
  return FOCUS_HEIGHT + tuning.camera.framingOffsetY;
}

export interface Viewport {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface CameraRigOptions {
  readonly camera: THREE.PerspectiveCamera;
  readonly tuning: Tuning;
  /** 地图尺寸（瓦片）；minY（默认 0）为可视区域下边界，见 cameraFloorY。 */
  readonly bounds: { readonly width: number; readonly height: number; readonly minY?: number };
  /** 画布在视口中的位置与尺寸（CSS 像素）。 */
  readonly viewport: () => Viewport;
  /** 跟随注视点的主光（可选）。 */
  readonly light?: THREE.DirectionalLight;
  readonly lightOffset?: Readonly<{ x: number; y: number; z: number }>;
}

export interface CameraRig {
  /** 立即对准目标（无平滑），用于出生/传送。 */
  snapTo(targetX: number, targetY: number, facing: 1 | -1): void;
  update(targetX: number, targetY: number, facing: 1 | -1, dt: number, closeup?: { shot: CameraShot; blend: number }): void;
  /** 屏幕坐标（clientX/Y）→ 射线交 z=0 平面的世界坐标；视线与平面平行或画布无尺寸时返回 null。 */
  screenToWorld(clientX: number, clientY: number, out: Vec2): Vec2 | null;
  /** z=0 平面上的可视矩形（按夹紧后的相机位置 + 半视野），四周再扩 margin（瓦片，≥0）。 */
  visibleRect(margin?: number): Rect;
  /** 平滑后的注视点（未夹紧；实际相机位置见 visibleRect / camera.position）。 */
  readonly focus: Readonly<Vec2>;
  /** 开场取景：立即对准 shot（停留 tuning.camera.intro.hold 秒后过渡到跟随）。shot 非法即抛。 */
  startIntro(shot: CameraShot): void;
  /** 玩家输入：取景停留中则立即开始过渡（未取景/已在过渡时无副作用）。 */
  skipIntro(): void;
  /** 是否仍在开场取景（含过渡）。 */
  readonly introActive: boolean;
}

/** 相机下边界：max(0, min(surface) − depth)。surface 为空或 depth 非法即抛。 */
export function cameraFloorY(surface: Int16Array, depth: number): number {
  if (surface.length === 0) throw new Error('camera-rig: surface is empty');
  if (!(Number.isFinite(depth) && depth >= 0)) throw new Error(`camera-rig: invalid floor depth ${depth}`);
  let min = Infinity;
  for (let i = 0; i < surface.length; i++) min = Math.min(min, surface[i] as number);
  return Math.max(0, min - depth);
}

/** 夹紧到 [lo, hi]；范围不足（lo > hi）时取中点。 */
function clampRange(v: number, lo: number, hi: number): number {
  return lo > hi ? (lo + hi) / 2 : clamp(v, lo, hi);
}

export function createCameraRig(options: CameraRigOptions): CameraRig {
  const { camera, tuning, bounds, viewport, light } = options;
  const lightOffset = options.lightOffset ?? { x: 3, y: 7.5, z: 10 };
  if (!(bounds.width > 0 && bounds.height > 0)) throw new Error(`camera-rig: invalid bounds ${bounds.width}×${bounds.height}`);
  const minY = bounds.minY ?? 0;
  if (!(Number.isFinite(minY) && minY >= 0 && minY < bounds.height)) {
    throw new Error(`camera-rig: invalid bounds.minY ${minY} (must be in [0, ${bounds.height}))`);
  }
  const cfg = tuning.camera;
  if (!Number.isFinite(cfg.framingOffsetY)) throw new Error(`camera-rig: invalid camera.framingOffsetY ${cfg.framingOffsetY}`);
  const lift = focusHeight(tuning);
  const introCfg = cfg.intro;
  if (!(introCfg && introCfg.hold >= 0 && introCfg.blend > 0)) throw new Error(`camera-rig: invalid camera.intro ${JSON.stringify(introCfg)}`);
  // 开场取景：shot 为取景，t 为已过时间（skipIntro 把 t 推到 hold）。
  let intro: { shot: CameraShot; t: number } | null = null;

  // goal：死区跟随后的期望注视点；focus：平滑后的实际注视点；lead：平滑后的前瞻量。
  const goal = { x: 0, y: 0 };
  const focus = { x: 0, y: 0 };
  let lead = 0;
  let closeup: { shot: CameraShot; blend: number } | undefined;

  const halfExtents = (distance: number): { hw: number; hh: number } => {
    const hh = distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    return { hw: hh * camera.aspect, hh };
  };

  const clampAt = (fx: number, fy: number, distance: number): { x: number; y: number; hw: number; hh: number } => {
    const { hw, hh } = halfExtents(distance);
    return { x: clampRange(fx, hw, bounds.width - hw), y: clampRange(fy, minY + hh, bounds.height - hh), hw, hh };
  };

  /** 当前相机：跟随位置（常规距离夹紧）；开场取景时与取景（按其距离夹紧）按 introBlend 混合。 */
  const clamped = (): { x: number; y: number; hw: number; hh: number; distance: number } => {
    const follow = clampAt(focus.x, focus.y, cfg.distance);
    if (closeup) {
      const { shot, blend } = closeup;
      const distance = lerp(cfg.distance, shot.distance, blend);
      const extents = halfExtents(distance);
      return { x: lerp(follow.x, shot.x, blend), y: lerp(follow.y, shot.y, blend), ...extents, distance };
    }
    if (intro === null) return { ...follow, distance: cfg.distance };
    const k = introBlend(intro.t, introCfg.hold, introCfg.blend);
    const shot = clampAt(intro.shot.x, intro.shot.y, intro.shot.distance);
    const distance = lerp(intro.shot.distance, cfg.distance, k);
    const { hw, hh } = halfExtents(distance);
    return { x: lerp(shot.x, follow.x, k), y: lerp(shot.y, follow.y, k), hw, hh, distance };
  };

  function apply(): void {
    const { x, y, distance } = clamped();
    camera.position.set(x, y, distance);
    camera.lookAt(x, y, 0);
    camera.updateMatrixWorld();
    if (light) {
      light.position.set(x + lightOffset.x, y + lightOffset.y, lightOffset.z);
      light.target.position.set(x, y, 0);
      light.target.updateMatrixWorld();
    }
  }

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();

  return {
    focus,
    get introActive() {
      return intro !== null;
    },
    startIntro(shot) {
      if (!Number.isFinite(shot.x) || !Number.isFinite(shot.y) || !(shot.distance > 0 && Number.isFinite(shot.distance))) {
        throw new Error(`camera-rig: invalid intro shot ${JSON.stringify(shot)}`);
      }
      intro = { shot, t: 0 };
      apply();
    },
    skipIntro() {
      if (intro !== null && intro.t < introCfg.hold) intro.t = introCfg.hold;
    },
    snapTo(targetX, targetY, facing) {
      intro = null;
      lead = facing * cfg.lookAhead;
      goal.x = targetX + lead;
      goal.y = targetY + lift;
      focus.x = goal.x;
      focus.y = goal.y;
      apply();
    },
    update(targetX, targetY, facing, dt, shot) {
      closeup = shot;
      if (!Number.isFinite(targetX) || !Number.isFinite(targetY) || !(dt >= 0)) {
        throw new Error(`camera-rig: invalid update target=(${targetX},${targetY}) dt=${dt}`);
      }
      lead = damp(lead, facing * cfg.lookAhead, cfg.lambda * 0.5, dt);
      const wantX = targetX + lead;
      const wantY = targetY + lift;
      // 死区：目标离开 goal 周围 ±deadZone 时才推动 goal。
      if (wantX > goal.x + cfg.deadZone.x) goal.x = wantX - cfg.deadZone.x;
      else if (wantX < goal.x - cfg.deadZone.x) goal.x = wantX + cfg.deadZone.x;
      if (wantY > goal.y + cfg.deadZone.y) goal.y = wantY - cfg.deadZone.y;
      else if (wantY < goal.y - cfg.deadZone.y) goal.y = wantY + cfg.deadZone.y;
      focus.x = damp(focus.x, goal.x, cfg.lambda, dt);
      focus.y = damp(focus.y, goal.y, cfg.lambda, dt);
      if (intro !== null) {
        intro.t += dt;
        if (intro.t >= introCfg.hold + introCfg.blend) intro = null;
      }
      apply();
    },
    visibleRect(margin = 0) {
      if (!(Number.isFinite(margin) && margin >= 0)) throw new Error(`camera-rig: invalid visibleRect margin ${margin}`);
      const { x, y, hw, hh } = clamped();
      return { x: x - hw - margin, y: y - hh - margin, w: 2 * (hw + margin), h: 2 * (hh + margin) };
    },
    screenToWorld(clientX, clientY, out) {
      const vp = viewport();
      if (!(vp.width > 0 && vp.height > 0)) return null;
      ndc.set(((clientX - vp.left) / vp.width) * 2 - 1, -((clientY - vp.top) / vp.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (ray.ray.intersectPlane(plane, hit) === null) return null;
      out.x = hit.x;
      out.y = hit.y;
      return out;
    },
  };
}
