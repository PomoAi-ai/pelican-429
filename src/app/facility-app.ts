import * as THREE from 'three';
import { TUNING } from '../config/tuning.ts';
import { createStage } from '../render/stage.ts';
import { loadGrassyAsset, disposeGrassyAssets } from '../render/grassy/grassy-rig.ts';
import { FACILITY_SCENES, FACILITY_SCENE_IDS, parseFacilityScene } from '../config/facility-scenes.ts';
import type { FacilitySceneId } from '../config/facility-scenes.ts';
import { createFacilityEnvironment } from './facility-environment.ts';
import { createFacilityPresentation } from './facility-presentation.ts';
import { FACILITY_EN } from '../ui/facility-minimap.ts';
import { getLanguage, onLanguageChange, setLanguage } from '../ui/language.ts';

function createFacilityPage(sceneId: FacilitySceneId): HTMLElement {
  const scene = FACILITY_SCENES[sceneId];
  const shots = [scene.overview, ...scene.shots];
  const page = document.createElement('main');
  page.className = 'facility-page';
  page.innerHTML = `
    <header class="facility-header">
      <div><p class="facility-eyebrow">SCENE PREVIEW / ${scene.number}</p><h1>${scene.name}</h1><p class="facility-subtitle">${scene.subtitle}</p></div>
      <div class="facility-languages" role="group" aria-label="语言 / Language" style="display:flex;gap:8px;align-items:center"><button type="button" data-language="zh">中文</button><button type="button" data-language="en">English</button></div>
      <nav class="facility-scene-list" aria-label="机房场景选择">
        ${FACILITY_SCENE_IDS.map((id) => `<a href="./?mode=facility&amp;scene=${id}" ${id === sceneId ? 'aria-current="page"' : ''}><span>${FACILITY_SCENES[id].number}</span>${FACILITY_SCENES[id].name}</a>`).join('')}
      </nav>
      ${sceneId === 'original' ? '' : `<a class="facility-play" href="./?mode=game&amp;level=facility&amp;scene=${sceneId}">进入场景 · 自由探索</a>`}
    </header>
    <section class="facility-viewport" aria-label="机房内外场景">
      <div class="facility-location"><span>实时场景预览</span><strong data-location>${scene.overview.caption}</strong></div>
      <div class="facility-tools" role="group" aria-label="画面控制">
        <button type="button" data-action="zoom-out" aria-label="缩小场景">−</button>
        <output data-zoom aria-label="当前缩放">100%</output>
        <button type="button" data-action="zoom-in" aria-label="放大场景">＋</button>
        <button type="button" data-action="reset">复位</button>
        <button type="button" data-action="motion" aria-pressed="false">暂停动画</button>
      </div>
      <p class="facility-hint">拖动平移 · 滚轮缩放 · 方向键移动 · Home 全景</p>
    </section>
    <footer class="facility-footer">
      <nav class="facility-shots" aria-label="场景区域">
        ${shots.map((shot, index) => `<button type="button" data-shot="${index}" aria-pressed="${index === 0}"><span>0${index}</span>${shot.label}</button>`).join('')}
      </nav>
      <label class="facility-travel"><span>横向查看</span><input type="range" min="0" max="${scene.width}" step="0.1" value="${scene.overview.x}" aria-label="镜头横向位置"/><span aria-hidden="true">↔</span></label>
    </footer>`;
  document.body.append(page);
  return page;
}

