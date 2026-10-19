export const RELEASE_MODES: readonly string[] = ['index', 'catalog', 'about', 'story', 'game', 'intro', 'controls'];

export function parseAppMode(params: URLSearchParams, release: boolean): 'index' | 'catalog' | 'about' | 'concepts' | 'story' | 'game' | 'homestead' | 'showcase' | 'compare' | 'resources' | 'lab' | 'intro' | 'facility' | 'sounds' | 'controls' {
  const mode = params.get('mode') ?? (params.has('level') || params.has('seed') ? 'game' : 'index');
  if (mode !== 'catalog' && mode !== 'about' && mode !== 'concepts' && mode !== 'index' && mode !== 'story' && mode !== 'game' && mode !== 'homestead' && mode !== 'showcase' && mode !== 'compare' && mode !== 'resources' && mode !== 'lab' && mode !== 'intro' && mode !== 'facility' && mode !== 'sounds' && mode !== 'controls') throw new Error(`未知页面模式：${mode}`);
  if (release) {
    if (!RELEASE_MODES.includes(mode)) throw new Error('此开发页面仅在本地完整版提供，请返回首页继续游玩。');
  }
  return mode;
}

const TEXTURE_TIERS = ['original', 'web-1k', 'web', 'ktx2', 'ktx2-256', 'ktx2-compact', 'ktx2-256-compact'] as const;
export type TextureTier = typeof TEXTURE_TIERS[number];

export interface PageParams {
  /** 角色与场景贴图资源档位。 */
  readonly textures: TextureTier;
  /** ?debug：着色器编译检查等调试开关。 */
  readonly debug: boolean;
}

/** 各页面共用的网址参数；发布版只提供优化画质。 */
export function parsePageParams(params: URLSearchParams, release: boolean): PageParams {
  const textures = params.get('textures');
  if (textures !== null && !(TEXTURE_TIERS as readonly string[]).includes(textures)) throw new Error(`未知角色资源规格：${textures}`);
  if (release && textures !== null && textures !== 'ktx2-compact') throw new Error('在线版仅提供优化画质，其他资源档位请在本地完整版查看。');
  return { textures: (textures as TextureTier | null) ?? 'ktx2-compact', debug: params.has('debug') };
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

export type PageRoute = 'index' | 'catalog' | 'about' | 'concepts' | 'story' | 'workspace' | 'compare' | 'sounds' | 'intro'
  | 'transit' | 'harbor' | 'residence' | 'showcase' | 'game';

/** 网址 → 页面入口，按顺序取第一个命中的条件。 */
export function pageRoute(params: URLSearchParams, host: AppHost): PageRoute {
  const mode = parseAppMode(params, host.release);
  const level = params.get('level');
  if (mode === 'index' || mode === 'catalog' || mode === 'about' || mode === 'concepts' || mode === 'story') return mode;
  if (mode === 'lab' || mode === 'resources' || mode === 'facility' || opensSceneGame(params, host)) return 'workspace';
  if (mode === 'compare' || mode === 'sounds' || mode === 'intro') return mode;
  if (mode === 'game' && level === 'transit') return 'transit';
  // 世界地图从城区出发；free=1 的主世界网址（重建、区域定位、城区右端出口）直接进原野。
  if (mode === 'game' && (level === 'harbor' || (level === null && params.get('free') !== '1'))) return 'harbor';
  if (mode === 'homestead' && params.get('scene') === 'residence') return 'residence';
  if (mode === 'showcase') return 'showcase';
  return 'game';
}
