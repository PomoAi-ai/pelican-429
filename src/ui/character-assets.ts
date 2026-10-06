import { ENEMY_MODEL_DIRS, isEnemyKind } from '../config/enemy-models.ts';
import { CHARACTER_ASSETS, GRASSY_HISTORY_ASSETS, GRASSY_HISTORY_DOWNLOADS } from '../config/character-assets.ts';
import type { CharacterAsset } from '../config/character-assets.ts';
import type { ShowcaseActor } from '../config/showcase.ts';

const descriptions: Readonly<Record<string, string>> = {
  '正侧面参考': '绘制的建模参考 · 正面与侧面',
  '装备概念': '已确认的装备设定 · 推进飞行、键盘攻击与日常背负',
  '战斗效果概念': '绘制的技能效果设定 · 概念图，非游戏实际渲染',
  '空中技能概念': '飞行中施放四种键盘攻击的设定 · 概念图，非游戏实际渲染',
  '历史模型多视图': '归档模型的原始渲染图 · 下方可旋转查看真实模型',
  '早期角色卡': '已归档的角色造型探索',
  '场景比例对照': '角色高度与场景、门框和鹈鹕的早期对照',
  '头身比例稿': '不同头身比例的设计探索',
  '早期四方向': '最初的四方向设计稿',
  '3.1 比例试稿': '3.1 头身比例的四方向试稿',
  '四方向修订稿': '母版确认前的四方向修订',
  '母版试稿': '正式母版的历史试稿',
  '角色卡': '主角造型与表情设定 · 点击查看完整角色卡',
  '四方向参考': '绘制的建模参考 · 正面、背面、左侧、右侧',
  '2D 原画': '角色设计原图 · 点击缩略图查看大图',
  '3D 参考': '立体风格设计图 · 静态图片',
  '模型多视图': '真实模型渲染截图 · 点击查看完整画面',
  '演变对照': '从平面到立体的过程截图与原画对照',
  '历史版本': '历史模型截图 · 第一版至第四版',
  '骑行素材': '骑行原画、动画素材与模型截图',
};

function element<K extends keyof HTMLElementTagNameMap>(tag: K, parent: HTMLElement, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  parent.append(node);
  return node;
}

