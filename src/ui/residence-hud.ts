import { AI_CITY_LAYERS } from '../config/ai-city-look.ts';
import { RESIDENCE_SEGMENTS, RESIDENCE_WORLD, type ResidenceResource } from '../config/residence.ts';
import { WORLD_CONTROLS } from './world-controls.ts';
import { SCENE_WEATHER_LABELS, SCENE_WEATHER_MODES, WIND_LABELS, WIND_MODES } from '../config/weather-rules.ts';

/** 界面只提供控件与容器，建造状态和保存反馈由住宅应用统一驱动。 */
export function createResidenceHud(resources: readonly ResidenceResource[], mode: 'demo' | 'saved', parent: HTMLElement = document.body) {
  const root = document.createElement('section');
  root.className = 'residence';
  root.setAttribute('aria-label', mode === 'demo' ? 'AI 住宅游戏演示' : 'AI 住宅建造');
  root.innerHTML = `
    <header class="residence-toolbar">
      <div class="residence-heading">
        <span class="residence-emblem" aria-hidden="true">⌂</span>
        <div><h1>AI 住宅 <span>· ${mode === 'demo' ? '游戏演示' : '建造'}</span></h1><p data-mode>正在准备住宅</p></div>
      </div>
      <div class="residence-actions" role="group" aria-label="住宅操作">
        ${mode === 'saved' ? '<a href="./?mode=lab&demo=residence">住宅游戏演示</a>' : ''}
        <button type="button" class="residence-primary" data-build aria-expanded="false" aria-controls="residence-resources" aria-pressed="false">${mode === 'demo' ? '体验建造' : '开始建造'}</button>
        <span class="residence-door-note">能量门 · 靠近自动开启，离开自动关闭</span>
        <button type="button" data-save${mode === 'demo' ? ' hidden' : ''}>保存住宅</button>
        ${mode === 'demo' ? '<a href="./?mode=homestead&scene=residence">住宅建造 · 独立存档</a>' : ''}
      </div>
      <div class="residence-camera" role="group" aria-label="游玩与镜头">
        <section class="residence-control-group" aria-label="视角控制">
          <h2>视角控制</h2>
          <div class="residence-control-buttons">
            <button type="button" data-residence-view="front" aria-pressed="true">正视</button>
            <button type="button" data-residence-view="angle" aria-pressed="false">斜视</button>
            <button type="button" data-residence-view="top" aria-pressed="false">俯视</button>
            <button type="button" data-play-view>游玩视角</button>
            <button type="button" data-camera aria-pressed="true">自由镜头</button>
            <button type="button" data-play aria-pressed="true">暂停游玩</button>
          </div>
        </section>
        <section class="residence-control-group" aria-label="世界与天气">
          <h2>世界与天气</h2>
          ${WORLD_CONTROLS}
          <label class="residence-weather-field">天气 <select data-weather aria-label="场景天气">${SCENE_WEATHER_MODES.map(weather => `<option value="${weather}">${SCENE_WEATHER_LABELS[weather]}</option>`).join('')}</select></label>
          <label class="residence-weather-field">风力 <select data-wind aria-label="场景风力">${WIND_MODES.filter(wind => wind !== 'auto').map(wind => `<option value="${wind}"${wind === 'breeze' ? ' selected' : ''}>${WIND_LABELS[wind]}</option>`).join('')}</select></label>
        </section>
        <section class="residence-control-group" aria-label="场景位置">
          <h2>场景位置</h2>
          <div class="residence-control-buttons">
            <button type="button" data-overview>看住宅</button>
            <button type="button" data-underground>看地下 · 64 格</button>
            <button type="button" data-world>全场景 · ${RESIDENCE_WORLD.width.toLocaleString('en-US')} 格</button>
            <button type="button" data-spawn>回到门口</button>
          </div>
          <label class="residence-travel">前往 <select data-travel aria-label="前往院区分段">${RESIDENCE_SEGMENTS.map(segment => `<option value="${segment.index}"${segment.index === 0 ? ' selected' : ''}>${segment.label}</option>`).join('')}</select></label>
          <details class="city-layer-controls"><summary>背景分层</summary><div>${AI_CITY_LAYERS.map(layer => `<label><input type="checkbox" data-city-layer="${layer.id}" checked>${layer.label}</label>`).join('')}</div></details>
        </section>
      </div>
    </header>
    <div class="residence-workspace">
      <aside id="residence-resources" class="residence-sidebar" aria-label="建造资源与工具">
        <div class="residence-panel-heading"><h2>建造资源</h2><span>${resources.length} 种</span></div>
        <p class="residence-panel-intro">${mode === 'demo' ? '体验格子搭建，演示修改仅本次有效。' : '挑选构件，在格子上搭出自己的家。'}</p>
        <div data-resource-picker aria-describedby="residence-resource-note"></div>
        <label class="residence-field" data-depth-field for="residence-depth">砖块深度
          <select id="residence-depth" data-depth-mode>
            <option value="normal">普通格 · 深 2</option>
            <option value="deep">加深格 · 深 3（前后各扩 0.5）</option>
          </select>
        </label>
        <p id="residence-resource-note" class="residence-resource-note" data-resource-note>选择资源，查看尺寸与摆放方式。</p>
        <label class="residence-field" for="residence-tool">建造工具
          <select id="residence-tool" data-tool>
            <option value="place">放置构件</option>
            <option value="remove">拆除构件</option>
          </select>
        </label>
        <div class="residence-build-status" data-build-status role="status" aria-live="polite" aria-atomic="true">选好资源后，点击场景中的格子。</div>
        <div class="residence-summary">
          <span>已放置构件</span><strong data-count>—</strong>
        </div>
        <details class="residence-help">
          <summary>搭建提示</summary>
          <p>先搭地板和墙，再加入门窗、跳台与家具。给人物留出通道，家具完整落在支撑面上。</p>
          <p>建造时游玩暂停；结束建造后，走进房间检查实际效果。</p>
        </details>
        <a class="residence-return" href="./?mode=homestead">返回家园 ↗</a>
      </aside>
      <div class="residence-stage">
        <div class="residence-viewport" aria-label="住宅游戏场景"></div>
        <p class="residence-save-status" data-save-status role="status" aria-live="polite">${mode === 'demo' ? '演示修改仅本次有效 · 刷新后恢复示例' : '住宅使用独立存档。'}</p>
        <div class="room-preview-hud" aria-label="角色与技能"></div>
        <p class="residence-action-status" data-action-status role="status" aria-live="polite" aria-atomic="true"></p>
        <p class="room-preview-hint">A / D 移动 · 空格跳跃 · 能量门自动感应</p>
      </div>
    </div>`;
  if (mode === 'demo') {
    root.classList.add('residence-demo');
    root.querySelector('.world-controls')!.remove();
    root.querySelector('[data-weather]')!.closest('section')!.remove();
  }
  parent.append(root);
  return { root, viewport: root.querySelector<HTMLElement>('.residence-viewport')!, dispose(): void { root.remove(); } };
}
