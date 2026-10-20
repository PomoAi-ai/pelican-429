/**
 * 模块科技风游戏 HUD：左列人物卡、资源条、无人机卡；技能栏砸击格；小地图顶栏；场景里的跟随无人机、
 * NPC 式对话气泡、真实家园派工与物品面板（含 1 格回收站）。挂在 weapon-hud 同一个根元素里，复用它的投影。
 */
import { clamp } from '../../core/math.ts';
import { t } from '../../config/i18n.ts';
import { getLanguage, onLanguageChange } from '../model/language.ts';
import { createDroneLocomotion, separateDrones, updateDroneLocomotion, type DroneBlocked, type DroneGroundAt } from '../model/drone-locomotion.ts';
import { FOLLOW_DRONE } from '../../config/follow-drone.ts';
import { SEASON_NAMES, calendarOf, type GameTime } from '../../core/calendar.ts';
import { SCENE_WEATHER_LABELS, type SceneWeatherMode } from '../../config/weather-rules.ts';
import { TUNING } from '../../config/tuning.ts';
import type { HomesteadState } from '../../sim/homestead.ts';
import type { Entity } from '../../entities/entity.ts';
import type { ScreenPoint, WorldToScreen } from './hud.ts';
import { clock } from '../model/clock.ts';
import { linkReleased } from '../site/release.ts';

export interface GameHudWorld { readonly time: Readonly<GameTime>; readonly weather?: SceneWeatherMode }
export interface GameHudOptions {
  readonly canvas: HTMLElement;
  readonly workOrders?: { readonly state: HomesteadState; readonly command: (tool: 'chop' | 'dig' | 'build') => void };
  readonly updateDrone: (index: number, x: number, y: number, dt: number, talking: boolean, flying: boolean, groundAngle: number, groundHeight: number | null, depth?: number) => void;
  /** 着陆舱开场接管随行无人机：hidden 时留在舱内不显示，否则沿出舱路径行进；undefined 时自主跟随。 */
  readonly droneEscort?: (index: number) => DroneEscort | undefined;
  readonly groundAt: DroneGroundAt;
  readonly droneBlocked: DroneBlocked;
  readonly project: WorldToScreen;
  /** 设置、大地图、死亡等状态下为真：收起 HUD 自己打开的东西，并放行全部输入。attachMap 挂上的地图带 is-open 时同样视为阻塞。 */
  readonly blocked: () => boolean;
  readonly world?: GameHudWorld;
  /** 家园用 Tab 进指挥模式，传 false 让出 Tab。 */
  readonly tabOpensDrone?: boolean;
}
export type DroneEscort = { readonly hidden: true } | { readonly hidden: false; readonly x: number; readonly ground: number; readonly depth: number };
export interface GameHud {
  update(entity: Entity, dt: number): void;
  attachMap(el: HTMLElement): void;
  dispose(): void;
}


const ICON = '/ui/hud';
// 非家园展示场的时间与背包仍为示例数据。
const SAMPLE_WORLD: GameHudWorld = { time: { day: 3, second: 7 * 3600 + 40 * 60 }, weather: 'clear' };
const SAMPLE_SHIELD = { value: 40, max: 40 };
const DRONES = [1, 2];
const droneName = (i: number): string => t('无人机 {n}').replace('{n}', String(DRONES[i]));
const INV_TABS = ['全部', '原料', '建材', '设备', '战利品'] as const;
const INV = [
  { name: '木材', cnt: 46, tab: '原料', desc: '砍树得到。树会重新长出来。' },
  { name: '石料', cnt: 30, tab: '原料', desc: '挖掘地块得到。' },
  { name: '泥土', cnt: 20, tab: '原料', desc: '挖掘地块得到，可以填回去。' },
  { name: '废金属', cnt: 12, tab: '原料', desc: '拆城区建筑或野外废墟得到。' },
  { name: '铜', cnt: 4, tab: '原料', desc: '中级材料，机器人开采。' },
  { name: '硅', cnt: 2, tab: '原料', desc: '中级材料，做芯片。' },
  { name: '陶瓷砖', cnt: 8, tab: '建材', desc: '加工建材。' },
  { name: '合金板', cnt: 3, tab: '建材', desc: '加工建材，墙、平台、设备都要用。' },
  { name: '太阳能板', cnt: 4, tab: '设备', desc: '宽 1 高 0.5，白天每块发电 1。放在储能 128 格以内才能给电网充电。' },
  { name: '电芯', cnt: 1, tab: '设备', desc: '蓄电池柜与灯具的部件。' },
  { name: '火把', cnt: 3, tab: '设备', desc: '离网照明，不算房间的灯。' },
  { name: '机械残片', cnt: 2, tab: '战利品', desc: '失控机械掉落。' },
] as const;
const INV_CELLS = 16;
/** 两台无人机相对玩家脚底的跟随位置（格）。 */
const DRONE_OFFSETS = [{ x: -4.2, y: 2.8 }, { x: 4.8, y: 3.4 }] as const;
const CHOICES = ['chop', 'dig', 'build', 'cancel'] as const;

