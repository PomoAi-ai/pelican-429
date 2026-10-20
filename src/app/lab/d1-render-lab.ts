import * as THREE from 'three';
import { DEFAULT_SPHERICAL_EYE_HAIRS, HAIR_ASSETS, HAIR_LABELS, SPHERICAL_EYE_HAIRS, hairTitle, isBlenderHair, readHairStyle, type HairStyle } from './d1-lab-hair-catalog.ts';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { D1_ACTIONS, type D1AnimatedVariant } from '../../config/grassy.ts';
import { D1_ARTWORK } from '../../config/showcase.ts';
import { createD1Rig, disposeD1Assets, loadD1Asset } from '../../render/grassy/d1-rig.ts';
import { applyD1LabLooks, D1_LAB_VERSIONS, type D1LabVersion } from '../../render/grassy/d1-lab-looks.ts';
import { createD1LabMotion } from '../../render/grassy/d1-lab-motion.ts';
import { createD1LabGaits } from '../../render/grassy/d1-lab-gait.ts';
import { contourD1LabHair } from '../../render/grassy/d1-lab-hair-contour.ts';
import { loadCharacterModel } from '../../render/character/character-model.ts';
import { disposeModelResources } from '../../render/character/model-resources.ts';
import type { PageContext } from '../shell/page-context.ts';
import { pageRenderer } from '../shell/page-renderer.ts';
import { createViewLoop } from '../shell/view-loop.ts';
import { TUNING } from '../../config/tuning.ts';
import { createStudioLights } from '../../render/stage/light-presets.ts';
import '../../ui/lab/d1-render-lab.css';

