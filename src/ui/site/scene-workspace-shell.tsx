import { useSyncExternalStore } from 'react';
import { t } from '../../config/i18n.ts';
import { mountReact } from '../react/mount.tsx';
import { createStore, type Store } from '../react/store.ts';
import { useLanguage } from '../react/use-language.ts';
import '../panels/scene-workspace.css';

export interface SceneDirectoryEntry {
  readonly id: string;
  readonly title: string;
  readonly href: string;
  readonly section: 'scenes' | 'perspectives';
}

export interface SceneWorkspaceShell {
  readonly root: HTMLElement;
  /** 场景工具条插在这里的最前面。 */
  readonly main: HTMLElement;
  /** 加载层覆盖的区域。 */
  readonly viewport: HTMLElement;
  /** 当前场景的挂载点。 */
  readonly mountRoot: HTMLElement;
  /** 目录切到条目所在的分组（场景 / 场景透视）并高亮它。 */
  select(entry: SceneDirectoryEntry): void;
}

/**
 * 场景工作区外壳替换 parent 的内容。只有目录是 React 根：场景画布要把按键交给场景自己的监听，
 * 不能放进会拦截按键冒泡的 React 根里。
 */
export function mountSceneWorkspaceShell(parent: HTMLElement, entries: readonly SceneDirectoryEntry[]): SceneWorkspaceShell {
  const root = document.createElement('section');
  root.className = 'scene-workspace';
  const directory = document.createElement('aside');
  directory.className = 'scene-directory';
  const main = document.createElement('main');
  main.className = 'scene-workspace-main';
  const viewport = document.createElement('div');
  viewport.className = 'scene-workspace-view';
  const mountRoot = document.createElement('div');
  mountRoot.className = 'scene-mount';
  viewport.append(mountRoot);
  main.append(viewport);
  root.append(directory, main);
  parent.replaceChildren(root);
  const selected = createStore<SceneDirectoryEntry | null>(null);
  mountReact(directory, <SceneDirectory entries={entries} selected={selected} />);
  return { root, main, viewport, mountRoot, select: selected.set };
}

function SceneDirectory({ entries, selected: store }: { entries: readonly SceneDirectoryEntry[]; selected: Store<SceneDirectoryEntry | null> }) {
  useLanguage();
  const selected = useSyncExternalStore(store.subscribe, store.get);
  if (selected === null) return null;
  const link = (item: SceneDirectoryEntry) => (
    <a key={item.id} href={item.href} aria-current={item.id === selected.id ? 'page' : undefined}>{t(item.title)}</a>
  );
  return (
    <>
      <h1>{selected.section === 'perspectives' ? t('场景透视') : t('场景')}</h1>
      <nav aria-label={t('场景目录')}>{entries.filter(item => item.section === selected.section).map(link)}</nav>
    </>
  );
}