const PLAYER_HTML = `
  <span class="hud-player-portrait"><img src="${ICON}/portrait.png" alt=""><span class="hud-skill-icon" data-icon="pelican"></span></span>
  <div class="hud-player-info">
    <div class="hud-player-title"><b data-name></b><span class="hud-muted" data-form></span></div>
    <div class="hud-meter"><span class="hud-muted" data-hp-label></span><div class="hud-gauge"><i class="hud-hp" data-hp-fill></i></div><span class="hud-num" data-hp></span></div>
    <div class="hud-meter"><span class="hud-muted" data-second-label></span><div class="hud-gauge hud-gauge-thin"><i class="hud-second" data-second-fill></i></div><span class="hud-num" data-second></span></div>
  </div>`;
// 静态文案在 HTML 生成时取译文；语言切换时整段重建（这些片段不被缓存引用）。
const resourcesHtml = (): string => `
  <span class="hud-seg" aria-label="${t('电力：储能 {stored}，每小时净发电 {net}').replace('{stored}', '62/80').replace('{net}', '+3.0')}">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F4FA3" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>
    <span class="hud-gauge hud-gauge-thin hud-power"><i style="width:78%"></i></span><span class="hud-num hud-ok">+3.0</span>
  </span>
  <span class="hud-seg" aria-label="${t('算力 {n}').replace('{n}', '4/6P')}">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1F4FA3" stroke-width="2" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/></svg>
    <span class="hud-num">4/6P</span>
  </span>
  <span class="hud-seg" aria-label="Token 42M">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C8922A" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M9 12h6M12 9v6"/></svg>
    <span class="hud-num">42M</span>
  </span>`;
const dronesHtml = (): string => `
  <div class="hud-drones-head"><b data-drone-count>${t('无人机展示')}</b><span class="hud-muted" data-drone-compute></span></div>
  <div class="hud-inset hud-drones-list">${DRONES.map((_, i) => `
    <button type="button" class="hud-drone-row" data-drone-row="${i}"><span class="hud-num">—</span><span class="hud-drone-task">${t('跟随展示')}</span><span class="hud-gauge hud-gauge-thin"><i></i></span><span class="hud-num">—</span></button>`).join('')}
  </div>
  <div class="hud-drones-foot"><span data-drone-goods></span><span class="hud-muted">${t('施工队列')} <span class="hud-num" data-queue>0</span></span></div>`;
const bubbleHtml = (): string => `
  <div class="hud-bubble-head"><b data-bubble-name></b><span class="hud-muted" data-bubble-state></span></div>
  <p data-bubble-say></p>
  <button type="button" data-choice="chop"><span class="hud-key">1</span>${t('去砍树')}</button>
  <button type="button" data-choice="dig"><span class="hud-key">2</span>${t('去挖掘')}</button>
  <button type="button" data-choice="build"><span class="hud-key">3</span>${t('去修建')}<span class="hud-muted">${t('太阳能板 / 仓库')}</span></button>
  <button type="button" data-choice="cancel"><span class="hud-key">4</span>${t('取消')}</button>`;
