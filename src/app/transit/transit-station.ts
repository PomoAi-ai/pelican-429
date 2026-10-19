import * as THREE from 'three';
import { TRANSIT, TRANSIT_DESTINATIONS, TRANSIT_PHASE_SECONDS, TRANSIT_PLANTER_X, TRANSIT_PULSE_SECONDS,
  type TransitDestinationId } from '../../config/transit.ts';
import type { Vec2 } from '../../core/math.ts';
import type { Body } from '../../physics/body.ts';
import type { Stage } from '../../render/stage/stage.ts';
import type { createAiCityLighting } from '../../render/city/ai-city-lighting.ts';
import { createAiCityGreenery } from '../../render/city/ai-city-environment.ts';
import { createTransitCenterModel, type TransitVisual } from '../../render/transit/transit-center-model.ts';
import type { GrassyRig } from '../../render/grassy/grassy-rig.ts';
import { animateGrassy } from '../../render/grassy/grassy-animator.ts';
import { cancelTransit, createTransit, enterTransit, launchTransit, seatTransit, selectTransitDestination,
  stepTransit, transitPhaseProgress, type TransitPhase, type TransitState } from '../../sim/transit.ts';
import type { createTransitInterface } from './transit-controls.ts';
import { createTransitPilot, transitWalkZ } from './transit-pilot.ts';
import { createTransitAudio } from './transit-audio.ts';
import { createTransitHandoff, type TransitOwner } from './transit-handoff.ts';
import { t } from '../../config/i18n.ts';

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
  travel: ['穿越时空', '尾部追航 · 正在穿越时空航道'],
  complete: ['正在抵达', '正在进入目的地场景'],
};
const FOLLOW_PHASES = new Set<TransitPhase>(['ground', 'elevator', 'calling', 'descending', 'opening', 'boarding', 'disembarking']);
const smooth = (value: number) => {
  const p = THREE.MathUtils.clamp(value, 0, 1);
  return p * p * (3 - 2 * p);
};

/** What a scene must provide to mount the transit center; positions are world coordinates. */
export interface TransitStationHost {
  readonly stage: Stage;
  readonly lighting: ReturnType<typeof createAiCityLighting>;
  readonly ui: ReturnType<typeof createTransitInterface>;
  readonly rig: GrassyRig;
  /** World position of the station's local (0, 0): the street surface below the pad axis line. */
  readonly origin: Vec2;
  /** Hosted stations leave the ground-phase camera and the street end caps to the surrounding scene. */
  readonly hosted: boolean;
  readonly signal: AbortSignal;
  readonly owner: TransitOwner;
  body(): Body;
  teleport(x: number, y: number): void;
  playing(): boolean;
  clearInput(): void;
  stopInput(): void;
  reportError(error: unknown): void;
}

function flightVisual(state: TransitState, travelTime: number, arrival: number): TransitVisual {
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
    travelTime, arrival,
  };
}

