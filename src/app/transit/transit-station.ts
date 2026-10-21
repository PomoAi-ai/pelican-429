/**
 * 交通中心功能插件（城区）：模型、界面、音效与发射镜头。阶段、电梯与人的位置在模拟层（sim/transit）按 tick 推进，
 * 这里只发命令并按阶段摆放画面；穿越结束后经返程穿梭层整页跳到目的地。
 */
import * as THREE from 'three';
import { TRANSIT, TRANSIT_DESTINATIONS, TRANSIT_PHASE_SECONDS, TRANSIT_PLANTER_X, TRANSIT_PULSE_SECONDS } from '../../config/transit.ts';
import type { Vec2 } from '../../core/math.ts';
import type { Body } from '../../physics/body.ts';
import type { Stage, StageRenderer } from '../../render/stage/stage.ts';
import { createAiCityGreenery } from '../../render/city/ai-city-environment.ts';
import { seatGrassy } from '../../render/grassy/grassy-seated.ts';
import { createTransitCenterModel, type TransitVisual } from '../../render/transit/transit-center-model.ts';
import { getPlayer, type SimWorld } from '../../sim/sim-world.ts';
import {
  canEnterTransit, onTransitDeck, requestTransit, requestTransitLift, selectTransitDestination,
  transitCabinPosition, transitElevatorY, transitExitPosition, transitPhaseProgress, type TransitPhase, type TransitState, type TransitStation,
} from '../../sim/transit.ts';
import type { GameFeature } from '../game/frame-loop.ts';
import { keepWorldParams } from '../game/free-world-navigation.ts';
import { createTransitInterface } from './transit-controls.ts';
import { createTransitAudio } from './transit-audio.ts';
import { CORRIDOR_DEPART_SECONDS, createReturnCorridorOverlay } from './return-corridor-overlay.ts';
import { onLanguageChange, t } from '../../config/i18n.ts';

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
const CABIN_PHASES = new Set<TransitPhase>(['cabin', 'retract', 'ignition', 'ascent', 'warp', 'travel', 'complete']);
const smooth = (value: number) => {
  const p = THREE.MathUtils.clamp(value, 0, 1);
  return p * p * (3 - 2 * p);
};

interface TransitStationInput {
  readonly stage: Stage<StageRenderer>;
  readonly world: SimWorld;
  readonly station: TransitStation;
  /** 玩家视图根：通道与座舱阶段按深度与座舱位置偏移它。 */
  readonly playerView: () => THREE.Object3D;
  readonly signal: AbortSignal;
  /** 设置面板、大地图或着陆舱开场期间不接受交互。 */
  readonly blocked: () => boolean;
  readonly releaseInput: () => void;
  /** 进入穿越航道：城区表现停止推进、城区光照关闭。 */
  readonly leaveCity: () => void;
  readonly reportError: (error: unknown) => void;
}

