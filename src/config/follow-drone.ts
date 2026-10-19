/** 跟随无人机碰撞体：原点在轮底（模型 root 下方 wheelDrop），顶面是车壳顶，半宽到前后挡泥板内沿。 */
export const FOLLOW_DRONE = {
  wheelDrop: 0.34,
  halfWidth: 0.75,
  roof: 0.84,
  /** 撞墙判断从轮底往上让出这一段，坡面上的轮子不算撞墙。 */
  wheelClearance: 0.25,
  /** 撞墙判断顶到头部，飞到天花板下时眼睛不穿进去。 */
  headTop: 1.44,
} as const;
