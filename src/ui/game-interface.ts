import { getLanguage, onLanguageChange } from './language.ts';

export function configureGameInterface(): void {
  document.documentElement.classList.add('game-interface');
  document.querySelector<HTMLMetaElement>('meta[name="viewport"]')!.content = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
  document.addEventListener('contextmenu', event => {
    if (!(event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"]'))) event.preventDefault();
  });
}

export function attachGameNavigation(navigation: HTMLElement, game: boolean): void {
  const drawer = document.createElement('details');
  drawer.id = 'game-navigation';
  drawer.open = !game;
  const handle = document.createElement('summary');
  handle.className = 'game-navigation-handle';
  const label = (): void => {
    const en = getLanguage() === 'en';
    handle.textContent = drawer.open ? en ? 'Collapse' : '收起' : en ? 'Navigation' : '导航';
    handle.title = en ? 'Expand / collapse navigation and world controls' : '展开 / 收起导航与世界工具条';
  };
  label();
  onLanguageChange(label);
  navigation.before(drawer);
  drawer.append(handle, navigation);
  drawer.addEventListener('toggle', () => {
    if (!drawer.open) {
      for (const popover of navigation.querySelectorAll<HTMLElement>(':popover-open')) popover.hidePopover();
    }
    label();
    // 把手不留焦点，键盘立即回到游戏。
    handle.blur();
  });
  for (const type of ['keydown', 'keyup']) drawer.addEventListener(type, event => event.stopPropagation());
  if (game) document.getElementById('app')!.addEventListener('pointerdown', () => { drawer.open = false; });
}