const CLOSE_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const inventoryHtml = (): string => `
  <div class="hud-panel hud-inventory-panel" role="dialog" aria-label="${t('物品')}">
    <div class="hud-inventory-head">
      <div class="hud-inventory-title"><b>${t('物品')}</b><span>${t('已用')} <span class="hud-num hud-big">132</span> / <span class="hud-num">160</span></span><span class="hud-muted">${t('容量来自 2 个储物柜：家 1 · 湖边据点 1')}</span></div>
      <button type="button" class="hud-icon-btn" data-close aria-label="${t('关闭（I / Esc）')}">${CLOSE_SVG}</button>
    </div>
    <div class="hud-gauge hud-gauge-thin hud-capacity"><i style="width:82.5%"></i></div>
    <div class="hud-inventory-tabs">${INV_TABS.map(tab => `<button type="button" class="hud-tab" data-tab="${tab}">${t(tab)}</button>`).join('')}</div>
    <div class="hud-inventory-body">
      <div class="hud-inventory-grid" data-grid></div>
      <div class="hud-inventory-side">
        <div class="hud-inventory-detail" data-detail>
          <div class="hud-inset hud-inventory-swatch"><img data-detail-img alt=""></div>
          <b data-detail-name></b>
          <span data-detail-desc></span>
          <button type="button" class="hud-trash-put" data-trash-put>${t('扔进回收站')}</button>
        </div>
        <div class="hud-trash">
          <b>${t('回收站 · 1 格')}</b>
          <button type="button" class="hud-cell" data-trash-slot aria-label="${t('回收站：点击取回')}"></button>
          <span class="hud-muted">${t('点它取回，关闭面板时删除')}</span>
        </div>
      </div>
    </div>
  </div>`;
const MAP_HEADER_HTML = `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C8922A" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
  <span data-map-label></span><span class="hud-map-clock hud-num" data-map-clock></span>`;

function el(tag: string, className: string, parent: HTMLElement, html = ''): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.innerHTML = html;
  parent.append(node);
  return node;
}
const q = (root: ParentNode, selector: string): HTMLElement => root.querySelector<HTMLElement>(selector)!;
// 每帧调用：只在内容变化时写 DOM。
const setText = (node: HTMLElement, text: string): void => {
  if (node.textContent !== text) node.textContent = text;
};
const setAttr = (node: HTMLElement, name: string, value: string): void => {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
};
const setHidden = (node: HTMLElement, hidden: boolean): void => {
  if (node.hidden !== hidden) node.hidden = hidden;
};
const written = new WeakMap<HTMLElement, Map<string, string>>();
const setStyle = (node: HTMLElement, prop: string, value: string): void => {
  let last = written.get(node);
  if (!last) written.set(node, last = new Map());
  if (last.get(prop) === value) return;
  last.set(prop, value);
  node.style.setProperty(prop, value);
};
// 取到半像素：静止或缓动收尾时不再写样式；位置只走 transform，由合成器移动，不重排不重绘。
const px = (v: number): string => `${Math.round(v * 2) / 2}px`;
const moveTo = (node: HTMLElement, x: number, y: number): void => setStyle(node, 'transform', `translate3d(${px(x)}, ${px(y)}, 0)`);
const itemCell = (i: number): string => {
  const item = INV[i]!;
  return `<img class="hud-cell-icon" src="${ICON}/item-${i}.png" alt="">${t(item.name)}<span class="hud-cell-count hud-num">${item.cnt}</span>`;
};

/** 人物卡；返回的 update 报告当前是否人形。 */
function createPlayerCard(column: HTMLElement): (entity: Entity) => boolean {
  const card = el('div', 'hud-panel hud-player', column, PLAYER_HTML);
  const name = q(card, '[data-name]'), form = q(card, '[data-form]'), hp = q(card, '[data-hp]'), hpFill = q(card, '[data-hp-fill]');
  const secondLabel = q(card, '[data-second-label]'), secondText = q(card, '[data-second]'), secondFill = q(card, '[data-second-fill]');
  const hpLabel = q(card, '[data-hp-label]');
  return (entity) => {
    const pelican = entity.pelican!;
    const health = entity.health!;
    const human = pelican.form === 'human';
    setAttr(card, 'data-form', pelican.form);
    setText(name, human ? 'Grassy' : t('鹈鹕'));
    setText(form, t(human ? '人形' : '鹈鹕形态'));
    setText(hpLabel, t('血量'));
    setText(hp, `${Math.ceil(health.hp)}/${health.maxHp}`);
    setStyle(hpFill, 'width', `${Math.max(0, health.hp / health.maxHp * 100).toFixed(1)}%`);
    const second = human ? SAMPLE_SHIELD : { value: Math.floor(pelican.weapon.water), max: TUNING.weapons.water.capacity };
    setText(secondLabel, t(human ? '护盾' : '水量'));
    setText(secondText, `${second.value}/${second.max}`);
    setStyle(secondFill, 'width', `${(second.value / second.max * 100).toFixed(1)}%`);
    return human;
  };
}

