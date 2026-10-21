import { LANDING_POD, type LandingPodPlan } from '../config/transit.ts';
import { savePrev, type Body } from '../physics/body.ts';
import type { RideProbe } from '../physics/ride-probe.ts';
import { moveAndCollide } from '../physics/tile-collision.ts';
import type { Entity } from '../entities/entity.ts';
import { NEUTRAL_INPUT, resolvePelicanState, updatePelican, type PelicanInput } from '../entities/pelican-controller.ts';
import type { SimWorld } from './sim-world.ts';

/** 着陆舱开场状态：机房关卡由 stepSim 推进，主世界城区由透视控制按同一固定步长推进。 */
export interface PodLanding {
  readonly x: number;
  readonly ground: number;
  readonly exitX: number;
  readonly altitude: number;
  readonly descentTicks: number;
  readonly settleTicks: number;
  readonly doorTicks: number;
  ticks: number;
}

/** 开门后玩家无法操作，角色自动向左走出舱门。 */
const POD_WALK_INPUT: PelicanInput = { ...NEUTRAL_INPUT, moveX: -1 };
/** 确认返回后玩家无法操作，角色自动向右走进舱门。 */
const POD_BOARD_INPUT: PelicanInput = { ...NEUTRAL_INPUT, moveX: 1 };

/** 已停好、开着门的舱：时间线停在末尾，起飞时倒放。 */
export function parkedPod(plan: LandingPodPlan, step: number): PodLanding {
  const ticks = (seconds: number) => Math.ceil(seconds / step);
  const descentTicks = ticks(plan.seconds.descent), settleTicks = ticks(plan.seconds.settle), doorTicks = ticks(plan.seconds.door);
  return { x: plan.x, ground: plan.ground, exitX: plan.exitX, altitude: plan.altitude,
    descentTicks, settleTicks, doorTicks, ticks: descentTicks + settleTicks + doorTicks };
}

/** 把玩家放进舱内准备下降；出生点不变，死亡重生照常回到地面。 */
export function placeInPod(player: Entity, plan: LandingPodPlan, step: number): PodLanding {
  // 身体站在舱地板上随舱下降，视图播放待机而不是下落姿态。
  Object.assign(player.body, { x: plan.x, y: plan.ground + plan.altitude, vx: 0, vy: 0, onGround: true });
  player.facing = -1;
  player.pelican!.coyoteTicks = 0;
  savePrev(player.body);
  return { ...parkedPod(plan, step), ticks: 0 };
}

/** 舱裙最大半径即舱体在行走平面上的投影半宽。 */
const POD_RADIUS = Math.max(...LANDING_POD.skirt.map(([radius]) => radius));

/** 站在与舱同高的地面上、舷梯出口到舱体右缘两格内都能登舱；出口右侧确认后先走回出口，起飞再从出口倒放走出路径。 */
export function canBoardPod(pod: PodLanding, body: Body): boolean {
  return body.onGround && body.x >= pod.exitX - 2 && body.x <= pod.x + POD_RADIUS + 2 && Math.abs(body.y - pod.ground) < .5;
}

/** 舱底离地高度：三次缓出，先快后慢。 */
export function podAltitude(landing: PodLanding, ticks: number): number {
  return landing.altitude * (1 - Math.min(1, ticks / landing.descentTicks)) ** 3;
}

/** carry：下降、触地与开门期间身体随舱；walk：向左走出舱门；done：抵达出口，交还控制。 */
function podLandingPhase(landing: PodLanding, body: Body): 'carry' | 'walk' | 'done' {
  if (landing.ticks < landing.descentTicks + landing.settleTicks + landing.doorTicks) return 'carry';
  return body.x > landing.exitX ? 'walk' : 'done';
}

/** 舱内阶段的一个 tick：调用方先存 prev。 */
function carryInPod(landing: PodLanding, body: Body): void {
  landing.ticks++;
  body.y = landing.ground + podAltitude(landing, landing.ticks);
}

/** walk：门开着、向右走到舱轴；carry：时间线倒放，身体随舱升起；gone：回到下降起始高度，等待离开关卡。 */
export function podTakeoffPhase(pod: PodLanding, body: Body): 'walk' | 'carry' | 'gone' {
  if (pod.ticks === pod.descentTicks + pod.settleTicks + pod.doorTicks && body.x < pod.x) return 'walk';
  return pod.ticks > 0 ? 'carry' : 'gone';
}

/** 起飞的一个 tick：调用方先存 prev；身体对准舱轴坐进座位。 */
export function liftInPod(pod: PodLanding, body: Body): void {
  pod.ticks--;
  body.x = pod.x;
  body.y = pod.ground + podAltitude(pod, pod.ticks);
  body.vx = body.vy = 0;
}

/**
 * stepSim 的着陆舱部分（开场降落与走出、确认返回后走回出口、起飞）：世界冻结，只推进玩家；
 * 本 tick 已处理时返回 true（调用方只再推进 tick）。
 */
export function stepPodFreeze(world: SimWorld, player: Entity, rideProbe: RideProbe): boolean {
  const { entities, map, tuning, fluid } = world;
  const dt = tuning.sim.step;
  const freeze = (): void => {
    for (const entity of entities) savePrev(entity.body);
    for (const fish of world.fish.fish) savePrev(fish.body);
  };
  const walk = (input: PelicanInput): void => {
    updatePelican(player, input, map, tuning, dt, fluid, 0, rideProbe);
    moveAndCollide(player.body, map, dt);
    resolvePelicanState(player);
  };
  const landing = world.podLanding;
  if (landing) {
    const phase = podLandingPhase(landing, player.body);
    if (phase !== 'done') {
      // 走出阶段玩家无法操作，世界像舱内阶段一样冻结，只推进步行，避免被敌人攻击。
      freeze();
      if (phase === 'carry') carryInPod(landing, player.body);
      else walk(POD_WALK_INPUT);
      return true;
    }
    world.podLanding = null;
  }
  const boarding = world.podBoarding;
  if (boarding) {
    if (player.body.x > boarding.exitX) {
      freeze();
      walk(POD_WALK_INPUT);
      return true;
    }
    world.podBoarding = null;
    world.podTakeoff = boarding;
  }
  const takeoff = world.podTakeoff;
  if (!takeoff) return false;
  const phase = podTakeoffPhase(takeoff, player.body);
  freeze();
  if (phase === 'carry') liftInPod(takeoff, player.body);
  else if (phase === 'walk') walk(POD_BOARD_INPUT);
  return true;
}
