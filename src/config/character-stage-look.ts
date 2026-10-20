/** 角色草地展示场与头发总览使用同一画面配置。low 保留调色和阴影，关闭 AO 与泛光。 */
export const CHARACTER_STAGE_LOOK = {
  stage: { quality: 'low', antialias: 'msaa' },
  surfaceBackground: '#b8ccc4',
  sunPosition: -.5,
} as const;

/**
 * 地下检视光：展示页切到地下环境时的背景色与舞台灯强度（相对 tuning.render 的 hemi、keyLight）。
 * 取正式角色展示场的一套：地下没有日光直射，主光关掉；半球光留 0.65，与人物、敌人展示页原用的比例一致。
 */
export const UNDERGROUND_INSPECTION = { background: '#172b3b', hemi: 0.65, key: 0 } as const;

export function characterStageSunDirection(fov: number, aspect: number, position: number) {
  const angle = position * Math.PI / 2;
  const halfHeight = Math.tan(fov * Math.PI / 360);
  const span = Math.max(0, Math.min(.26, halfHeight * (aspect - .2)));
  return { x: span * Math.sin(angle), y: .19 + .01 * Math.cos(angle), z: -1 };
}

export function characterStageFraming(height: number, width: number, aspect: number) {
  return { centerY: height * .45, viewHeight: Math.max(height * 1.5, (width + 3) / aspect) };
}
