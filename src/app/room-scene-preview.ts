import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GRASSY_HEIGHT } from '../config/grassy.ts';
import { TUNING } from '../config/tuning.ts';
import { createGrassyRig, disposeGrassyAssets, loadGrassyAsset } from '../render/grassy/grassy-rig.ts';
import { animateGrassy } from '../render/grassy/grassy-animator.ts';
import { createStage } from '../render/stage.ts';
import { createDefinitionSceneLayout, type SceneSection } from './definition-scene-layout.ts';
import { createDefinitionSettlementLayout } from './definition-settlement-layout.ts';
import { createDefinitionDepthLayout, createDepthEnvironment, DEPTH_LAYERS, DEPTH_STOPS, type DepthLayerId } from './definition-depth-layout.ts';
import { createCelestialSky, type SkyPhase } from '../render/celestial-sky.ts';
import { createPerspectiveControls } from './perspective-controls.ts';
import { createCharacterAppearanceStore } from './character-appearance.ts';
import { createDefinitionInspection } from '../render/definition-inspection.ts';

import { createFurniturePlayerRuler, measureFurniturePlayer } from './furniture-player-inspection.ts';

type View = 'front' | 'angle' | 'top';
type SceneVariant = 'room' | 'settlement' | 'depth';

function mountPreview(app: HTMLElement, sections: readonly SceneSection[], variant: SceneVariant): HTMLElement {
  const settlement = variant === 'settlement';
  app.innerHTML = `
    <section class="room-preview ${settlement ? 'room-preview-settlement' : ''}" aria-label="透视">
      <header class="room-preview-toolbar">
        <strong>透视 <span data-mode>游戏</span></strong>
        <button type="button" data-play aria-pressed="true">暂停游玩</button>
        ${variant === 'depth' ? '<button type="button" data-render-mode="wireframe" aria-pressed="true" title="淡色半透明格面与轮廓，保留砖块厚度">透视线框</button><button type="button" data-render-mode="solid" aria-pressed="false">实景</button><button type="button" data-landscape-view>大场景全览</button><button type="button" data-play-view>真实游玩视角</button>' : ''}
        <button type="button" data-tools aria-expanded="true" aria-controls="perspective-tools">控制面板</button>
        <a data-definition href="./?mode=concepts#${variant === 'depth' ? 'scene-depth-layers' : 'concept-building'}">定义 ↗</a>
      </header>
      <div class="room-preview-workspace">
        <aside class="room-preview-directory" aria-label="场景分区目录">
          <nav class="room-preview-tabs" aria-label="场景类型">
            <a href="./?mode=resources&scene=room" ${variant === 'room' ? 'aria-current="page"' : ''}>单独场景</a>
            <a href="./?mode=resources&scene=settlement" ${settlement ? 'aria-current="page"' : ''}>大场景</a>
            <a href="./?mode=resources&scene=depth" ${variant === 'depth' ? 'aria-current="page"' : ''}>场景分层</a>
          </nav>
          <h2 class="room-preview-heading">场景目录 <span>${sections.length}</span></h2>
          <nav class="room-preview-sections" aria-label="场景列表">${sections.map((section, index) => `<button type="button" data-section="${index}" aria-pressed="false">${section.title}</button>`).join('')}</nav>

          <details class="room-preview-description"><summary>场景说明</summary><div class="room-preview-caption" aria-live="polite"><strong data-title></strong><span data-description></span></div></details>
          ${variant !== 'depth' ? '<p><a href="./?mode=concepts#solar-grid-and-load">太阳能定义与线框图 ↗</a></p>' : ''}
          <details class="room-preview-coverage"><summary>完整覆盖清单</summary>${sections.map(section => `<h3>${section.title}</h3><ul>${section.items.map(item => `<li>${item}</li>`).join('')}</ul>`).join('')}</details>
        </aside>
        <div class="room-preview-main">
          <div class="room-preview-viewport">
            <div class="room-preview-canvas" aria-label="可游玩并支持鼠标旋转缩放的三维透视场景"></div>
            <div class="room-preview-hud" aria-label="玩家状态与技能">
              <button type="button" class="control-pad control-attack" data-skill="shoot" aria-label="近战攻击">
                <span class="hud-skill-icon" data-icon="keyboard" aria-hidden="true"></span>
                <span class="control-primary-key">J / 左键</span>
              </button>
            </div>

          </div>

        </div>
        <aside id="perspective-tools" class="room-preview-tools" aria-label="控制面板">
          <details class="room-preview-control-section" open>
            <summary>视角</summary>
            <div class="room-preview-camera-controls">
              <div class="room-preview-views" role="group" aria-label="观察角度">
                <button type="button" data-view="front" aria-pressed="true">正常视角</button>
                <button type="button" data-view="angle" aria-pressed="false">斜视</button>
                <button type="button" data-view="top" aria-pressed="false">俯视</button>
              </div>
              <div class="room-preview-control-row">
                <button type="button" data-camera aria-pressed="true">自由镜头</button>
                <button type="button" data-overview>${variant === 'depth' ? '风景全览' : '全景'}</button>
                <button type="button" data-player>玩家</button>
              </div>
              ${variant === 'depth' ? '<button type="button" data-depth-overview>侧看层距</button>' : ''}
            </div>
          </details>
          <details class="room-preview-control-section" open>
            <summary>显示</summary>
            <div class="room-preview-control-row">
              <button type="button" data-grid aria-pressed="${variant !== 'depth'}">格线</button>
              <button type="button" data-wire aria-pressed="${variant !== 'depth'}">半透明</button>
            </div>
          </details>
          <details class="room-preview-control-section" open>
            <summary>${variant === 'depth' ? '天空' : '太阳与光照'}</summary>
            ${variant === 'depth' ? '<div class="room-preview-control-row" role="group" aria-label="天空时段"><button type="button" data-sky="day" aria-pressed="true">白天</button><button type="button" data-sky="night" aria-pressed="false">夜晚</button></div>' : `
            <div class="room-preview-solar" role="group" aria-label="太阳与光照">
              <label for="solar-direction">太阳位置 <output data-solar-position>上方</output></label>
              <input id="solar-direction" type="range" min="-1" max="1" step="0.01" value="0" aria-label="太阳从左到右的位置"/>
              <div class="room-preview-control-row">
                <button type="button" data-solar-auto aria-pressed="true">自动追光</button>
                <button type="button" data-sun-light aria-pressed="true">太阳光照</button>
              </div>
              <label for="sun-intensity">光照强度 <output data-sun-intensity>100%</output></label>
              <input id="sun-intensity" type="range" min="0" max="2" step="0.05" value="1" aria-label="太阳光照强度"/>
            </div>`}
          </details>
          ${variant === 'depth' ? '<details class="room-preview-control-section" open><summary>观察点</summary><nav class="room-preview-depth-stops" data-depth-stops aria-label="场景观察点"></nav></details>' : ''}
          <details class="room-preview-control-section" data-solar-trial hidden open>
            <summary>半格太阳能 · 踩踏试玩</summary>
            <p>快捷站到整排中间的面板上，再沿12块面板左右走动。脚下板受力，身后的板恢复追光；空格跳离。</p>
            <div class="room-preview-control-row">
              <button type="button" data-solar-step="-1">试踩左侧</button>
              <button type="button" data-solar-step="1">试踩右侧</button>
              <button type="button" data-solar-leave>回到地面</button>
            </div>
            <p><output data-solar-load></output></p>
            <small>游玩暂停时面板也暂停。自动追光可关闭，固定太阳后观察回弹。</small>
            <p><a href="./concepts/solar-grid-and-load-perspective.png" target="_blank" rel="noopener">打开线框图 ↗</a></p>
          </details>
            <div class="room-preview-comparison" hidden>
              <strong>家具 × 人物 · 候选方案</strong><small class="room-preview-depth-key">玩家固定砖块中线 · 绿带：前半0.5 · 蓝带：后半0.5</small>
              <label for="furniture-player-x">人物左右位置 <output data-player-position></output></label>
              <input id="furniture-player-x" type="range" step="0.05" disabled />
              <p data-player-measure aria-live="polite">正在加载原尺寸人物…</p>
              <small>滑杆只摆放人物，不是物理行走；穿透与阻挡规则尚未定稿。</small>
            </div>
          <details class="room-preview-control-section">
            <summary>操作与尺寸</summary>
            <p class="room-preview-hint">A / D 移动 · 空格跳跃</p>
            <p class="room-preview-notes">1 格 = 1 世界单位<br>实体深 1 · 墙厚 0.2<br>平台深 0.5 / 0.75<br>男玩家高 ${GRASSY_HEIGHT} 格</p>
          </details>
          ${variant === 'depth' ? `<details class="room-preview-control-section" open><summary>场景图层 · 由近到远</summary><p>逐层关闭，查看遮挡关系；玩家地面始终保留。</p><div class="room-preview-depth-layers">${DEPTH_LAYERS.map((layer, index) => `<label title="${layer.description}"><input type="checkbox" data-depth-layer="${layer.id}" checked /><span>${index + 1} · ${layer.label}<small>${layer.id === 'sky' ? '按画面比例显示' : layer.id === 'clouds' ? '多层漂浮 · 可遮挡天体' : `${layer.distance > 0 ? '玩家前方' : '玩家后方'} ${Math.abs(layer.distance)} 格`}</small></span></label>`).join('')}<button type="button" data-depth-reset>显示全部图层</button></div></details>` : ''}
        </aside>
      </div>
    </section>`;
  const tools = app.querySelector<HTMLElement>('#perspective-tools')!;
  const toggleTools = app.querySelector<HTMLButtonElement>('[data-tools]')!;
  tools.hidden = window.matchMedia('(max-width: 1000px)').matches;
  toggleTools.setAttribute('aria-expanded', String(!tools.hidden));
  toggleTools.addEventListener('click', () => {
    tools.hidden = !tools.hidden;
    toggleTools.setAttribute('aria-expanded', String(!tools.hidden));
    app.querySelector<HTMLCanvasElement>('canvas')!.focus({ preventScroll: true });
  });
  return app.querySelector<HTMLElement>('.room-preview-canvas')!;
}