export function createCharacterAssets(parent: HTMLElement, actor: ShowcaseActor, cardId: number, historical = false, expanded = true): void {
  const assets = historical ? GRASSY_HISTORY_ASSETS : CHARACTER_ASSETS[actor];
  const section = element('section', parent, 'sc-assets');
  section.setAttribute('aria-label', '角色图片资源');
  const header = element('div', section, 'sc-assets-heading');
  element('strong', header, '', `图片资源 · ${assets.length}`);
  if (assets.length === 0) {
    element('span', header, 'sc-assets-description', '原始图片待补充 · 下方可查看实时模型');
    return;
  }
  const base = isEnemyKind(actor) ? `${ENEMY_MODEL_DIRS[actor]}/` : `./characters/${actor}/`;
  const assetUrl = (path: string): string => new URL(path, path.startsWith('./') ? window.location.href : new URL(base, window.location.href)).href;
  const source = element('a', header, '', '资源来源');
  source.href = historical ? `${base}history/README.md` : `${base}SOURCE.md`;
  source.target = '_blank'; source.rel = 'noopener';
  if (historical) {
    const downloads = element('details', section, 'sc-history-downloads');
    element('summary', downloads, '', '归档模型与工程索引');
    for (const asset of GRASSY_HISTORY_DOWNLOADS) {
      const link = element('a', downloads, '', asset.label);
      link.href = asset.path; link.target = '_blank'; link.rel = 'noopener';
    }
  }
  const toggle = element('button', header, 'sc-assets-toggle', '收起图片');
  toggle.type = 'button'; toggle.setAttribute('aria-expanded', 'true');
  const categories = element('div', section, 'sc-asset-categories');
  categories.setAttribute('role', 'group');
  categories.setAttribute('aria-label', '图片分类');
  const description = element('p', section, 'sc-assets-description');
  const gallery = element('div', section, 'sc-asset-gallery');
  const dialog = element('dialog', section, 'sc-asset-dialog');
  const dialogHeader = element('div', dialog, 'sc-asset-dialog-header');
  const dialogTitle = element('strong', dialogHeader, '');
  dialogTitle.id = `asset-title-${cardId}`;
  dialog.setAttribute('aria-labelledby', dialogTitle.id);
  const close = element('button', dialogHeader, '', '关闭');
  close.type = 'button'; close.addEventListener('click', () => dialog.close());
  const large = element('img', dialog, 'sc-asset-large');
  const error = element('p', dialog, 'sc-asset-error', '图片加载失败，请通过下方链接检查原文件。');
  error.setAttribute('role', 'alert'); error.hidden = true;
  large.addEventListener('error', () => { error.hidden = false; });
  const dialogFooter = element('div', dialog, 'sc-asset-dialog-footer');
  const previous = element('button', dialogFooter, '', '← 上一张');
  previous.type = 'button';
  const position = element('span', dialogFooter, '');
  const next = element('button', dialogFooter, '', '下一张 →');
  next.type = 'button';
  const original = element('a', dialogFooter, '', '打开原文件 ↗');
  original.target = '_blank'; original.rel = 'noopener';
  let selected: readonly CharacterAsset[] = [];
  let current = 0;
  const showImage = (index: number): void => {
    current = index;
    const asset = selected[index]!;
    dialogTitle.textContent = asset.label;
    error.hidden = true;
    large.src = assetUrl(asset.path);
    large.alt = asset.label;
    original.href = large.src;
    position.textContent = `${index + 1} / ${selected.length}`;
    previous.disabled = index === 0;
    next.disabled = index === selected.length - 1;
  };
  previous.addEventListener('click', () => showImage(current - 1));
  next.addEventListener('click', () => showImage(current + 1));
  const buttons = new Map<string, HTMLButtonElement>();
  const modelLabel = element('p', section, 'sc-assets-model-label', actor === 'human' ? historical ? '↓ 历史 3D 模型 · 选择版本并旋转查看' : '↓ 正式 3D 角色 · 动作与精细度独立切换' : '↓ 实时 3D 模型 · 在下方直接切换动作');
  const setExpanded = (expanded: boolean): void => {
    for (const part of [description, gallery, modelLabel]) part.hidden = !expanded;
    toggle.textContent = expanded ? '收起图片' : '展开图片';
    toggle.setAttribute('aria-expanded', String(expanded));
  };
  const showGroup = (group: string): void => {
    selected = assets.filter((asset) => asset.group === group);
    description.textContent = descriptions[group]!;
    for (const [name, button] of buttons) {
      button.classList.toggle('sc-active', name === group);
      button.setAttribute('aria-pressed', String(name === group));
    }
    gallery.replaceChildren();
    gallery.classList.toggle('sc-character-card-gallery', group === '角色卡');
    gallery.classList.toggle('sc-direction-gallery', group === '四方向参考');
    selected.forEach((asset, index) => {
      const thumbnail = element('button', gallery, 'sc-asset-thumbnail');
      thumbnail.type = 'button';
      thumbnail.setAttribute('aria-label', `查看${asset.label}`);
      const image = element('img', thumbnail, '');
      image.src = assetUrl(asset.thumbnail);
      image.alt = ''; image.loading = 'lazy'; image.decoding = 'async';
      image.addEventListener('error', () => { thumbnail.title = `资源加载失败：${asset.path}`; thumbnail.classList.add('sc-asset-error'); });
      element('span', thumbnail, '', asset.label);
      thumbnail.addEventListener('click', () => { showImage(index); dialog.showModal(); });
    });
    gallery.scrollLeft = 0;
    setExpanded(true);
  };
  for (const group of new Set(assets.map((asset) => asset.group))) {
    const count = assets.filter((asset) => asset.group === group).length;
    const button = element('button', categories, '', `${group} ${count}`);
    button.type = 'button'; button.addEventListener('click', () => showGroup(group));
    buttons.set(group, button);
  }
  showGroup(historical ? '历史模型多视图' : actor === 'human' ? '装备概念' : assets[0]!.group);
  if (historical || !expanded) setExpanded(false);
  toggle.addEventListener('click', () => setExpanded(gallery.hidden === true));
}
