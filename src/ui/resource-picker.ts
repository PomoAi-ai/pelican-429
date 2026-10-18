import type { ResidenceResource } from '../config/residence.ts';
import { TILE_SHAPE_DEFINITIONS } from '../config/definition-kit.ts';

export function createResourcePicker(resources: readonly ResidenceResource[], createThumbnailRenderer: () => { render(resourceId: string): string; renderSurface(resourceId: string): string; dispose(): void }, initialId = resources[0]!.id) {
  const root = document.createElement('div');
  root.className = 'resource-picker';
  root.innerHTML = '<input class="resource-picker-search" type="search" placeholder="搜索材质、形状、构件" aria-label="搜索材质、形状、构件"><div class="resource-picker-groups" role="group" aria-label="材质与建筑类别"></div><div class="resource-picker-variants" role="group" aria-label="可铺设构件"></div>';
  const search = root.querySelector<HTMLInputElement>('input')!;
  const groups = root.querySelector<HTMLElement>('.resource-picker-groups')!;
  const variants = root.querySelector<HTMLElement>('.resource-picker-variants')!;
  const cache = new Map<string, string>();
  const pending = new Set<HTMLImageElement>();
  let renderer: ReturnType<typeof createThumbnailRenderer> | undefined;
  let idle = 0;
  let value = initialId;
  let group = resources.find(resource => resource.id === initialId)!.group;
  const renderPending = (): void => {
    idle = 0;
    const image = pending.values().next().value;
    if (!image) return;
    pending.delete(image);
    const key = image.dataset.preview!;
    let source = cache.get(key);
    if (!source) {
      renderer ??= createThumbnailRenderer();
      source = image.dataset.surface === 'true' ? renderer.renderSurface(image.dataset.resource!) : renderer.render(image.dataset.resource!);
      cache.set(key, source);
    }
    image.src = source;
    observer.unobserve(image);
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
  const buttonFor = (resource: ResidenceResource, label: string, surface = false): HTMLButtonElement => {
    const button = document.createElement('button'); button.type = 'button';
    button.title = label; button.setAttribute('aria-label', label);
    const image = document.createElement('img'); image.alt = ''; image.width = 80; image.height = 60;
    // 形状使用同一份游戏构件预览，换材质无需重新渲染整套轮廓。
    image.dataset.resource = !surface && resource.kind === 'solid' ? `ceramic-${resource.shape}` : resource.id;
    image.dataset.surface = String(surface);
    image.dataset.preview = `${surface ? 'surface' : 'shape'}:${image.dataset.resource}`;
    const source = cache.get(image.dataset.preview);
    if (source) image.src = source;
    else observer.observe(image);
    button.append(image);
    if (surface || resource.kind !== 'solid') {
      const text = document.createElement('span'); text.textContent = surface ? label.replace(/块$/, '') : label;
      button.append(text);
    }
    return button;
  };
  const choose = (resource: ResidenceResource): void => {
    value = resource.id;
    for (const button of variants.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.resource === value));
    root.dispatchEvent(new Event('change'));
  };
  const matches = (resource: ResidenceResource): boolean => search.value.trim().toLocaleLowerCase().split(/\s+/)
    .every(word => `${resource.group} ${resource.label}`.toLocaleLowerCase().includes(word));
  const showGroup = (name: string, select: boolean): void => {
    group = name;
    for (const image of variants.querySelectorAll('img')) { observer.unobserve(image); pending.delete(image); }
    const items = resources.filter(resource => resource.group === name && matches(resource));
    variants.replaceChildren(...items.map(resource => {
      const label = resource.kind === 'solid' ? TILE_SHAPE_DEFINITIONS.find(shape => shape.id === resource.shape)!.label : resource.label;
      const button = buttonFor(resource, label); button.dataset.resource = resource.id;
      button.addEventListener('click', () => choose(resource));
      return button;
    }));
    if (!items.length) variants.textContent = '无匹配构件';
    for (const button of groups.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.group === name));
    if (select) {
      const selected = resources.find(resource => resource.id === value)!;
      choose(items.find(resource => resource.id === value)
        ?? items.find(resource => resource.kind === 'solid' && selected.kind === 'solid' && resource.shape === selected.shape)
        ?? items.find(resource => resource.kind === 'solid' && resource.shape === 'C') ?? items[0]!);
    } else {
      for (const button of variants.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.resource === value));
    }
    variants.scrollTop = 0;
  };
  for (const name of new Set(resources.map(resource => resource.group))) {
    const representative = resources.find(resource => resource.group === name)!;
    const button = buttonFor(representative, name, representative.kind === 'solid'); button.dataset.group = name;
    button.addEventListener('click', () => showGroup(name, true)); groups.append(button);
  }
  search.addEventListener('input', () => {
    const matching = resources.filter(matches);
    for (const button of groups.querySelectorAll<HTMLButtonElement>('button')) button.hidden = !matching.some(resource => resource.group === button.dataset.group);
    const selectedGroup = resources.find(resource => resource.id === value)!.group;
    const visibleGroup = search.value.trim() ? group : selectedGroup;
    showGroup(matching.find(resource => resource.group === visibleGroup)?.group ?? matching[0]?.group ?? '', false);
  });
  showGroup(group, false);
  return {
    root,
    get value(): string { return value; },
    dispose(): void { observer.disconnect(); cancelIdleCallback(idle); pending.clear(); renderer?.dispose(); root.remove(); },
  };
}
