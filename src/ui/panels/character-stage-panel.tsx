import { createRef, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import type { TextureTier } from '../../config/app-mode.ts';
import { CHARACTER_STAGE_LOOK } from '../../config/character-stage-look.ts';
import { D1_ARTWORK, type ShowcaseCard } from '../../config/showcase.ts';
import { ART_LIBRARY_GROUPS, type ArtLibraryEntry } from '../../config/art-library.ts';
import { t } from '../../config/i18n.ts';
import { translateShowcaseText } from '../../config/i18n/showcase.ts';
import type { ShowcaseModel } from '../model/showcase-model.ts';
import { writeCharacterStageLocation } from '../model/character-stage-location.ts';
import type { CharacterStageView } from '../model/character-stage-location.ts';
import { guidedImageUrl } from '../hud/ruler-guides.ts';
import { Select } from '../controls/select.tsx';
import { Slider } from '../controls/slider.tsx';
import { mountReact } from '../react/mount.tsx';
import { createStore, type Store } from '../react/store.ts';
import { useLanguage } from '../react/use-language.ts';
import { PreviewCard, modelRevision, useStore, type NpcSound, type PreviewCardView } from './showcase-panel.tsx';
import './character-stage.css';

// 每张默认原画所在的资料库条目；下拉列出同条目的其他原画。登记的路径不在资料库里时启动即报错。
const ARTWORK_ENTRIES = new Map<string, ArtLibraryEntry>(Object.values(D1_ARTWORK).map((path) => {
  const entry = ART_LIBRARY_GROUPS.flatMap((group) => group.entries).find((item) => item.images.some((image) => image.path === path));
  if (!entry) throw new Error(`原画对比路径不在原画资料库中：${path}`);
  return [path, entry];
}));

/** 与原生 range 一致：夹在 [0.65, 12] 并按 0.05 取整，写进网址的缩放才能被 readCharacterStageLocation 读回。 */
const stageZoom = (value: number): number => Number(Math.min(12, Math.max(0.65, Math.round(value * 20) / 20)).toFixed(2));

interface StageStores {
  revision: Store<number>;
  selected: Store<number | null>;
  zoom: Store<number>;
  environment: Store<ShowcaseCard['environment']>;
  sun: Store<number>;
  note: Store<string | null>;
}

/** 右侧原画对比栏：跟随选中（否则第一个）D1 角色的变体；滚轮以指针为中心缩放，拖动平移，双击复位；拖左边缘调宽度。 */
function StageArtwork({ model, selectedId, rootRef }: { model: ShowcaseModel; selectedId: number | null; rootRef: RefObject<HTMLDivElement | null> }) {
  const language = useLanguage();
  const frameRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const view = useRef({ scale: 1, x: 0, y: 0 });
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const [guides, setGuides] = useState(true);
  const [src, setSrc] = useState<string>();
  const cards = model.cards.filter((card) => model.entry(card.entryId).actor === 'd1');
  const card = cards.find((item) => item.id === selectedId) ?? cards[0];
  const path = card ? D1_ARTWORK[card.d1Variant] : null;
  // 默认原画变化（换角色或变体）时选择复位；同一默认原画下保留手动选的那张。
  const [choice, setChoice] = useState({ base: path, path });
  if (choice.base !== path) setChoice({ base: path, path });
  const images = path === null ? [] : ARTWORK_ENTRIES.get(path)!.images;
  const current = images.find((item) => item.path === choice.path);
  const place = (): void => { const { scale, x, y } = view.current; imageRef.current!.style.transform = `translate(${x}px, ${y}px) scale(${scale})`; };
  // 横版原画放在竖栏里会只占顶部，复位时垂直居中。
  const reset = (): void => { view.current = { scale: 1, x: 0, y: Math.max(0, (frameRef.current!.clientHeight - imageRef.current!.clientHeight) / 2) }; place(); };
  useEffect(() => {
    // React 的 wheel 监听是被动的，阻止页面滚动必须原生注册。
    const frame = frameRef.current!;
    const wheel = (event: WheelEvent): void => {
      event.preventDefault();
      const rect = frame.getBoundingClientRect();
      const px = event.clientX - rect.left, py = event.clientY - rect.top;
      const { scale, x, y } = view.current;
      const next = Math.min(10, Math.max(1, scale * Math.exp(-event.deltaY * .0015)));
      view.current = { scale: next, x: px - (px - x) * next / scale, y: py - (py - y) * next / scale };
      place();
    };
    frame.addEventListener('wheel', wheel, { passive: false });
    return () => frame.removeEventListener('wheel', wheel);
  }, []);
  // 开关状态在切换原画时保留；当前原画没有虚线版就直接显示原图。
  useEffect(() => {
    if (!current) return;
    if (!(guides && current.guides)) { setSrc(current.path); return; }
    let live = true;
    void guidedImageUrl(current.path, current.guides).then((url) => { if (live) setSrc(url); });
    return () => { live = false; };
  }, [current, guides]);
  const resize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent): void => {
      const root = rootRef.current!;
      const width = Math.min(innerWidth * .7, Math.max(220, root.getBoundingClientRect().right - next.clientX));
      root.style.setProperty('--sc-artwork-width', `${Math.round(width)}px`);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('lostpointercapture', () => handle.removeEventListener('pointermove', move), { once: true });
  };
  const release = (event: ReactPointerEvent): void => { if (drag.current?.id === event.pointerId) drag.current = null; };
  return (
    <aside className="sc-stage-artwork" aria-label={t('原画对比')}>
      <div className="sc-stage-artwork-resize" role="separator" aria-orientation="vertical" aria-label={t('拖动调整原画栏宽度')} onPointerDown={resize} />
      <div className="sc-stage-artwork-head">
        <strong>{t('原画对比')}</strong>
        {current && <Select label={t('选择原画')} value={current.path} items={images.map((image) => ({ value: image.path, label: image.label[language === 'zh' ? 0 : 1] }))}
          onValueChange={(next) => setChoice({ base: path, path: next })} />}
        <label className="sc-stage-artwork-guides" title={t('显示或隐藏标尺虚线')} hidden={!current?.guides}>
          <input type="checkbox" checked={guides} onChange={(event) => setGuides(event.target.checked)} />{t('虚线')}
        </label>
      </div>
      <div ref={frameRef} className="sc-stage-artwork-frame" hidden={path === null} onDoubleClick={reset}
        onPointerDown={(event) => { drag.current = { id: event.pointerId, x: event.clientX - view.current.x, y: event.clientY - view.current.y }; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={(event) => {
          if (drag.current?.id !== event.pointerId) return;
          view.current = { ...view.current, x: event.clientX - drag.current.x, y: event.clientY - drag.current.y };
          place();
        }}
        onPointerUp={release} onPointerCancel={release}>
        <img ref={imageRef} alt={t('原画')} decoding="async" draggable={false} src={src} onLoad={reset} />
      </div>
      <p className="sc-no-results" hidden={path !== null}>{t('场景中没有登记原画的角色')}</p>
    </aside>
  );
}

function StageDirectory({ model, addActor }: { model: ShowcaseModel; addActor: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase();
  // 中文模式也按英文名搜索。
  const rows = model.catalog.subjects.map((actor) => ({ actor, visible: [actor.name, actor.id, actor.description, translateShowcaseText(actor.name), translateShowcaseText(actor.description)].join(' ').toLocaleLowerCase().includes(needle) }));
  return <>
    <div className="sc-search">
      <input type="search" placeholder={t('搜索角色…')} aria-label={t('搜索角色目录')} value={query} onChange={(event) => setQuery(event.target.value)} />
    </div>
    <div className="sc-directory-heading"><span>{t('角色目录')}</span><span>{model.catalog.subjects.length}</span></div>
    <nav className="sc-stage-directory" aria-label={t('角色目录')}>
      {rows.map(({ actor, visible }) => {
        const instances = model.cards.filter((card) => model.entry(card.entryId).actor === actor.id).length;
        return (
          <div key={actor.id} className={`sc-stage-directory-row${instances > 0 ? ' sc-selected' : ''}`} hidden={!visible}>
            <button type="button" className="sc-stage-select" aria-label={t('添加{name}到场景').replace('{name}', t(actor.name))} disabled={model.full} onClick={() => addActor(actor.id)}
              title={model.full ? t(`场景最多 ${model.catalog.maxCards} 个角色，请先移除一个`) : t('添加到场景，保留已有角色')}>
              <img src={actor.image} alt="" loading="lazy" decoding="async" />
              <span className="sc-stage-subject">
                <strong>{t(actor.name)}</strong>
                <span className="sc-stage-subject-count">{instances > 0 ? t(`场景中 ${instances} 个`) : t('点击添加到场景')}</span>
              </span>
            </button>
          </div>
        );
      })}
      <p className="sc-no-results" hidden={rows.some((row) => row.visible)}>{t('没有匹配的角色')}</p>
    </nav>
  </>;
}

function CharacterStagePanel({ model, stores, applyEnvironment, returnUrl, onNpcSound, views, view, textures, rootRef, viewportRef, resetCameraRef }: {
  model: ShowcaseModel;
  stores: StageStores;
  applyEnvironment: () => void;
  returnUrl: string;
  onNpcSound: NpcSound;
  views: Map<number, PreviewCardView>;
  view: CharacterStageView;
  textures: TextureTier;
  rootRef: RefObject<HTMLDivElement | null>;
  viewportRef: RefObject<HTMLDivElement | null>;
  resetCameraRef: RefObject<HTMLButtonElement | null>;
}) {
  useLanguage();
  useStore(stores.revision);
  const selectedId = useStore(stores.selected);
  const zoom = useStore(stores.zoom);
  const environment = useStore(stores.environment);
  const sun = useStore(stores.sun);
  const note = useStore(stores.note);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [artworkShown, setArtworkShown] = useState(true);
  const { cards } = model;
  // 被移除的卡片不再算选中。
  const selected = cards.some((card) => card.id === selectedId) ? selectedId : null;
  const hasRuler = cards.some((card) => model.entry(card.entryId).actor === 'ruler');
  const hideDirectory = (): void => setDirectoryOpen(false);
  return (
    <div ref={rootRef} className={`showcase-app sc-character-stage${directoryOpen ? ' sc-directory-open' : ''}${artworkShown ? '' : ' sc-artwork-hidden'}`}>
      <aside className="sc-sidebar" id="character-stage-directory">
        <div className="sc-brand">
          <span className="sc-brand-mark">P</span>
          <div><strong>{t('角色展示场')}</strong><span>PELICAN 429 · CHARACTER STUDIO</span></div>
        </div>
        <StageDirectory model={model} addActor={(id) => { model.addActor(id); applyEnvironment(); hideDirectory(); }} />
        <div className="sc-stage-sidebar-bottom">
          <details className="sc-stage-demos">
            <summary>{t('演示组合')}</summary>
            {model.catalog.demos!.map((demo) => <button key={demo.id} type="button" onClick={() => { model.showDemo(demo); applyEnvironment(); hideDirectory(); }}>{t(demo.title)}</button>)}
          </details>
          <p>{t('点击角色添加到场景；可重复添加。')}</p>
          <div className="sc-stage-links">
            <a href={returnUrl}>{t('返回游戏 ↗')}</a>
            <a href="./">{t('首页索引')}</a>
          </div>
        </div>
      </aside>
      <main className="sc-stage-main">
        <header className="sc-stage-toolbar">
          <button type="button" className="sc-stage-directory-toggle" aria-controls="character-stage-directory" aria-expanded={directoryOpen} onClick={() => setDirectoryOpen(!directoryOpen)}>{t('☰ 目录')}</button>
          <div className="sc-stage-title"><strong>{t('角色场景')}</strong><span>{`${cards.length} / ${model.catalog.maxCards}`}</span></div>
          <div className="sc-stage-global-controls">
            <label className="sc-control">{t('贴图对比')}<Select label={t('贴图档位对比')} value={textures}
              items={[{ value: 'ktx2-compact', label: t('512 · 贴图＋模型压缩') }, { value: 'ktx2-256-compact', label: t('256 · 贴图＋模型压缩') }, { value: 'ktx2', label: 'KTX2 · 512' }, { value: 'web', label: 'WebP · 512' }, { value: 'original', label: t('原始高清') }] as const}
              onValueChange={(tier) => {
                const url = new URL(location.href);
                url.searchParams.set('textures', tier);
                url.searchParams.delete('demo');
                writeCharacterStageLocation(url.searchParams, cards, { zoom: stores.zoom.get(), angle: view.angle, environment: stores.environment.get() });
                location.assign(url.href);
              }} /></label>
            <button type="button" onClick={() => model.all({ playing: true })}>{t('▶ 播放')}</button>
            <button type="button" onClick={() => model.all({ playing: false })}>{t('Ⅱ 暂停')}</button>
            <button type="button" onClick={() => model.reset()}>{t('↺ 重播')}</button>
            <button type="button" title={t('显示或隐藏格子标尺，1 格 = 1 世界单位')} aria-pressed={hasRuler} disabled={model.full && !hasRuler}
              onClick={() => { model.selectActor('ruler', !hasRuler); applyEnvironment(); }}>{t('格子标尺')}</button>
            <label className="sc-control">{t('环境')}<Select label={t('场景环境')} value={environment}
              items={[{ value: 'surface', label: t('地上') }, { value: 'underground', label: t('地下') }] as const}
              onValueChange={(next) => { stores.environment.set(next); applyEnvironment(); }} /></label>
            <label className="sc-stage-zoom">{t('太阳')}
              <Slider label={t('太阳位置')} value={sun} min={-1} max={1} step={0.01} disabled={environment === 'underground'} onValueChange={(next) => stores.sun.set(next)} />
              <output>{t(Math.abs(sun) < .03 ? '上方' : sun < 0 ? '左侧' : '右侧')}</output>
            </label>
            <label className="sc-stage-zoom">{t('缩放')}<Slider label={t('场景镜头缩放')} value={zoom} min={0.65} max={12} step={0.05} onValueChange={(next) => stores.zoom.set(stageZoom(next))} /></label>
            <button ref={resetCameraRef} type="button">{t('重置镜头')}</button>
            <button type="button" aria-pressed={artworkShown} onClick={() => setArtworkShown(!artworkShown)}>{t('原画对比')}</button>
          </div>
        </header>
        <section className="sc-stage-actionbar" aria-label={t('当前角色操作栏')} hidden={selected === null}>
          {cards.map((card) => <PreviewCard key={card.id} card={card} model={model} onNpcSound={onNpcSound} views={views} sharedScene hidden={card.id !== selected} onCloseControls={() => stores.selected.set(null)} />)}
        </section>
        <div ref={viewportRef} className="sc-stage-viewport" role="region" aria-label={t('角色展示场景')}>
          <div className="sc-stage-hint" hidden={selected !== null || cards.length === 0}>{t('点击角色显示工具 · 拖动角色移动位置')}</div>
          <div className="sc-stage-empty" hidden={cards.length !== 0}>
            <strong>{t('场景中还没有角色')}</strong>
            <p>{t('点击左侧角色即可添加。')}</p>
          </div>
        </div>
        <footer className="sc-stage-status">
          {/* 状态文字由游戏循环每帧写入，由调用方负责语言。 */}
          <span>{note ?? t('正在准备场景…')}</span>
          <button type="button" onClick={() => model.clear()}>{t('清空场景')}</button>
        </footer>
      </main>
      <StageArtwork model={model} selectedId={selected} rootRef={rootRef} />
    </div>
  );
}

export function createCharacterStagePanel(parent: HTMLElement, model: ShowcaseModel, returnUrl: string, onNpcSound: NpcSound, view: CharacterStageView, textures: TextureTier) {
  const { revision, unsubscribe } = modelRevision(model);
  const stores: StageStores = {
    revision, selected: createStore<number | null>(null), zoom: createStore(view.zoom), environment: createStore(view.environment),
    sun: createStore(CHARACTER_STAGE_LOOK.sunPosition), note: createStore<string | null>(null),
  };
  const applyEnvironment = (): void => {
    const next = stores.environment.get();
    for (const card of model.cards) if (card.environment !== next) model.update(card, { environment: next }, true);
  };
  applyEnvironment();
  const views = new Map<number, PreviewCardView>();
  const rootRef = createRef<HTMLDivElement>();
  const viewportRef = createRef<HTMLDivElement>();
  const resetCameraRef = createRef<HTMLButtonElement>();
  const host = parent.appendChild(document.createElement('div'));
  host.style.display = 'contents';
  // 调用方随即在 viewport 上创建舞台并开始逐帧读取 views，必须同步提交。
  const unmount = flushSync(() => mountReact(host, <CharacterStagePanel model={model} stores={stores} applyEnvironment={applyEnvironment} returnUrl={returnUrl} onNpcSound={onNpcSound}
    views={views} view={view} textures={textures} rootRef={rootRef} viewportRef={viewportRef} resetCameraRef={resetCameraRef} />));
  return {
    root: rootRef.current!, viewport: viewportRef.current!, views, resetCamera: resetCameraRef.current!,
    selectActor(id: number | null) { stores.selected.set(id); },
    selectNextActor() {
      if (model.cards.length === 0) return;
      const selected = stores.selected.get();
      const index = model.cards.findIndex((card) => card.id === selected);
      const card = model.cards[(index + 1) % model.cards.length]!;
      // 先同步显示该角色的操作栏，按钮才能获得焦点。
      flushSync(() => stores.selected.set(card.id));
      views.get(card.id)!.root.querySelector<HTMLButtonElement>('button')!.focus();
    },
    get zoom() { return stores.zoom.get(); },
    setZoom(value: number) { stores.zoom.set(stageZoom(value)); },
    get environment() { return stores.environment.get(); },
    get sunPosition() { return stores.sun.get(); },
    setNote(text: string) { stores.note.set(text); },
    dispose() { unsubscribe(); unmount(); host.remove(); },
  };
}
