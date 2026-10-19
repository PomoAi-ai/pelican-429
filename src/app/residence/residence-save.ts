import { getResidenceResource, RESIDENCE_WORLD } from '../../config/residence.ts';
import { TILE_SHAPE_DEFINITIONS, type DefinitionDepthMode } from '../../config/definition-kit.ts';
import { addResidenceGround, checkResidencePlacement, type ResidencePlacement, type ResidenceState } from '../../sim/residence.ts';

export const RESIDENCE_SAVE_KEY = 'pelican-residence:v1';
// v2 起港湾城区左侧划出交通中心用地；旧 v1 存档不迁移。
export const RESIDENCE_HARBOR_SAVE_KEY = 'pelican-residence-harbor:v2';
export const RESIDENCE_THREE_SAVE_KEY = 'pelican-residence-three:v1';

export function saveResidence(storage: Pick<Storage, 'setItem'>, state: ResidenceState, key = RESIDENCE_SAVE_KEY): void {
  storage.setItem(key, JSON.stringify({ version: 2, nextId: state.nextId, revision: state.revision, placements: state.placements,
    ...state.underground ? { underground: [...state.underground] } : {} }));
}

/** 独立住宅存档不改写旧家园数据；无效内容保留原值并向界面报告。 */
export function loadResidence(storage: Pick<Storage, 'getItem'>, key = RESIDENCE_SAVE_KEY): ResidenceState | undefined {
  const raw = storage.getItem(key);
  if (raw === null) return undefined;
  let data: unknown;
  try { data = JSON.parse(raw); }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error('住宅存档无效：JSON 格式损坏，原存档已保留。', { cause: error });
    throw error;
  }
  const invalid = (what: string): never => { throw new Error(`住宅存档无效：${what}，原存档已保留。`); };
  const record = (value: unknown, what: string): Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : invalid(what);
  const integer = (value: unknown, what: string, min: number): number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= min ? value : invalid(what);
  const save = record(data, '格式');
  if (save.version !== 1 && save.version !== 2) invalid('版本');
  const nextId = integer(save.nextId, 'nextId', 1);
  const revision = integer(save.revision, 'revision', 0);
  if (!Array.isArray(save.placements)) invalid('placements');
  let underground: Set<number> | undefined;
  if (save.underground !== undefined) {
    if (!Array.isArray(save.underground)) invalid('地下挖掘记录');
    underground = new Set();
    const count = RESIDENCE_WORLD.width * (RESIDENCE_WORLD.foundationTop - RESIDENCE_WORLD.minY);
    for (const value of save.underground as unknown[]) {
      const cell = integer(value, '地下格子编号', 0);
      if (cell >= count || underground.has(cell)) invalid('地下格子编号重复或越界');
      underground.add(cell);
    }
  }
  const state: ResidenceState = { placements: [], nextId, revision, ...underground ? { underground } : {} };
  const ids = new Set<number>();
  for (const [index, value] of (save.placements as unknown[]).entries()) {
    const item = record(value, `构件 ${index}`);
    const id = integer(item.id, `构件 ${index} 的 id`, 1);
    if (id >= nextId || ids.has(id)) invalid(`构件 ${index} 的 id 重复或超过 nextId`);
    if (typeof item.resourceId !== 'string') invalid(`构件 ${index} 的资源`);
    const resourceId = item.resourceId as string;
    const resource = getResidenceResource(resourceId);
    if (item.depthMode !== undefined && (resource.kind !== 'solid' || item.depthMode !== 'normal' && item.depthMode !== 'deep')) {
      invalid(`构件 ${index} 的深度规格`);
    }
    const depthMode = item.depthMode as DefinitionDepthMode | undefined;
    if (typeof item.x !== 'number' || typeof item.y !== 'number') invalid(`构件 ${index} 的坐标`);
    const x = item.x as number;
    const y = item.y as number;
    if (resource.kind === 'door' ? typeof item.open !== 'boolean' : item.open !== undefined) invalid(`构件 ${index} 的门状态`);
    if (save.version === 1) {
      const bottom = resource.kind === 'solid'
        ? y + Math.min(...TILE_SHAPE_DEFINITIONS.find(shape => shape.id === resource.shape)!.points.map(([, py]) => py)) : y;
      if (bottom < RESIDENCE_WORLD.groundTop) invalid(`构件 ${index} 侵入旧固定地面`);
    }
    const check = checkResidencePlacement(state, resourceId, x, y, null, depthMode);
    if (!check.ok) invalid(`构件 ${index}：${check.message}`);
    const placement: ResidencePlacement = { id, resourceId, x, y,
      ...depthMode !== undefined ? { depthMode } : {}, ...resource.kind === 'door' ? { open: item.open as boolean } : {} };
    state.placements.push(placement);
    ids.add(id);
  }
  if (save.version === 1) addResidenceGround(state);
  return state;
}
