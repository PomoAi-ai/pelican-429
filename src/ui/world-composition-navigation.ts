import { TERRAIN_COMPOSITIONS } from '../config/terrain-compositions.ts';
import type { WorldComposition } from '../world/worldgen-compositions.ts';

/** 开发导航重载同一个世界，仅切换角色的检查起点，不更改地形生成。 */
export function createWorldCompositionNavigation(parent: HTMLElement, compositions: readonly WorldComposition[], selected: WorldComposition | undefined, url: URL): () => void {
  const label = document.createElement('label');
  label.className = 'dev-world-position';
  const caption = document.createElement('span');
  caption.textContent = '世界地形定位';
  const select = document.createElement('select');
  select.setAttribute('aria-label', '世界地形定位');
  select.title = '重载当前种子的同一世界，并从所选地形旁开始';
  select.add(new Option('返回出生点', ''));
  for (const composition of compositions) {
    const item = TERRAIN_COMPOSITIONS.find((entry) => entry.id === composition.kind)!;
    select.add(new Option(`${item.label} · x ${composition.x0}`, String(composition.x0)));
  }
  select.value = selected === undefined ? '' : String(selected.x0);
  const change = (): void => {
    if (select.value === '') url.searchParams.delete('inspect');
    else url.searchParams.set('inspect', select.value);
    location.assign(url.href);
  };
  select.addEventListener('change', change);
  label.append(caption, select);
  parent.append(label);
  return () => {
    select.removeEventListener('change', change);
    label.remove();
  };
}
