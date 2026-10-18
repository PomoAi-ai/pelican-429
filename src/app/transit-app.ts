import * as THREE from 'three';
import { BUILDING_SCENE_TUNING, AI_CITY_HARBOR_LOOK } from '../config/ai-city-look.ts';
import { TRANSIT, TRANSIT_DESTINATIONS, TRANSIT_PHASE_SECONDS } from '../config/transit.ts';
import { createSceneWeatherSettings } from '../config/scene-weather.ts';
import { sampleWorldTime } from '../core/calendar.ts';
import { attachStage, createStageRenderer, type Stage } from '../render/stage.ts';
import { createAiCityLighting } from '../render/ai-city-lighting.ts';
import { createHarborSideScene } from '../render/harbor-side-scene.ts';
import { createAiCityGreenery } from '../render/ai-city-environment.ts';
import { createTransitCenterModel, type TransitVisual } from '../render/transit-center-model.ts';
import { createGrassyRig, loadGrassyAsset } from '../render/grassy/grassy-rig.ts';
import { warmUpStage } from '../render/warm-up.ts';
import { cancelTransit, createTransit, enterTransit, launchTransit, selectTransitDestination,
  stepTransit, transitPhaseProgress, type TransitPhase, type TransitState } from '../sim/transit.ts';
import { bindTransitInput, createTransitInterface } from './transit-controls.ts';
import { createCharacterAppearanceStore } from './character-appearance.ts';
import { createTransitPilot } from './transit-pilot.ts';
import { createTransitAudio } from './transit-audio.ts';
import { waitSceneResource, type SceneMountContext } from './scene-mount.ts';

const PHASE_TEXT: Record<TransitPhase, [string, string]> = {
  ground: ['等待登船', 'A / D 移动 · 按住空格飞行 · S 下降 · E 交互'],
  calling: ['正在召梯', '电梯正在前往你的楼层'],
  elevator: ['升往登船层', '到达后走向舱门，点击进入'],
  opening: ['舱门解锁', '压力平衡 · 登舱通道已打开'],
  boarding: ['进入驾驶舱', '正在入座，连接航道导航'],
  cabin: ['已进入驾驶舱', '选择目的地，准备出发'],
  disembarking: ['离开驾驶舱', '返回登船桥，可自由飞行或乘电梯下楼'],
  descending: ['返回地面', '电梯正在下行'],
  retract: ['准备发射', '舱门密封 · 登船桥收回'],
  ignition: ['主发动机点火', '燃烧室增压 · 推力建立 · 支架解锁'],
  ascent: ['正在升空', '主发动机全功率 · 正在加速'],
  warp: ['突破航速', '跃迁推进接管 · 航道锁定'],
  travel: ['穿越时空', '跟随光航迹 · 正在穿越时空航道'],
  complete: ['正在抵达', '正在进入目的地场景'],
};
const smooth = (value: number) => {
  const p = THREE.MathUtils.clamp(value, 0, 1);
  return p * p * (3 - 2 * p);
};

function flightVisual(state: TransitState): TransitVisual {
  const phase = state.phase, p = transitPhaseProgress(state);
  const flying = phase === 'ascent' || phase === 'warp' || phase === 'travel' || phase === 'complete';
  const open = phase === 'boarding' || phase === 'cabin' || phase === 'disembarking';
  const ascending = phase === 'elevator' || (phase === 'calling' && state.elevatorDirection === 'down');
  const descending = phase === 'descending' || (phase === 'calling' && state.elevatorDirection === 'up');
  const climb = 42 * (.045 * p + .955 * p ** 3.1);
  const ascentSpeed = 42 / TRANSIT_PHASE_SECONDS.ascent;
  return {
    elevatorY: ascending ? TRANSIT.cabinFloor * smooth(p) : descending ? TRANSIT.cabinFloor * (1 - smooth(p))
      : state.elevatorAtTop ? TRANSIT.cabinFloor : 0,
    bridgeRetraction: phase === 'retract' ? smooth((p - .2) / .8) : phase === 'ignition' || flying ? 1 : 0,
    doorClosed: open ? 0 : phase === 'opening' ? 1 - smooth(p) : phase === 'retract' ? smooth(p / .25) : 1,
    clampRelease: phase === 'ignition' ? smooth((p - .8) / .2) : flying ? 1 : 0,
    charge: phase === 'ignition' ? smooth(p) : flying ? 1 : 0,
    thrust: phase === 'ignition' ? .95 * smooth((p - .08) / .65) : phase === 'ascent' ? .95 + .05 * p
      : phase === 'warp' ? 1 - smooth((p - .2) / .35) : 0,
    altitude: phase === 'ascent' ? climb : flying ? 42 : 0,
    speed: phase === 'ascent' ? ascentSpeed * (.045 + 2.9605 * p ** 2.1)
      : phase === 'warp' ? ascentSpeed * 3.0055 + 3000 * smooth((p - .14) / .55) : 0,
    burnTime: phase === 'ignition' ? state.elapsed : phase === 'ascent' ? TRANSIT_PHASE_SECONDS.ignition + state.elapsed
      : flying ? TRANSIT_PHASE_SECONDS.ignition + TRANSIT_PHASE_SECONDS.ascent
        + (phase === 'warp' ? state.elapsed : TRANSIT_PHASE_SECONDS.warp
          + (phase === 'travel' ? state.elapsed : TRANSIT_PHASE_SECONDS.travel)) : 0,
    warp: phase === 'warp' ? p : phase === 'travel' || phase === 'complete' ? 1 : 0,
    travel: phase === 'travel' ? p : phase === 'complete' ? 1 : -1,
  };
}

