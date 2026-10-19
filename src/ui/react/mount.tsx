import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { KeyFence } from './key-fence.tsx';

/** 把 React 树挂到容器上，返回卸载函数。不用 StrictMode：双重 effect 会重复创建命令式资源。 */
export function mountReact(container: HTMLElement, node: ReactNode): () => void {
  const root = createRoot(container);
  root.render(<KeyFence>{node}</KeyFence>);
  return () => root.unmount();
}
