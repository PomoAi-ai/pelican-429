/**
 * 家园概念版本界面：顶部资源条、无人机状态、光子引导、指挥模式（Tab）、商店终端、睡觉与 Tibo 天亮结算。
 * 指挥模式下用一层透明遮罩接住鼠标，左键点选或拖框，不会触发普攻。
 */
import { HOMESTEAD } from '../../config/homestead.ts';
import type { ComputeMode, HomesteadBuild, HomesteadPurchase } from '../../config/homestead.ts';
import { calendarOf, isDaytime, MOON_PHASE_NAMES, moonPhase, SEASON_NAMES } from '../../core/calendar.ts';
import type { Rect, Vec2 } from '../../core/math.ts';
import type { BuildResult, HarvestKind, Drone, DroneStatus, HomesteadState, MarkBlock, PurchaseResult } from '../../sim/homestead.ts';
import { npcModel } from '../../config/npc.ts';
import { t } from '../../config/i18n.ts';
import { onLanguageChange } from '../model/language.ts';

export type HomesteadTerminal = 'compute' | 'robot';

export interface HomesteadHudOptions {
  readonly state: () => HomesteadState;
  readonly terminal: () => HomesteadTerminal | null;
  readonly canSleep: () => boolean;
  readonly toWorld: (clientX: number, clientY: number) => Vec2 | null;
  readonly onMark: (area: Rect, kind: HarvestKind) => number;
  readonly onCancel: (area: Rect) => number;
  readonly onPlaceDepot: (x: number) => BuildResult;
  readonly onPlaceSolar: (area: Rect) => { readonly placed: number; readonly reason: Exclude<BuildResult, 'ok'> | null };
  readonly onPreview: (kind: HomesteadBuild | null, at: Vec2) => void;
  readonly onBuy: (item: HomesteadPurchase) => PurchaseResult;
  readonly onSleep: () => void;
  readonly onMode: (mode: ComputeMode) => void;
  readonly onOpen: () => void;
  readonly onClose: () => void;
}

export interface HomesteadHud {
  readonly open: boolean;
  readonly commanding: boolean;
  command(tool: 'chop' | 'dig' | 'build'): void;
  update(): void;
  dispose(): void;
}

type Tool = 'mark' | 'chop' | 'dig' | 'cancel' | HomesteadBuild;

const STATUS_TEXT: Readonly<Record<DroneStatus, string>> = {
  docked: '待命', charging: '充电中', flying: '飞往目标', working: '作业中', returning: '返回卸货',
  stalled: '429 算力不足', retreat: '附近有怪物，撤回', full: '仓库已满，等待卸货', blocked: '路线被地形挡住',
};
const BLOCK_TEXT: Readonly<Record<MarkBlock, string>> = {
  cliff: '落差超过飞行高度', drop: '落差超过飞行高度', zone: '区域还没清场', enemy: '附近有怪物', level: '采石需要 Lv2', buried: '还没露出地面', reach: '装得太高，无人机够不着',
};
const BUILD_TEXT: Readonly<Record<Exclude<BuildResult, 'ok'>, string>> = {
  materials: '材料不够', zone: '这里还没清场', uneven: '要放在空格子里、下面是实心砖（仓库要两列等高的实地）', occupied: '和已有设施重叠',
};
const targetText = (task: Drone['task']): string => task === null ? ''
  : ` · ${t(task.kind === 'site' ? (task.site.kind === 'solar' ? '施工太阳能板' : '施工仓库') : task.mark.kind === 'tree' ? '砍树' : '挖地块')}`;
const PURCHASE_TEXT: Readonly<Record<Exclude<PurchaseResult, 'ok'>, string>> = {
  tokens: 'Token 不够', wood: '木材不够', owned: '已经装过了', slots: '机器人坞没有空位', noLv1: '没有可以升级的 Lv1 无人机',
};
// 商店文案在渲染时取译文：语言可能在两次打开之间切换。
const shopEntries = (terminal: HomesteadTerminal): readonly { item: HomesteadPurchase; name: string; detail: string; price: string }[] => terminal === 'compute' ? [
  { item: 'gpu', name: t('显卡'), detail: t('装进工作站，+{n}P').replace('{n}', String(HOMESTEAD.compute.gpu)), price: `${HOMESTEAD.shop.gpu}M` },
  { item: 'battery', name: t('蓄电池'), detail: t('多一组：容量 +{capacity} 电·时，输出 +{output}').replace('{capacity}', String(HOMESTEAD.power.batteryCapacity)).replace('{output}', String(HOMESTEAD.power.batteryOutput)), price: `${HOMESTEAD.shop.battery}M` },
] : [
  { item: 'lv2', name: t('Lv2 升级组件'), detail: t('能采石，飞行高度 5 格，载重 15'), price: `${HOMESTEAD.shop.lv2}M` },
  { item: 'robot', name: t('第二台无人机'), detail: t('机器人坞 {n} 个机位').replace('{n}', String(HOMESTEAD.shop.maxRobots)), price: t('木材 {n}').replace('{n}', String(HOMESTEAD.shop.robotWood)) },
];

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent: HTMLElement, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  parent.append(node);
  return node;
}

