/**
 * 实体视图注册表：按实体 kind 用工厂创建视图、每帧同步、实体消失时销毁视图。
 * 渲染层只读逻辑层数据；缺少对应 kind 的工厂即抛（fail-fast）。
 */
import type * as THREE from 'three';
import type { Rect } from '../../core/math.ts';
import type { Entity, EntityKind } from '../../entities/entity.ts';

export interface EntityView {
  readonly object: THREE.Object3D;
  /** alpha：固定步长插值系数 [0,1)；frameDt：本渲染帧时长（秒，hitstop 时可为 0）。 */
  sync(e: Entity, alpha: number, frameDt: number): void;
  dispose(): void;
}

export type EntityViewFactory = (e: Entity) => EntityView;

type ViewFactories = Partial<Readonly<Record<EntityKind, EntityViewFactory>>>;

interface ViewRegistry {
  /** view：镜头可视矩形；给出时范围外的敌人视图移出场景且不同步，缺省全部同步。 */
  sync(entities: readonly Entity[], alpha: number, frameDt: number, view?: Readonly<Rect>): void;
  get(id: number): EntityView | undefined;
  readonly size: number;
  dispose(): void;
}

/**
 * 敌人全图常驻、数量上百且模型骨骼繁多；three 每帧遍历整棵场景图（不可见子树也做矩阵更新与阴影遍历），
 * 所以镜头外的敌人视图直接移出场景，而不是设 visible=false。
 */
const CULLED_KINDS: ReadonlySet<EntityKind> = new Set(['omi', 'lineHound', 'watchWasp', 'loadmaster']);
/** 移入边距（格）：盖住最大敌人的体型，进入画面前已挂回场景。 */
const CULL_MARGIN = 4;
/** 移出时再多留的边距（格）：在边界附近来回走不反复增删。 */
const CULL_HYSTERESIS = 4;

const within = (r: Readonly<Rect>, x: number, y: number, pad: number): boolean =>
  x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

export function createViewRegistry(parent: THREE.Object3D, factories: ViewFactories): ViewRegistry {
  const views = new Map<number, { kind: EntityKind; view: EntityView; attached: boolean }>();
  const seen = new Set<number>();

  const destroy = (id: number): void => {
    const entry = views.get(id);
    if (!entry) return;
    views.delete(id);
    entry.view.object.removeFromParent();
    entry.view.dispose();
  };

  return {
    sync(entities, alpha, frameDt, view) {
      seen.clear();
      for (const e of entities) {
        if (e.removed) continue;
        seen.add(e.id);
        let entry = views.get(e.id);
        if (entry && entry.kind !== e.kind) {
          throw new Error(`view-registry: entity ${e.id} changed kind from '${entry.kind}' to '${e.kind}'`);
        }
        if (!entry) {
          const factory = factories[e.kind];
          if (!factory) throw new Error(`view-registry: no view factory for entity kind '${e.kind}' (id ${e.id})`);
          entry = { kind: e.kind, view: factory(e), attached: false };
          views.set(e.id, entry);
        }
        if (view !== undefined && CULLED_KINDS.has(e.kind) && !within(view, e.body.x, e.body.y, CULL_MARGIN + (entry.attached ? CULL_HYSTERESIS : 0))) {
          if (entry.attached) {
            entry.view.object.removeFromParent();
            entry.attached = false;
          }
          continue;
        }
        // 先挂回再同步：视图的 sync 可能用父节点做坐标换算。
        if (!entry.attached) {
          parent.add(entry.view.object);
          entry.attached = true;
        }
        entry.view.sync(e, alpha, frameDt);
      }
      for (const id of [...views.keys()]) if (!seen.has(id)) destroy(id);
    },
    get(id) {
      return views.get(id)?.view;
    },
    get size() {
      return views.size;
    },
    dispose() {
      for (const id of [...views.keys()]) destroy(id);
    },
  };
}