const TEMPLATE = `
<header class="lab-header">
  <div class="lab-brand"><span class="lab-mark" aria-hidden="true">D1</span><div><p>PELICAN 429 / RENDER STUDY</p><h1>独立渲染实验</h1></div></div>
  <div class="lab-header-links">
    <a href="./?mode=render-lab&amp;hair=showcase&amp;framing=head&amp;angle=0&amp;projection=orthographic">头部对比预览</a>
    <a id="lab-showcase-link" href="./?mode=showcase&amp;stageActor=d1.idle,1,1,0.7854,0,1,1,outfit,1&amp;textures=web-1k" target="_blank" rel="noopener">打开当前展示场 <span aria-hidden="true">↗</span></a>
  </div>
</header>
<fieldset id="lab-hair-controls" class="lab-hair-picker" disabled aria-describedby="lab-hair-version-hint"><legend>模型 / 头发版本</legend><div class="lab-hair-buttons" role="group" aria-label="模型 / 头发版本"></div>
<p id="lab-hair-version-hint" class="lab-version-description">新头发在 Blender 中按发束制作，重点检查正面、侧面和头皮贴合。保留所选八款发型，并加入游戏正式精细版对照；切换保留当前视角。</p>
</fieldset>
<main class="lab-layout">
  <section class="lab-stage" data-view-mode="all" aria-label="D1 实时渲染预览">
    <div id="lab-canvas"></div>
    <div class="lab-stage-toolbar"><div><strong id="lab-view-title">全部版本</strong><p id="lab-view-description">点击任一角色放大 · 拖动任一角色同步旋转</p></div><button id="lab-show-all" type="button" hidden>← 返回全部版本</button></div>
    <div id="lab-gallery" class="lab-gallery" aria-label="全部渲染版本"></div>
    <div id="lab-status" class="lab-status" role="status" aria-live="polite">正在准备角色与材质…</div>
    <p class="lab-stage-help">拖动旋转 · 滚轮缩放 · 右键平移</p>
    <span class="lab-stage-note">同一镜头 · 同一动作 · 同一光照</span>
  </section>
  <aside class="lab-panel" aria-label="渲染实验控制">
    <div class="lab-intro"><p class="lab-eyebrow">LOOK DEVELOPMENT</p><h2>保留每一版的美感</h2><p>全部渲染版本同时展示，点击任一版本放大查看。镜头、光照、动作和眨眼同步。</p></div>
    <fieldset id="lab-controls" disabled>
      <section class="lab-control-section">
        <h3><span>01</span>眼球注视</h3>
        <label class="lab-version-select" for="lab-eye-version">眼睛版本<select id="lab-eye-version" aria-describedby="lab-eye-hint"><option value="patch">原眼片（保留对照）</option><option value="sphere">球形眼球 · 可转动视线</option></select></label>
        <p id="lab-eye-hint" class="lab-control-hint">31、34、35、39、40、41、42、43、44、45、46、47 支持球眼；39、40、41、42、43、44、45、46、47 默认启用。可切换原眼片对照。</p>
        <fieldset id="lab-gaze-controls" hidden disabled>
          <legend class="lab-eyebrow">控制注视方向</legend>
          <label class="lab-version-select" for="lab-gaze-mode">注视方式<select id="lab-gaze-mode"><option value="manual">手动方向</option><option value="pointer">跟随鼠标</option><option value="auto">自然扫视</option></select></label>
          <div class="lab-gaze-grid" role="group" aria-label="注视方向，按正面画面的左右"><button type="button" data-gaze-yaw="-15" data-gaze-pitch="10" aria-label="注视左上" aria-pressed="false">↖</button><button type="button" data-gaze-yaw="0" data-gaze-pitch="10" aria-label="注视向上" aria-pressed="false">↑</button><button type="button" data-gaze-yaw="15" data-gaze-pitch="10" aria-label="注视右上" aria-pressed="false">↗</button><button type="button" data-gaze-yaw="-15" data-gaze-pitch="0" aria-label="注视向左" aria-pressed="false">←</button><button id="lab-gaze-center" type="button" data-gaze-yaw="0" data-gaze-pitch="0" aria-label="注视正视前方" aria-pressed="false">正视</button><button type="button" data-gaze-yaw="15" data-gaze-pitch="0" aria-label="注视向右" aria-pressed="false">→</button><button type="button" data-gaze-yaw="-15" data-gaze-pitch="-10" aria-label="注视左下" aria-pressed="false">↙</button><button type="button" data-gaze-yaw="0" data-gaze-pitch="-10" aria-label="注视向下" aria-pressed="false">↓</button><button type="button" data-gaze-yaw="15" data-gaze-pitch="-10" aria-label="注视右下" aria-pressed="false">↘</button></div>
          <label class="lab-range-label" for="lab-gaze-yaw">左右视线 <output id="lab-gaze-yaw-value" for="lab-gaze-yaw">0°</output></label>
          <input id="lab-gaze-yaw" type="range" min="-18" max="18" step="1" value="0" />
          <label class="lab-range-label" for="lab-gaze-pitch">上下视线 <output id="lab-gaze-pitch-value" for="lab-gaze-pitch">0°</output></label>
          <input id="lab-gaze-pitch" type="range" min="-12" max="12" step="1" value="0" />
          <p class="lab-control-hint">左右按正面画面计算，旋转镜头后仍按头部方向。跟随鼠标时，在角色画面内移动；拖动仍旋转镜头。所有渲染同步，暂停动画也能控制视线。</p>
        </fieldset>
      </section>
      <section class="lab-control-section">
        <h3><span>02</span>配色与观察</h3>
        <label class="lab-version-select" for="lab-projection">比较镜头<select id="lab-projection" aria-describedby="lab-projection-hint"><option value="perspective">近景透视 · 原镜头</option><option value="orthographic">等比例 · 原画对照</option></select></label>
        <p id="lab-projection-hint" class="lab-control-hint">等比例镜头避免前额和刘海因离镜头近而放大，便于检查正面与侧面轮廓。</p>
        <div class="lab-segment" role="group" aria-label="取景范围"><button type="button" data-framing="body" aria-pressed="true">全身</button><button type="button" data-framing="head" aria-pressed="false">头部特写</button></div>
        <div class="lab-angles" role="group" aria-label="观察角度"><button type="button" data-angle="-90" aria-pressed="false">左侧</button><button type="button" data-angle="-45" aria-pressed="false">左45°</button><button type="button" data-angle="0" aria-pressed="false">正面</button><button type="button" data-angle="45" aria-pressed="true">右45°</button><button type="button" data-angle="90" aria-pressed="false">右侧</button><button type="button" data-angle="180" aria-pressed="false">背面</button></div>
      </section>
      <section class="lab-control-section">
        <h3><span>03</span>动作研究</h3>
        <div class="lab-action-row"><label class="lab-action-select" for="lab-action">动作<select id="lab-action"></select></label><label class="lab-action-select" for="lab-speed">播放速度<select id="lab-speed"><option value="0.25">0.25× · 慢放</option><option value="0.5">0.5× · 慢放</option><option value="1" selected>1× · 正常</option><option value="1.5">1.5× · 加速</option></select></label></div>
        <label class="lab-action-select lab-gait-select" for="lab-gait">步态版本<select id="lab-gait" aria-describedby="lab-gait-hint"><option value="original" selected>原动作（保留）</option><option value="smooth">顺滑步态（实验）</option></select></label>
        <p id="lab-gait-hint" class="lab-control-hint">仅走路、跑步；切换保留当前进度。</p>
        <label class="lab-range-label" for="lab-timeline">动作进度 <output id="lab-time" for="lab-timeline">0.00 / 0.00 秒</output></label>
        <input id="lab-timeline" type="range" min="0" max="1" step="0.0001" value="0" aria-describedby="lab-motion-hint" />
        <div class="lab-motion-buttons"><button id="lab-step-back" type="button" aria-label="后退一帧，1/30 秒">上一帧</button><button id="lab-pause" type="button" aria-pressed="false">暂停动画</button><button id="lab-step-forward" type="button" aria-label="前进一帧，1/30 秒">下一帧</button><button id="lab-replay" type="button">重播</button></div>
        <p id="lab-motion-hint" class="lab-control-hint">拖动进度暂停定位。逐帧步长 1/30 秒；暂停时自动眨眼一同停止。</p>
      </section>
      <section class="lab-control-section">
        <h3><span>04</span>眨眼与头发</h3>
        <label class="lab-version-select" for="lab-animation-version">模型动画<select id="lab-animation-version"><option value="refined" selected>修正版</option><option value="original">原版（保留）</option></select></label>
        <p class="lab-control-hint lab-animation-hint">全部渲染版本共用所选动画，可切换方式对照。</p>
        <label class="lab-toggle" for="lab-auto-blink"><span>自动眨眼</span><input id="lab-auto-blink" type="checkbox" checked /></label>
        <label class="lab-range-label" for="lab-closure">眼睑闭合 <output id="lab-closure-value" for="lab-closure">自动</output></label>
        <input id="lab-closure" type="range" min="0" max="1" step="0.01" value="0" disabled />
        <div class="lab-range-ends"><span>睁开</span><span>闭合</span></div>
        <label class="lab-toggle lab-hair-toggle" for="lab-hair-motion"><span>头发惯性</span><input id="lab-hair-motion" type="checkbox" checked aria-describedby="lab-hair-hint" /></label>
        <p id="lab-hair-hint" class="lab-control-hint">修正版在全部渲染中启用发梢惯性；原版保留之前的动画。</p>
      </section>
      <section class="lab-control-section">
        <h3><span>05</span>灯光</h3>
        <label class="lab-range-label" for="lab-light-angle">主光方位 <output id="lab-light-angle-value" for="lab-light-angle">−35°</output></label>
        <input id="lab-light-angle" type="range" min="-180" max="180" step="1" value="-35" />
        <label class="lab-range-label" for="lab-light-power">主光强度 <output id="lab-light-power-value" for="lab-light-power">3.0</output></label>
        <input id="lab-light-power" type="range" min="0" max="5" step="0.1" value="3" />
        <p class="lab-control-hint">暖主光、冷轮廓光与柔和环境补光。</p>
      </section>
    </fieldset>
    <figure class="lab-reference"><figcaption>配色参考 <span>外服 · 细腿定稿</span></figcaption><a id="lab-reference-link" target="_blank" rel="noopener" aria-label="打开 D1 外服原画大图"><img id="lab-reference-image" alt="D1 外服定稿原画，包含正面、侧面、背面和头部多视图" /><span>打开原画大图 ↗</span></a></figure>
    <details class="lab-definition" open><summary>这次如何渲染</summary><dl><div><dt>V7</dt><dd>动画明暗分层，强调原画线条与发束高光。</dd></div><div><dt>V8</dt><dd>连续柔光与丝绸反射，观察布料和头发的亮面。</dd></div><div><dt>V9</dt><dd>暖彩色块与冷暖暗部，保留手绘感。</dd></div><div><dt>V10</dt><dd>保留原画发色，只加入少量现场光照。</dd></div><div><dt>头发</dt><dd>Blender 发束模型与独立发色贴图共用同步光照，发根固定、发梢柔和跟随。各阶段造型均可切换对比。</dd></div></dl></details>
    <p class="lab-isolation-note">独立实验页面，使用角色与候选头发资源。</p>
  </aside>
</main>
`;

