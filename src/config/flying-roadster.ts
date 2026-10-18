export const FLYING_ROADSTER_MODEL = './models/white-vtol/model.glb';

/** 车体以车轮底为 y=0；碰撞只覆盖平坦车顶，避免玩家站在斜风挡上。 */
export const FLYING_ROADSTER = {
  length: 7,
  width: 3.15,
  height: 2.02,
  roofTop: 1.936,
  roofHalfWidth: .28,
  routeDistance: 28,
  routeRise: 2,
  travelSeconds: 14,
  dwellSeconds: 2,
} as const;
