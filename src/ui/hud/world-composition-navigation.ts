import { t } from '../../config/i18n.ts';
import { TERRAIN_COMPOSITIONS } from '../../config/terrain-compositions.ts';
import type { WorldComposition } from '../../world/worldgen-compositions.ts';
import { onLanguageChange } from '../model/language.ts';
import { gameHost } from './mobile-game-viewport.ts';

/** 开发导航重载同一个世界，仅切换角色的检查起点，不更改地形生成。 */
export function createWorldCompositionNavigation(parent: HTMLElement, compositions: readonly WorldComposition[], selected: WorldComposition | undefined, url: URL): () => void {
  const label = document.createElement('label');
  label.className = 'dev-world-position';
  const caption = document.createElement('span');
  const select = document.createElement('select');
  select.add(new Option('', ''));
  for (const composition of compositions) select.add(new Option('', String(composition.x0)));
  const translate = (): void => {
    caption.textContent = t('世界地形定位');
    select.setAttribute('aria-label', t('世界地形定位'));
    select.title = t('重载当前种子的同一世界，并从所选地形旁开始');
    select.options[0]!.text = t('返回出生点');
    compositions.forEach((composition, index) => {
      const item = TERRAIN_COMPOSITIONS.find((entry) => entry.id === composition.kind)!;
      select.options[index + 1]!.text = `${t(item.label)} · x ${composition.x0}`;
    });
  };
  translate();
  const unsubscribe = onLanguageChange(translate);
  select.value = selected === undefined ? '' : String(selected.x0);
  const change = (): void => {
    if (select.value === '') url.searchParams.delete('inspect');
    else url.searchParams.set('inspect', select.value);
    gameHost().location.assign(url.href);
  };
  select.addEventListener('change', change);
  label.append(caption, select);
  parent.append(label);
  return () => {
    unsubscribe();
    select.removeEventListener('change', change);
    label.remove();
  };
}
