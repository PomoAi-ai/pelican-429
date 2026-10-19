import type { Body } from './body.ts';
import { COLLISION_EPS as EPS } from './tile-collision.ts';

export interface DefinitionCollider {
  readonly points: readonly (readonly [number, number])[];
  /** 舰体、设备等实体仍可承托落地，但侧面不能作为台阶自动攀上。 */
  readonly autoStep?: boolean;
}

export interface DefinitionPlatform {
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

export interface DefinitionCollision {
  readonly solids: readonly DefinitionCollider[];
  readonly platforms: readonly DefinitionPlatform[];
}

/** 凸多边形与轴向带相交后的另一轴范围，保留倒坡、上半砖等真实空隙。 */
export function definitionColliderSection(shape: DefinitionCollider, axis: 0 | 1, low: number, high: number): [number, number] | null {
  const other = axis === 0 ? 1 : 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < shape.points.length; i++) {
    const a = shape.points[i]!;
    const b = shape.points[(i + 1) % shape.points.length]!;
    if (a[axis] >= low && a[axis] <= high) {
      min = Math.min(min, a[other]);
      max = Math.max(max, a[other]);
    }
    for (const edge of [low, high]) {
      if ((a[axis] < edge && b[axis] > edge) || (a[axis] > edge && b[axis] < edge)) {
        const value = a[other] + (b[other] - a[other]) * (edge - a[axis]) / (b[axis] - a[axis]);
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    }
  }
  return min === Infinity ? null : [min, max];
}

/** 只选择暴露在空气中的落脚面，叠放阶块底下的旧地面不能承托跟随物。 */
export function definitionGroundAt(geometry: DefinitionCollision, x: number, referenceY: number, maxDistance = 2.5): number | null {
  const sections = geometry.solids.map(solid => definitionColliderSection(solid, 0, x, x)).filter(section => section !== null);
  let nearest: number | null = null;
  const accept = (top: number): void => {
    if (Math.abs(top - referenceY) > maxDistance) return;
    if (sections.some(([bottom, ceiling]) => bottom <= top + EPS && ceiling > top + EPS)) return;
    if (nearest === null || Math.abs(top - referenceY) < Math.abs(nearest - referenceY)) nearest = top;
  };
  for (const section of sections) accept(section[1]);
  for (const platform of geometry.platforms) if (x >= platform.left && x <= platform.right) accept(platform.top);
  return nearest;
}

function horizontalLimit(b: Body, geometry: DefinitionCollision, target: number, y: number): { x: number; stepAllowed: boolean } {
  let limit = target;
  let stepAllowed = true;
  for (const solid of geometry.solids) {
    const range = definitionColliderSection(solid, 1, y + EPS, y + b.height - EPS);
    if (range === null) continue;
    const left = range[0] - b.halfWidth;
    const right = range[1] + b.halfWidth;
    if (target > b.x && b.x < right - EPS && target > left) {
      limit = Math.min(limit, Math.max(b.x, left));
      stepAllowed &&= solid.autoStep !== false;
    }
    if (target < b.x && b.x > left + EPS && target < right) {
      limit = Math.max(limit, Math.min(b.x, right));
      stepAllowed &&= solid.autoStep !== false;
    }
  }
  return { x: Math.abs(limit - target) <= EPS ? target : limit, stepAllowed };
}

function ceilingLimit(b: Body, geometry: DefinitionCollision, target: number): number {
  let limit = target;
  for (const solid of geometry.solids) {
    const range = definitionColliderSection(solid, 0, b.x - b.halfWidth + EPS, b.x + b.halfWidth - EPS);
    if (range !== null && range[0] >= b.y + b.height - EPS) limit = Math.min(limit, range[0] - b.height);
  }
  return limit;
}

function support(b: Body, geometry: DefinitionCollision, low: number, high: number): number | null {
  let top: number | null = null;
  const accept = (value: number): void => {
    if (value >= low - EPS && value <= high + EPS && (top === null || value > top)) top = value;
  };
  for (const solid of geometry.solids) {
    const range = definitionColliderSection(solid, 0, b.x - b.halfWidth + EPS, b.x + b.halfWidth - EPS);
    if (range !== null) accept(range[1]);
  }
  // 下穿只放过起跳那层：叠在下方的平台（如平台上的椅面下面）仍要接住人物。
  for (const platform of geometry.platforms) {
    if (b.dropThroughTicks > 0 && platform.top >= b.y - EPS) continue;
    if (b.x + b.halfWidth > platform.left + EPS && b.x - b.halfWidth < platform.right - EPS) accept(platform.top);
  }
  return top;
}

function moveHorizontal(b: Body, geometry: DefinitionCollision, dx: number, grounded: boolean): void {
  if (dx === 0) return;
  const target = b.x + dx;
  const contact = horizontalLimit(b, geometry, target, b.y);
  let limit = contact.x;
  if (limit !== target && contact.stepAllowed && grounded && b.vy <= 0 && b.stepUp > 0) {
    let top = b.y;
    for (const solid of geometry.solids) {
      const range = definitionColliderSection(solid, 0, Math.min(b.x, target) - b.halfWidth + EPS, Math.max(b.x, target) + b.halfWidth - EPS);
      if (range !== null && range[0] < b.y + b.height - EPS && range[1] > b.y) top = Math.max(top, range[1]);
    }
    if (top - b.y <= b.stepUp + EPS && ceilingLimit(b, geometry, top) >= top - EPS && horizontalLimit(b, geometry, target, top).x === target) {
      b.y = top;
      limit = target;
    }
  }
  b.x = limit;
  if (limit !== target) {
    b.vx = 0;
    b.wallContact = dx > 0 ? 1 : -1;
  }
}

/** 小步只用于沿坡追踪；每轴仍扫描完整位移，因此薄实体与高速运动不会漏碰撞。 */
export function moveDefinitionBody(b: Body, geometry: DefinitionCollision, dt: number): void {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b.vx), Math.abs(b.vy)) * dt / 0.2));
  const stepDt = dt / steps;
  b.wallContact = 0;
  for (let i = 0; i < steps; i++) {
    const grounded = b.onGround;
    b.onGround = false;
    moveHorizontal(b, geometry, b.vx * stepDt, grounded);
    const target = b.y + b.vy * stepDt;
    if (b.vy > 0) {
      const limit = ceilingLimit(b, geometry, target);
      b.y = limit;
      if (limit !== target) b.vy = 0;
    } else {
      const snap = grounded && b.dropThroughTicks === 0 ? b.groundSnap : 0;
      const top = support(b, geometry, target - snap, b.y);
      if (top === null) b.y = target;
      else {
        b.y = top;
        b.vy = 0;
        b.onGround = true;
        // 落到下一层就结束下穿，否则下一步会把脚下这层也当作起跳层放过。
        b.dropThroughTicks = 0;
      }
    }
  }
  if (b.dropThroughTicks > 0) b.dropThroughTicks--;
}

export function standingOnDefinitionPlatform(b: Body, geometry: DefinitionCollision): boolean {
  for (const solid of geometry.solids) {
    const range = definitionColliderSection(solid, 0, b.x - b.halfWidth + EPS, b.x + b.halfWidth - EPS);
    if (range !== null && Math.abs(b.y - range[1]) <= EPS) return false;
  }
  return b.onGround && geometry.platforms.some(platform =>
    Math.abs(b.y - platform.top) <= EPS && b.x + b.halfWidth > platform.left + EPS && b.x - b.halfWidth < platform.right - EPS);
}
