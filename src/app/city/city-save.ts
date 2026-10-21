import type { ResidenceVariant } from '../../config/residence.ts';
import { captureCity, createCity, restoreCity, type CitySnapshot, type CityState, type CityWorld } from '../../sim/city.ts';

const SAVE_KEYS: Readonly<Record<ResidenceVariant, string>> = { harbor: 'pelican-city:v1', original: 'pelican-city-original:v1',
  three: 'pelican-city-three:v1', four: 'pelican-city-four:v1' };
/** 住宅时代按旧构件表保存的布局：城区并入格子世界后不迁移，读到即删除并提示。 */
const LEGACY_KEYS = ['pelican-residence:v1', 'pelican-residence-harbor:v1', 'pelican-residence-harbor:v2'] as const;

export function saveCity(storage: Pick<Storage, 'setItem'>, city: CityState): void {
  storage.setItem(SAVE_KEYS[city.variant], JSON.stringify({ version: 1, ...captureCity(city) }));
}

/** localStorage 是外部输入：结构在这里校验，内容（块、重叠、建造规则）由 restoreCity 校验；无效即抛，原存档保留。 */
function parseSnapshot(raw: string): CitySnapshot {
  let data: unknown;
  try { data = JSON.parse(raw); }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error('城区存档无效：JSON 格式损坏，原存档已保留。', { cause: error });
    throw error;
  }
  const invalid = (what: string): never => { throw new Error(`城区存档无效：${what}，原存档已保留。`); };
  if (typeof data !== 'object' || data === null || Array.isArray(data)) invalid('格式');
  const save = data as Record<string, unknown>;
  if (save.version !== 1) invalid('版本');
  const rows = (name: string, kinds: readonly ('string' | 'number' | 'boolean')[]): void => {
    const list = save[name];
    if (!Array.isArray(list)) invalid(name);
    for (const [index, row] of (list as unknown[]).entries()) {
      const ok = Array.isArray(row) && row.length === kinds.length
        && kinds.every((kind, i) => typeof row[i] === kind && (kind !== 'number' || Number.isFinite(row[i])));
      if (!ok) invalid(`${name}.${index}`);
    }
  };
  rows('cells', ['number', 'string']);
  rows('walls', ['string', 'number', 'number']);
  rows('objects', ['string', 'number', 'number']);
  rows('specials', ['string', 'number', 'number', 'boolean']);
  return save as unknown as CitySnapshot;
}

/** 读城区存档；没有存档时建默认城区。discarded = 本次删除了旧住宅存档（界面提示一次）。 */
export function loadCity(storage: Pick<Storage, 'getItem' | 'removeItem'>, variant: ResidenceVariant): { world: CityWorld; discarded: boolean } {
  const legacy = LEGACY_KEYS.filter(key => storage.getItem(key) !== null);
  for (const key of legacy) storage.removeItem(key);
  const raw = storage.getItem(SAVE_KEYS[variant]);
  return { world: raw === null ? createCity(variant) : restoreCity(variant, parseSnapshot(raw)), discarded: legacy.length > 0 };
}
