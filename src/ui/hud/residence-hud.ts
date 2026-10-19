import { AI_CITY_LAYERS } from '../../config/ai-city-look.ts';
import { RESIDENCE_SEGMENT_WIDTH, RESIDENCE_SEGMENTS, RESIDENCE_WORLD, type ResidenceResource } from '../../config/residence.ts';
import { createSceneViewControls } from '../panels/scene-view-controls.tsx';
import { t } from '../../config/i18n.ts';
import { onLanguageChange } from '../model/language.ts';

/** 分段标签由序号与格子范围算出，只翻译固定部分；与 config/residence.ts 的中文 label 同格式。 */
const segmentLabel = ({ index, x }: { index: number; x: number }): string =>
  t(index === 0 ? '主院区 · {from}–{to} 格' : index < 0 ? '左侧第 {n} 段 · {from}–{to} 格' : '右侧第 {n} 段 · {from}–{to} 格')
    .replace('{n}', String(Math.abs(index))).replace('{from}', String(x)).replace('{to}', String(x + RESIDENCE_SEGMENT_WIDTH));

/**
 * 界面只提供控件与容器，建造状态和保存反馈由住宅应用统一驱动；世界与天气控制由共享场景工具条提供。
 * world 是主世界城区：只留建造与视角控制，没有保存与场景位置。
 */
