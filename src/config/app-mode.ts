export const RELEASE_MODES: readonly string[] = ['index', 'catalog', 'about', 'story', 'game', 'intro', 'controls'];

export function parseAppMode(params: URLSearchParams, release: boolean): 'index' | 'catalog' | 'about' | 'concepts' | 'story' | 'game' | 'homestead' | 'showcase' | 'compare' | 'resources' | 'lab' | 'intro' | 'facility' | 'sounds' | 'controls' {
  const mode = params.get('mode') ?? (params.has('level') || params.has('seed') ? 'game' : 'index');
  if (mode !== 'catalog' && mode !== 'about' && mode !== 'concepts' && mode !== 'index' && mode !== 'story' && mode !== 'game' && mode !== 'homestead' && mode !== 'showcase' && mode !== 'compare' && mode !== 'resources' && mode !== 'lab' && mode !== 'intro' && mode !== 'facility' && mode !== 'sounds' && mode !== 'controls') throw new Error(`未知页面模式：${mode}`);
  if (release) {
    if (!RELEASE_MODES.includes(mode)) throw new Error('此开发页面仅在本地完整版提供，请返回首页继续游玩。');
    const textures = params.get('textures');
    if (textures !== null && textures !== 'ktx2-compact') throw new Error('在线版仅提供优化画质，其他资源档位请在本地完整版查看。');
  }
  return mode;
}

/** 开发版桌面把这些游戏网址（城区、原野、交通中心、机房关卡）交给场景工作区挂载，其余关卡仍走整页游戏。 */
export function isSceneGameLevel(params: URLSearchParams): boolean {
  const level = params.get('level');
  return level === null || level === 'harbor' || level === 'facility' || level === 'transit';
}

export interface AppHost {
  readonly release: boolean;
  /** 页面运行在 iframe 内（如手机横屏宿主）。 */
  readonly embedded: boolean;
  readonly coarsePointer: boolean;
}

/** 游戏网址是否由场景工作区挂载；发布版、手机、内嵌页与渲染基准（整页帧循环驱动）仍是整页游戏。 */
export function opensSceneGame(params: URLSearchParams, host: AppHost): boolean {
  return !host.release && !host.embedded && !host.coarsePointer && parseAppMode(params, false) === 'game' && isSceneGameLevel(params) && !params.has('bench');
}
