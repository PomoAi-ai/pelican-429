import { LoadingManager, type WebGLRenderer } from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

const loaders = new WeakMap<WebGLRenderer, { loader: KTX2Loader; users: number }>();

/** 同一 renderer 共用 Worker；使用者必须等待自己的加载结算后归还。 */
export function acquireKtx2Loader(renderer: WebGLRenderer) {
  let entry = loaders.get(renderer);
  if (!entry) {
    entry = { loader: createKtx2Loader(renderer), users: 0 };
    loaders.set(renderer, entry);
  }
  const shared = entry;
  shared.users++;
  return { loader: shared.loader, release() {
    if (--shared.users === 0) {
      loaders.delete(renderer);
      shared.loader.dispose();
    }
  } };
}

function createKtx2Loader(renderer: WebGLRenderer): KTX2Loader {
  // 由 Vite 输出带哈希的本地转码器文件，兼容子路径部署。
  const manager = new LoadingManager().setURLModifier(url => {
    if (url === 'basis_transcoder.js') return new URL('../../node_modules/three/examples/jsm/libs/basis/basis_transcoder.js', import.meta.url).href;
    if (url === 'basis_transcoder.wasm') return new URL('../../node_modules/three/examples/jsm/libs/basis/basis_transcoder.wasm', import.meta.url).href;
    return url;
  });
  return new KTX2Loader(manager).setWorkerLimit(2).detectSupport(renderer);
}
