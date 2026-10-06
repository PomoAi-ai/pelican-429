import type { ShowcaseCard } from '../config/showcase.ts';
import { NPCS } from '../config/npc.ts';
import type { ShowcaseModel } from './showcase-model.ts';
import { createCard } from './showcase-panel.ts';
import type { PreviewCardView } from './showcase-panel.ts';
import { translateShowcaseText } from './showcase-language.ts';
import { writeCharacterStageLocation } from './character-stage-location.ts';
import type { CharacterStageView } from './character-stage-location.ts';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, parent: HTMLElement, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className; node.textContent = text; parent.append(node);
  return node;
}

function button(parent: HTMLElement, label: string, action: () => void, className = ''): HTMLButtonElement {
  const node = element('button', parent, className, label);
  node.type = 'button'; node.addEventListener('click', action);
  return node;
}

function createDirectory(parent: HTMLElement, model: ShowcaseModel, addActor: (id: string) => void) {
  const searchWrap = element('div', parent, 'sc-search');
  const search = element('input', searchWrap, '');
  search.type = 'search'; search.placeholder = '搜索角色…'; search.setAttribute('aria-label', '搜索角色目录');
  const heading = element('div', parent, 'sc-directory-heading');
  element('span', heading, '', '角色目录');
  element('span', heading, '', `${model.catalog.subjects.length}`);
  const directory = element('nav', parent, 'sc-stage-directory');
  directory.setAttribute('aria-label', '角色目录');
  const rows = model.catalog.subjects.map((actor) => {
    const row = element('div', directory, 'sc-stage-directory-row');
    const show = button(row, '', () => addActor(actor.id), 'sc-stage-select');
    show.setAttribute('aria-label', `添加${actor.name}到场景`);
    show.title = actor.description;
    const image = element('img', show, '');
    image.src = actor.image; image.alt = ''; image.loading = 'lazy'; image.decoding = 'async';
    const text = element('span', show, 'sc-stage-subject');
    element('strong', text, '', actor.name);
    const count = element('span', text, 'sc-stage-subject-count');
    return { actor, row, show, count };
  });
  const empty = element('p', directory, 'sc-no-results', '没有匹配的角色');
  empty.hidden = true;
  search.addEventListener('input', () => {
    const query = search.value.trim().toLocaleLowerCase();
    for (const { actor, row } of rows) row.hidden = ![actor.name, actor.id, actor.description, translateShowcaseText(actor.name), translateShowcaseText(actor.description)].join(' ').toLocaleLowerCase().includes(query);
    empty.hidden = rows.some(({ row }) => !row.hidden);
  });
  return () => {
    for (const { actor, row, show, count } of rows) {
      const instances = model.cards.filter((card) => model.entry(card.entryId).actor === actor.id).length;
      row.classList.toggle('sc-selected', instances > 0);
      count.textContent = instances > 0 ? `场景中 ${instances} 个` : '点击添加到场景';
      show.disabled = model.full;
      show.title = model.full ? `场景最多 ${model.catalog.maxCards} 个角色，请先移除一个` : '添加到场景，保留已有角色';
    }
  };
}

