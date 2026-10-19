import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { RESOURCE_CATALOG } from '../../render/resource/resource-catalog.ts';
import { loadInteriorBackgroundTexture } from '../../render/stage/free-world-interior-textures.ts';
import { loadGrassyAsset } from '../../render/grassy/grassy-rig.ts';
import { createShowcaseModel } from '../../ui/model/showcase-model.ts';
import { createResourceControls } from '../../ui/hud/resource-controls.ts';
import { attachResourceCameraInteraction, createResourceCameraControls } from '../../ui/hud/resource-camera-controls.ts';
import { createWorldShowcaseSession } from '../showcase/session.ts';
import type { ResourceSceneEntry } from '../workspace/scene-catalog.ts';
import { yieldScene, waitSceneResource, type SceneMountContext } from '../workspace/scene-mount.ts';
import { VIEW_MAX_DT } from '../shell/frame-clock.ts';
import { t } from '../../config/i18n.ts';

/** 同一张画布检查真实游戏资源；变体与参数沿用资源目录和共享预览。 */
export async function mountResourceInspection(context: SceneMountContext, entry: ResourceSceneEntry): Promise<void> {
  const { root, renderer, signal } = context;
  const model = createShowcaseModel(RESOURCE_CATALOG);
  const comparison = entry.resourceId === 'building-kit';
  if (comparison) model.showDemo(RESOURCE_CATALOG.demos![0]!);
  else model.showActor(entry.resourceId);
  root.innerHTML = `<section class="resource-inspection"><header class="resource-inspection-toolbar"></header>
    <div class="resource-inspection-stage"><div class="resource-inspection-samples"></div></div>
    <details class="resource-inspection-tools"><summary>${t('资源检查参数')}</summary><div data-resource-controls></div></details></section>`;
  const toolbar = root.querySelector<HTMLElement>('.resource-inspection-toolbar')!;
  context.attachToolbar(toolbar);
  const viewport = root.querySelector<HTMLElement>('.resource-inspection-stage')!;
  const samples = root.querySelector<HTMLElement>('.resource-inspection-samples')!;
  const controls = root.querySelector<HTMLElement>('[data-resource-controls]')!;
  samples.classList.toggle('resource-inspection-comparison', comparison);
  const disposers: Array<() => void> = [];
  const sessions: ReturnType<typeof createWorldShowcaseSession>[] = [];
  let frame = 0;
  context.onDispose(() => {
    cancelAnimationFrame(frame);
    for (const session of sessions) session.dispose();
    for (const dispose of disposers.reverse()) dispose();
    renderer.domElement.classList.remove('resource-inspection-canvas');
    renderer.domElement.remove();
  });
  const views = model.cards.map(card => {
    const sample = document.createElement('div'); sample.className = 'resource-inspection-sample'; sample.tabIndex = 0;
    samples.append(sample);
    const interaction = attachResourceCameraInteraction(sample, card, model);
    disposers.push(() => interaction.dispose());
    const label = document.createElement('label'); label.className = 'resource-inspection-variant';
    const subject = RESOURCE_CATALOG.subjects.find(subject => subject.id === model.entry(card.entryId).actor)!.name;
    label.textContent = t(subject);
    const select = document.createElement('select'); select.setAttribute('aria-label', t('{name}变体').replace('{name}', t(subject)));
    for (const choice of RESOURCE_CATALOG.entries.filter(item => item.actor === model.entry(card.entryId).actor)) {
      const option = document.createElement('option'); option.value = choice.id; option.textContent = t(choice.label); select.append(option);
    }
    select.value = card.entryId;
    select.addEventListener('change', () => model.changeAction(card, select.value));
    label.append(select); toolbar.append(label);
    const settings = createResourceControls(controls, card, model);
    return { sample, refresh: () => { interaction.refresh(); settings.refresh(); } };
  });
  const camera = createResourceCameraControls(toolbar, model, () => model.cards);
  const pause = document.createElement('button'); pause.type = 'button'; pause.textContent = t('暂停动画');
  pause.addEventListener('click', () => {
    const playing = !model.cards[0]!.playing;
    model.all({ playing }); pause.textContent = t(playing ? '暂停动画' : '播放动画');
  });
  toolbar.append(pause);
  const refresh = (): void => { camera.refresh(); for (const view of views) view.refresh(); };
  disposers.push(model.subscribe(refresh)); refresh();
  const canvas = renderer.domElement;
  canvas.classList.add('resource-inspection-canvas'); canvas.setAttribute('aria-label', t(entry.title)); viewport.prepend(canvas);
  const resize = (): void => renderer.setSize(viewport.clientWidth, viewport.clientHeight);
  const observer = new ResizeObserver(resize); observer.observe(viewport); disposers.push(() => observer.disconnect()); resize();
  const material = new THREE.RawShaderMaterial({
    uniforms: { tImage: { value: null as THREE.Texture | null } },
    vertexShader: 'precision highp float; attribute vec3 position; attribute vec2 uv; varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }',
    fragmentShader: 'precision highp float; uniform sampler2D tImage; varying vec2 vUv; void main(){ gl_FragColor=texture2D(tImage,vUv); }',
    depthTest: false, depthWrite: false,
  });
  const quad = new FullScreenQuad(material); disposers.push(() => { quad.dispose(); material.dispose(); });
  context.progress(t('加载资源检查背景与比例参照'), 0, 2);
  let completed = 0;
  const loaded = (): void => context.progress(t('加载资源检查背景与比例参照'), ++completed, 2);
  const background = loadInteriorBackgroundTexture(renderer, 'cave').then(texture => {
    if (signal.aborted) texture.dispose();
    else { disposers.push(() => texture.dispose()); loaded(); }
    return texture;
  });
  const grassy = loadGrassyAsset('game').then(loaded);
  const results = await waitSceneResource(Promise.allSettled([background, grassy]), signal);
  signal.throwIfAborted();
  for (const result of results) if (result.status === 'rejected') throw result.reason;
  const cave = (results[0] as PromiseFulfilledResult<THREE.Texture>).value;
  for (const [index, card] of model.cards.entries()) {
    context.progress(t('装配真实资源样本'), index, model.cards.length);
    await yieldScene(signal);
    const session = createWorldShowcaseSession(renderer, card, cave);
    sessions.push(session);
    context.progress(t('准备资源着色器'), index + 1, model.cards.length);
    await session.prepare(views[index]!.sample.getBoundingClientRect(), signal);
    signal.throwIfAborted();
  }
  let previous = performance.now();
  const renderFrame = (now: number): void => {
    if (signal.aborted) return;
    const dt = Math.max(0, Math.min((now - previous) / 1000, VIEW_MAX_DT)); previous = now;
    const bounds = viewport.getBoundingClientRect();
    renderer.setRenderTarget(null); renderer.setScissorTest(false); renderer.setViewport(0, 0, bounds.width, bounds.height);
    renderer.setClearColor('#10191e', 1); renderer.clear();
    for (const [index, session] of sessions.entries()) {
      const card = model.cards[index]!;
      if (session.needsReset || session.complete) session.reset();
      const elapsed = session.advance(dt, card.playing, null);
      const rect = views[index]!.sample.getBoundingClientRect();
      material.uniforms.tImage!.value = session.render(rect, elapsed, false);
      renderer.setRenderTarget(null); renderer.setScissorTest(true);
      renderer.setViewport(rect.left - bounds.left, bounds.bottom - rect.bottom, rect.width, rect.height);
      renderer.setScissor(rect.left - bounds.left, bounds.bottom - rect.bottom, rect.width, rect.height);
      quad.render(renderer);
    }
    renderer.setScissorTest(false);
    frame = requestAnimationFrame(draw);
  };
  const draw = (now: number): void => {
    try { renderFrame(now); } catch (error) { context.reportError(error); }
  };
  renderFrame(performance.now());
}