const clock = (second: number): string => `${String(Math.floor(second / 3600)).padStart(2, '0')}:${String(Math.floor(second % 3600 / 60)).padStart(2, '0')}`;

export function createHomesteadHud(parent: HTMLElement, options: HomesteadHudOptions): HomesteadHud {
  const root = element('div', 'homestead-hud', parent);
  const bar = element('div', 'hs-bar', root);
  const time = element('span', 'hs-time', bar);
  const power = element('span', '', bar);
  const compute = element('span', '', bar);
  const tokens = element('span', 'hs-tokens', bar);
  const goods = element('span', '', bar);
  const ultimate = element('span', '', bar);
  const mode = element('button', 'hs-mode', bar);
  mode.type = 'button';
  const drones = element('div', 'hs-drones', root);
  const droneLines: HTMLDivElement[] = [];
  const marksLine = element('div', 'hs-marks', drones);
  const photon = element('div', 'hs-photon', root);
  const photonTitle = element('strong', '', photon);
  const photonLine = element('span', '', photon);
  const command = element('div', 'hs-command', root);
  const commandToggle = element('button', 'hs-command-toggle', command);
  commandToggle.type = 'button';
  const tools = element('div', 'hs-tools', command);
  const toolButtons = new Map<Tool, HTMLButtonElement>();
  for (const tool of ['mark', 'chop', 'dig', 'cancel', 'solar', 'depot'] as const) {
    const button = element('button', 'hs-tool', tools);
    button.type = 'button';
    toolButtons.set(tool, button);
  }
  const hint = element('span', 'hs-hint', tools);
  const actions = element('div', 'hs-actions', root);
  const residence = element('a', 'hs-action', actions);
  residence.href = './?mode=homestead&scene=residence';
  const terminalButton = element('button', 'hs-action', actions);
  terminalButton.type = 'button';
  const sleepButton = element('button', 'hs-action', actions);
  sleepButton.type = 'button';
  const toast = element('div', 'hs-toast', root);
  toast.setAttribute('role', 'status');

  const overlay = element('div', 'hs-overlay', parent);
  const selection = element('div', 'hs-select', overlay);

  const shop = document.createElement('dialog');
  shop.className = 'hs-shop';
  parent.append(shop);
  const shopTitle = element('h2', '', shop);
  const shopBalance = element('p', 'hs-shop-balance', shop);
  const shopList = element('div', 'hs-shop-list', shop);
  const shopClose = element('button', 'hs-shop-close', shop);
  shopClose.type = 'button';

  const settle = document.createElement('dialog');
  settle.className = 'npc-dialogue hs-settle';
  settle.dataset.speaker = 'tibo';
  settle.innerHTML = `<div class="npc-dialogue-portrait"><img alt="" draggable="false"></div>
    <div class="npc-dialogue-content"><header><h2>Tibo</h2><span class="npc-dialogue-topic"></span></header><p></p>
    <footer><button type="button" data-next><span></span><span aria-hidden="true">→</span></button></footer></div>`;
  settle.querySelector('img')!.src = npcModel('tibo', 'human').image;
  parent.append(settle);
  const settleLine = settle.querySelector('p')!;

  let commanding = false;
  let tool: Tool = 'mark';
  let terminal: HomesteadTerminal | null = null;
  let shownSettlement: HomesteadState['economy']['lastSettlement'] = options.state().economy.lastSettlement;
  let toastTimer = 0;
  let drag: { x: number; y: number; cx: number; cy: number } | null = null;

  const say = (text: string): void => {
    toast.textContent = text;
    toast.classList.add('hs-toast-on');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('hs-toast-on'), 2400);
  };
  const setCommanding = (on: boolean): void => {
    commanding = on;
    root.classList.toggle('hs-commanding', on);
    overlay.classList.toggle('hs-overlay-on', on);
    commandToggle.textContent = t(on ? '退出指挥模式（Tab）' : '指挥模式（Tab）');
    if (!on) {
      drag = null;
      selection.hidden = true;
      options.onPreview(null, { x: 0, y: 0 });
    }
  };
  const setTool = (next: Tool): void => {
    tool = next;
    for (const [key, button] of toolButtons) button.classList.toggle('hs-tool-on', key === next);
    hint.textContent = toolHint(next);
    if (next !== 'solar' && next !== 'depot') options.onPreview(null, { x: 0, y: 0 });
  };
  const toolHint = (next: Tool): string => next === 'mark' ? t('左键点树或拖框圈地：框里有树就砍树，否则挖地块。红色区域还有敌人，清场后无人机才会进去')
    : next === 'chop' ? t('左键点树或拖框：只砍树，不挖地块')
    : next === 'dig' ? t('左键点选或拖框：只挖自然地块；树根与设施地基受保护，石头需要 Lv2')
    : next === 'cancel' ? t('左键点选或拖框，取消框里的标记和施工轮廓（退还材料）')
    : next === 'solar' ? t('左键点一个空格子，或拖框一次铺满；板要放在实心格子上面，每格发电 {n}').replace('{n}', String(HOMESTEAD.power.solarPerPanel))
    : t('移动鼠标选位置，左键放下轮廓；材料当场扣除');
  const toolLabel = (key: Tool): string => key === 'mark' ? t('自动采集') : key === 'chop' ? t('砍树') : key === 'dig' ? t('挖掘')
    : key === 'cancel' ? t('取消标记/施工')
    : key === 'solar' ? t('太阳能板（每格 木 {wood}）').replace('{wood}', String(HOMESTEAD.builds.solar.wood))
    : t('仓库扩容（木 {wood} 石 {stone}）').replace('{wood}', String(HOMESTEAD.builds.depot.wood)).replace('{stone}', String(HOMESTEAD.builds.depot.stone));
  const openDialog = (dialog: HTMLDialogElement): void => {
    options.onOpen();
    dialog.showModal();
  };
  const renderShop = (): void => {
    const state = options.state();
    shopTitle.textContent = t(terminal === 'compute' ? '算力组件终端' : '机器人技师终端');
    shopBalance.textContent = `Token ${Math.floor(state.economy.tokens)}M · ${t('木材 {n}').replace('{n}', String(state.wood))}`;
    shopList.replaceChildren(...shopEntries(terminal!).map(entry => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'hs-shop-item';
      row.innerHTML = '<strong></strong><span></span><em></em>';
      row.querySelector('strong')!.textContent = entry.name;
      row.querySelector('span')!.textContent = entry.detail;
      row.querySelector('em')!.textContent = entry.price;
      row.addEventListener('click', () => {
        const result = options.onBuy(entry.item);
        say(result === 'ok' ? t('已购买：{name}').replace('{name}', entry.name) : t(PURCHASE_TEXT[result]));
        renderShop();
      });
      return row;
    }));
  };

  const area = (a: Vec2, b: Vec2): Rect => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
  overlay.addEventListener('pointerdown', event => {
    event.preventDefault();
    if (event.button === 2) {
      const at = options.toWorld(event.clientX, event.clientY);
      if (at) say(t(options.onCancel({ x: at.x - 0.5, y: at.y - 0.5, w: 1, h: 1 }) > 0 ? '已取消' : '这里没有标记或施工'));
      return;
    }
    if (event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, cx: event.clientX, cy: event.clientY };
    overlay.setPointerCapture(event.pointerId);
  });
  overlay.addEventListener('pointermove', event => {
    if (tool === 'solar' || tool === 'depot') {
      const at = options.toWorld(event.clientX, event.clientY);
      if (at) options.onPreview(tool, at);
    }
    if (!drag || tool === 'depot') return;
    drag.cx = event.clientX;
    drag.cy = event.clientY;
    selection.hidden = false;
    Object.assign(selection.style, {
      left: `${Math.min(drag.x, drag.cx)}px`, top: `${Math.min(drag.y, drag.cy)}px`,
      width: `${Math.abs(drag.cx - drag.x)}px`, height: `${Math.abs(drag.cy - drag.y)}px`,
    });
  });
  overlay.addEventListener('pointerup', event => {
    if (!drag || event.button !== 0) return;
    const start = options.toWorld(drag.x, drag.y);
    const end = options.toWorld(event.clientX, event.clientY);
    drag = null;
    selection.hidden = true;
    if (!start || !end) return;
    if (tool === 'depot') {
      const result = options.onPlaceDepot(end.x);
      say(t(result === 'ok' ? '已放下施工轮廓，无人机会来施工' : BUILD_TEXT[result]));
      return;
    }
    const rect = area(start, end);
    if (tool === 'solar') {
      const result = options.onPlaceSolar(rect);
      say(result.placed > 0 ? t('已放下 {n} 格太阳能板轮廓，无人机会来施工').replace('{n}', String(result.placed)) : t(BUILD_TEXT[result.reason!]));
      return;
    }
    // 单击也给半格的余量，方便点中细小的树干。
    const picked = { x: rect.x - 0.25, y: rect.y - 0.25, w: rect.w + 0.5, h: rect.h + 0.5 };
    if (tool === 'mark' || tool === 'chop' || tool === 'dig') {
      const added = options.onMark(picked, tool === 'mark' ? 'auto' : tool);
      say(added > 0 ? t('新增 {n} 个标记').replace('{n}', String(added)) : t('框里没有可以采集的东西（小灌木只是装饰；设施脚下和小屋旁的地块受保护）'));
    } else say(t(options.onCancel(picked) > 0 ? '已取消' : '框里没有标记或施工'));
  });

  const onKey = (event: KeyboardEvent): void => {
    if (event.code !== 'Tab' || shop.open || settle.open) return;
    event.preventDefault();
    setCommanding(!commanding);
  };
  window.addEventListener('keydown', onKey);
  commandToggle.addEventListener('click', () => setCommanding(!commanding));
  for (const [key, button] of toolButtons) button.addEventListener('click', () => setTool(key));
  mode.addEventListener('click', () => options.onMode(options.state().economy.mode === 'production' ? 'tokens' : 'production'));
  terminalButton.addEventListener('click', () => {
    if (terminal === null) return;
    renderShop();
    openDialog(shop);
  });
  sleepButton.addEventListener('click', () => {
    options.onSleep();
  });
  shopClose.addEventListener('click', () => shop.close());
  settle.querySelector('button')!.addEventListener('click', () => settle.close());
  for (const dialog of [shop, settle]) {
    dialog.addEventListener('close', options.onClose);
    for (const type of ['keydown', 'pointerdown', 'mousedown', 'click']) dialog.addEventListener(type, e => e.stopPropagation());
  }
  for (const type of ['pointerdown', 'mousedown', 'click', 'keydown']) root.addEventListener(type, e => e.stopPropagation());
  const translate = (): void => {
    photonTitle.textContent = t('光子');
    for (const [key, button] of toolButtons) button.textContent = toolLabel(key);
    hint.textContent = toolHint(tool);
    commandToggle.textContent = t(commanding ? '退出指挥模式（Tab）' : '指挥模式（Tab）');
    residence.textContent = t('进入住宅建造 ↗');
    sleepButton.textContent = t('睡到天亮（跳过的时段收益七成）');
    shopClose.textContent = t('离开终端');
    settle.querySelector('.npc-dialogue-topic')!.textContent = t('天亮结算');
    settle.querySelector('[data-next] span')!.textContent = t('收下');
    if (shop.open) renderShop();
  };
  setCommanding(false);
  setTool('mark');
  translate();
  const unsubscribeLanguage = onLanguageChange(translate);

  const photonHint = (state: HomesteadState): string => {
    const m = state.milestones;
    if (!m.marked) return t('按 Tab 进入指挥模式，点一棵树，让无人机去砍。');
    if (!m.unloaded) return t('无人机在干活了。木材运回仓库之前，你可以去附近看看，清掉挡路的怪。');
    if (!m.built) return t('木材攒到 {n} 就能铺一格太阳能板：指挥模式里选「太阳能板」，点一个空格子放下。').replace('{n}', String(HOMESTEAD.builds.solar.wood));
    if (!m.night) return t('天快黑了。太阳能一停，工作站就没电，只剩我身上的 2P。');
    if (!m.settled) return t('夜里野外的怪更凶。可以回家规划，也可以在小屋里睡到天亮（收益七成）。天亮 Tibo 会来结算。');
    return t('第一天过去了。去终端看看：买显卡、升级无人机，还是再造一台？');
  };

  return {
    get open() { return shop.open || settle.open; },
    get commanding() { return commanding; },
    command(next) {
      options.onOpen();
      setTool(next === 'build' ? 'solar' : next);
      setCommanding(true);
    },
    update() {
      const state = options.state();
      const e = state.economy;
      const used = e.robots.reduce((sum, r) => sum + r.compute, 0);
      const date = calendarOf(e.day);
      time.textContent = t('第 {day} 天 · {season}季第 {date} 天 {clock} {period} · {moon}')
        .replace('{day}', String(e.day - e.startDay + 1)).replace('{season}', t(SEASON_NAMES[date.season]!)).replace('{date}', String(date.dayOfSeason))
        .replace('{clock}', clock(e.second)).replace('{period}', t(isDaytime(e) ? '白天' : '夜晚')).replace('{moon}', t(MOON_PHASE_NAMES[moonPhase(e)]!));
      const supply = e.solar + (e.stored > 0 ? e.batteries * HOMESTEAD.power.batteryOutput : 0);
      power.textContent = t('电 可供 {supply} / 在用 {used} · 储能 {stored}/{capacity}').replace('{supply}', String(supply)).replace('{used}', e.powerUsed.toFixed(1))
        .replace('{stored}', e.stored.toFixed(1)).replace('{capacity}', String(e.batteries * HOMESTEAD.power.batteryCapacity));
      compute.textContent = t('算力 {n}').replace('{n}', `${used}/${e.computeTotal}P`);
      tokens.textContent = t('Token {tokens}M（待结算 {pending}M）').replace('{tokens}', String(Math.floor(e.tokens))).replace('{pending}', e.pending.toFixed(1));
      goods.textContent = t('木 {wood}/{capacity} · 石 {stone}/{capacity}').replace('{wood}', String(state.wood)).replace('{stone}', String(state.stone)).replaceAll('{capacity}', String(state.capacity));
      ultimate.textContent = t('大招电量 {n}%').replace('{n}', String(Math.round(e.ultimate * 100))) + (e.ultimate < 1 && e.ultimatePower === 0 ? t('（没有富余电力）') : '');
      mode.textContent = t(e.mode === 'production' ? '生产优先' : '收益优先');
      mode.title = t(e.mode === 'production' ? '多出来的算力给无人机加速，剩下的换 Token' : '无人机只拿最低算力，其余全部换 Token');
      const blocked = new Map<string, number>();
      for (const item of [...state.marks, ...state.sites]) if (item.blocked !== null) blocked.set(BLOCK_TEXT[item.blocked], (blocked.get(BLOCK_TEXT[item.blocked]) ?? 0) + 1);
      while (droneLines.length < state.drones.length) droneLines.push(drones.insertBefore(document.createElement('div'), marksLine));
      state.drones.forEach((drone, i) => {
        const line = droneLines[i]!;
        line.className = `hs-drone hs-drone-${drone.status}`;
        line.textContent = `${t('无人机 {n}').replace('{n}', String(i + 1))} · Lv${drone.robot.level} · ${t(STATUS_TEXT[drone.status])} · ${t('电量 {n}%').replace('{n}', String(Math.round(drone.robot.battery * 100)))} · ${drone.robot.compute}P${targetText(drone.task)}`;
      });
      marksLine.hidden = state.marks.length + state.sites.length === 0;
      marksLine.textContent = t('标记 {marks} 个 · 施工 {sites} 处').replace('{marks}', String(state.marks.length)).replace('{sites}', String(state.sites.length))
        + [...blocked].map(([text, count]) => ` · ${t('{n} 个{reason}').replace('{n}', String(count)).replace('{reason}', t(text))}`).join('');
      photonLine.textContent = photonHint(state);
      terminal = options.terminal();
      terminalButton.hidden = terminal === null;
      terminalButton.textContent = t(terminal === 'compute' ? '使用算力组件终端' : '使用机器人技师终端');
      sleepButton.hidden = !options.canSleep();
      if (e.lastSettlement !== shownSettlement && e.lastSettlement !== null) {
        shownSettlement = e.lastSettlement;
        const { amount, subsidy } = e.lastSettlement;
        settleLine.textContent = t('昨天闲置的算力替周边避难所跑了计算任务，结算 {n}M Token。').replace('{n}', amount.toFixed(1))
          + (subsidy > 0 ? `\n${t('第一次结算另给你 {n}M 初始化补助，挑一件趁手的东西吧。').replace('{n}', String(subsidy))}` : '');
        if (!settle.open) {
          setCommanding(false);
          openDialog(settle);
        }
      }
    },
    dispose() {
      unsubscribeLanguage();
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(toastTimer);
      root.remove();
      overlay.remove();
      shop.remove();
      settle.remove();
    },
  };
}
