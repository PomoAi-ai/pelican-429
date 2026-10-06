import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TUNING } from '../config/tuning.ts';
import { GRASSY_ANIMATED_MODELS, GRASSY_HEIGHT } from '../config/grassy.ts';
import { NPCS, npcModel, type NpcKind, type NpcForm } from '../config/npc.ts';
import { ENEMY_KINDS, ENEMY_MODEL_DIRS } from '../config/enemy-models.ts';
import { ENEMY_RULES, type EnemyKind } from '../config/enemy-rules.ts';
import type { TextureTier } from '../render/character-model.ts';
import { createShowcaseRenderer } from '../render/showcase-renderer.ts';
import { createStageView } from '../render/stage.ts';
import { fitShadowCamera } from '../render/shadow-fit.ts';
import { loadGrassyAsset, createGrassyRig, disposeGrassyAssets } from '../render/grassy/grassy-rig.ts';
import { animateGrassy } from '../render/grassy/grassy-animator.ts';
import { loadNpcAsset, createNpcRig, disposeNpcAssets } from '../render/npc/npc-rig.ts';
import { animateNpc } from '../render/npc/npc-animator.ts';
import { loadEnemyAsset, createEnemyRig, disposeEnemyAssets } from '../render/enemy-rig.ts';

type Subject = { id: string; label: string; source: string; height: number } &
  ({ kind: 'grassy' } | { kind: 'npc'; npc: NpcKind; form: NpcForm } | { kind: 'enemy'; enemy: EnemyKind });
type Action = 'idle' | 'walk' | 'run';
type Preview = { root: THREE.Group; duration(action: Action): number; sample(action: Action, time: number): void; dispose(): void };
type ModelReport = { source: string; sourceBytes: number; outputBytes: number; images: { width: number; height: number; outputWidth: number; outputHeight: number; sourceRgbaMipBytes: number; outputRgbaMipBytes: number }[] };
const TIERS: { id: TextureTier; label: string; detail: string }[] = [
  { id: 'original', label: '原始高清', detail: '原始 PNG · 原始模型数据' },
  { id: 'web-1k', label: '1K · WebP', detail: '1024 上限 · 无损 Meshopt' },
  { id: 'web', label: '512 · WebP', detail: '512 上限 · 无损 Meshopt' },
  { id: 'ktx2', label: '512 · KTX2', detail: '512 上限 · GPU 压缩 · 无损 Meshopt' },
  { id: 'ktx2-256', label: '256 · KTX2', detail: '256 上限 · GPU 压缩 · 无损 Meshopt' },
];
const SUBJECTS: Subject[] = [
  { id: 'grassy', label: 'Grassy · 游戏版', kind: 'grassy', source: GRASSY_ANIMATED_MODELS.find(model => model.id === 'game')!.path, height: GRASSY_HEIGHT },
  ...(['sam', 'tibo'] as const).flatMap(npc => (['monster', 'human'] as const).map(form => ({
    id: `${npc}-${form}`, label: `${NPCS[npc].name} · ${form === 'monster' ? '怪物' : '人形'}`, kind: 'npc' as const,
    npc, form, source: npcModel(npc, form).path, height: NPCS[npc].visualHeight,
  }))),
  ...ENEMY_KINDS.map(enemy => ({ id: enemy, label: ENEMY_RULES[enemy].name, kind: 'enemy' as const, enemy,
    source: `${ENEMY_MODEL_DIRS[enemy]}/model.glb`, height: ENEMY_RULES[enemy].height })),
];
const REPORTS = [
  new URL('../../assets/characters/web-1k-models-report.json', import.meta.url),
  new URL('../../assets/characters/web-models-report.json', import.meta.url),
  new URL('../../assets/characters/ktx2-models-report.json', import.meta.url),
  new URL('../../assets/characters/ktx2-256-models-report.json', import.meta.url),
  new URL('../../assets/characters/ktx2-compact-models-report.json', import.meta.url),
  new URL('../../assets/characters/ktx2-256-compact-models-report.json', import.meta.url),
];

function element<K extends keyof HTMLElementTagNameMap>(parent: HTMLElement, tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.textContent = text; node.className = className; parent.append(node); return node;
}

function releaseAssets(): void { disposeGrassyAssets(); disposeNpcAssets(); disposeEnemyAssets(); }