function createTransitCamera(stage: Stage) {
  const base = new THREE.Vector3(), target = new THREE.Vector3();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (dt: number, time: number, state: TransitState, visual: TransitVisual, playerY: number, closeView: boolean) => {
    const cabin = state.phase === 'cabin';
    const upper = cabin || (state.phase === 'ground' && (closeView || playerY > 11)) || state.phase === 'opening' || state.phase === 'boarding';
    const flight = ['ignition', 'ascent', 'warp', 'travel', 'complete'].includes(state.phase);
    const rise = smooth(visual.altitude / 15);
    const height = cabin ? 13.5 : upper ? 19 : flight ? 36 + rise * 14 : 31;
    const span = cabin ? 24 : upper ? 35 : flight ? 53 + rise * 8 : 43;
    const distance = Math.max(height, span / stage.camera.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2)));
    // Keep the gantry fixed in frame until the hull has visibly cleared it.
    const flightY = 15 + Math.max(0, visual.altitude - 5) + 80 * smooth((visual.warp - .25) / .75);
    target.set(cabin ? 35 : upper ? 24 : 23, cabin ? 20.2 : upper ? Math.max(19.6, playerY + 1) : flight ? flightY : 13, distance);
    base.lerp(target, dt === 0 ? 1 : 1 - Math.exp(-dt * (visual.altitude > 0 ? 8 : 3)));
    stage.camera.position.copy(base);
    if (!reducedMotion) {
      const force = visual.thrust * (.045 + .11 * (1 - smooth(visual.altitude / 18))) * (1 - smooth(visual.warp / .4));
      stage.camera.position.x += force * (.65 * Math.sin(time * 47) + .25 * Math.sin(time * 79));
      stage.camera.position.y += force * (.55 * Math.sin(time * 59) + .45 * Math.sin(time * 13));
    }
    stage.camera.rotation.set(0, 0, 0); stage.camera.updateProjectionMatrix(); stage.camera.updateMatrixWorld();
  };
}