/** 物品面板与 1 格回收站：扔进的物品在面板关闭前可取回，关闭时删除。 */
function createInventory(root: HTMLElement, signal: AbortSignal) {
  const panel = el('div', 'hud-inventory', root, inventoryHtml());
  panel.hidden = true;
  let tab: (typeof INV_TABS)[number] = '全部';
  let selected = 0;
  let trash: number | null = null;
  const gone = new Set<number>();
  // 语言切换会重建面板内容，所以每次渲染重新取节点。
  const render = (): void => {
    const grid = q(panel, '[data-grid]'), detail = q(panel, '[data-detail]'), img = q(panel, '[data-detail-img]') as HTMLImageElement;
    const name = q(panel, '[data-detail-name]'), desc = q(panel, '[data-detail-desc]'), trashSlot = q(panel, '[data-trash-slot]') as HTMLButtonElement;
    const cells = INV.flatMap((item, i) => gone.has(i) || i === trash || tab !== '全部' && item.tab !== tab ? []
      : [`<button type="button" class="hud-cell" data-item="${i}" aria-pressed="${i === selected}">${itemCell(i)}</button>`]);
    while (cells.length < INV_CELLS) cells.push('<span class="hud-cell hud-cell-empty"></span>');
    grid.innerHTML = cells.join('');
    for (const button of panel.querySelectorAll<HTMLElement>('[data-tab]')) button.setAttribute('aria-pressed', String(button.dataset.tab === tab));
    detail.hidden = selected < 0;
    if (selected >= 0) {
      const item = INV[selected]!;
      img.src = `${ICON}/item-${selected}.png`;
      name.textContent = `${t(item.name)} ×${item.cnt}`;
      desc.textContent = t(item.desc);
    }
    trashSlot.disabled = trash === null;
    trashSlot.innerHTML = trash === null ? `<span class="hud-muted">${t('空')}</span>` : itemCell(trash);
  };
  const close = (): void => {
    if (panel.hidden) return;
    panel.hidden = true;
    // 回收站只在面板打开期间可反悔，关闭即删除。
    if (trash !== null) gone.add(trash);
    trash = null;
  };
  panel.addEventListener('click', (e) => {
    const target = e.target as Element;
    if (target === panel || target.closest('[data-close]')) { close(); return; }
    const hit = target.closest<HTMLElement>('[data-tab], [data-item], [data-trash-put], [data-trash-slot]');
    if (!hit) return;
    if (hit.dataset.tab) tab = hit.dataset.tab as (typeof INV_TABS)[number];
    else if (hit.dataset.item) selected = Number(hit.dataset.item);
    else if (hit.hasAttribute('data-trash-put')) {
      // 再扔一件会把上一件顶掉删除。
      if (trash !== null) gone.add(trash);
      trash = selected;
      selected = INV.findIndex((_, i) => !gone.has(i) && i !== trash);
    } else if (trash !== null) {
      selected = trash;
      trash = null;
    }
    render();
  }, { signal });
  return {
    el: panel,
    isOpen: (): boolean => !panel.hidden,
    open(): void { panel.hidden = false; render(); },
    close,
    translate(): void {
      panel.innerHTML = inventoryHtml();
      if (!panel.hidden) render();
    },
  };
}

/** 小地图顶栏：天气 · 第 N 天 · 季节 + 时钟，只在分钟或天气变化时写 DOM。 */
function createMapHeaders(world: GameHudWorld) {
  const headers: { readonly label: HTMLElement; readonly clock: HTMLElement }[] = [];
  const nodes: HTMLElement[] = [];
  let key = '';
  return {
    nodes,
    attach(map: HTMLElement): void {
      const header = document.createElement('div');
      header.className = 'hud-map-header';
      header.innerHTML = MAP_HEADER_HTML;
      map.prepend(header);
      nodes.push(header);
      headers.push({ label: q(header, '[data-map-label]'), clock: q(header, '[data-map-clock]') });
      key = '';
    },
    update(): void {
      const { day, second } = world.time;
      // 示例数据，待接入：没有天气来源的场景显示晴。
      const weather = world.weather ?? 'clear';
      const next = `${getLanguage()}:${day}:${Math.floor(second / 60)}:${weather}`;
      if (next === key) return;
      key = next;
      const c = calendarOf(day);
      for (const h of headers) {
        h.label.textContent = `${t(SCENE_WEATHER_LABELS[weather])} · ${t(SEASON_NAMES[c.season]!)} · ${t('第 {n} 天').replace('{n}', String(c.dayOfSeason))}`;
        h.clock.textContent = clock(second);
      }
    },
  };
}