/** 共享构件与游戏男玩家装配为独立场景或完整聚落。 */
export async function startRoomScenePreview(variant: SceneVariant): Promise<void> {
  document.body.classList.add('room-scene-page');
  document.title = variant === 'depth' ? '透视 · 场景分层' : variant === 'settlement' ? '透视 · 大场景' : '透视 · 单独场景';
  const app = document.getElementById('app')!;
  const disposers: Array<() => void> = [];
  let frame = 0;
  let disposed = false;
  const dispose = (): void => {
    disposed = true;
    cancelAnimationFrame(frame);
    window.removeEventListener('pagehide', dispose);
    for (const release of disposers.splice(0).reverse()) release();
    document.body.classList.remove('room-scene-page');
  };
  window.addEventListener('pagehide', dispose, { once: true });
  try {
    const rooms = variant === 'room' ? createDefinitionSceneLayout() : null;
    const depth = variant === 'depth' ? createDefinitionDepthLayout() : null;
    const settlement = variant === 'settlement' ? createDefinitionSettlementLayout() : null;
    const layout = depth ?? rooms ?? settlement!;
    const solarLayout = rooms ?? settlement;
    disposers.push(layout.dispose);
    const container = mountPreview(app, layout.sections, variant);
    app.querySelector<HTMLButtonElement>('[data-play]')!.disabled = true;
    const stage = createStage(container, TUNING, { quality: 'high', antialias: 'smaa' });
    disposers.push(() => stage.dispose());
    stage.canvas.setAttribute('aria-label', '全定义透视场景与当前男玩家');
    // 资料从内沿看外延；游戏从 +Z 观察，统一映射整个建筑组，保持 X/Y 与深度尺寸。
    layout.root.scale.z = -1;
    stage.scene.add(layout.root);
    const bounds = depth ? depth.bounds : new THREE.Box3().setFromObject(layout.root);
    const size = bounds.getSize(new THREE.Vector3());
    const depthEnvironment = depth ? createDepthEnvironment(stage) : null;
    if (depthEnvironment) disposers.push(() => depthEnvironment.dispose());
    const solarSky = solarLayout ? createCelestialSky() : null;
    if (solarSky) {
      stage.scene.add(solarSky.root);
      disposers.push(() => solarSky.dispose());
    }
    let skyPhase: SkyPhase = 'day';
    const skyButtons = app.querySelectorAll<HTMLButtonElement>('[data-sky]');
    const solarSlider = app.querySelector<HTMLInputElement>('#solar-direction');
    const solarAuto = app.querySelector<HTMLButtonElement>('[data-solar-auto]');
    const solarOutput = app.querySelector<HTMLOutputElement>('[data-solar-position]');
    const sunlight = app.querySelector<HTMLButtonElement>('[data-sun-light]');
    const sunIntensity = app.querySelector<HTMLInputElement>('#sun-intensity');
    const sunIntensityOutput = app.querySelector<HTMLOutputElement>('[data-sun-intensity]');
    const baseSunIntensity = stage.keyLight.intensity;
    let sunlightEnabled = true;
    let sunlightStrength = 1;
    const updateSunIntensity = (): void => {
      stage.keyLight.intensity = sunlightEnabled ? baseSunIntensity * sunlightStrength : 0;
    };
    sunlight?.addEventListener('click', () => {
      sunlightEnabled = !sunlightEnabled;
      sunlight.setAttribute('aria-pressed', String(sunlightEnabled));
      updateSunIntensity();
    });
    sunIntensity?.addEventListener('input', () => {
      sunlightStrength = Number(sunIntensity.value);
      sunIntensityOutput!.value = `${Math.round(sunlightStrength * 100)}%`;
      updateSunIntensity();
    });
    let solarPosition = 0;
    let solarAutomatic = true;
    let solarTime = 0;
    solarSlider?.addEventListener('input', () => {
      solarPosition = Number(solarSlider.value);
      solarAutomatic = false;
      solarAuto!.setAttribute('aria-pressed', 'false');
    });
    solarAuto?.addEventListener('click', () => {
      solarAutomatic = !solarAutomatic;
      solarTime = Math.asin(solarPosition) / .3;
      solarAuto.setAttribute('aria-pressed', String(solarAutomatic));
    });
    if (variant === 'settlement') {
      const width = Math.ceil(bounds.max.x) + 1;
      stage.addBackdrop({ width, height: Math.ceil(bounds.max.y) + 1, surface: new Int16Array(width) });
    }
    const overview: SceneSection = { id: 'all', title: depth ? '全景 · 当前分层场景' : '全景 · 所有组合同时在场', description: '选择左侧分区查看细节；透视投影不会改变实际世界尺寸。', x: bounds.min.x, y: bounds.min.y, width: size.x, height: size.y, playerX: 0, playerY: 0, items: [] };
    stage.camera.far = Math.max(1000, size.x * 8);
    stage.camera.updateProjectionMatrix();
    const controls = new OrbitControls(stage.camera, stage.canvas);
    disposers.push(() => controls.dispose());
    controls.enableDamping = true;
    controls.minDistance = 4;
    controls.maxDistance = size.x * 6;
    controls.minPolarAngle = 0.06;
    controls.maxPolarAngle = Math.PI * 0.78;
    let current = layout.sections.find(section => section.id === (location.hash.slice(1) || 'room-full')) ?? layout.sections[0]!;
    let framing = current;
    let view: View = depth ? 'angle' : 'front';
    let showingDepth = false;
    let rig: ReturnType<typeof createGrassyRig> | null = null;
    let gameplay: ReturnType<typeof createPerspectiveControls> | null = null;
    const inspection = createDefinitionInspection(layout.root);
    if (depth) { inspection.setTranslucent(false); inspection.setLines(false); }
    disposers.push(() => inspection.dispose());
    const viewButtons = app.querySelectorAll<HTMLButtonElement>('[data-view]');
    const viewAngles = (): readonly [number, number] => view === 'front' ? [0, 0] : view === 'top' ? [0, 78] : depth ? [6, 4] : [22, 24];
    const setView = (): void => {
      if (showingDepth) {
        const depthSize = new THREE.Vector3(60, 26, 84);
        const distance = Math.max(depthSize.length(), depthSize.length() / stage.camera.aspect)
          / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov) / 2));
        controls.maxDistance = Math.max(size.x * 6, distance * 1.2);
        controls.target.set(24, 5, -30);
        stage.camera.position.copy(controls.target).add(new THREE.Vector3(.52, .3, .8).normalize().multiplyScalar(distance));
        controls.update();
        for (const option of viewButtons) option.setAttribute('aria-pressed', 'false');
        return;
      }
      const [yaw, pitch] = viewAngles();
      const height = Math.max(framing.height + 3, (framing.width + 4) / stage.camera.aspect) * (framing === overview ? 1.12 : 1);
      const distance = height / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov) / 2));
      const azimuth = THREE.MathUtils.degToRad(yaw);
      const elevation = THREE.MathUtils.degToRad(pitch);
      controls.target.set(framing.x + framing.width / 2, framing.y + framing.height / 2, 0);
      stage.camera.position.set(controls.target.x + distance * Math.sin(azimuth) * Math.cos(elevation), controls.target.y + distance * Math.sin(elevation), distance * Math.cos(azimuth) * Math.cos(elevation));
      controls.update();
      for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.view === view));
    };
    const title = app.querySelector<HTMLElement>('[data-title]')!;
    const description = app.querySelector<HTMLElement>('[data-description]')!;
    const layerInputs = [...app.querySelectorAll<HTMLInputElement>('[data-depth-layer]')];
    for (const input of layerInputs) input.addEventListener('change', () => {
      depthEnvironment!.setLayerVisible(input.dataset.depthLayer as DepthLayerId, input.checked);
    });
    app.querySelector('[data-depth-reset]')?.addEventListener('click', () => {
      for (const input of layerInputs) {
        input.checked = true;
        depthEnvironment!.setLayerVisible(input.dataset.depthLayer as DepthLayerId, true);
      }
    });
    const showDepthStops = (): void => {
      if (!depth) return;
      const stops = DEPTH_STOPS[current.id as keyof typeof DEPTH_STOPS];
      const navigation = app.querySelector<HTMLElement>('[data-depth-stops]')!;
      navigation.innerHTML = stops.map((stop, index) => `<button type="button" data-depth-stop="${index}" aria-pressed="false"><b>${index + 1} · ${stop.name}</b><small>${stop.description}</small></button>`).join('');
      for (const button of navigation.querySelectorAll<HTMLButtonElement>('[data-depth-stop]')) button.addEventListener('click', () => {
        const stop = stops[Number(button.dataset.depthStop)]!;
        gameplay?.select({ ...current, playerX: stop.x, playerY: stop.y });
        view = 'front';
        showingDepth = false;
        gameplay?.setViewAngles(viewAngles());
        for (const option of viewButtons) option.setAttribute('aria-pressed', String(option.dataset.view === view));
        title.textContent = `${current.title} · ${stop.name}`;
        description.textContent = stop.description;
        for (const item of navigation.querySelectorAll('button')) item.setAttribute('aria-pressed', String(item === button));
      });
    };
    const comparison = installFurnitureComparison(app, stage.scene, disposers);
    const solarTrial = app.querySelector<HTMLElement>('[data-solar-trial]')!;
    const solarLoad = app.querySelector<HTMLOutputElement>('[data-solar-load]')!;
    for (const button of app.querySelectorAll<HTMLButtonElement>('[data-solar-step]')) button.addEventListener('click', () => {
      const panel = current.solarTrial!;
      gameplay!.select({ ...current, playerX: panel.x + Number(button.dataset.solarStep) * .25, playerY: panel.y + .5 });
    });
    app.querySelector('[data-solar-leave]')!.addEventListener('click', () => gameplay!.select(current));
    const select = (section: SceneSection): void => {
      showingDepth = false;
      framing = section;
      if (section !== overview) {
        current = section;
        rooms?.showSection(current.id);
        if (depth) skyPhase = current.id === 'ruins' ? 'night' : 'day';
        depthEnvironment?.select(current.id, skyPhase);
        for (const button of skyButtons) {
          button.disabled = current.id === 'cave';
          button.setAttribute('aria-pressed', String(button.dataset.sky === skyPhase));
        }
        for (const input of layerInputs) input.disabled = current.id === 'cave' && (input.dataset.depthLayer === 'sky' || input.dataset.depthLayer === 'clouds');
        showDepthStops();
        comparison.select(current);
        solarTrial.hidden = !current.solarTrial;
        history.replaceState(null, '', `${location.pathname}${location.search}#${current.id}`);
      } else comparison.suspend();
      title.textContent = section.title;
      description.textContent = section.description;
      app.querySelector<HTMLAnchorElement>('[data-definition]')!.href = `./?mode=concepts#${section.id.startsWith('rock-') ? 'natural-rock' : variant === 'depth' ? 'scene-depth-layers' : 'concept-building'}`;
      for (const button of app.querySelectorAll<HTMLButtonElement>('[data-section]')) button.setAttribute('aria-pressed', String(layout.sections[Number(button.dataset.section)] === section));
      setView();
      if (section !== overview) gameplay?.select(current);
      if (depth) { gameplay?.observe(); setView(); }
    };
    for (const button of app.querySelectorAll<HTMLButtonElement>('[data-section]')) button.addEventListener('click', () => select(layout.sections[Number(button.dataset.section)]!));
    for (const button of skyButtons) button.addEventListener('click', () => {
      skyPhase = button.dataset.sky as SkyPhase;
      depthEnvironment!.select(current.id, skyPhase);
      for (const option of skyButtons) option.setAttribute('aria-pressed', String(option === button));
      if (gameplay?.playing) stage.canvas.focus({ preventScroll: true });
    });
    for (const button of viewButtons) button.addEventListener('click', () => {
      showingDepth = false;
      view = button.dataset.view as View;
      gameplay?.setViewAngles(viewAngles());
      if (!gameplay?.following) setView();
      for (const option of viewButtons) option.setAttribute('aria-pressed', String(option === button));
      if (gameplay?.playing) stage.canvas.focus({ preventScroll: true });
    });
    app.querySelector('[data-overview]')!.addEventListener('click', () => {
      if (rooms) { framing = current; setView(); } else select(overview);
      gameplay?.observe();
    });
    app.querySelector('[data-depth-overview]')?.addEventListener('click', () => {
      gameplay?.observe();
      showingDepth = true;
      setView();
      title.textContent = `${current.title} · 侧看层距`;
      description.textContent = '近景在玩家前方；两层背景格子与三层远景向后展开。使用场景图层开关比较，点击观察点回到玩家视角。';
    });
    app.querySelector('[data-player]')!.addEventListener('click', () => {
      showingDepth = false;
      gameplay?.observe();
      framing = { ...current, x: (rig ? rig.root.position.x : current.playerX) - 3.5, y: (rig ? rig.root.position.y : current.playerY) - 0.5, width: 7, height: 5 };
      title.textContent = `${current.title} · 男玩家`;
      description.textContent = `原尺寸 ${GRASSY_HEIGHT} 格，使用游戏中的模型与动画。`;
      setView();
    });
    const gridButton = app.querySelector<HTMLButtonElement>('[data-grid]')!;
    gridButton.addEventListener('click', () => {
      const visible = gridButton.getAttribute('aria-pressed') !== 'true';
      inspection.setLines(visible); gridButton.setAttribute('aria-pressed', String(visible));
      depthEnvironment?.setLines(visible);
      if (gameplay?.playing) stage.canvas.focus({ preventScroll: true });
    });
    const translucent = app.querySelector<HTMLButtonElement>('[data-wire]')!;
    translucent.addEventListener('click', () => {
      const enabled = translucent.getAttribute('aria-pressed') !== 'true';
      inspection.setTranslucent(enabled); translucent.setAttribute('aria-pressed', String(enabled));
      depthEnvironment?.setTranslucent(enabled);
      if (gameplay?.playing) stage.canvas.focus({ preventScroll: true });
    });
    const renderButtons = app.querySelectorAll<HTMLButtonElement>('[data-render-mode]');
    const setWireframe = (enabled: boolean): void => {
      inspection.setWireframe(enabled);
      depthEnvironment!.setWireframe(enabled);
      gridButton.disabled = enabled;
      translucent.disabled = enabled;
      for (const button of renderButtons) button.setAttribute('aria-pressed', String((button.dataset.renderMode === 'wireframe') === enabled));
    };
    for (const button of renderButtons) button.addEventListener('click', () => {
      setWireframe(button.dataset.renderMode === 'wireframe');
      stage.canvas.focus({ preventScroll: true });
    });
    app.querySelector('[data-landscape-view]')?.addEventListener('click', () => {
      view = 'angle';
      select(overview);
    });
    const playView = app.querySelector<HTMLButtonElement>('[data-play-view]');
    if (playView) playView.disabled = true;
    playView?.addEventListener('click', () => {
      showingDepth = false;
      view = 'front';
      inspection.setTranslucent(false); depthEnvironment!.setTranslucent(false);
      inspection.setLines(false); depthEnvironment!.setLines(false);
      translucent.setAttribute('aria-pressed', 'false'); gridButton.setAttribute('aria-pressed', 'false');
      setWireframe(false);
      gameplay!.setViewAngles(viewAngles());
      for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.view === view));
      title.textContent = `${current.title} · 真实游玩视角`;
      stage.canvas.focus({ preventScroll: true });
    });
    if (depth) setWireframe(true);
    const resize = new ResizeObserver(() => { stage.setSize(container.clientWidth, container.clientHeight); if (!gameplay?.following) setView(); });
    resize.observe(container);
    disposers.push(() => resize.disconnect());
    comparison.select(current);
    select(current);
    depthEnvironment?.update(stage.camera, 0);
    stage.render();
    disposers.push(disposeGrassyAssets);
    await loadGrassyAsset('game');
    if (disposed) return;
    rig = createGrassyRig('game', undefined, createCharacterAppearanceStore(window.localStorage).current());
    // 标记角色的实际像素轮廓，只让单向平台与检查线避让，不关闭实体墙的深度测试。
    rig.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        material.stencilWrite = true;
        material.stencilRef = 1;
        material.stencilZPass = THREE.ReplaceStencilOp;
      }
    });
    disposers.push(() => rig!.dispose());
    rig.root.position.set(current.playerX, current.playerY, 0);
    animateGrassy(rig, 'idle', 0, 0, null);
    stage.scene.add(rig.root);
    comparison.attach(rig.root);
    gameplay = createPerspectiveControls(app, stage, controls, rig, layout.collision, bounds, current, viewAngles(), solarLayout ? solarLayout.solarPanels : []);
    disposers.push(() => gameplay!.dispose());
    gameplay.select(current);
    if (playView) playView.disabled = false;
    if (depth) { gameplay.observe(); setView(); }
    document.getElementById('loading')!.hidden = true;
    let previous: number | null = null;
    let time = 0;
    const draw = (now: number): void => {
      const dt = previous === null ? 0 : Math.min((now - previous) / 1000, 0.05);
      previous = now;
      time += dt;
      if (solarLayout) {
        if (solarAutomatic) {
          solarTime += dt;
          solarPosition = Math.sin(solarTime * .3);
          solarSlider!.value = String(solarPosition);
        }
        const angle = solarPosition * Math.PI / 2;
        // 太阳沿可见天空弧线移动，天体、主光和面板共享同一世界方向。
        const sunDirection = { x: .26 * Math.sin(angle), y: .19 + .01 * Math.cos(angle), z: -1 };
        solarSky!.setSunDirection(sunDirection);
        solarLayout.setSunDirection(sunDirection);
        stage.setSunDirection(sunDirection);
        solarOutput!.value = Math.abs(solarPosition) < .03 ? '上方' : `${solarPosition < 0 ? '左侧' : '右侧'} ${Math.round(THREE.MathUtils.radToDeg(Math.atan2(Math.abs(sunDirection.x), sunDirection.y)))}°`;
      }
      gameplay!.update(dt);
      solarLayout?.update(time);
      if (current.solarTrial) {
        const panel = current.solarTrial;
        solarLoad.value = `${panel.loaded ? '玩家压板' : '无人 · 恢复追光'} · 面板 ${THREE.MathUtils.radToDeg(panel.angle).toFixed(1)}° · 太阳目标 ${THREE.MathUtils.radToDeg(panel.sunAngle).toFixed(1)}°`;
      }
      if (controls.enabled) controls.update();
      solarSky?.update(stage.camera);
      depthEnvironment?.update(stage.camera, dt);
      stage.render();
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
  } catch (error) {
    dispose();
    throw error;
  }
}

