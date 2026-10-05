import { MAX_SHOWCASE_CARDS } from '../config/showcase.ts';
import type { ShowcaseCard, ShowcaseEntry } from '../config/showcase.ts';
import type { ResourceOptions } from '../config/resource-showcase.ts';
import { TERRAIN_COMPOSITIONS } from '../config/terrain-compositions.ts';
import { WIND_LABELS, WIND_MODES, resolveWindMode } from '../config/weather-rules.ts';
import type { ShowcaseModel } from './showcase-model.ts';
import { createResourceCameraControls } from './resource-camera-controls.ts';

const layouts = { single: '悬空单格', raised: '地面单格', flat: '连续平地', shapes: '四种形状并列', steps: '阶梯拼接', mixed: '多材质固定对照' };
const shapes = ['整格（1 × 1）', '右升斜坡', '左升斜坡', '半格（1 × 0.5）'];
const layers = { ground: '仅瓦片', cover: '瓦片 + 地被', flora: '再加花草', all: '完整植被' };
const habitats = { open: '空旷', wood: '树下', shore: '岸边', desert: '沙漠' };
const winds = WIND_LABELS;
const groundEntry = (entry: ShowcaseEntry<string>): boolean => (entry.actor === 'terrain' && !['branch', 'roof'].includes(entry.action)) || (entry.actor === 'grass' && entry.action === 'natural');
const treeEntry = (entry: ShowcaseEntry<string>): boolean => entry.actor === 'tree' || (entry.actor === 'terrain' && entry.action === 'branch');

export function labCardText(card: ShowcaseCard, model: ShowcaseModel): { title: string; detail: string } {
  const entry = model.entry(card.entryId);
  const options = card.resource!;
  if (options.composition) {
    const composition = TERRAIN_COMPOSITIONS.find(({ id }) => id === options.composition)!;
    return { title: `${composition.label} · ${entry.label}`, detail: `${composition.description} · 种子 ${options.seed} · ${layers[options.vegetation]}${options.platforms ? ' · 青线：可站立' : ''}` };
  }
  const name = options.assembly && entry.actor === 'cave' ? '完整洞穴' : entry.label;
  const ground = groundEntry(entry);
  const terrain = ground && entry.actor === 'terrain';
  const form = terrain ? `${layouts[options.layout]}${(options.layout === 'single' || options.layout === 'raised') && entry.supportsShapes ? ` · ${shapes[options.shapeIndex]}` : ''}` : '';
  const material = options.layout === 'mixed' && terrain ? '' : name;
  const title = model.activeDemo?.id === 'seeds' ? `${name} · 变化 ${model.cards.indexOf(card) + 1}`
    : model.activeDemo?.id === 'wind' ? `${name} · ${winds[options.wind]}`
    : model.activeDemo?.id === 'layers' ? `${name} · ${layers[options.vegetation]}`
    : model.activeDemo?.id === 'habitats' || model.activeDemo?.id === 'scenes' ? `${name} · ${habitats[options.habitat]}`
    : [material, form].filter(Boolean).join(' · ');
  const sample = terrain && (options.layout === 'single' || options.layout === 'raised') ? `${options.sampleCount === 8 ? `八个自然样本 ${options.sampleIndex + 1}–${options.sampleIndex + 8}` : `样本 ${options.sampleIndex + 1}`} · ` : '';
  return { title, detail: `${sample}${card.environment === 'surface' ? '地上' : '地下'} · 种子 ${options.seed} · ${winds[options.wind]}${ground ? ` · ${layers[options.vegetation]}` : ''}` };
}

function button(parent: HTMLElement, text: string, click: () => void): HTMLButtonElement {
  const node = document.createElement('button'); node.type = 'button'; node.textContent = text;
  node.addEventListener('click', click); parent.append(node); return node;
}

