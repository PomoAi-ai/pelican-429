/** 视角预设的偏航与俯仰（度）：城区、瓦片场景与演示舞台共用。 */
export const SCENE_VIEW_ANGLES = { front: [0, 0], angle: [13, 9], top: [0, 78] } as const;
export type SceneViewAngle = keyof typeof SCENE_VIEW_ANGLES;

/** 场景工具条的视角片段：三个预设、游玩视角、自由镜头与暂停。 */
export const SCENE_VIEW_CONTROLS = `<button type="button" data-scene-view="front" aria-pressed="true">正视</button>
  <button type="button" data-scene-view="angle" aria-pressed="false">斜视</button>
  <button type="button" data-scene-view="top" aria-pressed="false">俯视</button>
  <button type="button" data-play-view>游玩视角</button>
  <button type="button" data-camera aria-pressed="true">自由镜头</button>
  <button type="button" data-play aria-pressed="true">暂停游玩</button>`;