type PreviewCard = { version: D1LabVersion; element: HTMLElement; button: HTMLButtonElement; viewport: HTMLElement };
type Projection = 'perspective' | 'orthographic';

function readVersion(value: string, cards: PreviewCard[]): D1LabVersion {
  const version = cards.find(candidate => candidate.version === value);
  if (!version) throw new Error(`未知渲染版本：${value}`);
  return version.version;
}

function createPreviewCards(): PreviewCard[] {
  const gallery = document.querySelector<HTMLElement>('#lab-gallery')!;
  gallery.replaceChildren();
  const versions = D1_LAB_VERSIONS;
  gallery.setAttribute('aria-label', `${versions.length} 套渲染版本`);
  document.querySelector<HTMLButtonElement>('#lab-show-all')!.textContent = `← 返回全部 ${versions.length} 版`;
  return versions.map(version => {
    const element = document.createElement('article');
    element.className = 'lab-preview-card';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lab-card-title';
    button.textContent = version.label;
    button.title = version.description;
    button.setAttribute('aria-label', `放大 ${version.label}`);
    const viewport = document.createElement('div');
    viewport.className = 'lab-card-viewport';
    element.append(button, viewport);
    gallery.append(element);
    return { version: version.id, element, button, viewport };
  });
}

function createStudio(host: HTMLElement, cards: PreviewCard[], projection: Projection, renderer: THREE.WebGLRenderer) {
  // 各版本按分组复用同一张阴影图，由 render 决定何时重画。
  renderer.shadowMap.autoUpdate = false;
  renderer.domElement.setAttribute('aria-label', 'D1 三维角色，可拖动旋转视角');
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e4dfd6');
  scene.fog = new THREE.Fog('#e4dfd6', 16, 35);
  const camera = projection === 'perspective'
    ? new THREE.PerspectiveCamera(35, 1, .1, 80)
    : new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 80);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = .8;
  controls.maxDistance = 12;
  controls.minZoom = .4;
  controls.maxZoom = 4;
  controls.maxPolarAngle = Math.PI * (projection === 'orthographic' ? .5 : .49);

  const lights = createStudioLights(2048);
  scene.add(...lights.objects);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#d4cdc1', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.012;
  ground.receiveShadow = true;
  scene.add(ground);

  let views: Array<{ version: D1LabVersion; x: number; y: number; width: number; height: number }> = [];
  let viewAspect = 1;
  let frameHeight = 4.3;
  let frameWidth = 2.1;
  const framingDistance = (aspect: number): number => camera instanceof THREE.PerspectiveCamera
    ? Math.max(frameHeight, frameWidth / aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
    : 4;
  const updateProjection = (aspect: number): void => {
    if (camera instanceof THREE.PerspectiveCamera) camera.aspect = aspect;
    else {
      const height = Math.max(frameHeight, frameWidth / aspect);
      camera.left = -height * aspect / 2;
      camera.right = height * aspect / 2;
      camera.top = height / 2;
      camera.bottom = -height / 2;
    }
    camera.updateProjectionMatrix();
  };
  const resizeViewport = (): void => {
    const hostRect = host.getBoundingClientRect();
    views = cards.filter(card => !card.element.hidden).map(card => {
      const rect = card.viewport.getBoundingClientRect();
      return { version: card.version, x: rect.left - hostRect.left, y: hostRect.bottom - rect.bottom, width: rect.width, height: rect.height };
    });
    const aspect = views[0]!.width / views[0]!.height;
    // 按视口比例调整取景，保留手动旋转、平移与缩放的相对位置。
    camera.position.sub(controls.target).multiplyScalar(framingDistance(aspect) / framingDistance(viewAspect)).add(controls.target);
    viewAspect = aspect;
    updateProjection(aspect);
    controls.rotateSpeed = host.clientHeight / views[0]!.height;
    renderer.setSize(host.clientWidth, host.clientHeight);
  };
  const resize = new ResizeObserver(resizeViewport);
  resize.observe(host);
  resizeViewport();
  return {
    renderer, scene, camera, controls, key: lights.key, setLightAngle: lights.setAngle,
    resize: resizeViewport,
    frame(head: boolean, angle: number) {
      frameHeight = head ? (projection === 'orthographic' ? 1.5 : 1.55) : 4.3;
      frameWidth = head ? frameHeight : 2.1;
      const distance = framingDistance(viewAspect);
      const radians = THREE.MathUtils.degToRad(angle);
      controls.target.set(0, head ? (projection === 'orthographic' ? 2.64 : 2.52) : 1.7, 0);
      camera.zoom = 1;
      camera.position.set(-Math.sin(radians) * distance, controls.target.y + (projection === 'perspective' ? distance * .035 : 0), Math.cos(radians) * distance);
      updateProjection(viewAspect);
      controls.update();
    },
    render(look: ReturnType<typeof applyD1LabLooks>) {
      renderer.setScissorTest(false);
      renderer.clear();
      renderer.setScissorTest(true);
      let shadowGroup: string | null = null;
      for (const view of views) {
        updateProjection(view.width / view.height);
        renderer.setViewport(view.x, view.y, view.width, view.height);
        renderer.setScissor(view.x, view.y, view.width, view.height);
        look.setVersion(view.version);
        // 原材质、摄影棚和研究材质的头发/眼部投影不同，同组可复用投影。
        const study = view.version === 'v7' || view.version === 'v8' || view.version === 'v9' || view.version === 'v10';
        const group = view.version === 'showcase' ? 'showcase' : study ? 'study' : 'studio';
        renderer.shadowMap.needsUpdate = shadowGroup !== group;
        shadowGroup = group;
        renderer.render(scene, camera);
      }
      renderer.setScissorTest(false);
    },
    dispose() {
      resize.disconnect();
      controls.dispose();
      lights.dispose();
      ground.geometry.dispose();
      ground.material.dispose();
      renderer.domElement.remove();
    },
  };
}

