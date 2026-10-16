import type { DefinitionDepthMode } from '../config/definition-kit.ts';

type Footprint = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
export type DefinitionDepthPlacement = Footprint & (
  | { readonly kind: 'solid'; readonly depthMode: DefinitionDepthMode }
  | { readonly kind: 'wall' }
);

/** 互斥按完整格位判断，半砖的空半格也不能容纳背景墙。 */
export function definitionDepthConflict(candidate: DefinitionDepthPlacement, existing: readonly DefinitionDepthPlacement[]): string | null {
  const conflict = existing.find(item => {
    const incompatible = candidate.kind === 'wall'
      ? item.kind === 'solid' && item.depthMode === 'deep'
      : candidate.depthMode === 'deep' && item.kind === 'wall';
    return incompatible && candidate.x < item.x + item.width && candidate.x + candidate.width > item.x
      && candidate.y < item.y + item.height && candidate.y + candidate.height > item.y;
  });
  if (!conflict) return null;
  return candidate.kind === 'wall'
    ? '该格位已有加深格，先拆除加深格才能放置背景墙。'
    : '该格位已有背景墙，先拆除背景墙才能放置加深格。';
}

export function createDefinitionDepthOccupancy() {
  let entries: DefinitionDepthPlacement[] = [];
  return {
    get entries(): readonly DefinitionDepthPlacement[] { return entries; },
    place(candidate: DefinitionDepthPlacement): string | null {
      const conflict = definitionDepthConflict(candidate, entries);
      if (conflict) return conflict;
      entries.push(candidate);
      return null;
    },
    remove(candidate: DefinitionDepthPlacement): void {
      entries = entries.filter(item => item !== candidate);
    },
  };
}