async function loadSubject(subject: Subject, tier: TextureTier): Promise<void> {
  if (subject.kind === 'grassy') await loadGrassyAsset('game', tier);
  else if (subject.kind === 'npc') await loadNpcAsset(subject.npc, subject.form, tier);
  else await loadEnemyAsset(subject.enemy, tier);
}

function preview(subject: Subject, tier: TextureTier): Preview {
  if (subject.kind === 'grassy') {
    const rig = createGrassyRig('game', tier);
    return { root: rig.root, duration: action => rig.actions[action].getClip().duration,
      sample: (action, time) => { rig.motionPose.reset(); animateGrassy(rig, action, time, 0, null); }, dispose: () => rig.dispose() };
  }
  if (subject.kind === 'npc') {
    const rig = createNpcRig(subject.npc, subject.form, tier);
    return { root: rig.root, duration: action => rig.actions[action].getClip().duration,
      sample: (action, time) => { rig.pose.reset(time); animateNpc(rig, action, time, 0, 1); }, dispose: () => rig.dispose() };
  }
  const rig = createEnemyRig(subject.enemy, 0, tier);
  const actionName = (action: Action) => action === 'idle' ? 'idle' : 'move';
  return { root: rig.root, duration: action => rig.duration(actionName(action)),
    sample: (action, time) => rig.pose(actionName(action), time, 0, 0, null), dispose: () => rig.dispose() };
}

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(2)} MB`;
const mib = (bytes: number) => `${(bytes / 1024 ** 2).toFixed(2)} MiB`;

/** 页面只组织共享游戏资源、镜头和检视灯光，不重建角色材质或动画。 */
export async function startTextureCompare(onError: (error: unknown) => void): Promise<void> {
  document.body.classList.add('showcase-mode', 'texture-compare-mode');
  document.title = '画质对比 · Pelican 429';
  const parent = document.getElementById('app')!;
  const page = element(parent, 'main', '', 'tc-page showcase-app');
  const header = element(page, 'header', '', 'tc-header');
  const title = element(header, 'div');
  element(title, 'p', 'PELICAN 429 / TEXTURE LAB', 'tc-eyebrow');
  element(title, 'h1', '画质对比');
  element(title, 'p', '同一模型、灯光、镜头与动作时间。先看全身，再拉近检查脸部、毛发和衣料。', 'tc-subtitle');
  const nav = element(header, 'nav', '', 'sc-library-tabs');
  nav.setAttribute('aria-label', '角色资料库导航');
  for (const [label, href] of [['角色场景', './?mode=showcase'], ['历史资料', './?mode=showcase&library=history'], ['画质对比', './?mode=compare']] as const) {
    const link = element(nav, 'a', label); link.href = href;
    if (label === '画质对比') link.setAttribute('aria-current', 'page');
  }
  const toolbar = element(page, 'section', '', 'tc-toolbar');
  const compactLabel = element(toolbar, 'label', '同步压缩模型数据（KTX2 两栏）');
  const compact = element(compactLabel, 'input'); compact.type = 'checkbox'; compact.checked = true;
  compact.setAttribute('aria-label', '同步压缩模型数据');
  const effectiveTier = (tier: TextureTier): TextureTier => compact.checked
    ? tier === 'ktx2' ? 'ktx2-compact' : tier === 'ktx2-256' ? 'ktx2-256-compact' : tier : tier;
  const subjectLabel = element(toolbar, 'label', '角色与形态');
  const subjectSelect = element(subjectLabel, 'select');
  subjectSelect.setAttribute('aria-label', '对比角色与形态');
  for (const subject of SUBJECTS) { const option = element(subjectSelect, 'option', subject.label); option.value = subject.id; }
  subjectSelect.value = 'sam-monster';
  const actionLabel = element(toolbar, 'label', '动作');
  const actionSelect = element(actionLabel, 'select'); actionSelect.setAttribute('aria-label', '同步动作');
  for (const [value, label] of [['idle', '待机'], ['walk', '行走'], ['run', '跑步']] as const) {
    const option = element(actionSelect, 'option', label); option.value = value;
  }
  const play = element(toolbar, 'button', '播放动作'); play.type = 'button'; play.setAttribute('aria-pressed', 'false');
  const timeLabel = element(toolbar, 'label', '动作时间');
  const seek = element(timeLabel, 'input'); seek.type = 'range'; seek.min = '0'; seek.max = '1'; seek.step = '.001'; seek.value = '0'; seek.setAttribute('aria-label', '同步动作时间');
  const zoomLabel = element(toolbar, 'label', '拉近倍率');
  const zoom = element(zoomLabel, 'input'); zoom.type = 'range'; zoom.min = '.5'; zoom.max = '12'; zoom.step = '.05'; zoom.value = '1'; zoom.setAttribute('aria-label', '同步拉近倍率');
  const zoomValue = element(zoomLabel, 'output', '1.0×');
  const focusButtons = element(toolbar, 'div', '', 'tc-button-group');
  const directions = element(toolbar, 'div', '', 'tc-button-group');
  element(page, 'p', '在任一画面拖动旋转；滚轮 / 双指拉近；右键或 Shift＋拖动平移。所有栏同步。', 'tc-help');
  const status = element(page, 'p', '正在加载五档资源…', 'tc-status'); status.setAttribute('role', 'status');
  const grid = element(page, 'section', '', 'tc-grid'); grid.setAttribute('aria-label', '五档画质并排对比');
  const panels = TIERS.map(tier => {
    const card = element(grid, 'article', '', `tc-card${tier.id === 'original' ? ' tc-reference' : ''}`);
    const heading = element(card, 'header', '', 'tc-card-heading');
    element(heading, 'h2', tier.label); const detail = element(heading, 'p', tier.detail);
    const viewport = element(card, 'div', '', 'tc-viewport'); viewport.setAttribute('aria-label', `${tier.label}模型视窗`);
    const stats = element(card, 'div', '', 'tc-stats');
    return { tier, card, viewport, stats, detail, width: 0, height: 0 };
  });
  element(page, 'p', '勾选模型数据压缩，可在相同 KTX2 贴图下比较顶点、法线、UV 和动画数据压缩前后。面数、骨骼和动作保留；只降低数值精度，不代表绘制量或顶点显存降低。纹理预算不含渲染目标和驱动开销。', 'tc-footnote');
  const host = createShowcaseRenderer(parent);
  const stages = panels.map(() => {
    const stage = createStageView(host.renderer, TUNING, { quality: 'low', antialias: 'smaa' });
    stage.scene.background = new THREE.Color('#aeb9b3'); stage.camera.near = .01;
    return stage;
  });
  const camera = stages[0]!.camera.clone();
  // 共享一台控制相机，各栏只按自身宽高比复制投影，避免镜头状态逐渐漂移。
  const controls = panels.map(({ viewport }) => {
    const control = new OrbitControls(camera, viewport); control.enableDamping = false; return control;
  });
  let actors: Preview[] = [];
  let subject = SUBJECTS.find(item => item.id === subjectSelect.value)!;
  let playing = false, seconds = 0, dirty = true, stopped = false, ready = false, raf = 0, last = 0;
  let baseDistance = 1;
  const onScroll = (): void => { dirty = true; };
  const target = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const action = () => actionSelect.value as Action;
  const synchronize = (source = controls[0]!): void => {
    for (const control of controls) if (control !== source) control.target.copy(source.target);
    zoom.value = String(THREE.MathUtils.clamp(baseDistance / camera.position.distanceTo(source.target), .5, 12));
    zoomValue.value = `${Number(zoom.value).toFixed(1)}×`; dirty = true;
  };
  for (const control of controls) control.addEventListener('change', () => synchronize(control));
  const focus = (height: number, magnification: number): void => {
    target.set(0, subject.height * height, 0);
    offset.subVectors(camera.position, controls[0]!.target).normalize().multiplyScalar(baseDistance / magnification);
    camera.position.copy(target).add(offset);
    for (const control of controls) control.target.copy(target);
    camera.lookAt(target); synchronize();
  };
  for (const [label, height, magnification] of [['全身', .5, 1], ['面部细节', .88, 5], ['衣服细节', .57, 4]] as const) {
    const button = element(focusButtons, 'button', label); button.type = 'button'; button.addEventListener('click', () => focus(height, magnification));
  }
  for (const [label, x, z] of [['正面', 1, 0], ['侧面', 0, 1], ['背面', -1, 0]] as const) {
    const button = element(directions, 'button', label); button.type = 'button'; button.addEventListener('click', () => {
      const distance = camera.position.distanceTo(controls[0]!.target);
      camera.position.copy(controls[0]!.target).add(new THREE.Vector3(x, 0, z).multiplyScalar(distance));
      camera.lookAt(controls[0]!.target); synchronize();
    });
  }
  zoom.addEventListener('input', () => {
    offset.subVectors(camera.position, controls[0]!.target).normalize().multiplyScalar(baseDistance / Number(zoom.value));
    camera.position.copy(controls[0]!.target).add(offset); synchronize();
  });
  const pause = () => { playing = false; play.textContent = '播放动作'; play.setAttribute('aria-pressed', 'false'); };
  play.addEventListener('click', () => { playing = !playing; play.textContent = playing ? '暂停动作' : '播放动作'; play.setAttribute('aria-pressed', String(playing)); dirty = true; });
  seek.addEventListener('input', () => { pause(); seconds = Number(seek.value); dirty = true; });
  actionSelect.addEventListener('change', () => { seconds = 0; seek.max = String(actors[0]!.duration(action())); seek.value = '0'; dirty = true; });
  const dispose = (): void => {
    if (stopped) return; stopped = true; cancelAnimationFrame(raf);
    for (const control of controls) control.dispose();
    observer.disconnect();
    for (const actor of actors) actor.dispose();
    releaseAssets();
    for (const stage of stages) stage.dispose();
    host.dispose();
    window.removeEventListener('pagehide', dispose);
    window.removeEventListener('scroll', onScroll);
    parent.removeEventListener('scroll', onScroll);
  };
  const fail = (error: unknown): void => { dispose(); onError(error); };
  const observer = new ResizeObserver(() => { dirty = true; }); observer.observe(grid);
  window.addEventListener('pagehide', dispose, { once: true });
  const reports = await Promise.all(REPORTS.map(async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`资源报告加载失败：${url.pathname} (${response.status})`);
    const value = await response.json() as { models: ModelReport[] };
    if (!Array.isArray(value.models)) throw new Error(`无效资源报告：${url.pathname}`);
    return value.models;
  })).catch(error => { dispose(); throw error; });
  if (stopped) return;
  const load = async (keepView = false): Promise<void> => {
    ready = false; pause(); compact.disabled = subjectSelect.disabled = actionSelect.disabled = play.disabled = seek.disabled = true;
    status.textContent = '正在加载五档资源…';
    for (const actor of actors) actor.dispose(); actors = []; releaseAssets();
    subject = SUBJECTS.find(item => item.id === subjectSelect.value)!;
    await Promise.all(TIERS.map(tier => loadSubject(subject, effectiveTier(tier.id))));
    if (stopped) return;
    actors = TIERS.map((tier, index) => { const actor = preview(subject, effectiveTier(tier.id)); stages[index]!.scene.add(actor.root); return actor; });
    // 检视镜头可绕角色旋转；阴影固定覆盖角色，不使用游戏的 z=0 平面视野拟合。
    const lighting = TUNING.render.lighting;
    const fit = fitShadowCamera({ centerX: 0, centerY: subject.height / 2,
      halfWidth: subject.height, halfHeight: subject.height, zMin: -subject.height, zMax: subject.height,
      margin: lighting.shadow.margin, casterReach: lighting.shadow.casterReach,
      direction: lighting.sun.direction, mapSize: lighting.shadow.mapSize });
    for (const stage of stages) {
      stage.keyLight.position.copy(fit.position);
      stage.keyLight.target.position.copy(fit.target);
      stage.keyLight.target.updateMatrixWorld();
      Object.assign(stage.keyLight.shadow.camera, { left: -fit.halfRight, right: fit.halfRight,
        top: fit.halfUp, bottom: -fit.halfUp, near: fit.near, far: fit.far });
      stage.keyLight.shadow.camera.updateProjectionMatrix();
    }
    if (!keepView) seconds = 0;
    seek.value = String(seconds); seek.max = String(actors[0]!.duration(action()));
    baseDistance = subject.height * 1.2 / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    if (!keepView) {
      camera.position.set(baseDistance, subject.height * .5, 0);
      for (const control of controls) { control.minDistance = baseDistance / 12; control.maxDistance = baseDistance * 2; control.target.set(0, subject.height * .5, 0); }
    }
    camera.lookAt(controls[0]!.target); synchronize();
    panels.forEach(({ tier, stats, detail }, index) => {
      const optimized = compact.checked && tier.id.startsWith('ktx2');
      const report = reports[optimized ? index + 1 : Math.max(0, index - 1)]!.find(item => item.source === subject.source);
      if (!report) throw new Error(`资源报告缺少 ${subject.source}`);
      const original = tier.id === 'original';
      const bytes = original ? report.sourceBytes : report.outputBytes;
      const sizes = [...new Set(report.images.map(image => original ? `${image.width}×${image.height}` : `${image.outputWidth}×${image.outputHeight}`))];
      const rgba = report.images.reduce((sum, image) => sum + (original ? image.sourceRgbaMipBytes : image.outputRgbaMipBytes), 0);
      const ktx = tier.id.startsWith('ktx2');
      const budget = ktx ? report.images.reduce((sum, image) => {
        let width = image.outputWidth, height = image.outputHeight, bytes = 0;
        while (true) { bytes += Math.ceil(width / 4) * Math.ceil(height / 4) * 16; if (width === 1 && height === 1) break; width = Math.max(1, width >> 1); height = Math.max(1, height >> 1); }
        return sum + bytes;
      }, 0) : rgba;
      stats.replaceChildren();
      detail.textContent = optimized ? `${tier.id === 'ktx2' ? 512 : 256} 贴图 · 模型数据同步压缩` : tier.detail;
      element(stats, 'strong', mb(bytes));
      element(stats, 'span', original ? '原始文件' : `较原件减少 ${(100 * (1 - bytes / report.sourceBytes)).toFixed(1)}%`);
      element(stats, 'span', sizes.length ? `贴图 ${sizes.join(' / ')}` : '无图片贴图');
      element(stats, 'span', `${ktx ? 'ASTC / BC7' : 'RGBA8'}＋mip 预算 ${mib(budget)}`);
      if (optimized) {
        const before = reports[index - 1]!.find(item => item.source === subject.source)!;
        element(stats, 'span', `模型压缩前 ${mb(before.outputBytes)} → 再省 ${(100 * (1 - bytes / before.outputBytes)).toFixed(1)}%`);
      }
    });
    status.textContent = `${subject.label} · 五档已就绪 · 镜头和动作同步`;
    compact.disabled = subjectSelect.disabled = actionSelect.disabled = play.disabled = seek.disabled = false;
    ready = true; dirty = true;
    document.getElementById('loading')!.hidden = true;
  };
  subjectSelect.addEventListener('change', () => { void load().catch(fail); });
  compact.addEventListener('change', () => { void load(true).catch(fail); });
  const frame = (now: number): void => {
    if (stopped) return;
    const dt = Math.min((now - last) / 1000, .05); last = now;
    if (ready && !document.hidden && (dirty || playing)) {
      try {
        if (playing) { seconds = (seconds + dt) % actors[0]!.duration(action()); seek.value = String(seconds); }
        host.begin();
        const clip = grid.getBoundingClientRect();
        panels.forEach((panel, index) => {
          const { viewport } = panel;
          const rect = viewport.getBoundingClientRect();
          if (rect.right <= Math.max(0, clip.left) || rect.left >= Math.min(innerWidth, clip.right)
            || rect.bottom <= Math.max(0, clip.top) || rect.top >= Math.min(innerHeight, clip.bottom)) return;
          const stage = stages[index]!;
          if (rect.width !== panel.width || rect.height !== panel.height) {
            stage.setSize(rect.width, rect.height); panel.width = rect.width; panel.height = rect.height;
          }
          stage.camera.copy(camera);
          stage.camera.aspect = rect.width / rect.height; stage.camera.updateProjectionMatrix();
          actors[index]!.sample(action(), seconds);
          host.draw(stage.postFx.renderTexture(), rect, clip);
        });
        dirty = false;
      } catch (error) { fail(error); return; }
    }
    raf = requestAnimationFrame(frame);
  };
  // 视窗滚动改变合成位置，即使暂停也要重新画一次。
  grid.addEventListener('scroll', onScroll);
  window.addEventListener('scroll', onScroll);
  parent.addEventListener('scroll', onScroll);
  await load().catch(error => { dispose(); throw error; });
  if (!stopped) { last = performance.now(); raf = requestAnimationFrame(frame); }
}