function bindGallery(studio: ReturnType<typeof createStudio>, cards: PreviewCard[], signal: AbortSignal): void {
  const stage = document.querySelector<HTMLElement>('.lab-stage')!;
  const back = document.querySelector<HTMLButtonElement>('#lab-show-all')!;
  const title = document.querySelector<HTMLElement>('#lab-view-title')!;
  const description = document.querySelector<HTMLElement>('#lab-view-description')!;
  let focused: D1LabVersion | null = null;
  const show = (version: D1LabVersion | null): void => {
    focused = version;
    stage.dataset.viewMode = version ? 'focus' : 'all';
    studio.controls.enableZoom = version !== null;
    studio.renderer.domElement.style.touchAction = version ? 'none' : 'pan-y pinch-zoom';
    document.querySelector<HTMLElement>('.lab-stage-help')!.textContent = version ? '拖动旋转 · 滚轮缩放 · 右键平移' : '拖动旋转 · 滚动浏览全部版本';
    const selected = D1_LAB_VERSIONS.find(candidate => candidate.id === version);
    title.textContent = selected ? selected.label : `全部 ${cards.length} 版`;
    description.textContent = selected ? selected.description : '点击任一角色放大 · 拖动任一角色同步旋转';
    back.hidden = version === null;
    for (const card of cards) card.element.hidden = version !== null && card.version !== version;
    studio.resize();
    const url = new URL(location.href);
    url.searchParams.delete('left');
    url.searchParams.delete('right');
    if (version) url.searchParams.set('version', version);
    else url.searchParams.delete('version');
    history.replaceState(history.state, '', url);
  };
  for (const card of cards) card.button.addEventListener('click', () => {
    show(card.version);
    back.focus();
  }, { signal });
  back.addEventListener('click', () => {
    const previous = focused;
    show(null);
    cards.find(card => card.version === previous)!.button.focus();
  }, { signal });
  let pointerStart: { x: number; y: number; id: number } | null = null;
  const canvas = studio.renderer.domElement;
  canvas.addEventListener('pointerdown', event => {
    pointerStart = event.button === 0 && event.isPrimary ? { x: event.clientX, y: event.clientY, id: event.pointerId } : null;
  }, { signal });
  canvas.addEventListener('pointermove', event => {
    if (pointerStart && event.pointerId === pointerStart.id && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 4) pointerStart = null;
  }, { signal });
  canvas.addEventListener('pointerup', event => {
    const start = pointerStart;
    pointerStart = null;
    if (focused || !start || event.pointerId !== start.id || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return;
    const card = cards.find(candidate => {
      const rect = candidate.viewport.getBoundingClientRect();
      return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    });
    if (card) { show(card.version); back.focus(); }
  }, { signal });
  canvas.addEventListener('pointercancel', () => { pointerStart = null; }, { signal });
  const version = new URLSearchParams(location.search).get('version');
  show(version === null ? null : readVersion(version, cards));
}

function bindHairControl(hairStyle: HairStyle, signal: AbortSignal): void {
  const buttons = (Object.keys(HAIR_LABELS) as HairStyle[]).map(hair => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.hair = hair;
    button.setAttribute('aria-pressed', String(hair === hairStyle));
    button.textContent = hairTitle(hair);
    return button;
  });
  document.querySelector<HTMLElement>('.lab-hair-buttons')!.replaceChildren(...buttons);
  if (hairStyle === 'showcase' || hairStyle === 'game-detailed') {
    document.querySelector<HTMLElement>('#lab-hair-version-hint')!.textContent = '已单独保留这次链接中的白色基础服游戏标准版、完整头发和原动作；原材质基准与全部实验渲染使用统一棚光。';
    document.querySelector<HTMLElement>('#lab-hair-hint')!.textContent = '此项保留展示场头发，随原骨骼动作，不叠加实验发梢变形。';
    document.querySelector<HTMLInputElement>('#lab-hair-motion')!.checked = false;
    document.querySelector<HTMLInputElement>('#lab-hair-motion')!.disabled = true;
    document.querySelector<HTMLSelectElement>('#lab-gait')!.disabled = true;
    document.querySelector<HTMLElement>('#lab-gait-hint')!.textContent = '基础版使用展示场的原始动作。';
    document.querySelector<HTMLElement>('.lab-intro > p:last-child')!.textContent = '原材质基准与全部实验渲染同时展示。镜头、动作和闭合度同步，点击任一版本放大查看。';
    document.querySelector<HTMLElement>('.lab-definition dl > div:last-child dd')!.textContent = '本次展示场完整发型已单独保留，原材质基准与全部渲染统一比较；顶部链接打开当前展示场，会随正式模型更新。';
    const link = document.querySelector<HTMLAnchorElement>('#lab-showcase-link')!;
    link.href = './?mode=showcase&stageActor=d1.idle,1,0,1.5708,0,1,1,game,1&stageZoom=3.5&stageAngle=0&stageEnvironment=surface&textures=web-1k';
    if (hairStyle === 'game-detailed') {
      link.href = './?mode=showcase&stageActor=d1.idle,1,0,1.5708,0,1,1,detailed,1&stageZoom=3.5&stageEnvironment=surface&textures=web-1k';
      document.querySelector<HTMLElement>('#lab-hair-version-hint')!.textContent = '游戏当前精细检查版，直接复用正式模型、完整头发和原生眼睛着色；与01历史游戏标准版对照。';
    }
    link.textContent = '查看当前展示场 ↗';
  }
  if (isBlenderHair(hairStyle)) {
    const animation = document.querySelector<HTMLSelectElement>('#lab-animation-version')!;
    animation.options[0]!.text = '逐束动态';
    animation.options[1]!.text = '刚性跟随对照';
    document.querySelector<HTMLElement>('#lab-hair-hint')!.textContent = '发根与编辫固定，发梢随头部运动弯曲；可关闭惯性检查贴合。';
  }
  if (hairStyle === 'blender-d12') {
    const hairMotion = document.querySelector<HTMLInputElement>('#lab-hair-motion')!;
    hairMotion.checked = false;
    hairMotion.disabled = true;
    const animation = document.querySelector<HTMLSelectElement>('#lab-animation-version')!;
    animation.options[0]!.text = '修正版';
    animation.options[1]!.text = '原版（保留）';
    document.querySelector<HTMLElement>('#lab-hair-version-hint')!.textContent = 'D12 细发丝阶段稿：来自 Blender 当前发型，可实时旋转、缩放，检查正面与侧面贴合；旧版仍可切换对照。';
    document.querySelector<HTMLElement>('#lab-hair-hint')!.textContent = '保留 D12 发型与原骨架动作，逐束惯性待适配。';
    document.querySelector<HTMLElement>('.lab-definition dl > div:last-child dd')!.textContent = 'D12 使用当前 Blender 发型的真实发丝与编辫，随原骨架动作；逐束惯性待适配。各阶段造型均可切换对比。';
  }
  for (const button of buttons) button.addEventListener('click', () => {
    const selected = readHairStyle(button.dataset.hair!);
    if (selected === hairStyle) return;
    const url = new URL(location.href);
    url.searchParams.set('hair', selected);
    if (!SPHERICAL_EYE_HAIRS.includes(selected)) url.searchParams.set('eyes', 'patch');
    location.assign(url.href);
  }, { signal });
}

