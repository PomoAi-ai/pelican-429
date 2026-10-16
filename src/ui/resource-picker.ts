import type { ResidenceResource } from '../config/residence.ts';
import { TILE_SHAPE_DEFINITIONS } from '../config/definition-kit.ts';

export function createResourcePicker(resources: readonly ResidenceResource[], createThumbnailRenderer: () => { render(resourceId: string): string; dispose(): void }, initialId = resources[0]!.id) {
  const root = document.createElement('div');
  root.className = 'resource-picker';
  root.innerHTML = '<div class="resource-picker-groups" role="group" aria-label="材质与建筑类别"></div><div class="resource-picker-variants" role="group" aria-label="可铺设构件"></div>';
  const groups = root.firstElementChild as HTMLElement;
  const variants = root.lastElementChild as HTMLElement;
  const cache = new Map<string, string>();
  const pending = new Set<HTMLImageElement>();
  let renderer: ReturnType<typeof createThumbnailRenderer> | undefined;
  let frame = 0;
  let value = initialId;
  const renderPending = (): void => {
    frame = 0;
    renderer ??= createThumbnailRenderer();
    for (const image of [...pending].slice(0, 3)) {
      pending.delete(image);
      const id = image.dataset.resource!;
      const source = cache.get(id) ?? renderer.render(id);
      cache.set(id, source); image.src = source; observer.unobserve(image);
    }
    if (pending.size) frame = requestAnimationFrame(renderPending);
    else { renderer.dispose(); renderer = undefined; }
  };
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const image = entry.target as HTMLImageElement;
      if (entry.isIntersecting) pending.add(image);
      else pending.delete(image);
    }
    if (pending.size && !frame) frame = requestAnimationFrame(renderPending);
  });
  const buttonFor = (resource: ResidenceResource, label: string): HTMLButtonElement => {
    const button = document.createElement('button'); button.type = 'button';
    const image = document.createElement('img'); image.alt = ''; image.width = 80; image.height = 60; image.dataset.resource = resource.id;
    const source = cache.get(resource.id);
    if (source) image.src = source;
    else observer.observe(image);
    const text = document.createElement('span'); text.textContent = label;
    button.append(image, text);
    return button;
  };
  const choose = (resource: ResidenceResource): void => {
    value = resource.id;
    for (const button of variants.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.resource === value));
    root.dispatchEvent(new Event('change'));
  };
  const showGroup = (name: string, selectedId?: string): void => {
    for (const image of variants.querySelectorAll('img')) { observer.unobserve(image); pending.delete(image); }
    const items = resources.filter(resource => resource.group === name);
    variants.replaceChildren(...items.map(resource => {
      const label = resource.kind === 'solid' ? TILE_SHAPE_DEFINITIONS.find(shape => shape.id === resource.shape)!.label : resource.label;
      const button = buttonFor(resource, label); button.dataset.resource = resource.id;
      button.addEventListener('click', () => choose(resource));
      return button;
    }));
    for (const button of groups.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.group === name));
    choose(items.find(resource => resource.id === selectedId) ?? items.find(resource => resource.kind === 'solid' && resource.shape === 'C') ?? items[0]!);
    variants.scrollTop = 0;
  };
  for (const name of new Set(resources.map(resource => resource.group))) {
    const representative = resources.find(resource => resource.group === name)!;
    const button = buttonFor(representative, name); button.dataset.group = name;
    button.addEventListener('click', () => showGroup(name)); groups.append(button);
  }
  showGroup(resources.find(resource => resource.id === initialId)!.group, initialId);
  return {
    root,
    get value(): string { return value; },
    dispose(): void { observer.disconnect(); cancelAnimationFrame(frame); pending.clear(); renderer?.dispose(); root.remove(); },
  };
}
