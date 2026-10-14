import { LANGUAGES, getLanguage, onLanguageChange, setLanguage } from './language.ts';

export function createLanguagePicker(id: string) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'language-picker';
  button.setAttribute('aria-label', '语言 / Language');
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-controls', id);
  button.setAttribute('aria-expanded', 'false');

  const menu = document.createElement('div');
  menu.id = id;
  menu.className = 'language-menu';
  menu.popover = 'auto';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', '语言 / Language');
  button.popoverTargetElement = menu;

  const close = (): void => menu.hidePopover();
  const choices = LANGUAGES.map(({ id: language, label }) => {
    const choice = document.createElement('button');
    choice.type = 'button';
    choice.className = 'language-option';
    choice.textContent = label;
    choice.lang = language === 'zh' ? 'zh-CN' : 'en';
    choice.tabIndex = -1;
    choice.setAttribute('role', 'menuitemradio');
    choice.addEventListener('click', () => {
      setLanguage(language);
      close();
      button.focus();
    });
    menu.append(choice);
    return choice;
  });
  const sync = (): void => {
    button.textContent = LANGUAGES.find(item => item.id === getLanguage())!.label;
    choices.forEach((choice, index) => choice.setAttribute('aria-checked', String(LANGUAGES[index]!.id === getLanguage())));
  };
  sync();
  const unsubscribe = onLanguageChange(sync);
  const events = new AbortController();

  const position = (): void => {
    const rect = button.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(rect.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - menu.offsetHeight - 8))}px`;
  };
  menu.addEventListener('toggle', event => {
    const open = event.newState === 'open';
    button.setAttribute('aria-expanded', String(open));
    if (open) {
      position();
      choices[LANGUAGES.findIndex(item => item.id === getLanguage())]!.focus();
      window.addEventListener('resize', position, { signal: events.signal });
      document.addEventListener('scroll', position, { capture: true, signal: events.signal });
    } else {
      window.removeEventListener('resize', position);
      document.removeEventListener('scroll', position, true);
    }
  });
  button.addEventListener('keydown', event => {
    event.stopPropagation();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      menu.showPopover();
    } else if (event.key === ' ') {
      // 游戏会取消 Space 的 keyup 默认行为，所以在 keydown 激活按钮。
      event.preventDefault();
      if (!event.repeat) button.click();
    }
  });
  menu.addEventListener('keydown', event => {
    event.stopPropagation();
    const index = choices.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1
        : (index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length;
      choices[next]!.focus();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault();
      close();
      button.focus();
    } else if (event.key === ' ') {
      event.preventDefault();
      if (!event.repeat) choices[index]!.click();
    }
  });
  for (const node of [button, menu]) node.addEventListener('keyup', event => event.stopPropagation());

  return {
    button, menu, close,
    dispose(): void {
      unsubscribe();
      events.abort();
      close();
      button.remove();
      menu.remove();
    },
  };
}
