import type { GameAction } from '../config/keybindings.ts';
import { getLanguage, onLanguageChange } from './language.ts';
import { gameHost } from './mobile-game-viewport.ts';

export interface ControlSurface {
  readonly mode: 'desktop' | 'mobile';
  readonly aim: { readonly x: number; readonly y: number } | null;
  dispose(): void;
}

export interface ControlSurfaceOptions {
  readonly navigation: HTMLDetailsElement;
  readonly onPress: (action: GameAction, bindingKey: string) => void;
  readonly onRelease: (action: GameAction, bindingKey: string) => void;
  readonly onReset: () => void;
  readonly onFocusGame: () => void;
  readonly forceMobile: boolean;
}

/** 全屏操作层；触摸只提交动作和瞄准方向。 */
export function createControlSurface(parent: HTMLElement, options: ControlSurfaceOptions): ControlSurface {
  const root = document.createElement('section');
  root.className = 'control-surface';
  const labels: Array<() => void> = [];
  const controller = new AbortController();
  const { signal } = controller;
  const node = (tag: string, className: string, target = root): HTMLElement => {
    const result = document.createElement(tag);
    result.className = className;
    target.append(result);
    return result;
  };
  const text = (target: HTMLElement, zh: string, en: string): void => {
    labels.push(() => { target.textContent = getLanguage() === 'en' ? en : zh; });
  };
  const button = (target: HTMLElement, className: string, zh: string, en: string): HTMLButtonElement => {
    const result = node('button', className, target) as HTMLButtonElement;
    result.type = 'button';
    text(result, zh, en);
    return result;
  };
  const menu = node('details', 'control-menu') as HTMLDetailsElement;
  const menuToggle = node('summary', 'control-menu-toggle', menu);
  menuToggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 5h18M3 12h18M3 19h18"/></svg>';
  menuToggle.setAttribute('aria-controls', options.navigation.id);
  menu.addEventListener('focusin', options.onReset, { signal });
  menu.addEventListener('toggle', () => {
    options.navigation.open = menu.open;
  }, { signal });
  options.navigation.addEventListener('toggle', () => {
    menu.open = options.navigation.open;
  }, { signal });
  labels.push(() => menuToggle.setAttribute('aria-label', getLanguage() === 'en' ? 'Game menu and control layout' : '游戏菜单与操作布局'));
  const bar = node('div', 'control-toolbar', menu);
  const modes = node('div', 'control-modes', bar);
  modes.setAttribute('role', 'group');
  modes.setAttribute('aria-label', '操作界面 / Control layout');
  const desktop = button(modes, '', '电脑 · 键鼠', 'Desktop');
  const mobile = button(modes, '', '手机 · 横屏', 'Mobile');
  const tools = node('div', 'control-tools', bar);
  for (const [action, zh, en] of [['map', '地图', 'Map'], ['help', '帮助', 'Help'], ['settings', '设置', 'Settings']] as const) {
    button(tools, '', zh, en).addEventListener('click', () => {
      menu.open = false;
      options.onPress(action, `toolbar-${action}`);
      options.onRelease(action, `toolbar-${action}`);
      options.onFocusGame();
    }, { signal });
  }
  const hostDocument = gameHost().document;
  if (hostDocument.fullscreenEnabled) {
    const fullscreen = button(tools, '', '全屏', 'Fullscreen');
    const failure = node('p', 'control-fullscreen-error', bar);
    failure.hidden = true;
    failure.setAttribute('role', 'alert');
    fullscreen.addEventListener('click', () => {
      failure.hidden = true;
      void hostDocument.documentElement.requestFullscreen().then(() => {
        menu.open = false;
        options.onFocusGame();
      }).catch((error: unknown) => {
        failure.textContent = `${getLanguage() === 'en' ? 'Could not enter fullscreen' : '无法进入全屏'}：${error instanceof Error ? error.message : String(error)}`;
        failure.hidden = false;
      });
    }, { signal });
  }
  const home = button(bar, 'control-home', '首页 · 导航', 'Home · Pages');
  const pages = node('div', 'control-nav');
  pages.popover = 'auto';
  pages.setAttribute('role', 'navigation');
  labels.push(() => pages.setAttribute('aria-label', getLanguage() === 'en' ? 'Site pages' : '资源导航'));
  home.popoverTargetElement = pages;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'control-nav-close';
  close.popoverTargetElement = pages;
  close.popoverTargetAction = 'hide';
  text(close, '关闭', 'Close');
  labels.push(() => close.setAttribute('aria-label', getLanguage() === 'en' ? 'Close navigation' : '关闭导航'));
  home.addEventListener('click', () => {
    menu.open = false;
    // 每次打开都重新克隆，链接文字跟随顶部导航的当前语言；story 模式下顶部导航只是隐藏，仍在 DOM 中。
    const links = [...document.querySelectorAll<HTMLAnchorElement>('#dev-navigation .dev-links a')].map((link) => {
      const copy = link.cloneNode(true) as HTMLAnchorElement;
      copy.removeAttribute('id');
      return copy;
    });
    pages.replaceChildren(...links, close);
  }, { signal });
  const desktopKeys = node('div', 'control-keyboard');
  for (const [key, zh, en] of [['A D', '移动 / 自动跑', 'Move / Run'], ['SHIFT', '慢走', 'Walk'], ['SPACE', '跳跃 / 飞行', 'Jump / Fly'], ['S', '下平台 / 下潜', 'Drop / Dive'], ['R', '骑乘', 'Ride']] as const) {
    const item = node('span', '', desktopKeys);
    node('kbd', '', item).textContent = key;
    text(node('span', '', item), zh, en);
  }
  const touch = node('div', 'control-touch');
  const move = node('div', 'control-move', touch);
  const stick = node('button', 'control-stick', move) as HTMLButtonElement;
  stick.type = 'button';
  labels.push(() => stick.setAttribute('aria-label', getLanguage() === 'en' ? 'Movement: push near to walk, far to run, up to jump, down to drop through platforms or dive' : '移动摇杆：轻推慢走，推远奔跑，上推跳跃，下推下平台或下潜'));
  node('span', 'control-stick-ring', stick);
  const thumb = node('span', 'control-stick-thumb', stick);
  text(node('span', 'control-stick-up', stick), '跳 / 飞', 'JUMP');
  text(node('span', 'control-stick-down', stick), '下 / 潜', 'DOWN');
  text(node('div', 'control-caption', move), '轻推慢走 · 推远奔跑', 'NEAR: WALK · FAR: RUN');
  const actions = node('div', 'control-actions', touch);
  const held = new Map<string, GameAction>();
  const pads: HTMLElement[] = [];
  let aim: ControlSurface['aim'] = null;
  const setHeld = (action: GameAction, key: string, pressed: boolean): void => {
    if (pressed && !held.has(key)) { held.set(key, action); options.onPress(action, key); }
    else if (!pressed && held.has(key)) { options.onRelease(action, key); held.delete(key); }
  };
  const releaseControls = (): void => {
    for (const [key, action] of held) options.onRelease(action, key);
    held.clear();
    for (const pad of pads) pad.classList.remove('control-pressed');
    thumb.style.transform = '';
    aim = null;
  };
  const hold = (target: HTMLElement, action: GameAction, zh: string, en: string, className: string): HTMLButtonElement => {
    const control = node('button', `control-pad ${className}`, target) as HTMLButtonElement;
    control.type = 'button';
    pads.push(control);
    const press = (key: string, down: boolean): void => {
      setHeld(action, key, down);
      control.classList.toggle('control-pressed', [...held.values()].includes(action));
    };
    labels.push(() => { const label = getLanguage() === 'en' ? en : zh; control.setAttribute('aria-label', label); control.title = label; });
    const icon = node('span', 'hud-skill-icon', control);
    icon.dataset.icon = action === 'shoot' ? 'water' : 'dash';
    icon.setAttribute('aria-hidden', 'true');
    control.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      control.setPointerCapture(event.pointerId);
      press(`touch-${action}-${event.pointerId}`, true);
    }, { signal });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      control.addEventListener(type, (event) => press(`touch-${action}-${event.pointerId}`, false), { signal });
    }
    control.addEventListener('keydown', (event) => {
      if (event.code !== 'Space' && event.code !== 'Enter') return;
      event.preventDefault();
      press(`control-${action}-${event.code}`, true);
    }, { signal });
    control.addEventListener('keyup', (event) => press(`control-${action}-${event.code}`, false), { signal });
    control.addEventListener('blur', () => {
      for (const code of ['Space', 'Enter']) press(`control-${action}-${code}`, false);
    }, { signal });
    return control;
  };
  hold(actions, 'mount', '骑乘', 'Ride', 'control-ride');
  const attack = hold(actions, 'shoot', '攻击', 'Attack', 'control-attack');
  text(node('span', 'control-primary-key', attack), '左键', 'Left click');
  let attackOrigin: { x: number; y: number; pointer: number } | null = null;
  attack.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || attackOrigin !== null) return;
    aim = null;
    attackOrigin = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
  }, { signal });
  attack.addEventListener('pointermove', (event) => {
    if (attackOrigin === null || event.pointerId !== attackOrigin.pointer) return;
    const x = event.clientX - attackOrigin.x;
    const y = attackOrigin.y - event.clientY;
    const length = Math.hypot(x, y);
    if (length > 9) aim = { x: x / length, y: y / length };
  }, { signal });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) attack.addEventListener(type, (event) => { if (event.pointerId === attackOrigin?.pointer) { attackOrigin = null; if (type === 'pointercancel') aim = null; } }, { signal });
  const resetStick = bindMovementStick(stick, thumb, signal, setHeld);
  const hint = node('div', 'control-touch-hint');
  text(node('span', 'control-touch-description', hint), '左手上推可边移动边跳跃 · 右手按住攻击并拖动瞄准', 'LEFT: PUSH UP TO JUMP · RIGHT: HOLD & DRAG TO AIM');
  let mode: ControlSurface['mode'] = options.forceMobile || matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop';
  modes.hidden = options.forceMobile;
  // 操控展示页没有开场引导，操作说明需要常驻，桌面浏览器打开时同样可见。
  root.classList.toggle('control-surface-demo', options.forceMobile);
  const layout = (): void => {
    parent.style.setProperty('--touch-scale', String(Math.max(.72, Math.min(1, window.innerWidth / 844, window.innerHeight / 390))));
  };
  const setMode = (next: ControlSurface['mode']): void => {
    releaseControls();
    resetStick();
    attackOrigin = null;
    options.onReset();
    menu.open = false;
    options.navigation.open = false;
    mode = next;
    parent.dataset.controls = mode;
    desktop.setAttribute('aria-pressed', String(mode === 'desktop'));
    mobile.setAttribute('aria-pressed', String(mode === 'mobile'));
    layout();
  };
  desktop.addEventListener('click', () => { setMode('desktop'); options.onFocusGame(); }, { signal });
  mobile.addEventListener('click', () => { setMode('mobile'); options.onFocusGame(); }, { signal });
  const consumedKeys = new Set<string>();
  root.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' && event.code !== 'Enter') return;
    consumedKeys.add(event.code);
    event.stopPropagation();
  }, { signal });
  root.addEventListener('keyup', (event) => { if (consumedKeys.delete(event.code)) event.stopPropagation(); }, { signal });
  root.addEventListener('focusout', () => consumedKeys.clear(), { signal });
  window.addEventListener('blur', () => { releaseControls(); resetStick(); attackOrigin = null; consumedKeys.clear(); }, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { releaseControls(); resetStick(); attackOrigin = null; } }, { signal });
  const translate = (): void => { for (const label of labels) label(); };
  translate();
  const unsubscribe = onLanguageChange(translate);
  parent.append(root);
  setMode(mode);
  window.addEventListener('resize', layout, { signal });
  return {
    get mode() { return mode; },
    get aim() { return aim; },
    dispose() {
      releaseControls();
      controller.abort();
      unsubscribe();
      delete parent.dataset.controls;
      parent.style.removeProperty('--touch-scale');
      root.remove();
    },
  };
}

