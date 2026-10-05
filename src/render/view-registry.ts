/**
 * 实体视图注册表：按实体 kind 用工厂创建视图、每帧同步、实体消失时销毁视图。
 * 渲染层只读逻辑层数据；缺少对应 kind 的工厂即抛（fail-fast）。
 */
import type * as THREE from 'three';
import type { Entity, EntityKind } from '../entities/entity.ts';

export interface EntityView {
  readonly object: THREE.Object3D;
  /** alpha：固定步长插值系数 [0,1)；frameDt：本渲染帧时长（秒，hitstop 时可为 0）。 */
  sync(e: Entity, alpha: number, frameDt: number): void;
  dispose(): void;
}

export type EntityViewFactory = (e: Entity) => EntityView;

export type ViewFactories = Partial<Readonly<Record<EntityKind, EntityViewFactory>>>;

export interface ViewRegistry {
  sync(entities: readonly Entity[], alpha: number, frameDt: number): void;
  get(id: number): EntityView | undefined;
  readonly size: number;
  dispose(): void;
}

export function createViewRegistry(parent: THREE.Object3D, factories: ViewFactories): ViewRegistry {
  const views = new Map<number, { kind: EntityKind; view: EntityView }>();
  const seen = new Set<number>();

  const destroy = (id: number): void => {
    const entry = views.get(id);
    if (!entry) return;
    views.delete(id);
    entry.view.object.removeFromParent();
    entry.view.dispose();
  };

  return {
    sync(entities, alpha, frameDt) {
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
          entry = { kind: e.kind, view: factory(e) };
          views.set(e.id, entry);
          parent.add(entry.view.object);
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