/** Player coordinates are station-local; takeover starts the follow from wherever the host left the camera. */
function createTransitCamera(stage: Stage, origin: Vec2) {
  const base = new THREE.Vector3(), target = new THREE.Vector3(), offset = new THREE.Vector3(origin.x, origin.y, 0);
  const sideFov = stage.camera.fov;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (dt: number, time: number, state: TransitState, visual: TransitVisual, playerX: number, playerY: number,
    closeView: boolean, takeover: boolean) => {
    if (takeover) base.copy(stage.camera.position);
    if (visual.travel >= 0) {
      const settle = smooth(visual.travelTime / 1.8);
      stage.camera.position.set(TRANSIT.rocketX, visual.altitude - 18 - (reducedMotion ? 5 : settle * 5), 0).add(offset);
      // The view axis is +Y in world space; Z supplies screen-up without a lookAt singularity.
      stage.camera.up.set(0, 0, 1);
      // Entering the corridor the lens snaps from wide back to the chase FOV; the position stays on the ship axis.
      const punch = 1 - Math.min(1, visual.travelTime / .8);
      // Each corridor time shock briefly widens the lens in step with the shader surge.
      const shock = visual.travelTime > .8 ? Math.exp(-((visual.travelTime - .8) % TRANSIT_PULSE_SECONDS) * 4) : 0;
      stage.camera.fov = reducedMotion ? 38 : 38 + 24 * punch ** 3 + 7 * shock;
      stage.camera.lookAt(origin.x + TRANSIT.rocketX, origin.y + visual.altitude + 7, 0);
      stage.camera.updateProjectionMatrix(); stage.camera.updateMatrixWorld();
      return;
    }
    stage.camera.up.set(0, 1, 0);
    stage.camera.fov = sideFov;
    const cabin = state.phase === 'cabin';
    const upper = cabin || (state.phase === 'ground' && (closeView || playerY > 11)) || state.phase === 'opening' || state.phase === 'boarding';
    const flight = ['ignition', 'ascent', 'warp', 'travel', 'complete'].includes(state.phase);
    const rise = smooth(visual.altitude / 15);
    const height = cabin ? 13.5 : upper ? 19 : flight ? 36 + rise * 14 : 35;
    const span = cabin ? 24 : upper ? 35 : flight ? 53 + rise * 8 : 43;
    const distance = Math.max(height, span / stage.camera.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2)));
    // Keep the gantry fixed in frame until the hull has visibly cleared it.
    const flightY = 15 + Math.max(0, visual.altitude - 5) + 80 * smooth((visual.warp - .25) / .75);
    // On foot the view tracks the runner and stops where the street end caps meet the frame edge.
    const half = Math.max(height * stage.camera.aspect, span) / 2;
    const left = TRANSIT.walkwayMinX - 6 + half, right = TRANSIT.walkwayMaxX + 6 - half;
    const follow = FOLLOW_PHASES.has(state.phase);
    const x = cabin ? 35 : !follow ? 23 : left > right ? (left + right) / 2 : THREE.MathUtils.clamp(playerX, left, right);
    target.set(x, cabin ? 20.2 : upper ? Math.max(19.6, playerY + 1) : flight ? flightY : 10.2, distance).add(offset);
    base.lerp(target, dt === 0 ? 1 : 1 - Math.exp(-dt * (visual.altitude > 0 ? 8 : 3)));
    stage.camera.position.copy(base);
    // The camera falls slightly behind the climb, exposing the engine cluster without leaving the side view.
    const pitch = reducedMotion ? 0 : .19 * smooth(visual.altitude / 8) * (1 - smooth(visual.warp / .6));
    stage.camera.position.y -= Math.sin(pitch) * distance;
    stage.camera.position.z *= Math.cos(pitch);
    if (!reducedMotion) {
      const force = visual.thrust * (.045 + .11 * (1 - smooth(visual.altitude / 18))) * (1 - smooth(visual.warp / .4));
      stage.camera.position.x += force * (.65 * Math.sin(time * 47) + .25 * Math.sin(time * 79));
      stage.camera.position.y += force * (.55 * Math.sin(time * 59) + .45 * Math.sin(time * 13));
    }
    stage.camera.rotation.set(pitch, 0, 0); stage.camera.updateProjectionMatrix(); stage.camera.updateMatrixWorld();
  };
}

