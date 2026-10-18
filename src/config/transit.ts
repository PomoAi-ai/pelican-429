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
  walkwayMinX: 2,
  walkwayMaxX: 39,
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

export const TRANSIT_DESTINATIONS = [
  { id: 'fortress', name: '山体算力堡垒', detail: '试玩关卡 · 黑洞前哨与三层机房', href: './?mode=game&level=facility&scene=fortress' },
  { id: 'cathedral', name: '算力大教堂', detail: '试玩关卡 · 算力高塔与中央战场', href: './?mode=game&level=facility&scene=cathedral' },
  { id: 'abyss', name: '光纤深渊', detail: '试玩关卡 · 悬空战斗桥与网络核心', href: './?mode=game&level=facility&scene=abyss' },
] as const;

export type TransitDestinationId = typeof TRANSIT_DESTINATIONS[number]['id'];
