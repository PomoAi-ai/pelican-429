export const RELEASE_MODES: readonly string[] = ['index', 'about', 'story', 'game', 'intro', 'controls', 'concepts', 'sounds', 'resources', 'showcase'];

const APP_MODES = ['index', 'catalog', 'about', 'concepts', 'story', 'game', 'homestead', 'showcase', 'compare', 'resources', 'lab', 'intro', 'sounds', 'controls',
  'render-lab', 'hair-gallery', 'maglev'] as const;
export type AppMode = typeof APP_MODES[number];

export function parseAppMode(params: URLSearchParams, release: boolean): AppMode {
  const mode = params.get('mode') ?? (params.has('level') || params.has('seed') ? 'game' : 'index');
  // 机房、交通中心与住宅都只剩游戏网址一个入口，旧网址明确报错并给出新网址。
  if (mode === 'facility') throw new Error('mode=facility 已移除，请改用 ?mode=game&level=facility&scene=…');
  if (mode === 'transit' || mode === 'game' && params.get('level') === 'transit') {
    throw new Error('独立交通中心页已移除，交通中心在主世界城区：请改用 ?mode=game&from=transit（直接发射加 &flight=<目的地>）');
  }
  if (mode === 'residence') throw new Error('mode=residence 已移除，请改用 ?mode=homestead&scene=residence（原版住宅）或 ?mode=game（主世界城区）');
  if (!(APP_MODES as readonly string[]).includes(mode)) throw new Error(`未知页面模式：${mode}`);
  if (release && (!RELEASE_MODES.includes(mode) || params.has('library'))) throw new Error('此开发页面仅在本地完整版提供，请返回首页继续游玩。');
  return mode as AppMode;
}

/** 发布版只有 index 一个 HTML 入口，只开放 RELEASE_MODES，历史模型库只在本地完整版。 */
export function releasedUrl(url: URL): boolean {
  const mode = url.searchParams.get('mode');
  return (mode === null || RELEASE_MODES.includes(mode)) && !url.searchParams.has('library')
    && (!url.pathname.endsWith('.html') || url.pathname.endsWith('/index.html'));
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

/** 开发开关 ?cam=free：游戏页的自由镜头与预设视角；发布版拒绝。 */
export function parseDevCamera(params: URLSearchParams, release: boolean): boolean {
  const cam = params.get('cam');
  if (cam === null) return false;
  if (cam !== 'free') throw new Error(`未知镜头开关：cam=${cam}（仅支持 cam=free）`);
  if (release) throw new Error('自由镜头是开发开关，仅在本地完整版提供。');
  return true;
}

export type PageRoute = 'index' | 'catalog' | 'about' | 'concepts' | 'story' | 'workspace' | 'compare' | 'sounds' | 'intro'
  | 'render-lab' | 'hair-gallery' | 'maglev' | 'showcase' | 'game';

/** 网址 → 页面入口，按顺序取第一个命中的条件。 */
export function pageRoute(params: URLSearchParams, release: boolean): PageRoute {
  const mode = parseAppMode(params, release);
  if (mode === 'index' || mode === 'catalog' || mode === 'about' || mode === 'concepts' || mode === 'story') return mode;
  if (mode === 'lab' || mode === 'resources') return 'workspace';
  if (mode === 'compare' || mode === 'sounds' || mode === 'intro' || mode === 'render-lab' || mode === 'hair-gallery' || mode === 'maglev') return mode;
  if (mode === 'showcase') return 'showcase';
  // 城区、原野、交通中心、机房、家园与原版住宅都由游戏页按网址装配（app/game/game-level）。
  return 'game';
}