function createTransitHud(host: TransitStationHost, pilot: ReturnType<typeof createTransitPilot>,
  model: ReturnType<typeof createTransitCenterModel>, state: TransitState) {
  const { ui, stage } = host;
  const anchor = new THREE.Vector3();
  let lastPhase: TransitPhase | null = null;
  return (visual: TransitVisual, prompt: boolean) => {
    const phase = state.phase, p = transitPhaseProgress(state);
    if (phase !== lastPhase) {
      ui.section.dataset.phase = phase; ui.phase.textContent = t(PHASE_TEXT[phase][0]);
      ui.hint.textContent = t(PHASE_TEXT[phase][1]); ui.panel.hidden = phase !== 'cabin';
      ui.board.hidden = phase !== 'ground'; ui.overview.disabled = phase !== 'ground';
      if (phase === 'cabin') {
        ui.launch.disabled = true; ui.launch.textContent = t('请选择目的地');
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
      ui.board.textContent = t(pilot.atUpperDeck() ? '乘电梯 ↓' : '乘电梯 ↑');
      ui.board.disabled = pilot.approaching || !host.body().onGround;
      ui.hint.textContent = t(pilot.approaching ? '正在前往电梯…' : near ? '点击舱门或按 E · 确认后进入驾驶舱'
        : pilot.atUpperDeck() ? '走到右侧舱门点击进入 · S＋空格下穿 · 空格飞行' : PHASE_TEXT.ground[1]);
    }
    ui.readout.textContent = phase === 'ground' ? 'READY' : phase === 'cabin' ? 'ONLINE'
      : phase === 'ignition' ? `T − ${Math.max(1, Math.ceil(TRANSIT_PHASE_SECONDS.ignition * (1 - p)))}`
      : phase === 'ascent' ? `${visual.speed.toFixed(1)} m/s` : phase === 'warp' ? `${(visual.speed / 1000).toFixed(2)} km/s`
      : phase === 'travel' ? `T + ${state.elapsed.toFixed(1)} s`
      : phase === 'complete' ? 'JUMP' : `${Math.round(p * 100)}%`;
    ui.engine.textContent = phase === 'travel' ? t('航道稳定 · 目的地已锁定')
      : visual.thrust > 0 ? `ALT ${visual.altitude.toFixed(1)} m  /  THRUST ${Math.round(visual.thrust * 100)}%` : '';
    ui.meter.style.transform = `scaleX(${phase === 'ground' ? .08 : p})`;
    ui.flash.style.opacity = String(phase === 'warp' ? smooth((p - .28) / .65) : 0);
  };
}

/**
 * The transit center as a mountable unit. The host steps the ground-phase walker (using `collision` and `steer`);
 * once `active`, the station drives the rig pose and camera until the sequence returns to the street.
 */
export function createTransitStation(host: TransitStationHost) {
  const { stage, lighting, ui, origin, signal } = host;
  const model = createTransitCenterModel(stage.renderer, !host.hosted);
  model.root.position.set(origin.x, origin.y, 0);
  stage.scene.add(model.root);
  const flowers = createAiCityGreenery(TRANSIT_PLANTER_X.map(x => ({ x: origin.x + x - .75, y: origin.y + .84, z: -2.25, width: 1.5, depth: .5 })));
  stage.scene.add(flowers.root);
  const sound = createTransitAudio(signal, host.reportError);
  const daylightExposure = stage.renderer.toneMappingExposure;
  const state = createTransit();
  const pilot = createTransitPilot(host, model, state);
  const updateCamera = createTransitCamera(stage, origin), updateHud = createTransitHud(host, pilot, model, state);
  const handoff = createTransitHandoff(ui, signal, host.owner, host.stopInput);
  let closeView = false, hatchPrompt = false, elapsed = 0, travelTime = 0, chaseLighting = false, travelling = false, driving = false;
  const focusCanvas = () => stage.canvas.focus({ preventScroll: true });
  const closePrompt = () => { hatchPrompt = false; focusCanvas(); };
  const showHatch = () => {
    if (!pilot.canEnter()) return;
    pilot.stop(); hatchPrompt = true; ui.entry.hidden = false; ui.enter.focus({ preventScroll: true });
  };
  const local = (): Vec2 => { const body = host.body(); return { x: body.x - origin.x, y: body.y - origin.y }; };
  ui.board.addEventListener('click', () => { pilot.approachLift(); closeView = false; focusCanvas(); }, { signal });
  ui.hatch.addEventListener('click', showHatch, { signal });
  ui.closeEntry.addEventListener('click', closePrompt, { signal });
  ui.enter.addEventListener('click', () => {
    if (pilot.canEnter() && enterTransit(state, local())) { pilot.stop(); closePrompt(); }
  }, { signal });
  ui.overview.addEventListener('click', () => { closeView = !closeView; ui.overview.setAttribute('aria-pressed', String(closeView)); focusCanvas(); }, { signal });
  ui.sound.addEventListener('click', () => { const on = sound.toggle(); ui.sound.textContent = t(on ? '♪ 声音 开' : '♪ 声音 关'); ui.sound.setAttribute('aria-pressed', String(on)); focusCanvas(); }, { signal });
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
  stage.canvas.addEventListener('click', event => {
    if (!host.playing() || !pilot.canEnter()) return;
    const rect = stage.canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    ray.setFromCamera(pointer, stage.camera);
    if (ray.intersectObject(model.hatch, true).length > 0) showHatch();
  }, { signal });
  for (const button of ui.panel.querySelectorAll<HTMLButtonElement>('[data-destination]')) {
    const destination = TRANSIT_DESTINATIONS.find(item => item.id === button.dataset.destination)!;
    button.addEventListener('click', () => {
      if (!selectTransitDestination(state, destination.id)) return;
      for (const option of ui.panel.querySelectorAll<HTMLButtonElement>('[data-destination]')) option.setAttribute('aria-pressed', String(option === button));
      ui.launch.disabled = false; ui.launch.textContent = t('发射 · {name}').replace('{name}', t(destination.name, 'place'));
    }, { signal });
  }
  ui.launch.addEventListener('click', () => { if (launchTransit(state)) { pilot.stop(); closeView = false; focusCanvas(); } }, { signal });
  const cancel = () => { closePrompt(); cancelTransit(state); pilot.stop(); };
  ui.cancel.addEventListener('click', cancel, { signal });

  return {
    collision: pilot.collision,
    steer: pilot.steer,
    handoff,
    /** The station owns the rig and camera: any phase off the street, or while the hatch dialog is open. */
    get active(): boolean { return state.phase !== 'ground' || hatchPrompt; },
    get travelling(): boolean { return travelling; },
    /** On the station's street or above it; the diggable underground below the paving is ordinary city. */
    near(body: Body): boolean {
      const x = body.x - origin.x;
      return x >= TRANSIT.walkwayMinX && x <= TRANSIT.walkwayMaxX && body.y - origin.y > -.5;
    },
    walkZ(x: number, y: number): number { return transitWalkZ(x - origin.x, y - origin.y); },
    interact(): void {
      if (!host.playing()) return;
      if (pilot.canEnter()) showHatch(); else { pilot.approachLift(); focusCanvas(); }
    },
    cancel,
    /** 测试入口：跳过登舱，入座后立即发射。 */
    launch(destination: TransitDestinationId): void {
      if (!seatTransit(state, destination) || !launchTransit(state)) throw new Error(`交通中心无法直接发射：阶段 ${state.phase}`);
      pilot.stop(); closeView = false;
    },
    update(dt: number): void {
      elapsed += dt;
      const destination = stepTransit(state, dt);
      if (state.phase === 'travel') travelTime = state.elapsed;
      else if (state.phase === 'complete') travelTime += dt;
      const visual = flightVisual(state, travelTime, handoff.update(dt));
      travelling = visual.travel >= 0;
      if (travelling && !chaseLighting) {
        chaseLighting = true;
        lighting.setEnabled(false);
        stage.scene.fog = null;
        stage.postFx.setReflections(false);
        stage.postFx.grade.uAoIntensity.value = 0;
        // The corridor is the only world left: everything the host added besides lights disappears with the city.
        for (const child of stage.scene.children) if (child !== model.root && !(child instanceof THREE.Light)) child.visible = false;
      }
      model.update(visual, elapsed); model.root.updateMatrixWorld(true);
      if (!travelling) pilot.update(dt, elapsed, visual);
      if (!pilot.canEnter()) hatchPrompt = false;
      // 舱门确认框打开时宿主停止推进步行角色，待机动画改由交通中心播放。
      if (hatchPrompt) animateGrassy(host.rig, 'idle', elapsed, dt, null);
      const drive = !host.hosted || state.phase !== 'ground';
      const body = host.body();
      if (drive) updateCamera(dt, elapsed, state, visual, body.x - origin.x, body.y - origin.y, closeView, !driving);
      driving = drive;
      updateHud(visual, hatchPrompt);
      sound.update(visual, elapsed, state.phase, body.onGround ? Math.abs(body.vx) : 0);
      if (!travelling) flowers.update(elapsed);
      if (state.phase !== 'ground') stage.renderer.toneMappingExposure = daylightExposure * (1 - visual.thrust * .18 * (1 - visual.warp));
      if (destination !== null) handoff.start(destination);
    },
    dispose(): void {
      sound.dispose(); flowers.dispose(); model.dispose();
    },
  };
}
