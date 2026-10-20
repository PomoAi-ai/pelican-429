/**
 * 特殊构件层：门、太阳能板、舰体、电梯、甲板等自带碰撞的构件。几何为世界坐标下的凸多边形实体与单向承托面，
 * 按包围盒覆盖的格分桶。会改变碰撞，故只在 stepSim 内按 tick 修改（docs/architecture.md §3），表现层只读。
 */
import type { DefinitionPoint } from '../config/definition-kit.ts';

export type SpecialPartKind = 'door' | 'solar' | 'hull' | 'elevator' | 'deck';

/** 单向承托顶线 [left,right] @ top。 */
export interface SupportSurface {
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

export interface SpecialPartGeometry {
  readonly solids: readonly (readonly DefinitionPoint[])[];
  readonly supports: readonly SupportSurface[];
}

export interface SpecialPart extends SpecialPartGeometry {
  readonly id: number;
  readonly kind: SpecialPartKind;
}

export interface SpecialParts {
  add(kind: SpecialPartKind, geometry: SpecialPartGeometry): SpecialPart;
  /** 替换几何（门开合、板面转角、电梯升降）并重新分桶；id 不存在即抛。 */
  update(id: number, geometry: SpecialPartGeometry): SpecialPart;
  remove(id: number): void;
  /** 包围盒与 [x0,x1]×[y0,y1] 所覆盖格相交的构件（粗筛，按 id 升序）。 */
  query(x0: number, y0: number, x1: number, y1: number): readonly SpecialPart[];
  all(): readonly SpecialPart[];
  /** 增删改后按变化前后包围盒覆盖的格矩形 [x0,x1)×[y0,y1) 通知（门开合进光场）；返回退订函数。 */
  onChange(listener: SpecialPartsListener): () => void;
}

export type SpecialPartsListener = (kind: SpecialPartKind, x0: number, y0: number, x1: number, y1: number) => void;

/** 碰撞与表现只读的部分。 */
export type SpecialPartsQuery = Pick<SpecialParts, 'query' | 'all' | 'onChange'>;

const NO_PARTS: readonly SpecialPart[] = Object.freeze([]);

export function createSpecialParts(width: number, height: number): SpecialParts {
  const parts = new Map<number, SpecialPart>();
  const buckets = new Map<number, Set<number>>();
  const cellsOf = new Map<number, number[]>();
  const listeners = new Set<SpecialPartsListener>();
  let nextId = 1;
  /** 通知覆盖格列表的外接矩形。 */
  const notify = (kind: SpecialPartKind, cells: readonly number[]): void => {
    if (listeners.size === 0) return;
    let x0 = width, y0 = height, x1 = 0, y1 = 0;
    for (const cell of cells) {
      const tx = cell % width, ty = (cell - tx) / width;
      x0 = Math.min(x0, tx); y0 = Math.min(y0, ty); x1 = Math.max(x1, tx + 1); y1 = Math.max(y1, ty + 1);
    }
    if (x1 > x0) for (const listener of listeners) listener(kind, x0, y0, x1, y1);
  };

  const covered = (x0: number, y0: number, x1: number, y1: number): number[] => {
    const out: number[] = [];
    for (let ty = Math.max(0, Math.floor(y0)); ty <= Math.min(height - 1, Math.floor(y1)); ty++) {
      for (let tx = Math.max(0, Math.floor(x0)); tx <= Math.min(width - 1, Math.floor(x1)); tx++) out.push(ty * width + tx);
    }
    return out;
  };
  /** 校验几何并返回包围盒覆盖的格，不修改状态。 */
  const cellsFor = (part: SpecialPart): number[] => {
    const xs = [...part.solids.flatMap((s) => s.map(([x]) => x)), ...part.supports.flatMap((s) => [s.left, s.right])];
    const ys = [...part.solids.flatMap((s) => s.map(([, y]) => y)), ...part.supports.map((s) => s.top)];
    if (xs.length === 0) throw new Error(`SpecialParts: ${part.kind} ${part.id} has no geometry`);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (!(x0 >= 0 && y0 >= 0 && x1 <= width && y1 <= height)) {
      throw new Error(`SpecialParts: ${part.kind} ${part.id} bounds [${x0},${x1}]×[${y0},${y1}] outside map ${width}×${height}`);
    }
    return covered(x0, y0, x1, y1);
  };
  const insert = (part: SpecialPart, cells: number[]): SpecialPart => {
    for (const cell of cells) {
      const set = buckets.get(cell);
      if (set) set.add(part.id);
      else buckets.set(cell, new Set([part.id]));
    }
    cellsOf.set(part.id, cells);
    parts.set(part.id, part);
    return part;
  };
  const existing = (id: number): SpecialPart => {
    const part = parts.get(id);
    if (!part) throw new Error(`SpecialParts: no part ${id}`);
    return part;
  };
  const unbucket = (id: number): void => {
    for (const cell of cellsOf.get(id)!) {
      const set = buckets.get(cell)!;
      set.delete(id);
      if (set.size === 0) buckets.delete(cell);
    }
    cellsOf.delete(id);
    parts.delete(id);
  };

  return {
    add(kind, geometry) {
      const part: SpecialPart = { id: nextId, kind, solids: geometry.solids, supports: geometry.supports };
      const cells = cellsFor(part);
      nextId++;
      insert(part, cells);
      notify(kind, cells);
      return part;
    },
    update(id, geometry) {
      const part: SpecialPart = { id, kind: existing(id).kind, solids: geometry.solids, supports: geometry.supports };
      const cells = cellsFor(part);
      const before = cellsOf.get(id)!;
      unbucket(id);
      insert(part, cells);
      notify(part.kind, [...before, ...cells]);
      return part;
    },
    remove(id) {
      const { kind } = existing(id);
      const before = cellsOf.get(id)!;
      unbucket(id);
      notify(kind, before);
    },
    query(x0, y0, x1, y1) {
      // 碰撞每步都查询，大多数世界没有特殊构件。
      if (parts.size === 0) return NO_PARTS;
      const ids = new Set<number>();
      for (const cell of covered(x0, y0, x1, y1)) for (const id of buckets.get(cell) ?? []) ids.add(id);
      return [...ids].sort((a, b) => a - b).map((id) => parts.get(id)!);
    },
    all: () => [...parts.values()].sort((a, b) => a.id - b.id),
    onChange(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
