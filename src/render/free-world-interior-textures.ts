import { ClampToEdgeWrapping, SRGBColorSpace, type Texture, type WebGLRenderer } from 'three';
import { acquireKtx2Loader } from './ktx2-loader.ts';

export async function loadInteriorBackgroundTexture(renderer: WebGLRenderer, theme: 'cave' | 'cathedral' | 'abyss'): Promise<Texture> {
  const session = acquireKtx2Loader(renderer);
  try {
    const texture = await session.loader.loadAsync(`${import.meta.env.BASE_URL}resources/free-world/${theme}.ktx2`);
    texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
    texture.colorSpace = SRGBColorSpace;
    texture.repeat.y = -1;
    texture.offset.y = 1;
    renderer.initTexture(texture);
    return texture;
  } finally { session.release(); }
}

export async function loadInteriorBackgroundTextures(renderer: WebGLRenderer) {
  const results = await Promise.allSettled(['cave', 'cathedral', 'abyss'].map(theme =>
    loadInteriorBackgroundTexture(renderer, theme as 'cave' | 'cathedral' | 'abyss')));
  const failure = results.find(result => result.status === 'rejected');
  if (failure?.status === 'rejected') {
    for (const result of results) if (result.status === 'fulfilled') result.value.dispose();
    throw failure.reason;
  }
  const [cave, cathedral, abyss] = results.map(result => (result as PromiseFulfilledResult<Texture>).value) as [Texture, Texture, Texture];
  return { cave, cathedral, abyss, dispose() { cave.dispose(); cathedral.dispose(); abyss.dispose(); } };
}

export type InteriorBackgroundTextures = Awaited<ReturnType<typeof loadInteriorBackgroundTextures>>;