const droneStatus = (drone: HomesteadState['drones'][number]): string => {
  const status = { docked: '待命', charging: '充电', flying: '飞往目标', working: '作业中', returning: '返航卸货', stalled: '算力不足', retreat: '避敌返航', full: '仓库已满', blocked: '路线受阻' }[drone.status];
  const task = drone.task;
  return task === null ? t(status) : `${t(status)} · ${t(task.kind === 'site' ? task.site.kind === 'solar' ? '修建太阳能板' : '修建仓库' : task.mark.kind === 'tree' ? '砍树' : '挖掘')}`;
};

export function createGameHud(root: HTMLElement, options: GameHudOptions): GameHud {
  const { canvas, project } = options;
  const tabOpensDrone = options.tabOpensDrone ?? true;
  const controller = new AbortController();
  const { signal } = controller;
  const column = el('div', 'hud-column', root);
  const updatePlayer = createPlayerCard(column);
  const resources = options.workOrders ? null : el('div', 'hud-panel hud-resources', column);
  const dronePanel = el('div', 'hud-panel hud-drones', column);

  const smash = document.createElement('span');
  smash.className = 'hud-weapon-slot hud-weapon-ready';
  smash.dataset.slot = '0';
  smash.innerHTML = '<span class="hud-skill-icon" data-icon="smash" aria-hidden="true"></span><span class="hud-weapon-key"></span>';
  const smashIcon = q(smash, '.hud-skill-icon');
  const smashKey = q(smash, '.hud-weapon-key');
  root.querySelector('.hud-weapon-slots')!.prepend(smash);

  const droneEls = DRONES.map((_, i) => {
    const button = el('button', 'hud-drone', root, '<span class="hud-drone-hit" aria-hidden="true"></span>') as HTMLButtonElement;
    Object.assign(button, { type: 'button', hidden: true });
    button.dataset.drone = String(i);
    return button;
  });
  const drones = DRONE_OFFSETS.map((_, i) => createDroneLocomotion(429 + i * 7919));

  const bubble = el('div', 'hud-panel hud-bubble', root);
  Object.assign(bubble, { hidden: true, role: 'dialog' });
  let bubbleSize = { w: 0, h: 0, droneH: 0 };
  // 气泡贴边要用根宽度；缓存下来，免得每帧读布局触发强制重排。
  let rootWidth = root.clientWidth;
  const resize = new ResizeObserver(([entry]) => { rootWidth = entry!.contentRect.width; });
  resize.observe(root);

  const inventory = createInventory(root, signal);
  const map = createMapHeaders(options.world ?? SAMPLE_WORLD);

  let talking: number | null = null;
  const closeBubble = (): void => {
    if (talking === null) return;
    droneEls[talking]!.classList.remove('talking');
    talking = null;
    bubble.hidden = true;
  };
  const placeBubble = (p: ScreenPoint): void => {
    const { w, h, droneH } = bubbleSize;
    const left = clamp(p.x - w / 2, 12, rootWidth - w - 12);
    const above = p.y - droneH / 2 - h - 16;
    const below = above < 12;
    bubble.classList.toggle('below', below);
    moveTo(bubble, left, below ? p.y + droneH / 2 + 16 : above);
    setStyle(bubble, '--tail', px(clamp(p.x - left, 20, w - 20)));
  };
  // 没有家园作业的场景靠跳进家园派活；发布版没有家园，只保留取消。
  const dispatch = options.workOrders !== undefined || linkReleased('./?mode=homestead');
  const updateBubble = (i: number): void => {
    const real = options.workOrders?.state.drones[i];
    setText(q(bubble, '[data-bubble-name]'), droneName(i));
    setText(q(bubble, '[data-bubble-state]'), real ? `Lv${real.robot.level} · ${t('电量 {n}%').replace('{n}', String(Math.round(real.robot.battery * 100)))}` : t('外观展示'));
    setText(q(bubble, '[data-bubble-say]'), real ? t('{status}。选择任务后点选或框选目标，由空闲无人机接单。').replace('{status}', droneStatus(real))
      : t(dispatch ? '当前场景只展示跟随，选择下面操作将进入家园派工作业。' : '当前场景只展示跟随。'));
    for (const button of bubble.querySelectorAll<HTMLElement>('[data-choice]')) {
      if (button.dataset.choice === 'cancel') continue;
      button.title = t(real ? '打开家园作业工具' : '进入家园派工作业');
      button.hidden = !dispatch;
    }
  };
  const openBubble = (i: number): void => {
    closeBubble();
    inventory.close();
    updateBubble(i);
    talking = i;
    droneEls[i]!.classList.add('talking');
    bubble.hidden = false;
    bubbleSize = { w: bubble.offsetWidth, h: bubble.offsetHeight, droneH: q(droneEls[i]!, '.hud-drone-hit').offsetHeight };
    q(bubble, 'button').focus();
  };

  const translate = (): void => {
    if (resources) resources.innerHTML = resourcesHtml();
    dronePanel.innerHTML = dronesHtml();
    bubble.innerHTML = bubbleHtml();
    bubble.ariaLabel = t('无人机对话');
    for (const [i, button] of droneEls.entries()) button.ariaLabel = t('{name}：点它对话、派活').replace('{name}', droneName(i));
    smashKey.textContent = t('左键');
    inventory.translate();
  };
  translate();
  const unsubscribeLanguage = onLanguageChange(translate);

  const maps: HTMLElement[] = [];
  // 透视场景暂停时不跑 update，所以每个捕获监听都要先自己收起。
  const isBlocked = (): boolean => {
    if (!options.blocked() && !maps.some(m => m.classList.contains('is-open'))) return false;
    closeBubble(); inventory.close();
    return true;
  };
  const choose = (choice: (typeof CHOICES)[number]): void => {
    closeBubble();
    if (choice === 'cancel') return;
    if (options.workOrders) options.workOrders.command(choice);
    else window.location.assign('./?mode=homestead');
    canvas.focus();
  };

  for (const [i, button] of droneEls.entries()) button.addEventListener('click', () => talking === i ? closeBubble() : openBubble(i), { signal });
  dronePanel.addEventListener('click', (e) => {
    const row = (e.target as Element).closest<HTMLElement>('[data-drone-row]');
    if (row) openBubble(Number(row.dataset.droneRow));
  }, { signal });
  bubble.addEventListener('click', (e) => {
    const button = (e.target as Element).closest<HTMLElement>('[data-choice]');
    if (button) choose(button.dataset.choice as (typeof CHOICES)[number]);
  }, { signal });

  const handleKey = (e: KeyboardEvent): boolean => {
    const digit = /^(?:Digit|Numpad)([1-4])$/.exec(e.code);
    if (talking !== null && digit && (dispatch || digit[1] === '4')) { choose(CHOICES[Number(digit[1]) - 1]!); return true; }
    if (e.code === 'Escape') {
      if (talking !== null) closeBubble();
      else if (inventory.isOpen()) inventory.close();
      else return false;
      return true;
    }
    // 焦点在 HUD 按钮或页面控件上时放行 Tab 的焦点移动。
    const focus = document.activeElement;
    if (e.code === 'Tab' && tabOpensDrone && (focus === document.body || canvas.contains(focus))) {
      if (talking !== null) closeBubble();
      else openBubble(0);
      return true;
    }
    if (e.code === 'KeyI') {
      if (!e.repeat) {
        if (inventory.isOpen()) inventory.close();
        else { closeBubble(); inventory.open(); }
      }
      return true;
    }
    return false;
  };
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('dialog[open]') || isBlocked()) return;
    if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (!handleKey(e)) return;
    e.preventDefault();
    // 挡住 keyboard-mouse 的冒泡监听：对话中的 1–4 不放技能。
    e.stopImmediatePropagation();
  }, { capture: true, signal });

  const onCanvas = (e: Event): boolean => e.target instanceof Node && canvas.contains(e.target);
  window.addEventListener('mousedown', (e) => {
    if (isBlocked()) return;
    const target = e.target as Node;
    if (talking !== null) {
      if (bubble.contains(target) || droneEls.some(d => d.contains(target))) return;
      closeBubble();
      if (onCanvas(e)) { e.preventDefault(); e.stopPropagation(); }
      return;
    }
  }, { capture: true, signal });

  let droneActivityRadius = 8;
  const updateDrones = (entity: Entity, dt: number): void => {
    const center = project(entity.body.x, entity.body.y);
    const unit = project(entity.body.x + 1, entity.body.y);
    if (center && unit) {
      const margin = Math.min(center.x, rootWidth - center.x) * 0.72;
      droneActivityRadius = clamp(margin / Math.abs(unit.x - center.x), 3, 12);
    }
    const free: number[] = [];
    const shown: number[] = [];
    for (const [i, d] of drones.entries()) {
      const real = options.workOrders?.state.drones[i];
      if (options.workOrders && !real) {
        setHidden(droneEls[i]!, true);
        continue;
      }
      const escort = real ? undefined : options.droneEscort?.(i);
      if (escort?.hidden) {
        setHidden(droneEls[i]!, true);
        continue;
      }
      shown.push(i);
      if (real) { d.x = real.x; d.y = real.y; }
      else if (escort) {
        // Rolling on the hatch floor, stair and ground; the free follower picks up from here once released.
        Object.assign(d, { x: escort.x, y: escort.ground + 0.34, flying: false, groundAngle: 0, groundHeight: escort.ground, placed: true });
        options.updateDrone(i, d.x, d.y, dt, false, false, 0, escort.ground, escort.depth);
      } else {
        updateDroneLocomotion(d, entity.body, DRONE_OFFSETS[i]!, options.groundAt, options.droneBlocked, droneActivityRadius, dt);
        free.push(i);
      }
    }
    if (free.length === 2) separateDrones(drones[free[0]!]!, drones[free[1]!]!, FOLLOW_DRONE.halfWidth, FOLLOW_DRONE.roof, options.droneBlocked);
    for (const i of free) {
      const d = drones[i]!;
      options.updateDrone(i, d.x, d.y, dt, talking === i, d.flying, d.groundAngle, d.groundHeight);
    }
    for (const i of shown) {
      const d = drones[i]!;
      const p = project(d.x, d.y);
      const button = droneEls[i]!;
      setHidden(button, p === null);
      if (p) moveTo(button, p.x, p.y);
      if (talking === i) {
        if (p) placeBubble(p);
        else closeBubble();
      }
    }
  };

  return {
    update(entity, dt) {
      isBlocked();
      setAttr(smashIcon, 'data-icon', updatePlayer(entity) ? 'smash' : 'water');
      updateDrones(entity, dt);
      const state = options.workOrders?.state;
      setText(q(dronePanel, '[data-queue]'), String(state ? state.marks.length + state.sites.length : 0));
      if (state) {
        setText(q(dronePanel, '[data-drone-count]'), t('无人机 {n} 台').replace('{n}', String(state.drones.length)));
        setText(q(dronePanel, '[data-drone-compute]'), t('分到算力 {n}P').replace('{n}', String(state.drones.reduce((sum, d) => sum + d.robot.compute, 0))));
        setText(q(dronePanel, '[data-drone-goods]'), t('木材 {wood} · 石料 {stone}').replace('{wood}', String(state.wood)).replace('{stone}', String(state.stone)));
      }
      for (const [i, row] of [...dronePanel.querySelectorAll<HTMLElement>('[data-drone-row]')].entries()) {
        const real = state?.drones[i];
        setHidden(row, state !== undefined && !real);
        if (real) {
          setText(q(row, '.hud-num'), `Lv${real.robot.level}`);
          setText(q(row, '.hud-drone-task'), droneStatus(real));
          setStyle(q(row, '.hud-gauge i'), 'width', `${real.robot.battery * 100}%`);
          setText(row.lastElementChild as HTMLElement, `${Math.round(real.robot.battery * 100)}%`);
        }
      }
      if (talking !== null) updateBubble(talking);
      map.update();
    },
    attachMap(el) { maps.push(el); map.attach(el); },
    dispose() {
      unsubscribeLanguage();
      controller.abort();
      resize.disconnect();
      for (const node of [column, smash, ...droneEls, bubble, inventory.el, ...map.nodes]) node.remove();
    },
  };
}