function flightVisual(state: TransitState, travelTime: number, arrival: number): TransitVisual {
  const phase = state.phase, p = transitPhaseProgress(state);
  const flying = phase === 'ascent' || phase === 'warp' || phase === 'travel' || phase === 'complete';
  const open = phase === 'boarding' || phase === 'cabin' || phase === 'disembarking';
  const climb = 42 * (.045 * p + .955 * p ** 3.1);
  const ascentSpeed = 42 / TRANSIT_PHASE_SECONDS.ascent;
  return {
    elevatorY: transitElevatorY(state),
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

/** 非地面阶段由交通中心接管镜头（游戏镜头之后写入）；接管时从游戏镜头当前位置开始跟随。 */
function createTransitCamera(stage: Stage<StageRenderer>, origin: Vec2, cabinAnchor: THREE.Object3D) {
  const base = new THREE.Vector3(), target = new THREE.Vector3(), offset = new THREE.Vector3(origin.x, origin.y, 0);
  const seat = new THREE.Vector3();
  const sideFov = stage.camera.fov;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (dt: number, time: number, state: TransitState, visual: TransitVisual, playerX: number, playerY: number, takeover: boolean) => {
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
    const upper = cabin || state.phase === 'opening' || state.phase === 'boarding';
    // Retract already holds the ignition framing, so the close-up pulls back onto a still shot.
    const flight = ['retract', 'ignition', 'ascent', 'warp', 'travel', 'complete'].includes(state.phase);
    const rise = smooth(visual.altitude / 15);
    const height = cabin ? 13.5 : upper ? 19 : flight ? 36 + rise * 14 : 35;
    const span = cabin ? 24 : upper ? 35 : flight ? 53 + rise * 8 : 43;
    const distance = Math.max(height, span / stage.camera.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2)));
    // Keep the gantry fixed in frame until the hull has visibly cleared it.
    const flightY = 15 + Math.max(0, visual.altitude - 5) + 80 * smooth((visual.warp - .25) / .75);
    const half = Math.max(height * stage.camera.aspect, span) / 2;
    const left = TRANSIT.walkwayMinX - 6 + half, right = TRANSIT.walkwayMaxX + 6 - half;
    const follow = FOLLOW_PHASES.has(state.phase);
    const x = cabin ? 35 : !follow ? 23 : left > right ? (left + right) / 2 : THREE.MathUtils.clamp(playerX, left, right);
    target.set(x, cabin ? 20.2 : upper ? Math.max(19.6, playerY + 1) : flight ? flightY : 10.2, distance).add(offset);
    // After the launch click the lens eases in on the pilot at the keys and back out before liftoff.
    const sinceLaunch = state.phase === 'retract' ? state.elapsed
      : state.phase === 'ignition' ? TRANSIT_PHASE_SECONDS.retract + state.elapsed : Infinity;
    const zoom = THREE.MathUtils.smootherstep(sinceLaunch, 0, .8) * (1 - THREE.MathUtils.smootherstep(sinceLaunch, 1.4, 2.6));
    // The wide shot holds still during the push-in and jumps to its launch framing while hidden behind the close-up.
    if (zoom === 1) base.copy(target);
    else if (sinceLaunch > .8 || dt === 0) base.lerp(target, dt === 0 ? 1 : 1 - Math.exp(-dt * (visual.altitude > 0 ? 8 : 3)));
    stage.camera.position.copy(base);
    // The camera falls slightly behind the climb, exposing the engine cluster without leaving the side view.
    let pitch = reducedMotion ? 0 : .19 * smooth(visual.altitude / 8) * (1 - smooth(visual.warp / .6));
    stage.camera.position.y -= Math.sin(pitch) * distance;
    stage.camera.position.z *= Math.cos(pitch);
    if (zoom > 0) {
      // Looks down over the window sill so the hands on the keys stay in view.
      const tilt = reducedMotion ? 0 : -.2;
      const near = Math.max(5.5, 7 / stage.camera.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2)));
      cabinAnchor.getWorldPosition(seat).add(target.set(0, 1.8 - Math.sin(tilt) * near, Math.cos(tilt) * near));
      // Distance changes geometrically so the apparent size grows at an even rate instead of lurching near the pilot.
      const far = stage.camera.position.distanceTo(seat) + near;
      stage.camera.position.lerp(seat, (far - far ** (1 - zoom) * near ** zoom) / (far - near));
      pitch = THREE.MathUtils.lerp(pitch, tilt, zoom);
    }
    if (!reducedMotion) {
      const force = visual.thrust * (.045 + .11 * (1 - smooth(visual.altitude / 18))) * (1 - smooth(visual.warp / .4));
      stage.camera.position.x += force * (.65 * Math.sin(time * 47) + .25 * Math.sin(time * 79));
      stage.camera.position.y += force * (.55 * Math.sin(time * 59) + .45 * Math.sin(time * 13));
    }
    stage.camera.rotation.set(pitch, 0, 0); stage.camera.updateProjectionMatrix(); stage.camera.updateMatrixWorld();
  };
}

