import type { ShowcaseCard } from '../../config/showcase.ts';
import type { ResourceOptions } from '../../config/resource-showcase.ts';
import { isBuildingKitKind } from '../../config/building-kit.ts';
import { TERRAIN_COMPOSITIONS, parseTerrainComposition } from '../../config/terrain-compositions.ts';
import { TILE_SHAPES } from '../../world/tile-shapes.ts';
import { WIND_LABELS, WIND_MODES, resolveWindMode } from '../../config/weather-rules.ts';
import type { ShowcaseModel } from '../model/showcase-model.ts';
import { createResourceCameraControls } from './resource-camera-controls.ts';
import { t } from '../../config/i18n.ts';

export function createResourceControls(parent: HTMLElement, card: ShowcaseCard, model: ShowcaseModel) {
  const root = document.createElement('div');
  root.className = 'sc-card-row sc-resource-controls';
  parent.append(root);
  const camera = createResourceCameraControls(parent, model, () => [card]);
  const update = (change: Partial<ResourceOptions>): void => model.update(card, { resource: { ...card.resource!, ...change } }, true);
  const lab = document.createElement('div'); lab.className = 'sc-card-row sc-lab-controls'; parent.append(lab);
  // 调用方随每次重绘或模型变化刷新，静态文案在 refresh 里按当前语言重取。
  const texts: Array<() => void> = [];
  const choice = <T extends string>(name: string, choices: ReadonlyArray<readonly [T, string]>, change: (value: T) => void): HTMLSelectElement => {
    const label = document.createElement('label'); label.className = 'sc-control';
    const labelText = document.createTextNode('');
    const select = document.createElement('select');
    const options = choices.map(([value, text]) => { const option = document.createElement('option'); option.value = value; select.append(option); return [option, text] as const; });
    texts.push(() => {
      labelText.textContent = t(name); select.setAttribute('aria-label', t(name));
      for (const [option, text] of options) option.textContent = t(text);
    });
    select.addEventListener('change', () => change(select.value as T)); label.append(labelText, select); lab.append(label); return select;
  };
  const layout = choice('瓦片组合', [['single', '悬空单格'], ['raised', '地面单格'], ['flat', '连续平地'], ['shapes', '四种形状并列'], ['steps', '阶梯拼接'], ['mixed', '多材质邻接']], (layout: ResourceOptions['layout']) => update({ layout }));
  const composition = choice('地形构图', [['', '单块与拼接设置'], ...TERRAIN_COMPOSITIONS.map(({ id, label }) => [id, label] as const)], (value) => update({ composition: value === '' ? null : parseTerrainComposition(value), assembly: value !== '' }));
  const shapeNames = ['整格（1 × 1）', '右升斜坡', '左升斜坡', '半格（1 × 0.5）'];
  const shape = choice('顶层形状', TILE_SHAPES.map((shape) => [String(shape), shapeNames[shape]!]), (value) => update({ shapeIndex: TILE_SHAPES[Number(value)]! }));
  const vegetation = choice('植被层次', [['all', '完整植被'], ['ground', '仅瓦片'], ['cover', '瓦片 + 地被'], ['flora', '瓦片 + 地被 + 花草']], (vegetation: ResourceOptions['vegetation']) => update({ vegetation }));
  const habitat = choice('生长环境', [['open', '空旷地面'], ['wood', '树下'], ['shore', '近水岸边'], ['desert', '沙漠']], (habitat: ResourceOptions['habitat']) => update({ habitat }));
  const explanation = document.createElement('p'); explanation.className = 'sc-resource-detail'; parent.append(explanation);
  const seedLabel = document.createElement('label');
  seedLabel.className = 'sc-control';
  const seedText = document.createTextNode('');
  const seed = document.createElement('input');
  seed.type = 'number'; seed.min = '0'; seed.max = '4294967295'; seed.step = '1'; seed.required = true;
  seedLabel.append(seedText, seed); root.append(seedLabel);
  seed.addEventListener('change', () => {
    if (!seed.reportValidity()) return;
    update({ seed: seed.valueAsNumber });
  });
  const next = document.createElement('button');
  next.type = 'button';
  next.addEventListener('click', () => update({ seed: (card.resource!.seed + 1) >>> 0 }));
  root.append(next);
  const windLabel = document.createElement('label'); windLabel.className = 'sc-control';
  const windText = document.createTextNode('');
  const wind = document.createElement('select');
  const windOptions = WIND_MODES.map((value) => {
    const option = document.createElement('option'); option.value = value; wind.append(option); return [option, WIND_LABELS[value]] as const;
  });
  wind.addEventListener('change', () => update({ wind: resolveWindMode(wind.value, 'breeze') }));
  windLabel.append(windText, wind); root.append(windLabel);
  const context = document.createElement('button'); context.type = 'button';
  context.addEventListener('click', () => update({ context: !card.resource!.context })); root.append(context);
  const grid = document.createElement('button'); grid.type = 'button';
  grid.addEventListener('click', () => update({ grid: !card.resource!.grid })); root.append(grid);
  const platforms = document.createElement('button'); platforms.type = 'button';
  platforms.addEventListener('click', () => update({ platforms: !card.resource!.platforms })); root.append(platforms);
  const reference = document.createElement('button'); reference.type = 'button';
  reference.addEventListener('click', () => update({ reference: !card.resource!.reference })); root.append(reference);
  const light = document.createElement('button'); light.type = 'button';
  light.addEventListener('click', () => update({ inspectionLight: !card.resource!.inspectionLight })); root.append(light);
  texts.push(() => {
    seedText.textContent = t('种子'); seed.setAttribute('aria-label', t('资源种子'));
    next.textContent = t('下一种子');
    windText.textContent = t('风力'); wind.setAttribute('aria-label', t('资源风力'));
    for (const [option, text] of windOptions) option.textContent = t(text);
    grid.textContent = t('瓦片网格'); grid.title = t('显示每格 1 × 1 世界单位的边界');
    platforms.textContent = t('站立位置'); platforms.title = t('显示游戏地形与树木平台的可站立顶面');
    reference.textContent = t('鹈鹕比例参照');
    light.textContent = t('检视补光'); light.title = t('为地下资源提供固定柔光；关闭可查看场景原始光照');
  });
  return {
    refresh() {
      for (const text of texts) text();
      camera.refresh();
      const options = card.resource!;
      light.hidden = card.environment !== 'underground';
      light.setAttribute('aria-pressed', String(options.inspectionLight));
      light.classList.toggle('sc-active', options.inspectionLight);
      seed.value = String(options.seed); wind.value = options.wind;
      const entry = model.entry(card.entryId);
      const building = isBuildingKitKind(entry.actor);
      seedLabel.hidden = building; next.hidden = building; windLabel.hidden = building;
      const terrain = entry.actor === 'terrain' && !['branch', 'roof'].includes(entry.action);
      const groundResource = terrain || (entry.actor === 'grass' && entry.action === 'natural');
      platforms.hidden = !groundResource && entry.actor !== 'tree' && !(entry.actor === 'terrain' && entry.action === 'branch');
      platforms.setAttribute('aria-pressed', String(options.platforms));
      platforms.classList.toggle('sc-active', options.platforms);
      lab.hidden = model.catalog.mode !== 'lab' || (!terrain && !(entry.actor === 'grass' && entry.action === 'natural'));
      composition.parentElement!.hidden = !terrain || !entry.supportsShapes;
      composition.value = options.composition ?? '';
      layout.parentElement!.hidden = !terrain || options.composition !== null;
      shape.parentElement!.hidden = !terrain || options.composition !== null;
      habitat.parentElement!.hidden = options.composition !== null;
      shape.disabled = !terrain || !entry.supportsShapes || options.layout === 'shapes';
      habitat.value = options.habitat;
      layout.value = options.layout; shape.value = String(options.shapeIndex); vegetation.value = options.vegetation;
      explanation.hidden = model.catalog.mode !== 'lab';
      explanation.textContent = t(options.composition ? TERRAIN_COMPOSITIONS.find(({ id }) => id === options.composition)!.description : terrain ? '形状改变真实瓦片；邻格决定接缝。植被由暴露顶面、材质、坐标与环境生成。' : entry.actor === 'terrain' ? (entry.action === 'branch' ? '树枝平台是碰撞瓦片，外观由同一棵游戏树模型绘制。' : '屋顶瓦片负责碰撞，外观由游戏渔屋模型绘制。') : '类型决定几何，种子控制实例参数；风力驱动游戏原有动画。自然花草按坐标与环境分布，不随此种子任意重排。');
      context.hidden = groundResource; grid.hidden = !groundResource && !building;
      grid.setAttribute('aria-pressed', String(options.grid));
      grid.classList.toggle('sc-active', options.grid);
      context.textContent = t(options.context ? '场景模式' : '纯资源模式');
      context.setAttribute('aria-pressed', String(options.context));
      context.classList.toggle('sc-active', options.context);
      reference.setAttribute('aria-pressed', String(options.reference));
      reference.classList.toggle('sc-active', options.reference);
    },
  };
}
