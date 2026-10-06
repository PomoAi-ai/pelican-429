export function parseAppMode(params: URLSearchParams): 'index' | 'dev' | 'story' | 'game' | 'showcase' | 'compare' | 'resources' | 'lab' | 'intro' | 'facility' | 'sounds' | 'controls' {
  const mode = params.get('mode') ?? (params.has('level') || params.has('seed') ? 'game' : 'index');
  if (mode !== 'index' && mode !== 'dev' && mode !== 'story' && mode !== 'game' && mode !== 'showcase' && mode !== 'compare' && mode !== 'resources' && mode !== 'lab' && mode !== 'intro' && mode !== 'facility' && mode !== 'sounds' && mode !== 'controls') throw new Error(`未知页面模式：${mode}`);
  return mode;
}