function bindMotionControls(motion: ReturnType<typeof createD1LabMotion>, signal: AbortSignal): () => void {
  const actionSelect = document.querySelector<HTMLSelectElement>('#lab-action')!;
  const speed = document.querySelector<HTMLSelectElement>('#lab-speed')!;
  const gait = document.querySelector<HTMLSelectElement>('#lab-gait')!;
  const timeline = document.querySelector<HTMLInputElement>('#lab-timeline')!;
  const time = document.querySelector<HTMLOutputElement>('#lab-time')!;
  const pause = document.querySelector<HTMLButtonElement>('#lab-pause')!;
  const previous = document.querySelector<HTMLButtonElement>('#lab-step-back')!;
  const next = document.querySelector<HTMLButtonElement>('#lab-step-forward')!;
  actionSelect.replaceChildren(...D1_ACTIONS.map(action => new Option(action.label, action.id)));
  const sync = (): void => {
    actionSelect.value = motion.action;
    speed.value = String(motion.speed);
    gait.value = motion.gait;
    timeline.value = String(motion.time / motion.duration);
    time.value = `${motion.time.toFixed(2)} / ${motion.duration.toFixed(2)} 秒`;
    timeline.setAttribute('aria-valuetext', time.value);
    pause.setAttribute('aria-pressed', String(motion.paused));
    pause.textContent = motion.paused ? '播放动画' : '暂停动画';
    previous.disabled = motion.time <= 0;
    next.disabled = motion.time >= motion.duration;
  };
  actionSelect.addEventListener('change', () => {
    const selected = D1_ACTIONS.find(candidate => candidate.id === actionSelect.value);
    if (!selected) throw new Error(`实验页面未知动作：${actionSelect.value}`);
    motion.select(selected.id);
    sync();
  }, { signal });
  speed.addEventListener('change', () => {
    const value = Number(speed.value);
    if (![.25, .5, 1, 1.5].includes(value)) throw new Error(`实验页面未知动作速度：${speed.value}`);
    motion.setSpeed(value);
    sync();
  }, { signal });
  gait.addEventListener('change', () => {
    const value = gait.value;
    if (value !== 'original' && value !== 'smooth') throw new Error(`实验页面未知步态版本：${value}`);
    motion.setGait(value);
    sync();
  }, { signal });
  timeline.addEventListener('input', () => { motion.seek(timeline.valueAsNumber * motion.duration); sync(); }, { signal });
  previous.addEventListener('click', () => { motion.step(-1); sync(); }, { signal });
  next.addEventListener('click', () => { motion.step(1); sync(); }, { signal });
  pause.addEventListener('click', () => { motion.togglePause(); sync(); }, { signal });
  document.querySelector<HTMLButtonElement>('#lab-replay')!.addEventListener('click', () => { motion.replay(); sync(); }, { signal });
  sync();
  return sync;
}

