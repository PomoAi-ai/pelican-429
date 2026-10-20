import type { DefinitionDepthMode } from '../config/definition-kit.ts';
import { getResidenceResource } from '../config/residence.ts';
import {
  buildingItemsIn, buildingItemsTouching, buildingSolidsOverlap, buildingTouches, checkBuilding, placeBuilding, removeBuilding,
  replaceBuilding, resourceBottom, toggleDoor, type BuildingItem, type BuildingResult, type BuildingState,
} from './building.ts';

/** 整件移除覆盖刷子范围的构件，多格家具不会被拆成半件。 */
export function eraseBuildingBrush(state: BuildingState, x: number, y: number, size: number): number {
  const radius = Math.max(0, (size - 1) / 2);
  const selected = buildingItemsTouching(state, x - radius, y - radius, size, size);
  for (const item of selected) removeBuilding(state, item);
  return selected.length;
}

/** 指针跨过多个格子时补齐笔画，慢机器上拖刷也不留下空洞。 */
export function buildingBrushLine(from: { x: number; y: number }, to: { x: number; y: number }, step: number) {
  const length = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  const count = Math.max(1, Math.ceil(length / step));
  return Array.from({ length: count }, (_, index) => {
    const t = (index + 1) / count;
    return { x: Math.round((from.x + (to.x - from.x) * t) / step) * step,
      y: Math.round((from.y + (to.y - from.y) * t) / step) * step };
  });
}

/** 同类同锚点替换整件资源；不同层、不同锚点和未重叠的半平台都保留。 */
function prepareBuildingPaint(state: BuildingState, resourceId: string, x: number, y: number,
  depthMode: DefinitionDepthMode, minimumY: number) {
  const resource = getResidenceResource(resourceId);
  const candidate = { resourceId, x, y, depthMode, open: false };
  const originals = buildingItemsIn(state, x - 1, y - 1, x + resource.width + 1, y + resource.height + 1).filter(item => {
    const existing = getResidenceResource(item.resourceId);
    if (resource.kind === 'solid') return existing.kind === 'solid' && buildingSolidsOverlap(candidate, item);
    if (item.x !== x || item.y !== y || resource.layer !== existing.layer) return false;
    if (resource.layer === 'wall') return true;
    if (resource.kind !== existing.kind) return false;
    if (resource.kind === 'platform') return buildingTouches(item,
      x + (resource.platformWidth === 'right' ? .5 : 0), y + .3, resource.platformWidth === 'full' ? 1 : .5, .2);
    return true;
  });
  const result: BuildingResult = resourceBottom(resource, y) < minimumY ? { ok: false, message: '不能铺入场地固定基底' }
    : checkBuilding(state, resourceId, x, y, null, depthMode, originals);
  return { result, originals };
}

export function checkBuildingPaint(state: BuildingState, resourceId: string, x: number, y: number,
  depthMode: DefinitionDepthMode, minimumY: number = state.site.foundationTop): BuildingResult {
  return prepareBuildingPaint(state, resourceId, x, y, depthMode, minimumY).result;
}

export function paintBuilding(state: BuildingState, resourceId: string, x: number, y: number,
  depthMode: DefinitionDepthMode, minimumY: number = state.site.foundationTop): BuildingResult {
  const { result, originals } = prepareBuildingPaint(state, resourceId, x, y, depthMode, minimumY);
  if (!result.ok) return result;
  if (!originals.length) return placeBuilding(state, resourceId, x, y, null, depthMode);
  const original: BuildingItem = originals[0]!;
  if (originals.length === 1 && original.resourceId === resourceId && original.depthMode === depthMode) return { ok: true, message: '此处已经是所选构件' };
  const replaced = replaceBuilding(state, originals, resourceId, x, y, depthMode);
  // 门换方向保留开合状态（刷子用在无人物的场地）。
  if (getResidenceResource(resourceId).kind === 'door' && original.open) {
    toggleDoor(state, [...state.specials.values()].find(item => item.x === x && item.y === y)!, null);
  }
  return replaced;
}