function installFurnitureComparison(app: HTMLElement, scene: THREE.Scene, disposers: Array<() => void>) {
  const panel = app.querySelector<HTMLElement>('.room-preview-comparison')!;
  const slider = app.querySelector<HTMLInputElement>('#furniture-player-x')!;
  const position = app.querySelector<HTMLOutputElement>('[data-player-position]')!;
  const measurement = app.querySelector<HTMLElement>('[data-player-measure]')!;
  const ruler = createFurniturePlayerRuler();
  scene.add(ruler.root);
  ruler.root.visible = false;
  disposers.push(() => ruler.dispose());
  let player: THREE.Group | null = null;
  let bounds: ReturnType<typeof measureFurniturePlayer> | null = null;
  let current: SceneSection | null = null;
  const fade = (root: THREE.Group, opacity: number): void => {
    root.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        material.transparent = opacity < 1;
        material.opacity = opacity;
        material.depthWrite = opacity === 1;
      }
      node.castShadow = opacity === 1;
    });
  };
  const place = (): void => {
    if (!player || !current) return; // 资源异步加载期间目录仍可使用。
    const example = current.comparison;
    player.position.set(example ? Number(slider.value) : current.playerX, current.playerY, 0);
    player.rotation.y = example ? Math.PI / 2 : -.18;
    ruler.root.visible = !!example;
    ruler.root.position.copy(player.position);
    if (!example) return;
    position.textContent = `X ${(player.position.x - current.x).toFixed(2)} · 脚底 Y ${current.playerY.toFixed(2)} · 砖块中线 Z 0`;
    if (example.fadeFurniture) fade(example.fadeFurniture, player.position.x > current.x + 2.6 && player.position.x < current.x + 6.4 ? .2 : 1);
  };
  slider.addEventListener('input', place);
  const select = (section: SceneSection): void => {
    if (current?.comparison?.fadeFurniture) fade(current.comparison.fadeFurniture, 1);
    current = section;
    const example = section.comparison;
    panel.hidden = !example;
    if (example) {
      slider.min = String(example.fromX); slider.max = String(example.toX); slider.value = String(section.playerX);
      if (bounds) {
        const low = bounds.lowerMinZ;
        const high = bounds.lowerMaxZ;
        measurement.textContent = `待机采样：全身前后包络 ${(bounds.maxZ - bounds.minZ).toFixed(2)} 格；脚底上1格内包络 ${(bounds.lowerMaxZ - bounds.lowerMinZ).toFixed(2)} 格。`
          + (section.id === 'furniture-half' ? ` 玩家位于砖块中线 Z=0，前半空间 Z=[0,0.5]，下肢包络 Z=[${low.toFixed(2)},${high.toFixed(2)}]，${low >= 0 && high <= .5 ? '此采样位于半格内' : '仍超出半格边界'}。` : '')
          + ' 包络不等于精确碰撞，行走动画另需验证。';
      }
    }
    place();
  };
  return {
    select,
    suspend(): void {
      if (current?.comparison?.fadeFurniture) fade(current.comparison.fadeFurniture, 1);
      panel.hidden = true;
      ruler.root.visible = false;
    },
    attach(root: THREE.Group): void {
      player = root;
      root.rotation.y = Math.PI / 2;
      bounds = measureFurniturePlayer(root);
      slider.disabled = false;
      select(current!);
    },
  };
}