function select(parent: HTMLElement, text: string, choices: ReadonlyArray<readonly [string, string]>, change: (value: string) => void): HTMLSelectElement {
  const label = document.createElement('label'); label.className = 'sc-control'; label.textContent = text;
  const node = document.createElement('select'); node.setAttribute('aria-label', text);
  for (const [value, title] of choices) { const option = document.createElement('option'); option.value = value; option.textContent = title; node.append(option); }
  node.addEventListener('change', () => change(node.value)); label.append(node); parent.append(label); return node;
}

/** 顶部仅批量修改原卡片状态，生成、渲染和详细设置仍使用同一条路径。 */
export function createLabControls(parent: HTMLElement, model: ShowcaseModel, onDetails: (open: boolean) => void) {
  const root = document.createElement('section'); root.className = 'sc-lab-toolbar'; root.setAttribute('aria-label', '整组展示设置'); parent.append(root);
  const resources = document.createElement('div'); resources.className = 'sc-card-row'; root.append(resources);
  const row = document.createElement('div'); row.className = 'sc-card-row'; root.append(row);
  const inspection = document.createElement('div'); inspection.className = 'sc-card-row'; root.append(inspection);
  const extras = document.createElement('details'); extras.className = 'sc-group-details'; root.append(extras);
  const summary = document.createElement('summary'); summary.textContent = '更多整组设置'; extras.append(summary);
  const extraRow = document.createElement('div'); extraRow.className = 'sc-card-row'; extras.append(extraRow);
  const applyResource = (change: Partial<ResourceOptions>, accept: (entry: ShowcaseEntry<string>) => boolean = () => true): void => {
    for (const card of model.cards) if (accept(model.entry(card.entryId))) model.update(card, { resource: { ...card.resource!, ...change } }, true);
  };
  const common = <T>(read: (card: ShowcaseCard) => T): T | '' => {
    const values = model.cards.map(read); return values.length && values.every((value) => value === values[0]) ? values[0]! : '';
  };
  const play = button(row, '暂停动画', () => model.all({ playing: !model.cards.every((card) => card.playing) }));
  const replay = button(row, '重播', () => model.reset());
  const restore = button(row, '恢复本组默认', () => model.showDemo(model.catalog.demos!.find((demo) => demo.id === model.activeDemo!.id)!));
  let detailsOpen = false;
  const details = button(row, '展开详细设置', () => { detailsOpen = !detailsOpen; onDetails(detailsOpen); refresh(); });
  const environment = select(row, '整组环境', [['', '各格环境'], ['surface', '地上'], ['underground', '地下']], (value) => {
    if (value) model.all({ environment: value as ShowcaseCard['environment'] }, true);
  });
  const wind = select(row, '整组风力', [['', '分格对照'], ...WIND_MODES.map((mode) => [mode, WIND_LABELS[mode]] as const)], (value) => {
    if (value) applyResource({ wind: resolveWindMode(value, 'breeze') });
  });
  const shape = select(row, '单格形状', [['', '全部形状'], ...shapes.map((label, index) => [String(index), label] as const)], (value) => {
    for (const [index, card] of model.cards.entries()) model.update(card, { resource: { ...card.resource!, shapeIndex: value === '' ? model.activeDemo!.cards[index]!.resource!.shapeIndex! : Number(value) } }, true);
  });
  const cameraControls = createResourceCameraControls(row, model, () => model.cards);
  const vegetation = select(row, '整组植被', [['', '分层对照'], ['ground', '仅瓦片'], ['cover', '瓦片 + 地被'], ['flora', '瓦片 + 地被 + 花草'], ['all', '完整植被']], (value) => {
    if (value) applyResource({ vegetation: value as ResourceOptions['vegetation'] }, groundEntry);
  });
  const seedLabel = document.createElement('label'); seedLabel.className = 'sc-control';
  const seedTitle = document.createElement('span'); seedLabel.append(seedTitle);
  const seed = document.createElement('input'); seed.type = 'number'; seed.min = '0'; seed.max = '4294967295'; seed.step = '1'; seed.required = true; seed.setAttribute('aria-label', '整组种子');
  const applySeed = (): void => {
    if (!seed.reportValidity()) return;
    const base = seed.valueAsNumber;
    for (const [index, card] of model.cards.entries()) model.update(card, { resource: { ...card.resource!, seed: (base + (model.activeDemo?.id === 'seeds' ? index : 0)) >>> 0 } }, true);
  };
  seedLabel.append(seed); extraRow.append(seedLabel);
  const applySeedButton = button(extraRow, '应用种子', applySeed);
  const nextSeed = button(extraRow, '换一组变化', () => {
    if (model.activeDemo?.id === 'tiles') {
      for (const card of model.cards) model.update(card, { resource: { ...card.resource!, sampleIndex: (card.resource!.sampleIndex + card.resource!.sampleCount) >>> 0 } }, true);
      return;
    }
    const step = model.activeDemo?.id === 'seeds' ? MAX_SHOWCASE_CARDS : 1;
    for (const card of model.cards) model.update(card, { resource: { ...card.resource!, seed: (card.resource!.seed + step) >>> 0 } }, true);
  });
  const speed = select(extraRow, '整组速度', [['', '各格速度'], ['0.25', '0.25×'], ['0.5', '0.5×'], ['1', '1×']], (value) => { if (value) model.all({ speed: Number(value) }); });
  const zoom = select(extraRow, '整组缩放', [['', '各格缩放'], ['0.65', '0.65×'], ['1', '1×'], ['1.5', '1.5×'], ['2', '2×']], (value) => {
    if (value) for (const card of model.cards) model.update(card, { zoom: Number(value) });
  });
  const toggle = (text: string, key: 'context' | 'grid' | 'reference' | 'inspectionLight' | 'platforms', accept: (entry: ShowcaseEntry<string>) => boolean = () => true) => {
    const control = button(extraRow, text, () => {
      const eligible = model.cards.filter((card) => accept(model.entry(card.entryId)));
      applyResource({ [key]: !eligible.every((card) => card.resource![key]) }, accept);
    });
    return { control, key, accept };
  };
  const toggles = [toggle('场景模式', 'context', (entry) => !groundEntry(entry)), toggle('瓦片网格', 'grid', groundEntry), toggle('鹈鹕比例参照', 'reference'), toggle('检视补光', 'inspectionLight'), toggle('站立位置', 'platforms', (entry) => treeEntry(entry) || groundEntry(entry))];
  const loop = button(extraRow, '循环播放', () => { const enabled = !model.cards.every((card) => card.loop); for (const card of model.cards) model.update(card, { loop: enabled }); });
  const sync = button(extraRow, '同步对比', () => model.sync(!model.synchronized));
  sync.title = '所有画面可见时统一播放，离屏时整组暂停';
  const scale = button(extraRow, '统一比例', () => model.scale(!model.worldScale));
  const note = document.createElement('p'); note.className = 'sc-resource-detail'; root.append(note);
  let selector = '';
  let choices: Array<{ id: string; control: HTMLButtonElement }> = [];
  const refresh = (): void => {
    const demo = model.activeDemo;
    root.hidden = demo === null;
    if (!demo) return;
    const group = ['seeds', 'wind'].includes(demo.id) ? 'tree' : ['tiles', 'joins', 'layers', 'compositions'].includes(demo.id) ? 'terrain' : '';
    const compositions = demo.id === 'compositions';
    for (const control of [play, replay, restore, details, environment.parentElement!, wind.parentElement!]) {
      if (compositions && control.parentElement !== extraRow) extraRow.append(control);
      else if (!compositions && control.parentElement !== row) row.insertBefore(control, shape.parentElement!);
    }
    const noteParent = compositions ? extras : root;
    if (note.parentElement !== noteParent) noteParent.append(note);
    const inspectionRow = demo.id === 'compositions' ? inspection : extraRow;
    for (const control of [seedLabel, applySeedButton, nextSeed, ...toggles.filter(({ key }) => key === 'grid' || key === 'platforms').map(({ control }) => control)]) {
      if (control.parentElement !== inspectionRow) inspectionRow.append(control);
    }
    inspection.hidden = demo.id !== 'compositions';
    if (group !== selector) {
      selector = group; resources.replaceChildren(); choices = [];
      if (group) {
        const label = document.createElement('strong'); label.textContent = group === 'tree' ? '选择树种' : '选择材质'; resources.append(label);
        choices = model.catalog.entries.filter((entry) => entry.actor === group && (group === 'tree' || (entry.supportsShapes && groundEntry(entry)))).map((entry) => ({ id: entry.id, control: button(resources, entry.label, () => {
          for (const card of model.cards) if (model.activeDemo?.id !== 'joins' || card.resource!.layout !== 'mixed') model.changeAction(card, entry.id);
        }) }));
      }
    }
    resources.hidden = group === '';
    const selectedCards = model.cards.filter((card) => demo.id !== 'joins' || card.resource!.layout !== 'mixed');
    for (const { id, control } of choices) { const selected = selectedCards.length > 0 && selectedCards.every((card) => card.entryId === id); control.classList.toggle('sc-active', selected); control.setAttribute('aria-pressed', String(selected)); }
    play.textContent = model.cards.every((card) => card.playing) ? '暂停动画' : '播放动画';
    details.textContent = detailsOpen ? '收起详细设置' : '展开详细设置'; details.setAttribute('aria-expanded', String(detailsOpen));
    environment.value = common((card) => card.environment);
    wind.value = common((card) => card.resource!.wind);
    shape.parentElement!.hidden = demo.id !== 'tiles';
    shape.value = String(common((card) => card.resource!.shapeIndex));
    cameraControls.refresh();
    vegetation.parentElement!.hidden = !model.cards.some((card) => groundEntry(model.entry(card.entryId)));
    vegetation.value = common((card) => card.resource!.vegetation);
    speed.value = String(common((card) => card.speed)); zoom.value = String(common((card) => card.zoom));
    seedTitle.textContent = demo.id === 'seeds' ? '起始种子' : '统一种子';
    seed.value = demo.id === 'seeds' && model.cards.length ? String(model.cards[0]!.resource!.seed) : String(common((card) => card.resource!.seed));
    for (const { control, key, accept } of toggles) {
      const eligible = model.cards.filter((card) => accept(model.entry(card.entryId)));
      control.hidden = eligible.length === 0 || (key === 'inspectionLight' && model.cards.every((card) => card.environment === 'surface'));
      const enabled = eligible.length > 0 && eligible.every((card) => card.resource![key]);
      control.classList.toggle('sc-active', enabled); control.setAttribute('aria-pressed', String(enabled));
      if (key === 'context') control.textContent = enabled ? '场景模式' : '纯资源模式';
    }
    for (const [control, enabled] of [[loop, model.cards.every((card) => card.loop)], [sync, model.synchronized], [scale, model.worldScale]] as const) { control.classList.toggle('sc-active', enabled); control.setAttribute('aria-pressed', String(enabled)); }
    note.textContent = demo.id === 'compositions' ? '八种构图使用同样大小的范围与游戏生成代码。点击换角度、拖动旋转；打开网格或站立位置检查结构，进入游戏可实际走动。' : demo.id === 'tiles' ? '整格 1 × 1，半格 1 × 0.5；每卡从左到右八个游戏自然样本。点击换角度、拖动旋转；“换一组变化”查看下一批。' : group === 'tree' ? '青线：真实可站立位置。点击画面换角度，拖动旋转；展开详细设置可单独检查每格。' : demo.id === 'joins' ? '多材质格保留游戏固定材质组合；其余格跟随顶部材质。' : demo.id === 'layers' ? '植物按真实材质与生长规则出现；不适合生长的地面不会强行补花草。' : '各格自动展开对照，标签显示当前实际设置；点击画面换角度，拖动旋转。';
  };
  return { refresh };
}