export function createCharacterStagePanel(parent: HTMLElement, model: ShowcaseModel, returnUrl: string, onNpcSound: (card: ShowcaseCard, enabled: boolean) => Promise<void>, view: CharacterStageView) {
  const root = element('div', parent, 'showcase-app sc-character-stage');
  const sidebar = element('aside', root, 'sc-sidebar');
  sidebar.id = 'character-stage-directory';
  const brand = element('div', sidebar, 'sc-brand');
  element('span', brand, 'sc-brand-mark', 'P');
  const brandText = element('div', brand, '');
  element('strong', brandText, '', '角色展示场');
  element('span', brandText, '', 'PELICAN 429 · CHARACTER STUDIO');
  const libraries = element('nav', sidebar, 'sc-library-tabs');
  libraries.setAttribute('aria-label', '角色资料库导航');
  const current = element('a', libraries, '', '角色场景');
  current.href = './?mode=showcase'; current.setAttribute('aria-current', 'page');
  const history = element('a', libraries, '', '历史资料'); history.href = './?mode=showcase&library=history';
  const compare = element('a', libraries, '', '画质对比'); compare.href = './?mode=compare';
  const main = element('main', root, 'sc-stage-main');
  const toolbar = element('header', main, 'sc-stage-toolbar');
  const directoryToggle = button(toolbar, '☰ 目录', () => {
    const open = root.classList.toggle('sc-directory-open');
    directoryToggle.setAttribute('aria-expanded', String(open));
  }, 'sc-stage-directory-toggle');
  directoryToggle.setAttribute('aria-controls', sidebar.id);
  directoryToggle.setAttribute('aria-expanded', 'false');
  const title = element('div', toolbar, 'sc-stage-title');
  element('strong', title, '', '角色场景');
  const count = element('span', title, '');
  const controls = element('div', toolbar, 'sc-stage-global-controls');
  const texturesLabel = element('label', controls, 'sc-control', '贴图对比');
  const textures = element('select', texturesLabel, '');
  textures.setAttribute('aria-label', '贴图档位对比');
  for (const [value, label] of [['ktx2-compact', '512 · 贴图＋模型压缩'], ['ktx2-256-compact', '256 · 贴图＋模型压缩'], ['ktx2', 'KTX2 · 512'], ['web', 'WebP · 512'], ['original', '原始高清']] as const) {
    const option = element('option', textures, '', label); option.value = value;
  }
  textures.value = new URLSearchParams(location.search).get('textures') ?? 'ktx2-compact';
  textures.addEventListener('change', () => {
    const url = new URL(location.href);
    url.searchParams.set('textures', textures.value);
    url.searchParams.delete('demo');
    writeCharacterStageLocation(url.searchParams, model.cards, { zoom: Number(zoom.value), angle: view.angle, environment: environment.value as ShowcaseCard['environment'] });
    location.assign(url.href);
  });
  button(controls, '▶ 播放', () => model.all({ playing: true }));
  button(controls, 'Ⅱ 暂停', () => model.all({ playing: false }));
  button(controls, '↺ 重播', () => model.reset());
  const environmentLabel = element('label', controls, 'sc-control', '环境');
  const environment = element('select', environmentLabel, ''); environment.setAttribute('aria-label', '场景环境');
  for (const [value, label] of [['surface', '地上'], ['underground', '地下']] as const) {
    const option = element('option', environment, '', label); option.value = value;
  }
  environment.value = view.environment;
  const applyEnvironment = (): void => {
    const next = environment.value as ShowcaseCard['environment'];
    for (const card of model.cards) if (card.environment !== next) model.update(card, { environment: next }, true);
  };
  applyEnvironment();
  environment.addEventListener('change', applyEnvironment);
  const zoomLabel = element('label', controls, 'sc-stage-zoom', '缩放');
  const zoom = element('input', zoomLabel, '');
  zoom.type = 'range'; zoom.min = '0.65'; zoom.max = '12'; zoom.step = '0.05'; zoom.value = String(view.zoom); zoom.setAttribute('aria-label', '场景镜头缩放');
  const resetCamera = element('button', controls, '', '重置镜头');
  resetCamera.type = 'button';
  const viewport = element('div', main, 'sc-stage-viewport');
  viewport.setAttribute('role', 'region'); viewport.setAttribute('aria-label', '角色展示场景');
  const actionbar = element('section', viewport, 'sc-stage-actionbar');
  actionbar.setAttribute('aria-label', '当前角色操作栏');
  actionbar.hidden = true;
  const hideDirectory = (): void => { root.classList.remove('sc-directory-open'); directoryToggle.setAttribute('aria-expanded', 'false'); };
  const refreshDirectory = createDirectory(sidebar, model, (id) => {
    model.addActor(id);
    applyEnvironment(); hideDirectory();
  });
  const bottom = element('div', sidebar, 'sc-stage-sidebar-bottom');
  const demos = element('details', bottom, 'sc-stage-demos');
  element('summary', demos, '', '演示组合');
  for (const demo of model.catalog.demos!) button(demos, demo.title, () => {
    model.showDemo(demo); applyEnvironment(); hideDirectory();
  });
  element('p', bottom, '', '点击角色添加到场景；可重复添加。');
  const links = element('div', bottom, 'sc-stage-links');
  const back = element('a', links, '', '返回游戏 ↗'); back.href = returnUrl;
  const home = element('a', links, '', '首页索引'); home.href = './';
  const hint = element('div', viewport, 'sc-stage-hint', '拖动 / 单指移动镜头 · 滚轮 / 双指缩放 · 点击空白切换角度');
  const empty = element('div', viewport, 'sc-stage-empty');
  element('strong', empty, '', '场景中还没有角色');
  element('p', empty, '', '点击左侧角色即可添加。');
  const overlay = element('div', viewport, 'sc-stage-overlay');
  const status = element('footer', main, 'sc-stage-status');
  const note = element('span', status, '', '正在准备场景…');
  button(status, '清空场景', () => model.clear());
  const views = new Map<number, PreviewCardView>();
  const panels = new Map<number, { body: HTMLElement; name: HTMLElement; toggle: HTMLButtonElement }>();
  const setExpanded = (id: number, open: boolean): void => {
    for (const [key, panel] of panels) {
      const expanded = key === id && open;
      panel.body.hidden = !expanded;
      panel.toggle.textContent = expanded ? '收起' : '控制';
      panel.toggle.setAttribute('aria-expanded', String(expanded));
      views.get(key)!.root.classList.toggle('sc-expanded', expanded);
    }
    actionbar.hidden = !open;
  };
  const refresh = (): void => {
    const ids = new Set(model.cards.map((card) => card.id));
    for (const [id, view] of views) if (!ids.has(id)) { view.dispose(); views.delete(id); panels.get(id)!.body.remove(); panels.delete(id); }
    for (const card of model.cards) {
      if (!views.has(card.id)) {
        const view = createCard(overlay, card, model, onNpcSound, true);
        views.set(card.id, view);
        view.root.classList.add('sc-stage-actor');
        const header = view.root.querySelector<HTMLElement>('.sc-card-header')!;
        const body = element('div', actionbar, 'sc-stage-actor-body');
        body.id = `stage-controls-${card.id}`; body.hidden = true;
        const label = element('div', body, 'sc-stage-control-label');
        const name = element('strong', label, '');
        element('span', label, 'sc-stage-control-arrow', '→');
        const closeControls = button(label, '×', () => setExpanded(card.id, false), 'sc-stage-close-controls');
        closeControls.setAttribute('aria-label', '关闭角色操作栏');
        for (const child of [...view.root.children]) if (child !== header) body.append(child);
        const assets = element('details', body, 'sc-stage-control-assets');
        element('summary', assets, '', '图片资料');
        assets.append(body.querySelector('.sc-assets')!);
        const entry = model.entry(card.entryId);
        if ((entry.actor === 'sam' || entry.actor === 'tibo') && NPCS[entry.actor].forms.length > 1) {
          const transform = button(header, '变身', () => {
            model.changeNpcForm(card, model.entry(card.entryId).npcForm === 'human' ? 'monster' : 'human');
            model.update(card, { playing: true });
          });
          transform.setAttribute('aria-label', '切换人形和怪物形态');
        }
        const toggle = button(header, '控制', () => setExpanded(card.id, body.hidden === true), 'sc-stage-expand');
        toggle.setAttribute('aria-controls', body.id); toggle.setAttribute('aria-expanded', 'false');
        panels.set(card.id, { body, name, toggle });
      }
      views.get(card.id)!.refresh();
      panels.get(card.id)!.name.textContent = views.get(card.id)!.root.querySelector('.sc-card-name strong')!.textContent;
    }
    actionbar.hidden = ![...panels.values()].some(({ body }) => !body.hidden);
    refreshDirectory();
    count.textContent = `${model.cards.length} / ${model.catalog.maxCards}`;
    hint.hidden = model.cards.length === 0; empty.hidden = model.cards.length !== 0;
  };
  refresh();
  const unsubscribe = model.subscribe(refresh);
  return {
    root, viewport, views, resetCamera,
    get zoom() { return Number(zoom.value); },
    setZoom(value: number) { zoom.value = String(value); },
    get environment() { return environment.value as ShowcaseCard['environment']; },
    setNote(text: string) { if (note.textContent !== text) note.textContent = text; },
    position(points: readonly { id: number; x: number; y: number }[]) {
      const placed: Array<{ left: number; top: number }> = [];
      for (const { id, x, y } of points) {
        const view = views.get(id)!;
        const half = Math.min(115, viewport.clientWidth / 2 - 8);
        const left = Math.max(half + 8, Math.min(viewport.clientWidth - half - 8, x));
        let top = Math.max(82, Math.min(viewport.clientHeight - 48, y));
        for (let step = 0; step < model.catalog.maxCards * 2; step++) {
          const candidate = top + Math.ceil(step / 2) * 52 * (step % 2 ? -1 : 1);
          if (candidate < 70 || candidate > viewport.clientHeight - 12) continue;
          if (placed.some(other => Math.abs(other.left - left) < half * 2 + 4 && Math.abs(other.top - candidate) < 50)) continue;
          top = candidate;
          break;
        }
        placed.push({ left, top });
        view.root.style.left = `${left}px`; view.root.style.top = `${top}px`;
      }
    },
    dispose() { unsubscribe(); for (const view of views.values()) view.dispose(); views.clear(); panels.clear(); root.remove(); },
  };
}