/** 独立场景只装配共享资源和镜头，不依赖游戏或展示卡片的页面状态。 */
export async function startFacility(onError: (error: unknown) => void): Promise<void> {
  const sceneId = parseFacilityScene(new URLSearchParams(window.location.search));
  const scene = FACILITY_SCENES[sceneId];
  const shots = [scene.overview, ...scene.shots];
  document.title = `${getLanguage() === 'en' ? FACILITY_EN[sceneId].name : scene.name} · ${getLanguage() === 'en' ? 'PELICAN 429' : '鹈鹕 429'}`;
  const page = createFacilityPage(sceneId);
  const viewport = page.querySelector<HTMLElement>('.facility-viewport')!;
  const location = page.querySelector<HTMLElement>('[data-location]')!;
  const zoomOutput = page.querySelector<HTMLOutputElement>('[data-zoom]')!;
  const travel = page.querySelector<HTMLInputElement>('.facility-travel input')!;
  const motion = page.querySelector<HTMLButtonElement>('[data-action="motion"]')!;
  const buttons = [...page.querySelectorAll<HTMLButtonElement>('[data-shot]')];
  page.querySelectorAll<HTMLButtonElement>('[data-language]').forEach((button) => {
    button.addEventListener('click', () => setLanguage(button.dataset.language as 'zh' | 'en'));
  });
  const listeners = new AbortController();
  const disposers: Array<() => void> = [() => page.remove(), () => listeners.abort()];
  let frame = 0;
  const dispose = (): void => {
    cancelAnimationFrame(frame);
    for (const release of disposers.splice(0).reverse()) release();
  };
  const signal = listeners.signal;
  window.addEventListener('pagehide', dispose, { once: true, signal });
  // 返回缓存页面不会重新执行入口，需重建已释放的 WebGL 场景。
  window.addEventListener('pageshow', (event) => { if (event.persisted) window.location.reload(); });
  try {
    const stage = createStage(viewport, TUNING, { quality: 'high', antialias: 'smaa' });
    disposers.push(() => stage.dispose());
    disposers.push(disposeGrassyAssets);
    await loadGrassyAsset('game');
    if (signal.aborted) return;
    const facility = await createFacilityPresentation(stage, sceneId);
    if (signal.aborted) { facility.dispose(); return; }
    disposers.push(() => facility.dispose());
    stage.canvas.setAttribute('aria-label', '机房内外实时场景。方向键平移，加减号缩放，Home 查看全景。');
    const environment = await createFacilityEnvironment(stage, sceneId);
    if (signal.aborted) { environment.dispose(); return; }
    disposers.push(() => environment.dispose());
    const target = { x: scene.overview.x as number, y: scene.overview.y as number, zoom: 1 };
    const current = { ...target };
    let paused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let time = 0;
    let previous = performance.now();
    let drag: { id: number; x: number; y: number } | null = null;
    const baseHeight = (): number => Math.max(scene.overview.height, scene.overview.width / stage.camera.aspect);
    const updateMotion = (): void => {
      motion.textContent = getLanguage() === 'en' ? paused ? 'Play animation' : 'Pause animation' : paused ? '播放动画' : '暂停动画';
      motion.setAttribute('aria-pressed', String(paused));
    };
    const freeView = (): void => {
      buttons.forEach((button) => button.setAttribute('aria-pressed', 'false'));
      location.textContent = getLanguage() === 'en' ? 'Free view' : '自由查看';
    };
    const zoom = (factor: number): void => {
      target.zoom = THREE.MathUtils.clamp(target.zoom * factor, 0.75, 5);
      freeView();
    };
    const shot = (index: number): void => {
      const chosen = shots[index]!;
      target.x = chosen.x; target.y = chosen.y;
      target.zoom = index === 0 ? 1 : THREE.MathUtils.clamp(baseHeight() / Math.max(chosen.height, chosen.width / stage.camera.aspect), 0.75, 5);
      location.textContent = getLanguage() === 'en' ? index === 0 ? FACILITY_EN[sceneId].overview : FACILITY_EN[sceneId].shots[index - 1]![1] : chosen.caption;
      buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    };
    const pan = (x: number, y: number): void => {
      target.x = THREE.MathUtils.clamp(target.x + x, 0, scene.width);
      target.y = THREE.MathUtils.clamp(target.y + y, 5, scene.height);
      freeView();
    };
    const syncLanguage = (): void => {
      const en = getLanguage() === 'en';
      const copy = FACILITY_EN[sceneId];
      page.querySelectorAll<HTMLButtonElement>('[data-language]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.language === getLanguage())));
      document.title = `${en ? copy.name : scene.name} · ${en ? 'PELICAN 429' : '鹈鹕 429'}`;
      page.querySelector('h1')!.textContent = en ? copy.name : scene.name;
      page.querySelector('.facility-subtitle')!.textContent = en ? copy.subtitle : scene.subtitle;
      page.querySelector('.facility-scene-list')!.setAttribute('aria-label', en ? 'Choose data center scene' : '机房场景选择');
      page.querySelectorAll('.facility-scene-list a').forEach((link, index) => {
        const id = FACILITY_SCENE_IDS[index]!;
        link.lastChild!.textContent = en ? FACILITY_EN[id].name : FACILITY_SCENES[id].name;
      });
      const play = page.querySelector('.facility-play');
      if (play) play.textContent = en ? 'Enter scene · Free exploration' : '进入场景 · 自由探索';
      page.querySelector('.facility-viewport')!.setAttribute('aria-label', en ? 'Data center interior and exterior' : '机房内外场景');
      page.querySelector('.facility-location span')!.textContent = en ? 'Live scene preview' : '实时场景预览';
      page.querySelector('.facility-tools')!.setAttribute('aria-label', en ? 'View controls' : '画面控制');
      page.querySelector('[data-action="zoom-out"]')!.setAttribute('aria-label', en ? 'Zoom out' : '缩小场景');
      zoomOutput.setAttribute('aria-label', en ? 'Current zoom' : '当前缩放');
      page.querySelector('[data-action="zoom-in"]')!.setAttribute('aria-label', en ? 'Zoom in' : '放大场景');
      page.querySelector('[data-action="reset"]')!.textContent = en ? 'Reset' : '复位';
      page.querySelector('.facility-hint')!.textContent = en ? 'Drag to pan · Scroll to zoom · Arrow keys to move · Home for overview' : '拖动平移 · 滚轮缩放 · 方向键移动 · Home 全景';
      page.querySelector('.facility-shots')!.setAttribute('aria-label', en ? 'Scene areas' : '场景区域');
      buttons.forEach((button, index) => { button.lastChild!.textContent = en ? index === 0 ? 'Overview' : copy.shots[index - 1]![0] : shots[index]!.label; });
      page.querySelector('.facility-travel span')!.textContent = en ? 'Pan horizontally' : '横向查看';
      travel.setAttribute('aria-label', en ? 'Horizontal camera position' : '镜头横向位置');
      stage.canvas.setAttribute('aria-label', en ? 'Live data center scene. Arrow keys to pan, plus and minus to zoom, Home for overview.' : '机房内外实时场景。方向键平移，加减号缩放，Home 查看全景。');
      const active = buttons.findIndex((button) => button.getAttribute('aria-pressed') === 'true');
      location.textContent = active < 0 ? en ? 'Free view' : '自由查看' : en ? active === 0 ? copy.overview : copy.shots[active - 1]![1] : shots[active]!.caption;
      updateMotion();
    };
    syncLanguage();
    disposers.push(onLanguageChange(syncLanguage));
    buttons.forEach((button, index) => button.addEventListener('click', () => shot(index), { signal }));
    page.querySelector('[data-action="zoom-in"]')!.addEventListener('click', () => zoom(1.2), { signal });
    page.querySelector('[data-action="zoom-out"]')!.addEventListener('click', () => zoom(1 / 1.2), { signal });
    page.querySelector('[data-action="reset"]')!.addEventListener('click', () => shot(0), { signal });
    motion.addEventListener('click', () => { paused = !paused; updateMotion(); }, { signal });
    travel.addEventListener('input', () => { target.x = travel.valueAsNumber; freeView(); }, { signal });
    stage.canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      stage.canvas.setPointerCapture(event.pointerId);
      stage.canvas.focus({ preventScroll: true });
    }, { signal });
    stage.canvas.addEventListener('pointermove', (event) => {
      if (!drag || drag.id !== event.pointerId) return;
      const unit = baseHeight() / current.zoom / viewport.clientHeight;
      pan((drag.x - event.clientX) * unit, (event.clientY - drag.y) * unit);
      drag.x = event.clientX; drag.y = event.clientY;
    }, { signal });
    stage.canvas.addEventListener('lostpointercapture', () => { drag = null; }, { signal });
    stage.canvas.addEventListener('pointerup', (event) => {
      if (drag?.id === event.pointerId) stage.canvas.releasePointerCapture(event.pointerId);
    }, { signal });
    stage.canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      zoom(Math.exp(-THREE.MathUtils.clamp(event.deltaY, -100, 100) * 0.002));
    }, { passive: false, signal });
    stage.canvas.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? 5 : 1.5;
      switch (event.key) {
        case 'ArrowLeft': pan(-step, 0); break;
        case 'ArrowRight': pan(step, 0); break;
        case 'ArrowUp': pan(0, step); break;
        case 'ArrowDown': pan(0, -step); break;
        case '+': case '=': zoom(1.2); break;
        case '-': zoom(1 / 1.2); break;
        case 'Home': shot(0); break;
        default: return;
      }
      event.preventDefault();
    }, { signal });
    document.addEventListener('visibilitychange', () => { previous = performance.now(); }, { signal });
    updateMotion();
    const draw = (now: number): void => {
      try {
        // 恢复可见时，排队中的 rAF 时间戳可能早于 visibilitychange 的时钟重置。
        const dt = THREE.MathUtils.clamp((now - previous) / 1000, 0, 0.05);
        previous = now;
        const blend = 1 - Math.exp(-dt * 12);
        current.x += (target.x - current.x) * blend;
        current.y += (target.y - current.y) * blend;
        current.zoom += (target.zoom - current.zoom) * blend;
        const h = baseHeight() / current.zoom;
        const w = h * stage.camera.aspect;
        const distance = h / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov) / 2));
        // 竖屏全景会把相机拉远，裁剪范围随之覆盖建筑及自然后景。
        stage.camera.far = distance + 256;
        stage.camera.updateProjectionMatrix();
        stage.camera.position.set(current.x, current.y, distance);
        stage.camera.lookAt(current.x, current.y, 0);
        stage.camera.updateMatrixWorld();
        const animationDt = paused || document.hidden ? 0 : dt;
        time += animationDt;
        environment.update({ x: current.x - w / 2 - 3, y: current.y - h / 2 - 3, w: w + 6, h: h + 6 }, time, animationDt);
        facility.update(time);
        stage.render();
        zoomOutput.value = `${Math.round(current.zoom * 100)}%`;
        if (document.activeElement !== travel) travel.value = String(current.x);
        frame = requestAnimationFrame(draw);
      } catch (error) {
        dispose();
        onError(error);
      }
    };
    document.getElementById('loading')!.hidden = true;
    frame = requestAnimationFrame(draw);
  } catch (error) {
    dispose();
    throw error;
  }
}
