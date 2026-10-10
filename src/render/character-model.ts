import { WEB_MODEL_SOURCES, webModelPath, web1kModelPath, ktxModelPath, ktx256ModelPath, compactModelPath } from '../config/web-models.ts';
import type { WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { acquireKtx2Loader } from './ktx2-loader.ts';

let renderer: WebGLRenderer | null = null;
type TextureSession = ReturnType<typeof acquireKtx2Loader> & { pending: number; retired: boolean };
let textureSession: TextureSession | null = null;
const preloaded = new Map<string, Promise<ArrayBuffer>>();
export type TextureTier = 'original' | 'web-1k' | 'web' | 'ktx2' | 'ktx2-256' | 'ktx2-compact' | 'ktx2-256-compact';

export function configureCharacterTextures(value: WebGLRenderer | null): void {
  if (renderer === value) return;
  if (textureSession) {
    textureSession.retired = true;
    if (textureSession.pending === 0) textureSession.release();
    textureSession = null;
  }
  renderer = value;
}

export function currentCharacterTextureRenderer(): WebGLRenderer | null {
  return renderer;
}

export function disposeCharacterTextures(): void {
  configureCharacterTextures(null);
  preloaded.clear();
}

function compressedTextures(): TextureSession {
  if (!renderer) throw new Error('KTX2 贴图需要先创建游戏渲染器');
  if (!textureSession) {
    textureSession = { ...acquireKtx2Loader(renderer), pending: 0, retired: false };
  }
  return textureSession;
}

/** 游戏默认档位来自 URL；对比页通过显式参数同时加载多个档位。 */
export function characterTextureTier(): TextureTier {
  const textures = new URLSearchParams(location.search).get('textures');
  if (textures !== null && textures !== 'ktx2' && textures !== 'ktx2-256' && textures !== 'ktx2-compact' && textures !== 'ktx2-256-compact' && textures !== 'web' && textures !== 'web-1k' && textures !== 'original') {
    throw new Error(`未知角色资源规格：${textures}`);
  }
  return textures ?? 'ktx2-compact';
}

export function characterModelPath(source: string, tier: TextureTier = characterTextureTier()): string {
  if (tier === 'original' || !WEB_MODEL_SOURCES.includes(source)) return source;
  if (tier === 'web-1k') return web1kModelPath(source);
  if (tier === 'ktx2-256') return ktx256ModelPath(source);
  if (tier === 'ktx2-compact' || tier === 'ktx2-256-compact') return compactModelPath(source, tier === 'ktx2-compact' ? 512 : 256);
  return tier === 'web' ? webModelPath(source) : ktxModelPath(source);
}

/** 序章没有 WebGL 上下文，先缓存字节；进入游戏后使用真实设备能力解码。 */
export async function preloadCharacterModel(source: string, tier: TextureTier = characterTextureTier()): Promise<void> {
  const path = characterModelPath(source, tier);
  if (!preloaded.has(path)) preloaded.set(path, fetch(path).then(response => {
    if (!response.ok) throw new Error(`角色资源加载失败：${path} (${response.status})`);
    return response.arrayBuffer();
  }));
  await preloaded.get(path)!;
}

export async function loadCharacterModel(source: string, tier: TextureTier = characterTextureTier()) {
  const path = characterModelPath(source, tier);
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const session = /\.ktx2(?:-256)?(?:-compact)?\.glb$/.test(path) ? compressedTextures() : null;
  if (session) { session.pending++; loader.setKTX2Loader(session.loader); }
  try {
    const decoderReady = session ? session.loader.init() : Promise.resolve();
    const bytes = preloaded.get(path);
    preloaded.delete(path);
    const model = bytes
      ? bytes.then(data => loader.parseAsync(data, new URL('.', new URL(path, location.href)).href))
      : loader.loadAsync(path);
    // 清理必须等待下载与转码都结算，提前终止 Worker 会让正在加载的 Promise 永远悬空。
    const [result, decoder] = await Promise.allSettled([model, decoderReady]);
    if (result.status === 'rejected') throw result.reason;
    if (decoder.status === 'rejected') throw decoder.reason;
    return result.value;
  } finally {
    if (session) {
      session.pending--;
      if (session.retired && session.pending === 0) session.release();
    }
  }
}
