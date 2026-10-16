import { TILE_SHAPE_DEFINITIONS, type DefinitionDepthMode } from '../config/definition-kit.ts';
import { getResidenceResource, RESIDENCE_WORLD } from '../config/residence.ts';
import { checkResidencePlacement, placeResidence, removeResidence, residencePlacementIntersectsArea, residenceSolidsOverlap, type ResidenceResult, type ResidenceState } from './residence.ts';

/** 整件移除覆盖刷子范围的构件，多格家具不会被拆成半件。 */
export function eraseBuildingBrush(state: ResidenceState, x: number, y: number, size: number): number {
  const radius = Math.max(0, (size - 1) / 2);
  const left = x - radius, bottom = y - radius;
  const selected = state.placements.filter(item => residencePlacementIntersectsArea(item, left, bottom, size, size));
  for (const item of selected) removeResidence(state, item.id);
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
function prepareBuildingPaint(state: ResidenceState, resourceId: string, x: number, y: number,
  depthMode: DefinitionDepthMode, minimumY: number) {
  const resource = getResidenceResource(resourceId);
  const candidate = { id: state.nextId, resourceId, x, y, depthMode };
  const originals = state.placements.filter(item => {
    const existing = getResidenceResource(item.resourceId);
    if (resource.kind === 'solid') return existing.kind === 'solid' && residenceSolidsOverlap(candidate, item);
    if (item.x !== x || item.y !== y || resource.layer !== existing.layer) return false;
    if (resource.layer === 'wall') return true;
    if (resource.kind !== existing.kind) return false;
    if (resource.kind === 'platform') return residencePlacementIntersectsArea(item,
      x + (resource.platformWidth === 'right' ? .5 : 0), y + .3, resource.platformWidth === 'full' ? 1 : .5, .2);
    return true;
  });
  const bottom = resource.kind === 'solid' ? y + Math.min(...TILE_SHAPE_DEFINITIONS.find(shape => shape.id === resource.shape)!.points.map(([, py]) => py))
    : resource.kind === 'platform' ? y + .3 : y;
  const result: ResidenceResult = bottom < minimumY ? { ok: false, message: '不能铺入场地固定基底' }
    : checkResidencePlacement({ ...state, placements: state.placements.filter(item => !originals.includes(item)) }, resourceId, x, y, null, depthMode);
  return { result, originals };
}

export function checkBuildingPaint(state: ResidenceState, resourceId: string, x: number, y: number,
  depthMode: DefinitionDepthMode, minimumY: number = RESIDENCE_WORLD.foundationTop): ResidenceResult {
  return prepareBuildingPaint(state, resourceId, x, y, depthMode, minimumY).result;
}

export function paintBuilding(state: ResidenceState, resourceId: string, x: number, y: number,
  depthMode: DefinitionDepthMode, minimumY: number = RESIDENCE_WORLD.foundationTop): ResidenceResult {
  const resource = getResidenceResource(resourceId);
  const { result, originals } = prepareBuildingPaint(state, resourceId, x, y, depthMode, minimumY);
  if (!result.ok) return result;
  if (!originals.length) return placeResidence(state, resourceId, x, y, null, depthMode);
  const original = originals[0]!;
  if (originals.length === 1 && original.resourceId === resourceId && (original.depthMode ?? 'normal') === depthMode) return { ok: true, message: '此处已经是所选构件' };
  const index = state.placements.indexOf(original);
  state.placements[index] = { id: original.id, resourceId, x, y, ...depthMode === 'deep' ? { depthMode } : {},
    ...resource.kind === 'door' ? { open: original.open! } : {} };
  for (const replaced of originals.slice(1)) state.placements.splice(state.placements.indexOf(replaced), 1);
  state.revision++;
  return { ok: true, message: `已替换为${resource.label}`, id: original.id };
}
