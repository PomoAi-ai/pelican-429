/**
 * 开场取景（纯函数）：出生在渔屋门外时，开局相机拉远/上移，让整座渔屋（屋檐两端、地板到烟囱顶）与鹈鹕同框；
 * camera-rig 按 introBlend（停留 hold 秒后 blend 秒平滑过渡）从取景切到正常跟随。参数见 tuning.camera.intro。
 */
import * as THREE from 'three';
import type { Rect, Vec2 } from '../core/math.ts';
import type { FishingHut } from '../world/level.ts';

/** 取景：注视点（相机正对的 z=0 平面点）与相机距离。 */
export interface CameraShot {
  readonly x: number;
  readonly y: number;
  readonly distance: number;
}

/** 烟囱（含烟口）高出屋顶最上一行顶边的量（与 hut-exterior.chimneySpan 的 yt 同口径，再留烟口余量）。 */
const CHIMNEY_TOP = 1.2;
/** 鹈鹕取景占位：半宽、高（格）。 */
const PELICAN_BOX = { halfWidth: 1, height: 2.6 } as const;

/** 渔屋 + 出生点鹈鹕的包围框（世界格坐标，y 向上）。 */
export function hutIntroBox(hut: FishingHut, spawn: Vec2): Rect {
  if (!Number.isFinite(spawn.x) || !Number.isFinite(spawn.y)) throw new Error(`camera-intro: invalid spawn (${spawn.x},${spawn.y})`);
  const x0 = Math.min(hut.roofX0, spawn.x - PELICAN_BOX.halfWidth);
  const x1 = Math.max(hut.roofX1 + 1, spawn.x + PELICAN_BOX.halfWidth);
  const y0 = Math.min(hut.floorY - 1, spawn.y);
  const y1 = Math.max(hut.roofY + hut.roofRows + CHIMNEY_TOP, spawn.y + PELICAN_BOX.height);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * 让 box（四周再放大 margin 倍）完整入画的取景：中心对准框中心，距离取满足宽/高两者的较大值且不小于 minDistance。
 * 参数非法即抛。
 */
export function introShot(box: Rect, fovDeg: number, aspect: number, minDistance: number, margin: number): CameraShot {
  if (![box.x, box.y, box.w, box.h].every(Number.isFinite) || box.w <= 0 || box.h <= 0) throw new Error(`camera-intro: invalid box ${JSON.stringify(box)}`);
  if (!(fovDeg > 0 && fovDeg < 180)) throw new Error(`camera-intro: invalid fov ${fovDeg}`);
  if (!(aspect > 0 && Number.isFinite(aspect))) throw new Error(`camera-intro: invalid aspect ${aspect}`);
  if (!(minDistance > 0 && Number.isFinite(minDistance))) throw new Error(`camera-intro: invalid minDistance ${minDistance}`);
  if (!(margin >= 1 && Number.isFinite(margin))) throw new Error(`camera-intro: margin must be >= 1, got ${margin}`);
  const tan = Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
  const byH = ((box.h / 2) * margin) / tan;
  const byW = ((box.w / 2) * margin) / (tan * aspect);
  return { x: box.x + box.w / 2, y: box.y + box.h / 2, distance: Math.max(minDistance, byH, byW) };
}

/** 取景 → 跟随的混合权重：t ≤ hold 为 0，之后 blend 秒内 smoothstep 升到 1。参数非法即抛。 */
export function introBlend(t: number, hold: number, blend: number): number {
  if (!Number.isFinite(t) || !(hold >= 0) || !(blend > 0)) throw new Error(`camera-intro: invalid blend input t=${t} hold=${hold} blend=${blend}`);
  const u = Math.min(1, Math.max(0, (t - hold) / blend));
  return u * u * (3 - 2 * u);
}
