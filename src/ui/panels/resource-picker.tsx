import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { ResidenceResource } from '../../config/residence.ts';
import { TILE_SHAPE_DEFINITIONS } from '../../config/definition-kit.ts';
import { t } from '../../config/i18n.ts';
import { mountReact } from '../react/mount.tsx';
import { createStore, type Store } from '../react/store.ts';
import { useLanguage } from '../react/use-language.ts';
import './resource-picker.css';

interface PickerState { value: string; group: string; query: string }

/** 缩略图进入视口才排队渲染，空闲时一张张画，同一预览只画一次。 */
interface Thumbnails {
  cached(key: string): string | undefined;
  request(image: HTMLImageElement, key: string, resourceId: string, surface: boolean, done: (source: string) => void): () => void;
}

function Thumbnail({ resource, surface, thumbnails }: { resource: ResidenceResource; surface: boolean; thumbnails: Thumbnails }) {
  // 形状使用同一份游戏构件预览，换材质无需重新渲染整套轮廓。
  const resourceId = !surface && resource.kind === 'solid' ? `ceramic-${resource.shape}` : resource.id;
  const key = `${surface ? 'surface' : 'shape'}:${resourceId}`;
  const [source, setSource] = useState(() => thumbnails.cached(key));
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => source === undefined ? thumbnails.request(image.current!, key, resourceId, surface, setSource) : undefined, [source, key, resourceId, surface, thumbnails]);
  return <img ref={image} alt="" width={80} height={60} data-surface={String(surface)} src={source} />;
}

function ResourceButton({ resource, label, surface, pressed, hidden, thumbnails, onClick }: {
  resource: ResidenceResource; label: string; surface: boolean; pressed: boolean; hidden?: boolean; thumbnails: Thumbnails; onClick: () => void;
}) {
  return (
    <button type="button" title={t(label)} aria-label={t(label)} aria-pressed={pressed} hidden={hidden} onClick={onClick}>
      <Thumbnail resource={resource} surface={surface} thumbnails={thumbnails} />
      {(surface || resource.kind !== 'solid') && <span>{t(surface ? label.replace(/块$/, '') : label)}</span>}
    </button>
  );
}

const matches = (resource: ResidenceResource, query: string): boolean => query.trim().toLocaleLowerCase().split(/\s+/)
  .every(word => `${resource.group} ${resource.label}`.toLocaleLowerCase().includes(word));

function ResourcePicker({ resources, store, choose, thumbnails }: {
  resources: readonly ResidenceResource[]; store: Store<PickerState>; choose: (id: string, group?: string) => void; thumbnails: Thumbnails;
}) {
  useLanguage();
  const { value, group, query } = useSyncExternalStore(store.subscribe, store.get);
  const variants = useRef<HTMLDivElement>(null);
  const items = resources.filter(resource => resource.group === group && matches(resource, query));
  const matching = resources.filter(resource => matches(resource, query));
  useLayoutEffect(() => { variants.current!.scrollTop = 0; }, [group, query]);
  const showGroup = (name: string): void => {
    const selected = resources.find(resource => resource.id === value)!;
    const options = resources.filter(resource => resource.group === name && matches(resource, query));
    choose((options.find(resource => resource.id === value)
      ?? options.find(resource => resource.kind === 'solid' && selected.kind === 'solid' && resource.shape === selected.shape)
      ?? options.find(resource => resource.kind === 'solid' && resource.shape === 'C') ?? options[0]!).id, name);
  };
  const search = (next: string): void => {
    const visible = resources.filter(resource => matches(resource, next));
    const visibleGroup = next.trim() ? group : resources.find(resource => resource.id === value)!.group;
    store.set({ value, query: next, group: visible.find(resource => resource.group === visibleGroup)?.group ?? visible[0]?.group ?? '' });
  };
  return (
    <>
      <input className="resource-picker-search" type="search" value={query} placeholder={t('搜索材质、形状、构件')} aria-label={t('搜索材质、形状、构件')}
        onChange={(event) => search(event.currentTarget.value)} />
      <div className="resource-picker-groups" role="group" aria-label={t('材质与建筑类别')}>
        {[...new Set(resources.map(resource => resource.group))].map((name) => {
          const representative = resources.find(resource => resource.group === name)!;
          return <ResourceButton key={name} resource={representative} label={name} surface={representative.kind === 'solid'} pressed={name === group}
            hidden={!matching.some(resource => resource.group === name)} thumbnails={thumbnails} onClick={() => showGroup(name)} />;
        })}
      </div>
      <div ref={variants} className="resource-picker-variants" role="group" aria-label={t('可铺设构件')}>
        {items.length ? items.map((resource) => {
          const label = resource.kind === 'solid' ? TILE_SHAPE_DEFINITIONS.find(shape => shape.id === resource.shape)!.label : resource.label;
          return <ResourceButton key={resource.id} resource={resource} label={label} surface={false} pressed={resource.id === value}
            thumbnails={thumbnails} onClick={() => choose(resource.id)} />;
        }) : t('无匹配构件')}
      </div>
    </>
  );
}

export function createResourcePicker(resources: readonly ResidenceResource[], createThumbnailRenderer: () => { render(resourceId: string): string; renderSurface(resourceId: string): string; dispose(): void }, initialId = resources[0]!.id) {
  const root = document.createElement('div');
  root.className = 'resource-picker';
  const store = createStore<PickerState>({ value: initialId, group: resources.find(resource => resource.id === initialId)!.group, query: '' });
  const cache = new Map<string, string>();
  const requests = new Map<HTMLImageElement, { key: string; resourceId: string; surface: boolean; done: (source: string) => void }>();
  const pending = new Set<HTMLImageElement>();
  let renderer: ReturnType<typeof createThumbnailRenderer> | undefined;
  let idle = 0;
  const renderPending = (): void => {
    idle = 0;
    const image = pending.values().next().value;
    if (!image) return;
    pending.delete(image);
    const { key, resourceId, surface, done } = requests.get(image)!;
    let source = cache.get(key);
    if (!source) {
      renderer ??= createThumbnailRenderer();
      source = surface ? renderer.renderSurface(resourceId) : renderer.render(resourceId);
      cache.set(key, source);
    }
    observer.unobserve(image);
    requests.delete(image);
    done(source);
    if (pending.size) idle = requestIdleCallback(renderPending, { timeout: 200 });
  };
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const image = entry.target as HTMLImageElement;
      if (entry.isIntersecting) pending.add(image);
      else pending.delete(image);
    }
    if (pending.size && !idle) idle = requestIdleCallback(renderPending, { timeout: 200 });
  });
  const thumbnails: Thumbnails = {
    cached: (key) => cache.get(key),
    request(image, key, resourceId, surface, done) {
      requests.set(image, { key, resourceId, surface, done });
      observer.observe(image);
      return () => { observer.unobserve(image); pending.delete(image); requests.delete(image); };
    },
  };
  const choose = (id: string, group = store.get().group): void => {
    store.set({ ...store.get(), value: id, group });
    root.dispatchEvent(new Event('change'));
  };
  const unmount = mountReact(root, <ResourcePicker resources={resources} store={store} choose={choose} thumbnails={thumbnails} />);
  return {
    root,
    get value(): string { return store.get().value; },
    dispose(): void { unmount(); observer.disconnect(); cancelIdleCallback(idle); pending.clear(); requests.clear(); renderer?.dispose(); root.remove(); },
  };
}
