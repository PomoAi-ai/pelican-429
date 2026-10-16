import { D1_LAB_VERSIONS, type D1LabVersion } from '../render/grassy/d1-lab-looks.ts';
import type { D1GalleryMessage } from './d1-render-lab.ts';

const gallery = document.querySelector<HTMLElement>('#hair-gallery')!;
const lookControls = document.querySelector<HTMLElement>('#hair-looks')!;
const angleControls = document.querySelector<HTMLElement>('#hair-angles')!;
const status = document.querySelector<HTMLElement>('#hair-status')!;
const versions = D1_LAB_VERSIONS.filter(version => version.id !== 'showcase');
const requestedVersion = new URLSearchParams(location.search).get('version') ?? 'v2';
const selectedVersion = versions.find(version => version.id === requestedVersion);
let version: D1LabVersion = 'v2';
let angle = 0;
const frames = new Map<HTMLElement, HTMLIFrameElement>();
let camera: Extract<D1GalleryMessage, { type: 'd1-gallery-camera' }> | null = null;

window.addEventListener('message', (event: MessageEvent<D1GalleryMessage>) => {
  if (event.origin !== location.origin) return;
  const sender = [...frames.entries()].find(([, frame]) => frame.contentWindow === event.source);
  if (!sender) return;
  const [card, frame] = sender;
  if (event.data.type === 'd1-gallery-ready') {
    if (camera) (event.source as Window).postMessage(camera, location.origin);
  } else if (event.data.type === 'd1-gallery-error') {
    frame.dataset.ready = 'true';
  } else if (event.data.type === 'd1-gallery-preview') {
    card.querySelector<HTMLImageElement>('.hair-snapshot')!.src = event.data.image;
    frame.dataset.ready = 'true';
  } else if (event.data.type === 'd1-gallery-camera') {
    camera = event.data;
    for (const frame of frames.values()) {
      if (frame.contentWindow !== event.source) frame.contentWindow!.postMessage(camera, location.origin);
    }
    for (const button of angleControls.querySelectorAll('button')) button.setAttribute('aria-pressed', 'false');
  }
});

function previewUrl(hair: string, embed: boolean): string {
  const url = new URL('./render-lab.html', location.href);
  url.search = new URLSearchParams({ hair, version, framing: 'head', angle: String(angle), projection: 'orthographic' }).toString();
  if (embed) url.searchParams.set('embed', '1');
  return url.href;
}

function refreshPreviews(): void {
  for (const snapshot of gallery.querySelectorAll<HTMLImageElement>('.hair-snapshot')) snapshot.removeAttribute('src');
  for (const [card, frame] of frames) {
    delete frame.dataset.ready;
    frame.src = previewUrl(card.dataset.hair!, true);
  }
  for (const link of gallery.querySelectorAll<HTMLAnchorElement>('a[data-open-hair]')) link.href = previewUrl(link.dataset.openHair!, false);
  const url = new URL(location.href);
  url.searchParams.set('version', version);
  history.replaceState(null, '', url);
}

async function initialize(): Promise<void> {
  if (!selectedVersion) throw new Error(`未知渲染风格：${requestedVersion}`);
  version = selectedVersion.id;
  for (const look of versions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = look.label;
    button.title = look.description;
    button.setAttribute('aria-pressed', String(look.id === version));
    button.addEventListener('click', () => {
      version = look.id;
      for (const sibling of lookControls.querySelectorAll('button')) sibling.setAttribute('aria-pressed', String(sibling === button));
      refreshPreviews();
    });
    lookControls.append(button);
  }
  for (const button of angleControls.querySelectorAll<HTMLButtonElement>('button')) {
    button.addEventListener('click', () => {
      angle = Number(button.dataset.angle);
      camera = null;
      for (const sibling of angleControls.querySelectorAll('button')) sibling.setAttribute('aria-pressed', String(sibling === button));
      refreshPreviews();
    });
  }

  const response = await fetch('./render-lab.html');
  if (!response.ok) throw new Error(`读取头发目录失败：HTTP ${response.status}`);
  const documentSource = new DOMParser().parseFromString(await response.text(), 'text/html');
  const hairs = documentSource.querySelectorAll<HTMLButtonElement>('button[data-hair]');
  if (!hairs.length) throw new Error('渲染实验页面没有头发目录，无法生成预览。');

  // 离屏释放三维上下文，但保留真实预览快照，滚回时立即显示。
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const card = entry.target as HTMLElement;
      if (entry.isIntersecting && !frames.has(card)) {
        const frame = document.createElement('iframe');
        frame.title = card.dataset.title!;
        frame.src = previewUrl(card.dataset.hair!, true);
        card.querySelector('.hair-viewport')!.append(frame);
        frames.set(card, frame);
      } else if (!entry.isIntersecting) {
        frames.get(card)?.remove();
        frames.delete(card);
      }
    }
  });
  for (const [index, source] of [...hairs].entries()) {
    const hair = source.dataset.hair;
    const title = source.textContent?.trim();
    if (!hair || !title) throw new Error(`头发目录第 ${index + 1} 项缺少版本标识或名称。`);
    const card = document.createElement('article');
    card.className = 'hair-card';
    card.dataset.hair = hair;
    card.dataset.title = title;
    const heading = document.createElement('h2');
    heading.textContent = `${String(index + 1).padStart(2, '0')} · ${title}`;
    const viewport = document.createElement('div');
    viewport.className = 'hair-viewport';
    const loading = document.createElement('p');
    loading.className = 'hair-loading';
    loading.textContent = '首次加载三维模型…';
    const snapshot = document.createElement('img');
    snapshot.className = 'hair-snapshot';
    snapshot.alt = title;
    viewport.append(loading, snapshot);
    const link = document.createElement('a');
    link.dataset.openHair = hair;
    link.href = previewUrl(hair, false);
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = '单独打开 ↗';
    card.append(heading, viewport, link);
    gallery.append(card);
    observer.observe(card);
  }
  status.textContent = `共 ${hairs.length} 款 · 拖动任一模型同步旋转，滚轮同步缩放 · 宽屏每行最多 5 款`;
}

void initialize().catch((error: unknown) => {
  status.setAttribute('role', 'alert');
  status.classList.add('hair-error');
  status.textContent = `无法显示头发预览：${error instanceof Error ? error.message : String(error)}`;
});
