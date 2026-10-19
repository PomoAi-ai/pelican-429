/**
 * 训练假人外形（019 打磨 B）：木桩 + 稻草身体。身体为回转体（LatheGeometry）：底部半球、直筒侧壁、
 * 平顶 + 小圆角——平顶高度正好等于碰撞盒顶（tuning.dummy.height），站在头上的鹈鹕脚底与视觉头顶对齐；
 * 圆角区按 dummyTopAt 的曲面高度贴合（渲染层步态地面采样复用）。
 */
import * as THREE from 'three';

/** 木桩高度（格）：身体从这里开始。 */
export const DUMMY_POST_HEIGHT = 0.5;
/** 头顶圆角半径占身体半宽的比例：其内为平顶。 */
export const DUMMY_TOP_CORNER_SHARE = 0.36;

function check(halfWidth: number, height: number): void {
  if (!(Number.isFinite(halfWidth) && halfWidth > 0)) throw new Error(`dummy shape: halfWidth must be > 0, got ${halfWidth}`);
  if (!(Number.isFinite(height) && height > DUMMY_POST_HEIGHT + 2 * halfWidth)) {
    throw new Error(`dummy shape: height must be > post + 2·halfWidth (${DUMMY_POST_HEIGHT + 2 * halfWidth}), got ${height}`);
  }
}

/**
 * 头顶曲面高度（相对假人脚底，格）：|dx| ≤ 平顶半径为 height；圆角内按圆弧下降；超出半宽返回 null。
 */
export function dummyTopAt(dx: number, halfWidth: number, height: number): number | null {
  check(halfWidth, height);
  if (!Number.isFinite(dx)) throw new Error(`dummyTopAt: dx must be finite, got ${dx}`);
  const a = Math.abs(dx);
  if (a > halfWidth) return null;
  const rc = halfWidth * DUMMY_TOP_CORNER_SHARE;
  const flat = halfWidth - rc;
  if (a <= flat) return height;
  const u = a - flat;
  return height - rc + Math.sqrt(Math.max(0, rc * rc - u * u));
}

/** 回转体轮廓（r, y），自底极点到顶面中心。 */
export function dummyBodyProfile(halfWidth: number, height: number, arcSegments = 8): THREE.Vector2[] {
  check(halfWidth, height);
  const r = halfWidth;
  const rc = r * DUMMY_TOP_CORNER_SHARE;
  const base = DUMMY_POST_HEIGHT + r;
  const pts: THREE.Vector2[] = [];
  // 底部半球：从极点 (0, post) 到赤道 (r, post + r)。
  for (let i = 0; i <= arcSegments; i++) {
    const t = (-Math.PI / 2) * (1 - i / arcSegments);
    pts.push(new THREE.Vector2(r * Math.cos(t), base + r * Math.sin(t)));
  }
  // 侧壁直到圆角起点，再沿圆角到平顶边缘。
  const cy = height - rc;
  for (let i = 0; i <= arcSegments; i++) {
    const t = (Math.PI / 2) * (i / arcSegments);
    pts.push(new THREE.Vector2(r - rc + rc * Math.cos(t), cy + rc * Math.sin(t)));
  }
  pts.push(new THREE.Vector2(0, height));
  return pts;
}

/** 身体几何（世界坐标系下以假人脚底为原点，y 向上；最高点 = height）。 */
export function createDummyBodyGeometry(halfWidth: number, height: number): THREE.LatheGeometry {
  return new THREE.LatheGeometry(dummyBodyProfile(halfWidth, height), 24);
}
