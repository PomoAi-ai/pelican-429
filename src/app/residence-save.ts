import { getResidenceResource } from '../config/residence.ts';
import { checkResidencePlacement, type ResidencePlacement, type ResidenceState } from '../sim/residence.ts';

export const RESIDENCE_SAVE_KEY = 'pelican-residence:v1';

export function saveResidence(storage: Pick<Storage, 'setItem'>, state: ResidenceState): void {
  storage.setItem(RESIDENCE_SAVE_KEY, JSON.stringify({ version: 1, nextId: state.nextId, revision: state.revision, placements: state.placements }));
}

/** 独立住宅存档不改写旧家园数据；无效内容保留原值并向界面报告。 */
export function loadResidence(storage: Pick<Storage, 'getItem'>): ResidenceState | undefined {
  const raw = storage.getItem(RESIDENCE_SAVE_KEY);
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
  if (save.version !== 1) invalid('版本');
  const nextId = integer(save.nextId, 'nextId', 1);
  const revision = integer(save.revision, 'revision', 0);
  if (!Array.isArray(save.placements)) invalid('placements');
  const state: ResidenceState = { placements: [], nextId, revision };
  const ids = new Set<number>();
  for (const [index, value] of (save.placements as unknown[]).entries()) {
    const item = record(value, `构件 ${index}`);
    const id = integer(item.id, `构件 ${index} 的 id`, 1);
    if (id >= nextId || ids.has(id)) invalid(`构件 ${index} 的 id 重复或超过 nextId`);
    if (typeof item.resourceId !== 'string') invalid(`构件 ${index} 的资源`);
    const resourceId = item.resourceId as string;
    const resource = getResidenceResource(resourceId);
    if (typeof item.x !== 'number' || typeof item.y !== 'number') invalid(`构件 ${index} 的坐标`);
    const x = item.x as number;
    const y = item.y as number;
    if (resource.kind === 'door' ? typeof item.open !== 'boolean' : item.open !== undefined) invalid(`构件 ${index} 的门状态`);
    const check = checkResidencePlacement(state, resourceId, x, y, null);
    if (!check.ok) invalid(`构件 ${index}：${check.message}`);
    const placement: ResidencePlacement = { id, resourceId, x, y, ...resource.kind === 'door' ? { open: item.open as boolean } : {} };
    state.placements.push(placement);
    ids.add(id);
  }
  return state;
}