export function createResidenceHud(resources: readonly ResidenceResource[], mode: 'demo' | 'saved' | 'world', parent: HTMLElement = document.body) {
  const scene = mode !== 'world';
  const root = document.createElement('section');
  root.className = 'residence scene-page';
  // 模板只拼一次；每段译文先留注释标记，挂载后换成文本节点绑定，语言切换时逐个重取。
  const texts: Array<() => string> = [];
  const attrs: Array<readonly [string, () => string]> = [];
  const text = (render: () => string): string => `<!--${texts.push(render) - 1}-->${render()}`;
  const attr = (name: string, render: () => string): string => `${name}="${render()}" data-l10n="${attrs.push([name, render]) - 1}"`;
  root.setAttribute('aria-label', t(mode === 'demo' ? 'AI 住宅游戏演示' : mode === 'world' ? '主世界城区' : 'AI 住宅建造'));
  root.innerHTML = `
    <header class="residence-toolbar">
      <div class="residence-heading">
        <span class="residence-emblem" aria-hidden="true">⌂</span>
        <div><h1>${text(() => `${t(scene ? 'AI 住宅' : '主世界')} `)}<span>${text(() => `· ${t(mode === 'demo' ? '游戏演示' : scene ? '建造' : '城区')}`)}</span></h1><p data-mode>${text(() => t('正在准备住宅'))}</p></div>
      </div>
      <div class="residence-actions" role="group" ${attr('aria-label', () => t('住宅操作'))}>
        ${mode === 'saved' ? `<a href="./?mode=lab&demo=residence">${text(() => t('住宅游戏演示'))}</a>` : ''}
        <button type="button" class="residence-primary" data-build aria-expanded="false" aria-controls="residence-resources" aria-pressed="false">${text(() => t(mode === 'demo' ? '体验建造' : scene ? '开始建造' : '建造'))}</button>
        <span class="residence-door-note">${text(() => t('能量门 · 靠近自动开启，离开自动关闭'))}</span>
        ${scene ? `<button type="button" data-save${mode === 'demo' ? ' hidden' : ''}>${text(() => t('保存住宅'))}</button>` : ''}
        ${mode === 'demo' ? `<a href="./?mode=homestead&scene=residence">${text(() => t('住宅建造 · 独立存档'))}</a>` : ''}
      </div>
      <div class="residence-camera" role="group" ${attr('aria-label', () => t('游玩与镜头'))}>
        <section class="residence-control-group" ${attr('aria-label', () => t('视角控制'))}>
          <h2>${text(() => t('视角控制'))}</h2>
          <div class="residence-control-buttons">
            <span data-scene-view-controls></span>
          </div>
        </section>
        ${scene ? `<section class="residence-control-group" ${attr('aria-label', () => t('场景位置'))}>
          <h2>${text(() => t('场景位置'))}</h2>
          <div class="residence-control-buttons">
            <button type="button" data-overview>${text(() => t('看住宅'))}</button>
            <button type="button" data-underground>${text(() => t('看地下 · 64 格'))}</button>
            <button type="button" data-world>${text(() => t('全场景 · {n} 格').replace('{n}', RESIDENCE_WORLD.width.toLocaleString('en-US')))}</button>
            <button type="button" data-spawn>${text(() => t('回到门口'))}</button>
          </div>
          <label class="residence-travel">${text(() => `${t('前往')} `)}<select data-travel ${attr('aria-label', () => t('前往院区分段'))}>${RESIDENCE_SEGMENTS.map(segment => `<option value="${segment.index}"${segment.index === 0 ? ' selected' : ''}>${text(() => segmentLabel(segment))}</option>`).join('')}</select></label>
          <details class="city-layer-controls"><summary>${text(() => t('背景分层'))}</summary><div>${AI_CITY_LAYERS.map(layer => `<label><input type="checkbox" data-city-layer="${layer.id}" checked>${text(() => t(layer.label))}</label>`).join('')}</div></details>
          <label><input type="checkbox" data-reflections checked>${text(() => t('地面反射'))}</label>
        </section>` : ''}
      </div>
    </header>
    <div class="residence-workspace">
      <aside id="residence-resources" class="residence-sidebar" ${attr('aria-label', () => t('建造资源与工具'))}>
        <div class="residence-panel-heading"><h2>${text(() => t('建造资源'))}</h2><span>${text(() => t('{n} 种').replace('{n}', String(resources.length)))}</span></div>
        <p class="residence-panel-intro">${text(() => t(mode === 'demo' ? '体验格子搭建，演示修改仅本次有效。' : '挑选构件，在格子上搭出自己的家。'))}</p>
        <div data-resource-picker aria-describedby="residence-resource-note"></div>
        <label class="residence-field" data-depth-field for="residence-depth">${text(() => `${t('砖块深度')} `)}<select id="residence-depth" data-depth-mode>
            <option value="normal">${text(() => t('普通格 · 深 2'))}</option>
            <option value="deep">${text(() => t('加深格 · 深 3（前后各扩 0.5）'))}</option>
          </select>
        </label>
        <p id="residence-resource-note" class="residence-resource-note" data-resource-note>${text(() => t('选择资源，查看尺寸与摆放方式。'))}</p>
        <label class="residence-field" for="residence-tool">${text(() => `${t('建造工具')} `)}<select id="residence-tool" data-tool>
            <option value="place">${text(() => t('放置构件'))}</option>
            <option value="remove">${text(() => t('拆除构件'))}</option>
          </select>
        </label>
        <div class="residence-build-status" data-build-status role="status" aria-live="polite" aria-atomic="true">${text(() => t('选好资源后，点击场景中的格子。'))}</div>
        <div class="residence-summary">
          <span>${text(() => t('已放置构件'))}</span><strong data-count>—</strong>
        </div>
        <details class="residence-help">
          <summary>${text(() => t('搭建提示'))}</summary>
          <p>${text(() => t('先搭地板和墙，再加入门窗、跳台与家具。给人物留出通道，家具完整落在支撑面上。'))}</p>
          <p>${text(() => t('建造时游玩暂停；结束建造后，走进房间检查实际效果。'))}</p>
        </details>
        <a class="residence-return" href="./?mode=homestead">${text(() => t('返回家园 ↗'))}</a>
      </aside>
      <div class="residence-stage">
        <div class="residence-viewport" ${attr('aria-label', () => t('住宅游戏场景'))}></div>
        <p class="residence-save-status" data-save-status role="status" aria-live="polite">${text(() => t(mode === 'demo' ? '演示修改仅本次有效 · 刷新后恢复示例' : '住宅使用独立存档。'))}</p>
        <div class="room-preview-hud" ${attr('aria-label', () => t('角色与技能'))}></div>
        <p class="residence-action-status" data-action-status role="status" aria-live="polite" aria-atomic="true"></p>
        <p class="room-preview-hint">${text(() => t('A / D 移动 · 空格跳跃 · 能量门自动感应'))}</p>
      </div>
    </div>`;
  const bound: Array<readonly [Text, () => string]> = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const markers: Comment[] = [];
  while (walker.nextNode()) markers.push(walker.currentNode as Comment);
  for (const marker of markers) {
    bound.push([marker.nextSibling as Text, texts[Number(marker.data)]!]);
    marker.remove();
  }
  const attributed = [...root.querySelectorAll<HTMLElement>('[data-l10n]')].map((element) => [element, attrs[Number(element.dataset.l10n)]!] as const);
  // 应用会改写状态行等文本；只重取仍是上一语言原文的节点，避免覆盖运行中的状态。
  let shown = bound.map(([node]) => node.data);
  const syncLanguage = (): void => {
    root.setAttribute('aria-label', t(mode === 'demo' ? 'AI 住宅游戏演示' : mode === 'world' ? '主世界城区' : 'AI 住宅建造'));
    bound.forEach(([node, render], index) => { if (node.data === shown[index]) node.data = render(); });
    shown = bound.map(([node]) => node.data);
    for (const [element, [name, render]] of attributed) element.setAttribute(name, render());
  };
  const unsubscribe = onLanguageChange(syncLanguage);
  if (mode === 'demo') root.classList.add('residence-demo');
  parent.append(root);
  const view = createSceneViewControls(root.querySelector<HTMLElement>('[data-scene-view-controls]')!);
  return { root, view, viewport: root.querySelector<HTMLElement>('.residence-viewport')!, dispose(): void { unsubscribe(); view.dispose(); root.remove(); } };
}