export function createTransitStation(input: TransitStationInput): GameFeature & { dispose(): void } {
  const { stage, world, station, signal } = input;
  const { state, origin } = station;
  const body = (): Body => getPlayer(world).body;
  const ui = createTransitInterface(document.body);
  const model = createTransitCenterModel(stage);
  model.root.position.set(origin.x, origin.y, 0);
  stage.scene.add(model.root);
  const flowers = createAiCityGreenery(TRANSIT_PLANTER_X.map(x => ({ x: origin.x + x - .75, y: origin.y + .84, z: -2.25, width: 1.5, depth: .5 })));
  stage.scene.add(flowers.root);
  const sound = createTransitAudio(signal, input.reportError);
  // 新建渲染上下文要卡一两秒，趁加载时隐藏着建好。
  const corridor = createReturnCorridorOverlay(document.body, false);
  const daylightExposure = stage.renderer.toneMappingExposure;
  const updateCamera = createTransitCamera(stage, origin, model.cabinAnchor);
  const anchor = new THREE.Vector3(), seat = new THREE.Vector3();
  let hatchPrompt = false, elapsed = 0, travelTime = 0, travelling = false, driving = false, posed = false;
  let departure = -1, lastPhase: TransitPhase | null = null;

  const focusCanvas = () => stage.canvas.focus({ preventScroll: true });
  const closePrompt = () => { hatchPrompt = false; focusCanvas(); };
  const showHatch = () => {
    if (!canEnterTransit(station, body()) || input.blocked()) return;
    state.approaching = false; hatchPrompt = true; input.releaseInput();
    // 提示期间模拟停着而动画照常：先让人站定，免得停在迈步的速度上原地走。
    body().vx = 0;
    ui.entry.hidden = false; ui.enter.focus({ preventScroll: true });
  };
  const interact = () => {
    if (canEnterTransit(station, body())) showHatch(); else requestTransitLift(station);
  };
  const cancel = () => { closePrompt(); requestTransit(station, 'cancel'); };
  /** 站点街面或其上方（街面以下的地下是普通城区）。 */
  const near = (b: Body): boolean => {
    const x = b.x - origin.x;
    return x >= TRANSIT.walkwayMinX && x <= TRANSIT.walkwayMaxX && b.y - origin.y > -.5;
  };
  ui.board.addEventListener('click', () => { requestTransitLift(station); focusCanvas(); }, { signal });
  ui.hatch.addEventListener('click', showHatch, { signal });
  ui.closeEntry.addEventListener('click', closePrompt, { signal });
  // 舱门提示只在能进舱时出现，提示期间模拟暂停，站位不会变：关掉提示，下一 tick 开舱。
  ui.enter.addEventListener('click', () => { requestTransit(station, 'enter'); closePrompt(); }, { signal });
  const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
  stage.canvas.addEventListener('click', event => {
    if (!canEnterTransit(station, body())) return;
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
      ui.launch.disabled = false; writeLaunch();
    }, { signal });
  }
  // 发射按钮在选定目的地后才可用。
  ui.launch.addEventListener('click', () => { requestTransit(station, 'launch'); focusCanvas(); }, { signal });
  ui.cancel.addEventListener('click', cancel, { signal });
  // 提示可见时 E 是交通中心交互而不是技能 4；舱门对话框与座舱里 Esc 是取消而不是设置。须在游戏输入的冒泡监听之前拦下。
  window.addEventListener('keydown', event => {
    if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea')) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'Escape' && (hatchPrompt || state.phase === 'cabin')) {
      event.preventDefault(); event.stopImmediatePropagation(); cancel(); return;
    }
    if (event.code !== 'KeyE' || ui.section.hidden || state.phase !== 'ground' || hatchPrompt || input.blocked()) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!event.repeat) interact();
  }, { capture: true, signal });

  const writePhase = (): void => {
    ui.phase.textContent = t(PHASE_TEXT[state.phase][0]); ui.hint.textContent = t(PHASE_TEXT[state.phase][1]);
  };
  const writeLaunch = (): void => {
    const destination = ui.launch.disabled ? undefined : TRANSIT_DESTINATIONS.find(item => item.id === state.destination);
    ui.launch.textContent = destination === undefined ? t('请选择目的地') : t('发射 · {name}').replace('{name}', t(destination.name, 'place'));
  };
  const unsubscribeLanguage = onLanguageChange(() => { ui.translate(); writePhase(); writeLaunch(); });
  const updateHud = (visual: TransitVisual, b: Body): void => {
    const phase = state.phase, p = transitPhaseProgress(state);
    if (phase !== lastPhase) {
      ui.section.dataset.phase = phase; writePhase(); ui.panel.hidden = phase !== 'cabin';
      ui.board.hidden = phase !== 'ground';
      // 登舱到穿越期间画面交给座舱与航道，游戏 HUD 与小地图让开。
      document.body.toggleAttribute('data-transit-cabin', !(phase === 'ground' || phase === 'calling' || phase === 'elevator' || phase === 'descending'));
      if (phase === 'cabin') {
        input.releaseInput();
        ui.launch.disabled = true; writeLaunch();
        for (const button of ui.panel.querySelectorAll<HTMLButtonElement>('[data-destination]')) button.setAttribute('aria-pressed', 'false');
        ui.panel.querySelector<HTMLButtonElement>('[data-destination]')!.focus({ preventScroll: true });
      }
      lastPhase = phase;
    }
    const canEnter = canEnterTransit(station, b);
    ui.entry.hidden = !hatchPrompt; ui.hatch.hidden = !canEnter || hatchPrompt;
    if (canEnter) {
      model.hatchAnchor.getWorldPosition(anchor).project(stage.camera);
      const width = window.innerWidth, height = window.innerHeight;
      const x = (anchor.x + 1) * .5 * width, y = (1 - anchor.y) * .5 * height;
      ui.hatch.style.left = `${x - 15}px`; ui.hatch.style.top = `${y - 85}px`;
      ui.entry.style.left = `${THREE.MathUtils.clamp(x - 290, 12, width - 292)}px`;
      ui.entry.style.top = `${THREE.MathUtils.clamp(y + 80, 12, height - 230)}px`;
    }
    if (phase === 'ground') {
      const deck = onTransitDeck(station, b);
      ui.board.textContent = t(deck ? '乘电梯 ↓' : '乘电梯 ↑');
      ui.board.disabled = state.approaching || !b.onGround;
      ui.hint.textContent = t(state.approaching ? '正在前往电梯…' : canEnter ? '点击舱门或按 E · 确认后进入驾驶舱'
        : deck ? '走到右侧舱门点击进入 · S＋空格下穿 · 空格飞行' : PHASE_TEXT.ground[1]);
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

  /** 人在模拟层随电梯、沿通道或停在座位上；画面只补通道深度，入座后坐在座舱锚点上。 */
  const posePlayer = (b: Body, time: number, dt: number): void => {
    const phase = state.phase, view = input.playerView();
    if (phase === 'ground' || phase === 'calling' || phase === 'elevator' || phase === 'descending') {
      // 着陆舱开场也写这个根，只在离开座舱与通道阶段时归位一次。
      if (posed) { view.position.set(0, 0, 0); view.rotation.y = 0; view.visible = true; posed = false; }
      return;
    }
    posed = true;
    const p = transitPhaseProgress(state);
    if (CABIN_PHASES.has(phase)) {
      model.cabinAnchor.getWorldPosition(seat);
      // 视图外层绕世界原点转：把人从行走朝向转到正对仪表台（+z），再按转过的身体 x 平移回座位。
      const yaw = -getPlayer(world).facing * Math.PI / 2;
      view.rotation.y = yaw;
      view.position.set(seat.x - b.x * Math.cos(yaw), seat.y - b.y, seat.z + b.x * Math.sin(yaw));
      // 登舱后坐下，按下发射后双手移到键盘上。
      seatGrassy(view, time, dt, phase !== 'cabin');
    } else {
      const from = phase === 'disembarking' ? transitExitPosition(state.entryFrom!) : state.entryFrom!;
      view.rotation.y = 0;
      view.position.set(0, 0, transitCabinPosition(from, phase === 'opening' ? 0 : phase === 'boarding' ? p : 1 - p).z);
    }
    view.visible = phase !== 'travel' && phase !== 'complete' && !(phase === 'warp' && p > .4);
  };

  return {
    get paused() { return hatchPrompt; },
    update(_view, _time, frameDt) {
      elapsed += frameDt;
      if (state.phase === 'travel') travelTime = state.elapsed;
      else if (state.phase === 'complete') travelTime += frameDt;
      if (departure >= 0) departure += frameDt;
      const visual = flightVisual(state, travelTime, departure < 0 ? 0 : Math.min(1, departure / CORRIDOR_DEPART_SECONDS));
      if (visual.travel >= 0 && !travelling) {
        travelling = true;
        input.leaveCity();
        stage.scene.fog = null;
        stage.postFx.setReflections(false);
        stage.postFx.grade.uAoIntensity.value = 0;
        // 航道是唯一剩下的世界：除灯光外城区的一切随之隐藏。
        for (const child of stage.scene.children) if (child !== model.root && !(child instanceof THREE.Light)) child.visible = false;
      }
      model.update(visual, elapsed); model.root.updateMatrixWorld(true);
      const b = body();
      posePlayer(b, elapsed, frameDt);
      if (!canEnterTransit(station, b)) hatchPrompt = false;
      const drive = state.phase !== 'ground';
      if (drive) updateCamera(frameDt, elapsed, state, visual, b.x - origin.x, b.y - origin.y, !driving);
      driving = drive;
      ui.section.hidden = !drive && !hatchPrompt && (!near(b) || world.podLanding !== null);
      updateHud(visual, b);
      sound.update(visual, elapsed, state.phase, b.onGround ? Math.abs(b.vx) : 0);
      if (!travelling) flowers.update(elapsed);
      if (drive) stage.renderer.toneMappingExposure = daylightExposure * (1 - visual.thrust * .18 * (1 - visual.warp));
      if (state.phase === 'complete' && departure < 0) {
        departure = 0;
        input.releaseInput();
        const destination = TRANSIT_DESTINATIONS.find(item => item.id === state.destination)!;
        const url = keepWorldParams(destination.href, location.search);
        url.searchParams.set('landing', '1');
        corridor.depart(url.href);
      }
    },
    dispose() {
      unsubscribeLanguage(); corridor.hide(0); document.body.removeAttribute('data-transit-cabin'); sound.dispose(); flowers.dispose(); model.dispose(); ui.section.remove();
    },
  };
}