function bindGazeControls(canvas: HTMLCanvasElement, rig: ReturnType<typeof createD1Rig>, signal: AbortSignal): void {
  const controls = document.querySelector<HTMLFieldSetElement>('#lab-gaze-controls')!;
  controls.hidden = controls.disabled = !rig.hasSphericalEyes;
  if (!rig.hasSphericalEyes) return;
  const mode = document.querySelector<HTMLSelectElement>('#lab-gaze-mode')!;
  const yaw = document.querySelector<HTMLInputElement>('#lab-gaze-yaw')!;
  const pitch = document.querySelector<HTMLInputElement>('#lab-gaze-pitch')!;
  const yawValue = document.querySelector<HTMLOutputElement>('#lab-gaze-yaw-value')!;
  const pitchValue = document.querySelector<HTMLOutputElement>('#lab-gaze-pitch-value')!;
  const buttons = document.querySelectorAll<HTMLButtonElement>('[data-gaze-yaw]');
  const sync = (): void => {
    yaw.disabled = pitch.disabled = mode.value !== 'manual';
    const automatic = mode.value === 'auto';
    yawValue.value = automatic ? '自动' : `${yaw.value}°`;
    pitchValue.value = automatic ? '自动' : `${pitch.value}°`;
    for (const button of buttons) button.setAttribute('aria-pressed', String(mode.value === 'manual' && Number(button.dataset.gazeYaw) === yaw.valueAsNumber && Number(button.dataset.gazePitch) === pitch.valueAsNumber));
    rig.setEyeGaze(automatic ? null : new THREE.Vector2(THREE.MathUtils.degToRad(yaw.valueAsNumber), THREE.MathUtils.degToRad(pitch.valueAsNumber)));
  };
  mode.addEventListener('change', sync, { signal });
  yaw.addEventListener('input', sync, { signal });
  pitch.addEventListener('input', sync, { signal });
  for (const button of buttons) button.addEventListener('click', () => {
    mode.value = 'manual';
    yaw.value = button.dataset.gazeYaw!;
    pitch.value = button.dataset.gazePitch!;
    sync();
  }, { signal });
  const viewports = [...document.querySelectorAll<HTMLElement>('.lab-card-viewport')];
  canvas.addEventListener('pointermove', event => {
    if (mode.value !== 'pointer' || event.buttons !== 0) return;
    const rect = viewports.map(viewport => viewport.getBoundingClientRect()).find(rect => event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom);
    if (!rect) return;
    // shortcut: 鼠标映射头部局部角度；需要侧视下精确追踪空间物体时再接世界坐标目标。
    yaw.value = String(Math.round(THREE.MathUtils.clamp((event.clientX - rect.left) / rect.width * 2 - 1, -1, 1) * Number(yaw.max)));
    pitch.value = String(Math.round(THREE.MathUtils.clamp(1 - (event.clientY - rect.top) / rect.height * 2, -1, 1) * Number(pitch.max)));
    sync();
  }, { signal });
  canvas.addEventListener('pointerleave', () => {
    if (mode.value !== 'pointer') return;
    yaw.value = pitch.value = '0';
    sync();
  }, { signal });
  sync();
}

