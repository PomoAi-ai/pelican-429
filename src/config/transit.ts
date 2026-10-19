import type { FacilityChapterId } from './facility-scenes.ts';
import type { Vec2 } from '../core/math.ts';

export const TRANSIT = {
  rocketX: 30,
  rocketHeight: 26,
  rocketRadius: 2.8,
  cabinFloor: 18.2,
  towerX: 18,
  bridgeStartX: 19.8,
  hatchX: 27.3,
  seatX: 30,
  seatY: 18.6,
  elevatorX: 18,
  groundY: 0,
  spawnX: 10,
  walkwayMinX: -40,
  walkwayMaxX: 100,
  /** 前庭铺装比步行道两端各宽的格数；城区里这段即交通中心用地。 */
  pavingMargin: 2,
  hullClearance: 3,
  groundLaneZ: 3.3,
} as const;

/** 沿街绿植槽中心；模型与花卉共用，避开候车亭、终端、塔架与发射台。 */
export const TRANSIT_PLANTER_X = [-36, -22, -9, 3, 13.9, 38, 52, 66, 80, 94] as const;

/** 同一径向剖面供舰体建模、门框与实体碰撞使用；坐标为半径、舰底局部高度。 */
export const TRANSIT_HULL_PROFILE: readonly (readonly [number, number])[] = [
  [2.35, 2.7], [2.47, 3], [2.62, 3.7], [2.73, 4.6], [2.79, 5.6], [2.8, 6.4],
  [2.8, 18.2], [2.795, 18.7], [2.77, 19.2], [2.71, 20], [2.59, 20.9],
  [2.42, 21.7], [2.3, 22.1], [2.03, 22.9], [1.7, 23.7], [1.28, 24.5],
  [.83, 25.2], [.39, 25.7], [.03, 26],
];

/** 按高度在径向剖面上线性插值半径，超出两端取端点半径。 */
export function profileRadiusAt(profile: readonly (readonly [number, number])[], y: number): number {
  const first = profile[0]!;
  if (y <= first[1]) return first[0];
  for (let i = 1; i < profile.length; i++) {
    const [radius, height] = profile[i]!;
    if (y <= height) {
      const [previousRadius, previousHeight] = profile[i - 1]!;
      return previousRadius + (radius - previousRadius) * (y - previousHeight) / (height - previousHeight);
    }
  }
  return profile.at(-1)![0];
}

export function transitHullRadiusAt(y: number): number {
  return profileRadiusAt(TRANSIT_HULL_PROFILE, y);
}

// The collider starts above head height so street pedestrians pass in front of the engines under the hull.
const HULL_COLLIDER_SIDE = [[transitHullRadiusAt(TRANSIT.hullClearance), TRANSIT.hullClearance] as const,
  ...TRANSIT_HULL_PROFILE.filter(([, y]) => y > TRANSIT.hullClearance)];
export const TRANSIT_HULL_COLLIDER = { points: [
  ...HULL_COLLIDER_SIDE.map(([radius, y]) => [TRANSIT.rocketX + radius, y] as const),
  ...HULL_COLLIDER_SIDE.toReversed().map(([radius, y]) => [TRANSIT.rocketX - radius, y] as const),
], autoStep: false } as const;

export const TRANSIT_HATCH = {
  x: TRANSIT.hatchX, floor: TRANSIT.cabinFloor, height: 3.35,
  angleStart: 4.26, angleEnd: 5.16, slideAngle: 1.02,
  centerZ: 0, seatZ: 1.5, waitingX: TRANSIT.hatchX - .8, insideX: TRANSIT.hatchX + .65,
} as const;

export const TRANSIT_PHASE_SECONDS = {
  calling: 3.2,
  elevator: 3.2,
  opening: .55,
  boarding: 1.4,
  disembarking: 1.4,
  descending: 3.2,
  retract: 1.6,
  ignition: 4.4,
  ascent: 8.5,
  warp: .7,
  travel: 4.6,
} as const;

/** Corridor time shocks: shader surge, chase FOV kick and audio thump share this period. */
export const TRANSIT_PULSE_SECONDS = 1.6;

export const TRANSIT_DESTINATIONS = [
  { id: 'fortress', name: '山体算力堡垒', detail: '试玩关卡 · 黑洞前哨与三层机房', href: './?mode=game&level=facility&scene=fortress' },
  { id: 'cathedral', name: '算力大教堂', detail: '试玩关卡 · 算力高塔与中央战场', href: './?mode=game&level=facility&scene=cathedral' },
  { id: 'abyss', name: '光纤深渊', detail: '试玩关卡 · 悬空战斗桥与网络核心', href: './?mode=game&level=facility&scene=abyss' },
] as const;

export type TransitDestinationId = typeof TRANSIT_DESTINATIONS[number]['id'];

/** 抵达关卡的载人着陆舱：复用星舰座舱段（crewBottom 到鼻尖），下接短舰裙；舱局部 y=0 为隔热底面。 */
export const LANDING_POD = {
  crewBottom: TRANSIT.cabinFloor - .6,
  skirt: [[2.3, 0], [2.52, .22], [2.7, .45], [2.8, .6]] as readonly (readonly [number, number])[],
  // 舱门在 −X；下梯后在地面上斜向走回玩家平面，再到出生点。
  offsetX: 6.3,
  // 整舱位于玩家行走平面之后：舱壳与前支脚都在 z=0 的角色之后，后支脚仍落在地面深度内。
  z: -3.4,
  clearance: .12,
  // 舱顶（地面 + clearance + 起始高度 + 舱高 9）不越过出生点上方踏板底面。
  altitude: { fortress: 18, cathedral: 6, abyss: 10 } as Readonly<Record<FacilityChapterId, number>>,
  seconds: { descent: 4.8, settle: .6, door: 1.1 },
  reducedSeconds: { descent: 1.5, settle: .25, door: .5 },
  reducedAltitude: 4,
} as const;

/** 主世界的着陆场在交通中心左侧两个花槽之间（站局部坐标）；舱落在铺装上，走出终点即城区出生点。 */
export const TRANSIT_LANDING = { exitX: -9.3, altitude: 18 } as const;

/** 舱停在出口右侧，角色从左侧舱门走到出口后交还控制。 */
export function landingPodPlan(exit: Readonly<Vec2>, altitude: number, reduced: boolean) {
  return {
    x: exit.x + LANDING_POD.offsetX, ground: exit.y, exitX: exit.x,
    altitude: reduced ? Math.min(altitude, LANDING_POD.reducedAltitude) : altitude,
    seconds: reduced ? LANDING_POD.reducedSeconds : LANDING_POD.seconds,
  };
}

export type LandingPodPlan = ReturnType<typeof landingPodPlan>;