function bindMovementStick(stick: HTMLButtonElement, thumb: HTMLElement, signal: AbortSignal, setHeld: (action: GameAction, key: string, pressed: boolean) => void): () => void {
  const release = (): void => {
    stick.classList.remove('control-pressed');
    for (const [action, key] of [['moveLeft', 'stick-left'], ['moveRight', 'stick-right'], ['walk', 'stick-walk'], ['jump', 'stick-jump'], ['down', 'stick-down']] as const) setHeld(action, key, false);
  };
  let stickPointer: number | null = null;
  const stickMove = (event: PointerEvent): void => {
    if (event.pointerId !== stickPointer) return;
    const bounds = stick.getBoundingClientRect();
    const radius = bounds.width / 2;
    const x = (event.clientX - bounds.left - radius) / radius;
    const y = (event.clientY - bounds.top - radius) / radius;
    // 指针捕获允许拖出底盘；换回局部坐标，避免手机缩放再次放大位移。
    thumb.style.transform = `translate(${x * stick.offsetWidth / 2}px, ${y * stick.offsetHeight / 2}px)`;
    setHeld('moveLeft', 'stick-left', x < -.2);
    setHeld('moveRight', 'stick-right', x > .2);
    setHeld('walk', 'stick-walk', Math.abs(x) < .68);
    setHeld('jump', 'stick-jump', y < -.62);
    setHeld('down', 'stick-down', y > .62);
  };
  stick.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || stickPointer !== null) return;
    event.preventDefault();
    stickPointer = event.pointerId;
    stick.classList.add('control-pressed');
    stick.setPointerCapture(event.pointerId);
    stickMove(event);
  }, { signal });
  stick.addEventListener('pointermove', stickMove, { signal });
  const releaseStick = (event: PointerEvent): void => {
    if (event.pointerId !== stickPointer) return;
    stickPointer = null;
    release();
    thumb.style.transform = '';
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) stick.addEventListener(type, releaseStick, { signal });
  return () => { stickPointer = null; release(); thumb.style.transform = ''; };
}
