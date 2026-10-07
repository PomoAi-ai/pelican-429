export const RELEASE_MODES: readonly string[] = ['index', 'catalog', 'about', 'story', 'game', 'intro', 'controls'];

export function parseAppMode(params: URLSearchParams, release: boolean): 'index' | 'catalog' | 'about' | 'dev' | 'story' | 'game' | 'showcase' | 'compare' | 'resources' | 'lab' | 'intro' | 'facility' | 'sounds' | 'controls' {
  const mode = params.get('mode') ?? (params.has('level') || params.has('seed') ? 'game' : 'index');
  if (mode !== 'catalog' && mode !== 'about' && mode !== 'index' && mode !== 'dev' && mode !== 'story' && mode !== 'game' && mode !== 'showcase' && mode !== 'compare' && mode !== 'resources' && mode !== 'lab' && mode !== 'intro' && mode !== 'facility' && mode !== 'sounds' && mode !== 'controls') throw new Error(`未知页面模式：${mode}`);
  if (release) {
    if (!RELEASE_MODES.includes(mode)) throw new Error('此开发页面仅在本地完整版提供，请返回首页继续游玩。');
    const textures = params.get('textures');
    if (textures !== null && textures !== 'ktx2-compact') throw new Error('在线版仅提供优化画质，其他资源档位请在本地完整版查看。');
  }
  return mode;
}
