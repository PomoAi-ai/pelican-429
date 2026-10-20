import { onLanguageChange, t } from '../../config/i18n.ts';

/** 工具条上唯一的“地图 M”按钮：场景与整页原野共用，文案随语言切换。 */
export function createSceneMapButton(map: { toggleBigMap(open?: boolean): void }, focus: () => void, signal: AbortSignal): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  const label = (): void => { button.textContent = t('地图 M'); button.title = t('M 打开或关闭地图'); };
  label();
  signal.addEventListener('abort', onLanguageChange(label));
  button.addEventListener('click', () => { map.toggleBigMap(); focus(); }, { signal });
  return button;
}
