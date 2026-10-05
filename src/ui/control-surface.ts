import type { GameAction } from '../config/keybindings.ts';
import { getLanguage, onLanguageChange } from './language.ts';

export interface ControlSurface {
  readonly mode: 'desktop' | 'mobile';
  readonly aim: { readonly x: number; readonly y: number } | null;
  dispose(): void;
}

export interface ControlSurfaceOptions {
  readonly onPress: (action: GameAction, bindingKey: string) => void;
  readonly onRelease: (action: GameAction, bindingKey: string) => void;
  readonly onReset: () => void;
  readonly onFocusGame: () => void;
}

/** 演示壳与游戏共用同一画幅；触摸只提交动作和瞄准方向。 */
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
  const bar = node('div', 'control-toolbar');
  const identity = node('div', 'control-identity', bar);
  text(node('strong', '', identity), '操作界面', 'CONTROLS');
  text(node('span', '', identity), '同一世界 · 两种操作方式', 'ONE WORLD · TWO WAYS TO PLAY');
  const modes = node('div', 'control-modes', bar);
  modes.setAttribute('role', 'group');
  modes.setAttribute('aria-label', '操作界面 / Control layout');
  const desktop = button(modes, '', '电脑 · 键鼠', 'Desktop');
  const mobile = button(modes, '', '手机 · 横屏', 'Mobile');
  const preview = node('div', 'control-preview');
  const tools = node('div', 'control-tools');
  for (const [action, zh, en] of [['map', '地图', 'Map'], ['help', '帮助', 'Help'], ['settings', '设置', 'Settings']] as const) {
    button(tools, '', zh, en).addEventListener('click', () => {
      options.onPress(action, `toolbar-${action}`);
      options.onRelease(action, `toolbar-${action}`);
      options.onFocusGame();
    }, { signal });
  }
  const desktopKeys = node('div', 'control-keyboard');
  for (const [key, zh, en] of [['A D', '移动 / 自动跑', 'Move / Run'], ['SHIFT', '慢走', 'Walk'], ['SPACE', '跳跃 / 飞行', 'Jump / Fly'], ['左键', '普通攻击', 'Primary'], ['S', '下潜', 'Dive'], ['R', '骑乘', 'Ride']] as const) {
    const item = node('span', '', desktopKeys);
    node('kbd', '', item).textContent = key;
    text(node('span', '', item), zh, en);
  }
  const touch = node('div', 'control-touch');
  const move = node('div', 'control-move', touch);
  const stick = node('button', 'control-stick', move) as HTMLButtonElement;
  stick.type = 'button';
  labels.push(() => stick.setAttribute('aria-label', getLanguage() === 'en' ? 'Movement: push near to walk, far to run, up to jump, down to dive' : '移动摇杆：轻推慢走，推远奔跑，上推跳跃，下推下潜'));
  node('span', 'control-stick-ring', stick);
  const thumb = node('span', 'control-stick-thumb', stick);
  text(node('span', 'control-stick-up', stick), '跳 / 飞', 'JUMP');
  text(node('span', 'control-stick-down', stick), '下潜', 'DIVE');
  text(node('div', 'control-caption', move), '轻推慢走 · 推远奔跑', 'NEAR: WALK · FAR: RUN');
  const actions = node('div', 'control-actions', touch);
  const held = new Map<string, GameAction>();
  let aim: ControlSurface['aim'] = null;
  const setHeld = (action: GameAction, key: string, pressed: boolean): void => {
    if (pressed && !held.has(key)) { held.set(key, action); options.onPress(action, key); }
    else if (!pressed && held.has(key)) { options.onRelease(action, key); held.delete(key); }
  };
  const releaseControls = (): void => {
    for (const [key, action] of held) options.onRelease(action, key);
    held.clear();
    thumb.style.transform = '';
    aim = null;
  };
  const hold = (target: HTMLElement, action: GameAction, zh: string, en: string, className: string): HTMLButtonElement => {
    const control = button(target, `control-pad ${className}`, zh, en);
    control.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      control.setPointerCapture(event.pointerId);
      setHeld(action, `touch-${action}-${event.pointerId}`, true);
    }, { signal });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      control.addEventListener(type, (event) => setHeld(action, `touch-${action}-${event.pointerId}`, false), { signal });
    }
    control.addEventListener('keydown', (event) => {
      if (event.code !== 'Space' && event.code !== 'Enter') return;
      event.preventDefault();
      setHeld(action, `control-${action}-${event.code}`, true);
    }, { signal });
    control.addEventListener('keyup', (event) => setHeld(action, `control-${action}-${event.code}`, false), { signal });
    control.addEventListener('blur', () => {
      for (const code of ['Space', 'Enter']) setHeld(action, `control-${action}-${code}`, false);
    }, { signal });
    return control;
  };
  hold(actions, 'mount', '骑乘', 'Ride', 'control-ride');
  const attack = hold(actions, 'shoot', '攻击', 'Attack', 'control-attack');
  text(node('span', 'control-aim-caption', actions), '拖动瞄准', 'DRAG TO AIM');
  hold(actions, 'jump', '跳跃', 'Jump', 'control-jump');
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
  text(node('span', 'control-rotate', hint), '请旋转手机，横屏体验完整操作', 'Rotate your phone to play in landscape');
  let mode: ControlSurface['mode'] = matchMedia('(pointer: coarse)').matches ? 'mobile' : 'desktop';
  const layout = (): void => {
    const rect = preview.getBoundingClientRect();
    const ratio = mode === 'desktop' ? 16 / 9 : 20 / 9;
    const width = Math.min(rect.width, rect.height * ratio, mode === 'mobile' ? 932 : 1600);
    const height = width / ratio;
    parent.style.setProperty('--touch-scale', String(Math.max(.8, Math.min(1, width / 844))));
    for (const [name, value] of Object.entries({ left: rect.left + (rect.width - width) / 2, top: rect.top + (rect.height - height) / 2, width, height })) parent.style.setProperty(`--game-${name}`, `${value}px`);
  };
  const setMode = (next: ControlSurface['mode']): void => {
    releaseControls();
    resetStick();
    attackOrigin = null;
    options.onReset();
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
      for (const name of ['left', 'top', 'width', 'height']) parent.style.removeProperty(`--game-${name}`);
      parent.style.removeProperty('--touch-scale');
      root.remove();
    },
  };
}

function bindMovementStick(stick: HTMLButtonElement, thumb: HTMLElement, signal: AbortSignal, setHeld: (action: GameAction, key: string, pressed: boolean) => void): () => void {
  const release = (): void => {
    for (const [action, key] of [['moveLeft', 'stick-left'], ['moveRight', 'stick-right'], ['walk', 'stick-walk'], ['jump', 'stick-jump'], ['down', 'stick-down']] as const) setHeld(action, key, false);
  };
  let stickPointer: number | null = null;
  const stickMove = (event: PointerEvent): void => {
    if (event.pointerId !== stickPointer) return;
    const bounds = stick.getBoundingClientRect();
    const radius = bounds.width / 2;
    const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left - radius) / radius));
    const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top - radius) / radius));
    const length = Math.max(1, Math.hypot(x, y));
    thumb.style.transform = `translate(${x / length * radius * .62}px, ${y / length * radius * .62}px)`;
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
