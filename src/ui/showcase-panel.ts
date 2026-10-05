import { isEnemyKind } from '../config/enemy-models.ts';
import { WIND_LABELS } from '../config/weather-rules.ts';
import { GRASSY_ANIMATED_MODELS, GRASSY_FLIGHTS, isGrassyAttack } from '../config/grassy.ts';
import { showcaseEntry } from '../config/showcase.ts';
import { createResourceControls } from './resource-controls.ts';
import type { ShowcaseCard } from '../config/showcase.ts';
import type { ShowcaseModel } from './showcase-model.ts';
import { createCharacterAssets } from './character-assets.ts';
import { createLabControls, labCardText } from './lab-controls.ts';
import { attachResourceCameraInteraction, createResourceCameraControls } from './resource-camera-controls.ts';
import { createModelCameraControls } from './model-camera-controls.ts';

export interface PreviewCardView {
  readonly root: HTMLElement;
  readonly viewport: HTMLElement;
  update(status: string, progress: number, waiting: boolean): void;
  refresh(showDetails?: boolean): void;
  dispose(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  node.textContent = text;
  parent.append(node);
  return node;
}

function button(parent: HTMLElement, label: string, action: () => void, cls = ''): HTMLButtonElement {
  const node = el('button', cls, parent, label);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

function select(parent: HTMLElement, label: string, values: ReadonlyArray<readonly [string, string]>, change: (value: string) => void): HTMLSelectElement {
  const wrap = el('label', 'sc-control', parent);
  el('span', '', wrap, label);
  const node = el('select', '', wrap);
  node.setAttribute('aria-label', label);
  for (const [value, title] of values) { const option = el('option', '', node, title); option.value = value; }
  node.addEventListener('change', () => change(node.value));
  return node;
}

const speeds: ReadonlyArray<readonly [string, string]> = [['0.25', '0.25×'], ['0.5', '0.5×'], ['1', '1×']];

function createCard(parent: HTMLElement, card: ShowcaseCard, model: ShowcaseModel): PreviewCardView {
  const root = el('article', 'sc-card', parent);
  root.dataset.cardId = String(card.id);
  const header = el('header', 'sc-card-header', root);
  const name = el('div', 'sc-card-name', header);
  const portrait = el('img', 'sc-card-portrait', name);
  portrait.alt = ''; 
  const title = el('strong', '', name);
  const index = el('span', 'sc-card-index', header, `#${String(card.id).padStart(2, '0')}`);
  index.setAttribute('aria-hidden', 'true');
  const close = button(header, '×', () => model.close(card.id), 'sc-close');
  close.setAttribute('aria-label', '关闭预览');
  const isResource = model.catalog.mode !== 'showcase';
  if (!isResource) {
    const actor = showcaseEntry(card.entryId).actor;
    createCharacterAssets(root, actor, card.id, model.catalog.library === 'history', model.activeDemo?.id !== 'pelican-combat' && !(actor === 'human' && card.humanView === 'world'));
  }
  const caption = isResource ? el('p', 'sc-card-caption', root) : null;
  const gameLink = isResource ? el('a', 'sc-composition-game', header, '进入游戏 ↗') : null;
  const actions = el('div', 'sc-actions', root);
  actions.setAttribute('role', 'group');
  actions.setAttribute('aria-label', isResource ? '资源变体选择' : '动作选择');
  const actionButtons = new Map<string, HTMLButtonElement>();
  const equipmentCharacter = !isResource && model.entry(card.entryId).actor === 'human' && model.catalog.library !== 'history';
  const humanView = equipmentCharacter ? select(actions, '展示方式', [['world', '横版实战'], ['model', '模型查看']], (value) => model.update(card, { humanView: value as ShowcaseCard['humanView'], manual: false }, true)) : null;
  const attackMotion = equipmentCharacter ? select(actions, '移动施法', [['still', '静止'], ['walk', '行走'], ['run', '跑步']], (value) => model.update(card, { attackMotion: value as ShowcaseCard['attackMotion'] }, true)) : null;
  const quality = equipmentCharacter ? select(actions, '模型精细度', GRASSY_ANIMATED_MODELS.map((item) => [item.id, item.label]), (variant) => {
    const current = model.entry(card.entryId);
    const { flight } = current.grassyAnimation!;
    const next = model.catalog.entries.find((entry) => entry.grassyAnimation?.variant === variant && entry.action === current.action && entry.grassyAnimation.flight === flight)!;
    model.changeAction(card, next.id);
  }) : null;
  const flightControl = equipmentCharacter ? select(actions, '施法姿态', [['ground', '地面施法'], ...GRASSY_FLIGHTS.map((item): readonly [string, string] => [item.id, item.label])], (value) => {
    const current = model.entry(card.entryId);
    const { variant } = current.grassyAnimation!;
    const flight = value === 'ground' ? undefined : value;
    const next = model.catalog.entries.find((entry) => entry.grassyAnimation?.variant === variant && entry.action === current.action && entry.grassyAnimation.flight === flight)!;
    model.changeAction(card, next.id);
  }) : null;
  const actionList = el('div', 'sc-action-list', actions);
  const viewport = el('div', 'sc-viewport', root);
  viewport.tabIndex = 0;
  viewport.setAttribute('role', 'img');
  const cameraInteraction = card.resource ? attachResourceCameraInteraction(viewport, card, model) : null;
  const badges = el('div', 'sc-badges', viewport);
  const environmentBadge = el('span', '', badges);
  const live = el('span', 'sc-live', badges, '准备场景');
  const instruction = el('div', 'sc-manual-hint', viewport, '点击画面后：A/D 移动 · Space 跳跃 · Shift 慢走 · J/K 普攻 · 右键副攻 · 1–3 技能 · E 大招 · R 骑车 · F 变身');
  instruction.hidden = true;
  const footer = el('div', 'sc-card-controls', root);
  const mainRow = el('div', 'sc-card-row', footer);
  const environment = select(mainRow, '环境', [['surface', '地上'], ['underground', '地下']], (value) => model.update(card, { environment: value as ShowcaseCard['environment'] }, true));
  let modelCamera: ReturnType<typeof createModelCameraControls> | null = null;
  const resourceControls = card.resource ? createResourceControls(footer, card, model) : null;
  const controls = el('div', 'sc-card-row', footer);
  const play = button(controls, '暂停', () => model.update(card, { playing: !card.playing }));
  button(controls, '重播', () => { model.update(card, { playing: true }, true); });
  const loop = button(controls, '循环', () => model.update(card, { loop: !card.loop }));
  const facing = button(controls, '朝右 →', () => model.update(card, { facing: card.facing === 1 ? -1 : 1 }, true));
  const targetDodge = button(controls, '目标躲避', () => model.update(card, { targetDodge: !card.targetDodge, playing: true }, true));
  const speed = select(controls, '速度', speeds, (value) => model.update(card, { speed: Number(value) }));
  const extra = el('div', 'sc-card-row sc-secondary', footer);
  const duplicate = button(extra, '＋ 添加对照', () => model.duplicate(card), 'sc-compare');
  const manual = button(extra, '手动控制', () => { model.update(card, { manual: !card.manual }); viewport.focus(); });
  const zoomWrap = el('label', 'sc-zoom', extra, '缩放');
  const zoom = el('input', '', zoomWrap);
  zoom.type = 'range'; zoom.min = '0.65'; zoom.max = '2.5'; zoom.step = '0.05'; zoom.value = '1';
  zoom.setAttribute('aria-label', '镜头缩放');
  zoom.addEventListener('input', () => model.update(card, { zoom: Number(zoom.value) }));
  const details = isResource ? el('p', 'sc-resource-detail', footer) : null;
  const bottom = el('div', 'sc-card-bottom', footer);
  const state = el('span', '', bottom, '准备场景');
  const progress = el('progress', '', bottom); progress.max = 1; progress.value = 0;
  progress.setAttribute('aria-label', '动作进度');
  let actionSet = '';
  const refresh = (showDetails = false): void => {
    const entry = model.entry(card.entryId);
    const photon = entry.actor === 'human' && entry.action === 'photon_burst';
    const humanWorld = equipmentCharacter && card.humanView === 'world';
    const actorInfo = model.catalog.subjects.find((a) => a.id === entry.actor)!;
    const caveAssembly = entry.actor === 'cave' && card.resource?.assembly === true;
    const label = caveAssembly ? '完整洞穴' : entry.label;
    const flightLabel = entry.grassyAnimation?.flight ? ` · ${GRASSY_FLIGHTS.find((item) => item.id === entry.grassyAnimation!.flight)!.label}` : '';
    const overview = model.catalog.mode === 'lab' && model.activeDemo !== null;
    title.textContent = overview || card.resource?.composition ? labCardText(card, model).title : `${actorInfo.name} · ${label}${flightLabel}`;
    if (gameLink) {
      const options = card.resource!;
      gameLink.hidden = options.composition === null;
      if (options.composition) {
        gameLink.href = `/?${new URLSearchParams({ mode: 'game', level: 'composition', composition: options.composition, seed: String(options.seed), material: entry.action, environment: card.environment })}`;
        gameLink.setAttribute('aria-label', `进入游戏：${labCardText(card, model).title}`);
      } else gameLink.removeAttribute('href');
    }
    title.title = title.textContent;
    close.hidden = overview && !showDetails;
    portrait.hidden = overview;
    index.hidden = overview;
    footer.hidden = overview && !showDetails;
    actions.hidden = caveAssembly || (overview && !showDetails);
    portrait.src = actorInfo.image;
    duplicate.disabled = model.full;
    duplicate.title = model.full ? `最多同时预览 ${model.catalog.maxCards} 张卡，请先关闭一张` : '添加同项目对照';
    viewport.setAttribute('aria-label', `${actorInfo.name} ${label} 效果预览`);
    viewport.title = entry.description;
    root.classList.toggle('sc-resource-card', isResource);
    root.classList.toggle('sc-combat-wide', humanWorld || entry.actor === 'human' && entry.grassyAnimation !== undefined && ['keyboard_smash', 'codex_attack', 'bug_attack', 'server_overload'].includes(entry.grassyAnimation.clip));
    root.classList.toggle('sc-photon-stage', photon || (entry.actor === 'pelican' || entry.actor === 'luma') && entry.action === 'ultimate');
    const nextActionSet = `${entry.actor}:${entry.grassyAnimation?.variant ?? ''}:${entry.grassyAnimation?.flight ?? ''}`;
    if (actionSet !== nextActionSet) {
      actionSet = nextActionSet;
      actionList.replaceChildren();
      actionButtons.clear();
      const groups = new Map<string, HTMLElement>();
      for (const item of model.catalog.entries.filter((e) => e.actor === entry.actor && (!equipmentCharacter || (e.grassyAnimation!.variant === entry.grassyAnimation!.variant && (!(isGrassyAttack(e.grassyAnimation!.clip) || e.action === 'photon_burst') || e.grassyAnimation!.flight === entry.grassyAnimation!.flight))))) {
        let choices = groups.get(item.group);
        if (!choices) {
          const row = el('div', 'sc-action-row', actionList);
          el('span', 'sc-action-label', row, item.group);
          choices = el('div', 'sc-action-buttons', row);
          groups.set(item.group, choices);
        }
        const choice = button(choices, item.label, () => model.changeAction(card, item.id), 'sc-action-button');
        choice.title = item.description;
        actionButtons.set(item.id, choice);
      }
    }
    for (const [id, choice] of actionButtons) {
      choice.classList.toggle('sc-active', id === card.entryId);
      choice.setAttribute('aria-pressed', String(id === card.entryId));
    }
    if (humanView) { humanView.value = card.humanView; humanView.disabled = photon; }
    if (attackMotion) {
      attackMotion.value = card.attackMotion;
      attackMotion.parentElement!.hidden = !humanWorld || !(isGrassyAttack(entry.grassyAnimation!.clip) || photon) || entry.grassyAnimation!.flight !== undefined;
    }
    if (quality) quality.value = entry.grassyAnimation!.variant;
    if (flightControl) {
      flightControl.parentElement!.hidden = !(isGrassyAttack(entry.grassyAnimation!.clip) || photon);
      flightControl.value = entry.grassyAnimation!.flight ?? 'ground';
    }
    environment.value = card.environment;
    environmentBadge.textContent = card.environment === 'surface' ? '☀ 地上' : `◐ 地下${card.resource?.inspectionLight ? ' · 检视补光' : ''}`;
    environmentBadge.className = card.environment;
    play.textContent = card.playing ? 'Ⅱ 暂停' : '▶ 播放';
    play.setAttribute('aria-label', card.playing ? '暂停此预览' : '播放此预览');
    loop.classList.toggle('sc-active', card.loop); loop.setAttribute('aria-pressed', String(card.loop));
    const staticHuman = entry.actor === 'human' && !entry.grassyAnimation;
    controls.hidden = staticHuman;
    progress.hidden = staticHuman;
    actions.setAttribute('aria-label', entry.actor === 'human' ? equipmentCharacter ? '角色动作与精细度' : '历史模型版本选择' : isResource ? '资源变体选择' : '动作选择');
    const supportsModelView = isEnemyKind(entry.actor) || (entry.actor === 'human' && !humanWorld) || (entry.actor === 'luma' && entry.action !== 'ultimate');
    if (supportsModelView && !modelCamera) modelCamera = createModelCameraControls(mainRow, viewport, card, model);
    else if (!supportsModelView && modelCamera) {
      modelCamera.dispose(); modelCamera = null;
      viewport.setAttribute('role', 'img'); viewport.removeAttribute('title');
    }
    facing.hidden = isResource || (supportsModelView && !isEnemyKind(entry.actor));
    targetDodge.hidden = entry.actor !== 'sam' || entry.action !== 'skill1';
    targetDodge.classList.toggle('sc-active', card.targetDodge);
    targetDodge.setAttribute('aria-pressed', String(card.targetDodge));
    resourceControls?.refresh();
    if (caption && card.resource) {
      const settings = card.resource;
      const ground = entry.actor === 'terrain' || (entry.actor === 'grass' && entry.action === 'natural');
      const layers = ground ? `${({ single: '悬空单格', raised: '地面单格', flat: '连续平地', shapes: '四形状并列', steps: '阶梯', mixed: '材质邻接' })[settings.layout]} · ${({ ground: '仅瓦片', cover: '加入地被', flora: '加入花草', all: '完整植被' })[settings.vegetation]} · ` : '';
      caption.textContent = `${settings.assembly ? '场景组合 · ' : ''}${layers}${({ open: '空旷', wood: '树下', shore: '岸边', desert: '沙漠' })[settings.habitat]} · 种子 ${settings.seed} · ${WIND_LABELS[settings.wind]}`;
      if (settings.platforms && (entry.actor === 'tree' || (entry.actor === 'terrain' && entry.action === 'branch'))) caption.textContent += ' · 青线：可站立';
      if (overview || settings.composition) caption.textContent = labCardText(card, model).detail;
    }
    if (details) details.textContent = caveAssembly ? '完整洞穴按游戏规则生成地面与洞顶装饰；单件变体请通过完整目录查看。' : `${entry.id} · ${entry.description}`;
    facing.textContent = card.facing === 1 ? '朝右 →' : '← 朝左';
    speed.value = String(card.speed);
    zoom.value = String(card.zoom);
    manual.hidden = entry.actor !== 'pelican' && !humanWorld;
    instruction.textContent = humanWorld ? 'A/D 移动 · Shift 慢走 · Space 跳跃 / 持续推进飞行 · J/K 单手键盘 · 右键 Codex · 1 Bug · 2 超载 · 3/E 光子 · R 骑车 · F 变身' : 'A/D 移动 · Space 跳跃 · Shift 慢走 · J/K 普攻 · 右键副攻 · 1–3 技能 · E 大招 · R 骑车 · F 变身';
    manual.classList.toggle('sc-active', card.manual);
    instruction.hidden = !card.manual;
    root.classList.toggle('sc-manual', card.manual);
    cameraInteraction?.refresh();
    modelCamera?.refresh();
  };
  refresh();
  return {
    root, viewport, refresh,
    dispose() { cameraInteraction?.dispose(); modelCamera?.dispose(); root.remove(); },
    update(status, fraction, waiting) {
      state.textContent = status;
      progress.value = fraction;
      live.textContent = waiting ? '已暂停调度' : card.playing ? '● 实时预览' : 'Ⅱ 已暂停';
      live.classList.toggle('sc-waiting', waiting || !card.playing);
    },
  };
}

export function createShowcasePanel(parent: HTMLElement, model: ShowcaseModel, returnUrl: string) {
  const isResource = model.catalog.mode !== 'showcase';
  const isHistory = model.catalog.library === 'history';
  const subject = isResource ? '资源' : isHistory ? '历史角色' : '角色';
  const action = isResource ? '变体' : '动作';
  const root = el('div', 'showcase-app', parent);
  const sidebar = el('aside', 'sc-sidebar', root);
  const brand = el('div', 'sc-brand', sidebar);
  el('span', 'sc-brand-mark', brand, 'P');
  const brandText = el('div', '', brand);
  el('strong', '', brandText, model.catalog.title);
  el('span', '', brandText, 'PELICAN 429 · DEV STUDIO');
  if (!isResource) {
    const libraries = el('nav', 'sc-library-tabs', sidebar);
    libraries.setAttribute('aria-label', '角色资料库导航');
    for (const [historical, label, url] of [[false, '角色资料', '/?mode=showcase'], [true, '历史资料', '/?mode=showcase&library=history']] as const) {
      const link = el('a', '', libraries, label); link.href = url;
      if (isHistory === historical) link.setAttribute('aria-current', 'page');
    }
  }
  const demoViews = model.catalog.demos ? createDemoDirectory(sidebar, model) : [];
  const searchWrap = el('div', 'sc-search', sidebar);
  searchWrap.hidden = model.catalog.mode === 'lab';
  el('span', '', searchWrap, '⌕');
  const search = el('input', '', searchWrap);
  search.type = 'search'; search.placeholder = `搜索${subject}…`; search.setAttribute('aria-label', '搜索目录');
  const directoryHeading = el('div', 'sc-directory-heading', sidebar);
  el('span', '', directoryHeading, `${subject}目录`);
  const selectionCount = el('span', '', directoryHeading);
  directoryHeading.hidden = model.catalog.mode === 'lab';
  const directory = el('nav', 'sc-directory', sidebar);
  directory.hidden = model.catalog.mode === 'lab';
  directory.setAttribute('aria-label', isResource ? '资源分类目录' : '角色多选目录');
  let resourceBrowser: ReturnType<typeof createResourceBrowser>;
  const actorCards = model.catalog.subjects.map((actor) => {
    const label = el('label', 'sc-actor-card', directory);
    const image = el('img', 'sc-actor-image', label);
    image.classList.toggle('sc-character-image', !isResource);
    image.src = actor.image; image.alt = `${actor.name}预览图片`;
    const info = el('div', 'sc-actor-info', label);
    const row = el('div', 'sc-actor-title', info);
    el('strong', '', row, actor.name);
    const checkbox = el('input', '', row);
    checkbox.type = isResource ? 'radio' : 'checkbox'; checkbox.setAttribute('aria-label', `选择${actor.name}`);
    if (isResource) {
      checkbox.name = 'resource-category';
      checkbox.addEventListener('click', () => resourceBrowser.showCategory(actor.id));
    } else checkbox.addEventListener('change', () => model.selectActor(actor.id, checkbox.checked));
    el('span', 'sc-actor-description', info, actor.description);
    const meta = el('div', 'sc-actor-meta', info);
    const countEntries = model.catalog.entries.filter((e) => e.actor === actor.id);
    const itemCount = actor.id === 'human' && !isHistory ? new Set(countEntries.map((entry) => entry.action)).size : countEntries.length;
    el('span', '', meta, `${itemCount} 个${isHistory ? '历史模型' : action}`);
    const count = el('span', 'sc-instance-count', meta);
    return { actor, label, checkbox, count };
  });
  const noResults = el('p', 'sc-no-results', directory, `没有匹配的${subject}`);
  noResults.hidden = true;
  const sidebarBottom = el('div', 'sc-sidebar-bottom', sidebar);
  button(sidebarBottom, '清空选择', () => model.clear());
  const back = el('a', '', sidebarBottom, '↗ 返回游戏'); back.href = returnUrl;
  const home = el('a', 'sc-home-link', sidebarBottom, '首页索引'); home.href = '/';
  el('p', '', sidebarBottom, `最多 ${model.catalog.maxCards} 张预览卡 · ${action}在右侧切换`);
  const main = el('main', 'sc-main', root);
  let labDetails = false;
  const labControls = model.catalog.mode === 'lab' ? createLabControls(main, model, (open) => { labDetails = open; refresh(); }) : null;
  if (isResource) {
    const catalogParent = model.catalog.mode === 'lab' ? el('details', 'sc-lab-catalog', main) : main;
    if (model.catalog.mode === 'lab') el('summary', '', catalogParent, '完整资源目录（单独查看或分批预览）');
    resourceBrowser = createResourceBrowser(catalogParent, model);
  }
  const toolbar = el('div', 'sc-toolbar', main);
  const cameraControls = isResource ? createResourceCameraControls(toolbar, model, () => model.cards) : null;
  button(toolbar, '▶ 全部播放', () => model.all({ playing: true }), 'sc-primary');
  button(toolbar, 'Ⅱ 全部暂停', () => model.all({ playing: false }));
  button(toolbar, '↺ 全部重置', () => model.reset());
  select(toolbar, '统一速度', speeds, (v) => model.all({ speed: Number(v) })).value = '1';
  const allEnvironment = select(toolbar, '统一环境', [['', '各自设置'], ['surface', '全部地上'], ['underground', '全部地下']], (v) => {
    if (v) model.all({ environment: v as ShowcaseCard['environment'] }, true);
  });
  const sync = button(toolbar, '同步对比', () => model.sync(!model.synchronized));
  sync.title = '从同一起点播放；任一对比画面离屏时整组暂停';
  const scale = button(toolbar, '统一比例', () => model.scale(!model.worldScale));
  scale.title = '按相同的世界尺寸取景，比较实际尺寸';
  const scroll = el('div', 'sc-scroll', main);
  const empty = el('div', 'sc-empty', scroll);
  el('div', '', empty, '◫');
  el('h2', '', empty, `选择一个${subject}，开始查看`);
  el('p', '', empty, `勾选左侧${subject}卡；使用「添加对照」比较不同${action}或环境。`);
  const grid = el('div', 'sc-grid', scroll);
  const views = new Map<number, PreviewCardView>();
  const foot = el('footer', 'sc-statusbar', main);
  const note = el('span', '', foot, '独立预览 · 每个画面单独控制');
  el('span', '', foot, isResource ? '游戏模型 · 原始材质 · 真实风动' : '真实角色 · 真实物理 · 真实光照');
  const filter = (): void => {
    const query = search.value.trim().toLocaleLowerCase();
    let visible = 0;
    for (const { actor, label } of actorCards) {
      label.hidden = !`${actor.name} ${actor.id} ${actor.description}`.toLocaleLowerCase().includes(query);
      if (!label.hidden) visible++;
    }
    noResults.hidden = visible > 0;
  };
  search.addEventListener('input', filter);
  const refresh = (): void => {
    const overview = model.catalog.mode === 'lab' && model.activeDemo !== null;
    root.classList.toggle('sc-lab-overview', overview);
    root.classList.toggle('sc-lab-expanded', overview && labDetails);
    root.classList.toggle('sc-lab-tiles', overview && model.activeDemo!.id === 'tiles');
    root.classList.toggle('sc-lab-compositions', overview && model.activeDemo!.id === 'compositions');
    grid.style.setProperty('--sc-lab-columns', String(model.activeDemo?.id === 'tiles' ? 1 : model.activeDemo?.id === 'compositions' ? 2 : model.cards.length === 3 || model.cards.length === 6 ? 3 : Math.min(4, Math.max(1, model.cards.length))));
    toolbar.hidden = overview;
    if (model.catalog.mode === 'lab') {
      for (const { id, button: choice } of demoViews) { choice.classList.toggle('sc-active', model.activeDemo?.id === id); choice.setAttribute('aria-pressed', String(model.activeDemo?.id === id)); }
    }
    labControls?.refresh();
    cameraControls?.refresh();
    const ids = new Set(model.cards.map((c) => c.id));
    for (const [id, view] of views) if (!ids.has(id)) { view.dispose(); views.delete(id); }
    for (const card of model.cards) {
      if (!views.has(card.id)) views.set(card.id, createCard(grid, card, model));
      views.get(card.id)!.refresh(labDetails);
    }
    for (const { actor, label, checkbox, count: actorCount } of actorCards) {
      const n = model.cards.filter((c) => model.entry(c.entryId).actor === actor.id).length;
      checkbox.checked = n > 0;
      checkbox.disabled = !isResource && n === 0 && model.full;
      label.classList.toggle('sc-selected', n > 0);
      label.classList.toggle('sc-disabled', checkbox.disabled);
      label.title = isResource ? `查看${actor.name}全部变体，每批最多 ${model.catalog.maxCards} 张（替换当前预览）` : checkbox.disabled ? `已达 ${model.catalog.maxCards} 张上限，请先关闭一张预览` : `选择${actor.name}`;
      actorCount.textContent = n > 0 ? `${n} 张预览` : '未选择';
    }
    selectionCount.textContent = `${new Set(model.cards.map((c) => model.entry(c.entryId).actor)).size} / ${model.catalog.subjects.length}`;
    empty.hidden = model.cards.length !== 0;
    grid.classList.toggle('sc-single', model.cards.length === 1);
    sync.classList.toggle('sc-active', model.synchronized);
    sync.setAttribute('aria-pressed', String(model.synchronized));
    scale.classList.toggle('sc-active', model.worldScale);
    scale.setAttribute('aria-pressed', String(model.worldScale));
    const environments = new Set(model.cards.map((c) => c.environment));
    allEnvironment.value = environments.size === 1 ? model.cards[0]!.environment : '';
  };
  refresh();
  const unsubscribe = model.subscribe(refresh);
  return {
    root, scroll, views,
    setNote(text: string) { note.textContent = text; },
    dispose() { unsubscribe(); for (const view of views.values()) view.dispose(); root.remove(); views.clear(); },
  };
}

function createResourceBrowser(parent: HTMLElement, model: ShowcaseModel) {
  const root = el('section', 'sc-resource-browser', parent);
  root.setAttribute('aria-label', '完整游戏资源目录');
  const row = el('div', 'sc-card-row', root);
  let page = 0;
  const category = select(row, '完整目录', model.catalog.subjects.map((item) => [item.id, `${item.name} · ${model.catalog.entries.filter((e) => e.actor === item.id).length}`]), () => showCategory(category.value));
  const previous = button(row, '上一批', () => { page--; refresh(); model.showBatch(category.value, page); });
  const next = button(row, '下一批', () => { page++; refresh(); model.showBatch(category.value, page); });
  button(row, '预览本批（替换当前卡片）', () => model.showBatch(category.value, page), 'sc-primary');
  const status = el('span', '', row);
  const entries = el('div', 'sc-catalog-entries', root);
  const note = el('p', 'sc-resource-detail', root, '切换分类直接预览一批，替换当前卡片；每批最多 8 张。点名称可单独查看。');
  note.setAttribute('role', 'note');
  const refresh = (): void => {
    const choices = model.catalog.entries.filter((item) => item.actor === category.value);
    const pages = Math.ceil(choices.length / model.catalog.maxCards);
    previous.disabled = page === 0;
    next.disabled = page + 1 === pages;
    const start = page * model.catalog.maxCards;
    status.textContent = `${choices.length} 种 · 第 ${page + 1} / ${pages} 批 · ${start + 1}–${Math.min(start + model.catalog.maxCards, choices.length)}`;
    entries.replaceChildren();
    choices.forEach((item, i) => {
      const choice = button(entries, item.label, () => { model.clear(); model.selectActor(item.actor, true); model.changeAction(model.cards[0]!, item.id); });
      choice.title = `${item.id} · ${item.description}`;
      choice.classList.toggle('sc-active', i >= start && i < start + model.catalog.maxCards);
    });
  };
  const showCategory = (actor: string): void => {
    category.value = actor; page = 0; refresh(); model.showBatch(actor, page);
  };
  refresh();
  return { root, showCategory };
}

function createDemoDirectory(parent: HTMLElement, model: ShowcaseModel) {
  const nav = el('nav', 'sc-directory sc-demo-directory', parent);
  nav.setAttribute('aria-label', '功能演示目录');
  return model.catalog.demos!.map((demo) => {
    const choice = button(nav, '', () => {
      model.showDemo(demo);
      const params = new URLSearchParams(location.search);
      params.set('demo', demo.id);
      history.replaceState(null, '', `${location.pathname}?${params}`);
    }, 'sc-demo-choice');
    el('strong', '', choice, demo.title);
    el('span', '', choice, demo.description);
    return { id: demo.id, button: choice };
  });
}
