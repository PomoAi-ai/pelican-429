import type { GameAction } from '../config/keybindings.ts';
import { getLanguage, onLanguageChange } from './language.ts';
import { gameHost } from './mobile-game-viewport.ts';
import { homeScreenInstallState } from './home-screen-install.ts';
import { createGameZoom } from './game-zoom.ts';

export interface ControlSurface {
  readonly mode: 'desktop' | 'mobile';
  dispose(): void;
}

export interface ControlSurfaceOptions {
  readonly canvas: HTMLCanvasElement;
  readonly onZoom: (zoom: number) => void;
  readonly navigation: HTMLDetailsElement;
  readonly onPress: (action: GameAction, bindingKey: string) => void;
  readonly onRelease: (action: GameAction, bindingKey: string) => void;
  readonly onReset: () => void;
  readonly onFocusGame: () => void;
  readonly onModeChange: (mode: ControlSurface['mode']) => void;
  readonly forceMobile: boolean;
}

/** 全屏操作层；触摸只提交动作，手机瞄准由游戏自动选择目标。 */
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
  const topActions = node('div', 'control-top-actions');
  const menu = node('details', 'control-menu', topActions) as HTMLDetailsElement;
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
  const host = gameHost();
  const hostDocument = host.document;
  const isIOS = /iPad|iPhone|iPod/.test(host.navigator.userAgent)
    || (host.navigator.platform === 'MacIntel' && host.navigator.maxTouchPoints > 1);
  const isMac = /Mac/.test(host.navigator.platform) && !isIOS;
  const isMacSafari = isMac && /Safari/.test(host.navigator.userAgent)
    && !/Chrome|Chromium|Edg|OPR/.test(host.navigator.userAgent);
  const isAndroid = /Android/.test(host.navigator.userAgent);
  const installLabel = isIOS || isAndroid
    ? ['添加到主屏幕', 'Add to Home Screen'] as const
    : isMacSafari ? ['添加到程序坞', 'Add to Dock'] as const : ['安装游戏', 'Install game'] as const;
  const fullscreen = button(topActions, 'control-fullscreen', '全屏', 'Fullscreen');
  const addToHomeScreen = button(topActions, 'control-fullscreen', installLabel[0], installLabel[1]);
  const installation = homeScreenInstallState();
  const fullscreenDocument = hostDocument as Document & {
    webkitFullscreenElement?: Element;
    webkitExitFullscreen?: () => Promise<void> | void;
  };
  const standaloneMode = host.matchMedia('(display-mode: standalone)');
  const fullscreenMode = host.matchMedia('(display-mode: fullscreen)');
  // 浏览器窗口全屏也匹配 fullscreen；仅应用启动网址带来的标记可辅助区分。
  const launchedFromApp = new URLSearchParams(host.location.search).get('launch') === 'pwa';
  const isStandalone = (): boolean => standaloneMode.matches
    || (fullscreenMode.matches && launchedFromApp)
    || (host.navigator as Navigator & { standalone?: boolean }).standalone === true;
  let installPending = false;
  const updateHomeScreenButton = (): void => {
    addToHomeScreen.hidden = !installation.prompt && (installation.installed || isStandalone());
    addToHomeScreen.disabled = installPending;
    nativeInstall.hidden = !installation.prompt;
    nativeInstall.disabled = installPending;
    installStatus.textContent = getLanguage() === 'en'
      ? installation.prompt ? 'Your browser is ready. Install now opens its installation dialog.'
        : !host.isSecureContext ? 'This HTTP address cannot request browser installation. On this computer, use localhost or 127.0.0.1; other devices need HTTPS.'
          : 'The browser has not offered an installation dialog yet. You can keep playing and try again, or use the browser menu below.'
      : installation.prompt ? '浏览器已允许安装，点击“立即安装”打开原生安装确认框。'
        : !host.isSecureContext ? '当前 HTTP 地址无法调用浏览器安装弹窗。本机请使用 localhost 或 127.0.0.1；其他设备需要 HTTPS 地址。'
          : '浏览器暂未提供安装弹窗。可以继续游戏后重试，或按下面步骤使用浏览器菜单。';
  };
  host.addEventListener('beforeinstallprompt', event => {
    // 只有实际提供自定义安装入口时，才接管浏览器默认安装推荐。
    event.preventDefault();
    updateHomeScreenButton();
  }, { signal });
  host.addEventListener('appinstalled', () => {
    homeScreenGuide.close();
    updateHomeScreenButton();
  }, { signal });
  standaloneMode.addEventListener('change', updateHomeScreenButton, { signal });
  fullscreenMode.addEventListener('change', updateHomeScreenButton, { signal });
  hostDocument.addEventListener('fullscreenchange', updateHomeScreenButton, { signal });
  hostDocument.addEventListener('webkitfullscreenchange', updateHomeScreenButton, { signal });
  host.addEventListener('pageshow', updateHomeScreenButton, { signal });
  const homeScreenGuide = node('dialog', 'control-home-screen-guide') as HTMLDialogElement;
  const guideTitle = node('h2', '', homeScreenGuide);
  text(guideTitle, installLabel[0], installLabel[1]);
  labels.push(() => homeScreenGuide.setAttribute('aria-label', getLanguage() === 'en' ? installLabel[1] : installLabel[0]));
  const installStatus = node('p', '', homeScreenGuide);
  installStatus.setAttribute('role', 'status');
  installStatus.hidden = isIOS || isMacSafari;
  const nativeInstall = button(homeScreenGuide, 'control-fullscreen', '立即安装', 'Install now');
  labels.push(updateHomeScreenButton);
  updateHomeScreenButton();
  text(node('p', '', homeScreenGuide), '按下面步骤添加或安装后，从新建的游戏图标打开，才能使用独立应用显示方式。', 'After adding or installing the game, open its new icon to use the standalone app display.');
  const steps = node('ol', '', homeScreenGuide);
  const installSteps: ReadonlyArray<readonly [string, string]> = isIOS ? [
    ['用 Safari 或 Chrome 打开当前游戏页面。', 'Open this game page in Safari or Chrome.'],
    ['打开浏览器的“分享”（可能位于“更多”菜单中），选择“添加到主屏幕”；如有“查看全部”或“编辑操作”，可展开查找。没有该项时，请用 Safari 打开此页面。', 'Open your browser’s Share menu (possibly under More), then choose Add to Home Screen. Expand View All or Edit Actions if offered. If unavailable, open this page in Safari.'],
    ['如有“作为网页 App 打开”，请开启，再点击“添加”。', 'Enable Open as Web App if shown, then tap Add.'],
    ['离开浏览器，返回手机主屏幕，点击新添加的游戏图标重新进入。', 'Leave the browser, return to your Home Screen, and reopen the game using the new icon.'],
  ] : isMacSafari ? [
    ['需要 macOS Sonoma 14 或更新版本的 Safari。', 'Requires Safari on macOS Sonoma 14 or later.'],
    ['在 Safari 菜单栏选择“文件 → 添加到程序坞”，或打开“分享”并选择“添加到程序坞”。', 'In the Safari menu bar, choose File → Add to Dock, or open Share and choose Add to Dock.'],
    ['确认名称并点击“添加”，然后从程序坞中的游戏图标打开。', 'Confirm the name and click Add, then open the game from its Dock icon.'],
  ] : isAndroid ? [
    ['用 Chrome 或支持安装网页应用的浏览器打开当前游戏页面。', 'Open this game page in Chrome or a browser that supports installing web apps.'],
    ['打开浏览器菜单（⋮），选择“添加到主屏幕”或“安装应用”，并确认。', 'Open the browser menu (⋮), choose Add to Home screen or Install app, and confirm.'],
    ['如果只提供“创建快捷方式”，它可能仍在浏览器标签页中打开；可在支持安装的浏览器中重试。', 'If only Create shortcut is offered, it may still open in a browser tab. Try a browser that supports app installation.'],
    ['返回主屏幕，点击新添加的游戏图标进入。', 'Return to your Home Screen and open the new game icon.'],
  ] : [
    ['使用 Chrome 或 Edge，点击地址栏中的安装图标，或在浏览器菜单中查找“安装”相关选项。', 'In Chrome or Edge, use the install icon in the address bar, or find the installation option in the browser menu.'],
    ['确认安装后，从新建的游戏图标打开。浏览器未提供安装时，请使用支持网页应用安装的浏览器。', 'Confirm installation, then open the new game icon. If installation is unavailable, use a browser that supports installing web apps.'],
    ...(isMac ? [['也可在 macOS Sonoma 14 或更新版本中用 Safari 打开，选择“文件 → 添加到程序坞”。', 'On macOS Sonoma 14 or later, you can also open this page in Safari and choose File → Add to Dock.'] as const] : []),
  ];
  for (const [zh, en] of installSteps) text(node('li', '', steps), zh, en);
  text(node('p', '', homeScreenGuide), '“添加到收藏”只保存浏览器书签，不会安装游戏。', 'Add to Favorites only saves a browser bookmark; it does not install the game.');
  button(homeScreenGuide, '', '知道了', 'Got it').addEventListener('click', () => homeScreenGuide.close(), { signal });
  const installFailure = node('p', '', homeScreenGuide);
  installFailure.hidden = true;
  installFailure.setAttribute('role', 'alert');
  const showInstallError = (error: unknown): void => {
    installFailure.textContent = `${getLanguage() === 'en' ? 'Installation failed' : '安装失败'}：${error instanceof Error ? error.message : String(error)}`;
    installFailure.hidden = false;
    homeScreenGuide.showModal();
  };
  const install = (): void => {
    installFailure.hidden = true;
    if (!installation.prompt) {
      homeScreenGuide.showModal();
      return;
    }
    const prompt = installation.prompt;
    installPending = true;
    updateHomeScreenButton();
    homeScreenGuide.close();
    const finish = (): void => {
      installPending = false;
      updateHomeScreenButton();
    };
    const failed = (error: unknown): void => {
      finish();
      showInstallError(error);
    };
    try {
      // 在这次用户点击内调用；等待结果时禁用入口，不抢先丢掉尚未展示的事件。
      prompt.prompt().then(() => {
        // 取消后 Chrome 可能已发出新事件，旧回调不能清掉新的安装机会。
        if (installation.prompt === prompt) installation.prompt = null;
        finish();
      }, failed);
    } catch (error: unknown) {
      failed(error);
    }
  };
  addToHomeScreen.addEventListener('click', install, { signal });
  nativeInstall.addEventListener('click', install, { signal });
  const failure = node('p', 'control-fullscreen-error');
  failure.hidden = true;
  failure.setAttribute('role', 'alert');
  const fullscreenRoot = hostDocument.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void;
  };
  const isFullscreen = (): boolean => Boolean(hostDocument.fullscreenElement || fullscreenDocument.webkitFullscreenElement);
  const updateFullscreen = (): void => {
    fullscreen.textContent = getLanguage() === 'en'
      ? (isFullscreen() ? 'Exit fullscreen' : 'Fullscreen')
      : (isFullscreen() ? '退出全屏' : '全屏');
    fullscreen.setAttribute('aria-pressed', String(isFullscreen()));
  };
  labels.push(updateFullscreen);
  hostDocument.addEventListener('fullscreenchange', updateFullscreen, { signal });
  hostDocument.addEventListener('webkitfullscreenchange', updateFullscreen, { signal });
  const showFullscreenError = (error: unknown): void => {
    failure.textContent = `${getLanguage() === 'en' ? 'Fullscreen failed' : '全屏操作失败'}：${error instanceof Error ? error.message : String(error)}`;
    failure.hidden = false;
  };
  fullscreen.addEventListener('click', () => {
    failure.hidden = true;
    try {
      let request: Promise<void> | void;
      if (isFullscreen()) {
        if (hostDocument.exitFullscreen) request = hostDocument.exitFullscreen();
        else request = fullscreenDocument.webkitExitFullscreen!();
      } else if (fullscreenRoot.requestFullscreen) {
        request = fullscreenRoot.requestFullscreen({ navigationUI: 'hide' });
      } else if (fullscreenRoot.webkitRequestFullscreen) {
        request = fullscreenRoot.webkitRequestFullscreen();
      } else {
        throw new Error(getLanguage() === 'en'
          ? 'This browser exposes neither requestFullscreen nor webkitRequestFullscreen.'
          : '当前浏览器未提供 requestFullscreen 或 webkitRequestFullscreen 接口。');
      }
      Promise.resolve(request).then(() => {
        updateFullscreen();
        menu.open = false;
        options.onFocusGame();
      }, showFullscreenError);
    } catch (error: unknown) {
      showFullscreenError(error);
    }
  }, { signal });
  const home = button(bar, 'control-home', '首页 · 导航', 'Home · Pages');
  const zoom = createGameZoom(bar, options.canvas, options.onZoom);
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
    const links = [...document.querySelectorAll<HTMLAnchorElement>('#dev-navigation .home-primary-link, #dev-navigation .home-nav-play, #dev-navigation .home-resources-menu a')].map((link) => {
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
  const setHeld = (action: GameAction, key: string, pressed: boolean): void => {
    if (pressed && !held.has(key)) { held.set(key, action); options.onPress(action, key); }
    else if (!pressed && held.has(key)) { options.onRelease(action, key); held.delete(key); }
  };
  const releaseControls = (): void => {
    for (const [key, action] of held) options.onRelease(action, key);
    held.clear();
    for (const pad of pads) pad.classList.remove('control-pressed');
    thumb.style.transform = '';
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
  const resetStick = bindMovementStick(stick, thumb, signal, setHeld);
  const hint = node('div', 'control-touch-hint');
  text(node('span', 'control-touch-description', hint), '左手上推可边移动边跳跃 · 右手按住攻击，自动瞄准', 'LEFT: PUSH UP TO JUMP · RIGHT: HOLD ATTACK, AUTO AIM');
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
    options.onReset();
    menu.open = false;
    options.navigation.open = false;
    mode = next;
    zoom.setMobile(mode === 'mobile');
    options.onModeChange(mode);
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
  window.addEventListener('blur', () => { releaseControls(); resetStick(); consumedKeys.clear(); }, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { releaseControls(); resetStick(); } }, { signal });
  const translate = (): void => { for (const label of labels) label(); };
  translate();
  const unsubscribe = onLanguageChange(translate);
  parent.append(root);
  setMode(mode);
  window.addEventListener('resize', layout, { signal });
  return {
    get mode() { return mode; },
    dispose() {
      zoom.dispose();
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