function bindControls(studio: ReturnType<typeof createStudio>, motion: ReturnType<typeof createD1LabMotion>, look: ReturnType<typeof applyD1LabLooks>, rig: ReturnType<typeof createD1Rig>, variant: D1AnimatedVariant, signal: AbortSignal): () => void {
  const params = new URLSearchParams(location.search);
  const framing = params.get('framing') ?? 'body';
  if (framing !== 'body' && framing !== 'head') throw new Error(`未知取景范围：${framing}`);
  let head = framing === 'head';
  let angle = Number(params.get('angle') ?? '45');
  if (!Number.isFinite(angle)) throw new Error(`观察角度需要有限数值：${params.get('angle')}`);
  const frame = (): void => {
    studio.frame(head, angle);
    const url = new URL(location.href);
    url.searchParams.set('framing', head ? 'head' : 'body');
    url.searchParams.set('angle', String(angle));
    history.replaceState(null, '', url);
  };
  const referenceImage = document.querySelector<HTMLImageElement>('#lab-reference-image')!;
  const referenceLink = document.querySelector<HTMLAnchorElement>('#lab-reference-link')!;
  const referenceLabel = variant === 'game' || variant === 'detailed' ? '基础版 · 白色基础服' : '外服 · 细腿定稿';
  referenceImage.src = D1_ARTWORK[variant];
  referenceImage.alt = `D1 ${referenceLabel}原画，包含正面、侧面与背面多视图`;
  referenceLink.href = D1_ARTWORK[variant];
  referenceLink.setAttribute('aria-label', `打开 D1 ${referenceLabel}原画大图`);
  document.querySelector<HTMLElement>('.lab-reference figcaption span')!.textContent = referenceLabel;
  const framingButtons = document.querySelectorAll<HTMLButtonElement>('[data-framing]');
  const angleButtons = document.querySelectorAll<HTMLButtonElement>('[data-angle]');
  for (const button of framingButtons) button.setAttribute('aria-pressed', String((button.dataset.framing === 'head') === head));
  for (const button of angleButtons) button.setAttribute('aria-pressed', String(Number(button.dataset.angle) === angle));
  for (const button of framingButtons) button.addEventListener('click', () => {
    head = button.dataset.framing === 'head';
    for (const peer of framingButtons) peer.setAttribute('aria-pressed', String(peer === button));
    frame();
  }, { signal });
  for (const button of angleButtons) button.addEventListener('click', () => {
    angle = Number(button.dataset.angle);
    for (const peer of angleButtons) peer.setAttribute('aria-pressed', String(peer === button));
    frame();
  }, { signal });
  frame();

  const automatic = document.querySelector<HTMLInputElement>('#lab-auto-blink')!;
  const closure = document.querySelector<HTMLInputElement>('#lab-closure')!;
  const closureValue = document.querySelector<HTMLOutputElement>('#lab-closure-value')!;
  const changeClosure = (): void => {
    closure.disabled = automatic.checked;
    const value = closure.valueAsNumber;
    closureValue.value = automatic.checked ? '自动' : `${Math.round(value * 100)}%`;
    const closed = automatic.checked ? null : value;
    if (rig.hasSphericalEyes) rig.setEyeClosure(closed);
    else look.setClosure(closed);
  };
  automatic.addEventListener('change', changeClosure, { signal });
  closure.addEventListener('input', changeClosure, { signal });
  changeClosure();
  bindGazeControls(studio.renderer.domElement, rig, signal);
  const animation = document.querySelector<HTMLSelectElement>('#lab-animation-version')!;
  const animationVersion = params.get('animation') ?? 'refined';
  if (animationVersion !== 'original' && animationVersion !== 'refined') throw new Error(`未知模型动画版本：${animationVersion}`);
  animation.value = animationVersion;
  look.setAnimationVersion(animationVersion);
  animation.addEventListener('change', () => {
    const value = animation.value;
    if (value !== 'original' && value !== 'refined') throw new Error(`未知模型动画版本：${value}`);
    look.setAnimationVersion(value);
    const url = new URL(location.href);
    url.searchParams.set('animation', value);
    history.replaceState(history.state, '', url);
  }, { signal });
  const hairMotion = document.querySelector<HTMLInputElement>('#lab-hair-motion')!;
  hairMotion.addEventListener('change', () => look.setHairMotion(hairMotion.checked), { signal });
  look.setHairMotion(hairMotion.checked);

  const lightAngle = document.querySelector<HTMLInputElement>('#lab-light-angle')!;
  const lightAngleValue = document.querySelector<HTMLOutputElement>('#lab-light-angle-value')!;
  lightAngle.addEventListener('input', () => {
    studio.setLightAngle(lightAngle.valueAsNumber);
    lightAngleValue.value = `${lightAngle.value}°`;
  }, { signal });
  const lightPower = document.querySelector<HTMLInputElement>('#lab-light-power')!;
  const lightPowerValue = document.querySelector<HTMLOutputElement>('#lab-light-power-value')!;
  lightPower.addEventListener('input', () => {
    studio.key.intensity = lightPower.valueAsNumber;
    lightPowerValue.value = lightPower.valueAsNumber.toFixed(1);
  }, { signal });
  return bindMotionControls(motion, signal);
}