function createTransitHud(ui: ReturnType<typeof createTransitInterface>, pilot: ReturnType<typeof createTransitPilot>,
  model: ReturnType<typeof createTransitCenterModel>, stage: Stage, state: TransitState) {
  const anchor = new THREE.Vector3();
  let lastPhase: TransitPhase | null = null;
  return (visual: TransitVisual, prompt: boolean) => {
    const phase = state.phase, p = transitPhaseProgress(state);
    if (phase !== lastPhase) {
      ui.section.dataset.phase = phase; ui.phase.textContent = PHASE_TEXT[phase][0];
      ui.hint.textContent = PHASE_TEXT[phase][1]; ui.panel.hidden = phase !== 'cabin';
      ui.board.hidden = phase !== 'ground'; ui.overview.disabled = phase !== 'ground';
      if (phase === 'cabin') {
        ui.launch.disabled = true; ui.launch.textContent = '请选择目的地';
        for (const button of ui.panel.querySelectorAll<HTMLButtonElement>('[data-destination]')) button.setAttribute('aria-pressed', 'false');
        ui.panel.querySelector<HTMLButtonElement>('[data-destination]')!.focus({ preventScroll: true });
      }
      lastPhase = phase;
    }
    const near = pilot.canEnter();
    ui.entry.hidden = !prompt; ui.hatch.hidden = !near || prompt;
    if (near) {
      model.hatchAnchor.getWorldPosition(anchor).project(stage.camera);
      const x = (anchor.x + 1) * .5 * ui.viewport.clientWidth, y = (1 - anchor.y) * .5 * ui.viewport.clientHeight;
      ui.hatch.style.left = `${x - 15}px`; ui.hatch.style.top = `${y - 85}px`;
      ui.entry.style.left = `${THREE.MathUtils.clamp(x - 290, 12, ui.viewport.clientWidth - 292)}px`;
      ui.entry.style.top = `${THREE.MathUtils.clamp(y + 80, 12, ui.viewport.clientHeight - 230)}px`;
    }
    if (phase === 'ground') {
      ui.board.textContent = pilot.atUpperDeck() ? '乘电梯 ↓' : '乘电梯 ↑';
      ui.board.disabled = pilot.approaching || !pilot.player.entity.body.onGround;
      ui.hint.textContent = pilot.approaching ? '正在前往电梯…' : near ? '点击舱门或按 E · 确认后进入驾驶舱'
        : pilot.atUpperDeck() ? '走到右侧舱门点击进入 · S＋空格下穿 · 空格飞行' : PHASE_TEXT.ground[1];
    }
    ui.readout.textContent = phase === 'ground' ? 'READY' : phase === 'cabin' ? 'ONLINE'
      : phase === 'ignition' ? `T − ${Math.max(1, Math.ceil(TRANSIT_PHASE_SECONDS.ignition * (1 - p)))}`
      : phase === 'ascent' ? `${visual.speed.toFixed(1)} m/s` : phase === 'warp' ? `${(visual.speed / 1000).toFixed(2)} km/s`
      : phase === 'travel' ? `T + ${state.elapsed.toFixed(1)} s`
      : phase === 'complete' ? 'JUMP' : `${Math.round(p * 100)}%`;
    ui.engine.textContent = phase === 'travel' ? '航道稳定 · 目的地已锁定'
      : visual.thrust > 0 ? `ALT ${visual.altitude.toFixed(1)} m  /  THRUST ${Math.round(visual.thrust * 100)}%` : '';
    ui.meter.style.transform = `scaleX(${phase === 'ground' ? .08 : p})`;
    ui.flash.style.opacity = String(phase === 'complete' ? 1 : phase === 'warp' ? smooth((p - .28) / .65) : 0);
  };
}

export async function mountTransit(context: SceneMountContext): Promise<void> {
  const { signal, root } = context;
  const ui = createTransitInterface(root);
  const stage = attachStage(ui.viewport, context.renderer, BUILDING_SCENE_TUNING, { quality: 'high', antialias: 'smaa' });
  context.onDispose(() => stage.dispose()); stage.camera.far = 600;
  const lighting = createAiCityLighting(stage, AI_CITY_HARBOR_LOOK);
  lighting.setEnabled(true); context.onDispose(() => lighting.dispose());
  const daylightExposure = stage.renderer.toneMappingExposure;
  const model = createTransitCenterModel(context.renderer);
  stage.scene.add(model.root); context.onDispose(() => model.dispose());
  const flowers = createAiCityGreenery([3, 13.9, 38].map(x => ({ x: x - .75, y: .84, z: -2.25, width: 1.5, depth: .5 })));
  stage.scene.add(flowers.root); context.onDispose(() => flowers.dispose());
  context.progress('载入正式角色与城市远景');
  await waitSceneResource(loadGrassyAsset('game'), signal); signal.throwIfAborted();
  const rig = createGrassyRig('game', undefined, createCharacterAppearanceStore(localStorage).current());
  stage.scene.add(rig.root); rig.effects.setProjectilePreview(false);
  context.onDispose(() => { rig.root.removeFromParent(); rig.dispose(); });
  const background = await createHarborSideScene({ minX: -60, maxX: 100, homeCenter: 20 });
  if (signal.aborted) { background.dispose(); signal.throwIfAborted(); }
  stage.scene.add(background.root); context.onDispose(() => background.dispose());
  const sound = createTransitAudio(signal, context.reportError); context.onDispose(() => sound.dispose());
  const state = createTransit();
  let closeView = false, hatchPrompt = false, elapsed = 0, previous: number | null = null, worldSignature = '';
  const focusCanvas = () => stage.canvas.focus({ preventScroll: true });
  const closePrompt = () => { hatchPrompt = false; focusCanvas(); };
  const showHatch = () => {
    if (!pilot.canEnter()) return;
    pilot.stop(); hatchPrompt = true; ui.entry.hidden = false; ui.enter.focus({ preventScroll: true });
  };
  const interact = () => { if (pilot.canEnter()) showHatch(); else { pilot.approachLift(); focusCanvas(); } };
  const cancel = () => { closePrompt(); cancelTransit(state); pilot.stop(); };
  const input = bindTransitInput(root, stage.canvas, signal, interact, cancel);
  const pilot = createTransitPilot(rig, model, state, input);
  const updateCamera = createTransitCamera(stage), updateHud = createTransitHud(ui, pilot, model, stage, state);
  ui.board.addEventListener('click', () => { pilot.approachLift(); closeView = false; focusCanvas(); }, { signal });
  ui.hatch.addEventListener('click', showHatch, { signal });
  ui.closeEntry.addEventListener('click', closePrompt, { signal });
  ui.enter.addEventListener('click', () => {
    if (pilot.canEnter() && enterTransit(state, pilot.player.entity.body)) { pilot.stop(); closePrompt(); }
  }, { signal });
  ui.cancel.addEventListener('click', cancel, { signal });
  ui.overview.addEventListener('click', () => { closeView = !closeView; ui.overview.setAttribute('aria-pressed', String(closeView)); focusCanvas(); }, { signal });
  ui.sound.addEventListener('click', () => { const on = sound.toggle(); ui.sound.textContent = on ? '♪ 声音 开' : '♪ 声音 关'; ui.sound.setAttribute('aria-pressed', String(on)); focusCanvas(); }, { signal });
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
  stage.canvas.addEventListener('click', event => {
    if (!pilot.canEnter()) return;
    const rect = stage.canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    ray.setFromCamera(pointer, stage.camera);
    if (ray.intersectObject(model.hatch, true).length > 0) showHatch();
  }, { signal });
  for (const destination of TRANSIT_DESTINATIONS) {
    const button = root.querySelector<HTMLButtonElement>(`[data-destination="${destination.id}"]`)!;
    button.addEventListener('click', () => {
      if (!selectTransitDestination(state, destination.id)) return;
      for (const option of ui.panel.querySelectorAll<HTMLButtonElement>('[data-destination]')) option.setAttribute('aria-pressed', String(option === button));
      ui.launch.disabled = false; ui.launch.textContent = `发射 · ${destination.name}`;
    }, { signal });
  }
  ui.launch.addEventListener('click', () => { if (launchTransit(state)) { pilot.stop(); closeView = false; focusCanvas(); } }, { signal });
  const render = (dt: number): void => {
    elapsed += dt;
    const destination = stepTransit(state, dt), visual = flightVisual(state);
    model.update(visual, elapsed); model.root.updateMatrixWorld(true);
    pilot.update(dt, elapsed, visual);
    if (!pilot.canEnter()) hatchPrompt = false;
    updateCamera(dt, elapsed, state, visual, pilot.player.entity.body.y, closeView);
    background.setCamera(stage.camera); updateHud(visual, hatchPrompt); sound.update(visual, elapsed);
    const signature = `${context.world.time.day}:${context.world.time.second}`;
    if (signature !== worldSignature) {
      const time = sampleWorldTime(context.world.time);
      lighting.setWorldTime(time, null); background.setNightFactor(time.night); worldSignature = signature;
    }
    lighting.update(); background.update(elapsed); flowers.update(elapsed);
    stage.renderer.toneMappingExposure = daylightExposure * (1 - visual.thrust * .18 * (1 - visual.warp));
    stage.render();
    if (destination !== null) location.assign(TRANSIT_DESTINATIONS.find(item => item.id === destination)!.href);
  };
  context.progress('预热金属反射、燃烧喷流与驾驶舱');
  render(0); await warmUpStage(stage, [], signal); signal.throwIfAborted();
  const frame = (now: number) => {
    const dt = previous === null || document.hidden ? 0 : Math.min((now - previous) / 1000, .05);
    previous = now;
    try { render(dt); }
    catch (error) { stage.renderer.setAnimationLoop(null); context.reportError(error); }
  };
  context.onDispose(() => { stage.renderer.setAnimationLoop(null); input.clear(); });
  stage.renderer.setAnimationLoop(frame); focusCanvas();
}

export async function startTransit(reportError: (error: unknown) => void): Promise<void> {
  const renderer = createStageRenderer(BUILDING_SCENE_TUNING), abort = new AbortController();
  const cleanups: Array<() => void> = [];
  const dispose = () => { abort.abort(); for (const cleanup of cleanups.reverse()) cleanup(); renderer.dispose(); };
  document.title = '星舰交通中心 · 鹈鹕 429';
  const status = document.querySelector<HTMLElement>('#loading');
  try {
    await mountTransit({ root: document.getElementById('app')!, renderer, signal: abort.signal,
      world: { time: { day: 13, second: 36000 }, weather: 'clear', weatherConfig: createSceneWeatherSettings() },
      reportError, progress(phase) { if (status) status.textContent = phase; }, onDispose(cleanup) { cleanups.push(cleanup); } });
    if (status) status.hidden = true;
  } catch (error) { dispose(); throw error; }
  window.addEventListener('pagehide', event => { if (!event.persisted) dispose(); });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
}