export async function mountD1RenderLab(ctx: PageContext): Promise<void> {
  document.getElementById('loading')!.hidden = true;
  document.title = 'D1 · 独立渲染实验';
  ctx.root.innerHTML = TEMPLATE;
  const params = new URLSearchParams(location.search);
  const projection = params.get('projection') ?? 'perspective';
  if (projection !== 'perspective' && projection !== 'orthographic') throw new Error(`未知镜头方式：${projection}`);
  const hairStyle = readHairStyle(params.get('hair') ?? 'showcase');
  const eyeStyle = params.get('eyes') ?? (DEFAULT_SPHERICAL_EYE_HAIRS.includes(hairStyle) ? 'sphere' : 'patch');
  if (eyeStyle !== 'patch' && eyeStyle !== 'sphere') throw new Error(`未知眼睛版本：${eyeStyle}`);
  if (eyeStyle === 'sphere' && !SPHERICAL_EYE_HAIRS.includes(hairStyle)) throw new Error('球形眼睛需要眼周修复版或之后的模型；请先切换模型版本');
  const hairFamily = isBlenderHair(hairStyle) ? 'blender' : 'rodin';
  const nativeHair = hairStyle === 'showcase' || hairStyle === 'game-detailed';
  const variant = hairStyle === 'showcase' ? 'game' : hairStyle === 'game-detailed' ? 'detailed' : 'outfit';
  const cards = createPreviewCards();
  const status = document.querySelector<HTMLElement>('#lab-status')!;
  const studio = createStudio(document.querySelector<HTMLElement>('#lab-canvas')!, cards, projection, pageRenderer(ctx, 'studio', TUNING));
  let rig: ReturnType<typeof createD1Rig> | null = null;
  let look: ReturnType<typeof applyD1LabLooks> | null = null;
  let fit: ReturnType<typeof contourD1LabHair> | null = null;
  let motion: ReturnType<typeof createD1LabMotion> | null = null;
  let eyeAsset: THREE.Object3D | null = null;
  ctx.onDispose(() => {
    motion?.dispose();
    look?.dispose();
    fit?.dispose();
    rig?.dispose();
    if (eyeAsset) disposeModelResources(eyeAsset);
    disposeD1Assets();
    studio.dispose();
  });
  const { signal } = ctx;
  const projectionSelect = document.querySelector<HTMLSelectElement>('#lab-projection')!;
  projectionSelect.value = projection;
  projectionSelect.addEventListener('change', () => {
    const url = new URL(location.href);
    url.searchParams.set('projection', projectionSelect.value);
    location.assign(url.href);
  }, { signal });
  bindHairControl(hairStyle, signal);
  const eyeSelect = document.querySelector<HTMLSelectElement>('#lab-eye-version')!;
  eyeSelect.value = eyeStyle;
  eyeSelect.options[1]!.disabled = !SPHERICAL_EYE_HAIRS.includes(hairStyle);
  eyeSelect.addEventListener('change', () => {
    const url = new URL(location.href);
    url.searchParams.set('eyes', eyeSelect.value);
    location.assign(url.href);
  }, { signal });
  if (eyeStyle === 'sphere') {
    const loaded = await loadCharacterModel('./characters/human/render-lab/d1-spherical-eyes-v3.glb', 'original');
    if (signal.aborted) { disposeModelResources(loaded.scene); return; }
    eyeAsset = loaded.scene;
  }
  // 只换模型文件来源（与头发预览相同），继续复用游戏的模型加载、尺寸与骨骼装配。
  const hairAsset = HAIR_ASSETS[hairStyle];
  await loadD1Asset(variant, 'web-1k', hairAsset);
  if (signal.aborted) return;
  const actor = createD1Rig(variant, 'anime', 'web-1k', eyeAsset ?? undefined, hairAsset);
  rig = actor;
  if (hairStyle === 'rodin-contour') fit = contourD1LabHair(actor.root);
  const material = applyD1LabLooks(actor.root, nativeHair ? 'showcase' : hairFamily);
  look = material;
  studio.scene.add(actor.root);
  // 基础版赤脚，不能使用从外服版鞋底生成的实验步态。
  motion = createD1LabMotion(actor, () => material.resetMotion(), nativeHair ? null : createD1LabGaits(actor));
  bindGallery(studio, cards, signal);
  const syncMotion = bindControls(studio, motion, material, actor, variant, signal);
  await studio.renderer.compileAsync(studio.scene, studio.camera);
  if (signal.aborted) return;
  document.querySelector<HTMLFieldSetElement>('#lab-controls')!.disabled = false;
  document.querySelector<HTMLFieldSetElement>('#lab-hair-controls')!.disabled = false;
  status.hidden = true;
  const loop = createViewLoop(dt => {
    const actualDt = motion!.update(dt);
    material.update(actualDt);
    syncMotion();
    studio.controls.update();
    studio.render(material);
  }, ctx.reportError);
  ctx.onDispose(loop.stop);
  loop.start();
}

