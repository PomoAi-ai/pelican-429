import { createRef, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { flushSync } from 'react-dom';
import { isEnemyKind } from '../../config/enemy-models.ts';
import { D1_ANIMATED_MODELS, D1_SHADINGS, GRASSY_ANIMATED_MODELS, GRASSY_FLIGHTS, isGrassyAttack } from '../../config/grassy.ts';
import { NPCS, npcModel } from '../../config/npc.ts';
import type { NpcKind } from '../../config/npc.ts';
import { showcaseEntry } from '../../config/showcase.ts';
import type { ShowcaseCard, ShowcaseEntry } from '../../config/showcase.ts';
import { t } from '../../config/i18n.ts';
import { translateShowcaseText } from '../../config/i18n/showcase.ts';
import type { ShowcaseModel } from '../model/showcase-model.ts';
import { createCharacterAssets } from '../model/character-assets.ts';
import { createModelCameraControls } from '../hud/model-camera-controls.ts';
import { Select } from '../controls/select.tsx';
import { Slider } from '../controls/slider.tsx';
import { mountReact } from '../react/mount.tsx';
import { createStore, type Store } from '../react/store.ts';
import { useLanguage } from '../react/use-language.ts';
import './showcase.css';

/** 游戏循环每帧按卡片读取画面区域并回报状态。 */
export interface PreviewCardView {
  readonly root: HTMLElement;
  readonly viewport: HTMLElement;
  update(status: string, progress: number, waiting: boolean): void;
}

export type NpcSound = (card: ShowcaseCard, enabled: boolean) => Promise<void>;

/** null 表示游戏循环还没回报过，显示“准备场景”。 */
type FrameState = { status: string; progress: number; waiting: boolean } | null;

/** ShowcaseModel 原地修改卡片、没有版本号；把通知计数成版本，视图据此整体重渲染。 */
export function modelRevision(model: ShowcaseModel): { revision: Store<number>; unsubscribe: () => void } {
  const revision = createStore(0);
  const unsubscribe = model.subscribe(() => revision.set(revision.get() + 1));
  return { revision, unsubscribe };
}

export const useStore = <T,>(store: Store<T>): T => useSyncExternalStore(store.subscribe, store.get);

const SPEEDS = [{ value: 0.25, label: '0.25×' }, { value: 0.5, label: '0.5×' }, { value: 1, label: '1×' }];
const environments = () => [{ value: 'surface', label: t('地上') }, { value: 'underground', label: t('地下') }] as const;
const MANUAL_HINT = 'A/D 移动 · Space 跳跃 · Shift 慢走 · J/K 普攻 · 右键副攻 · 1–3 技能 · E 大招 · R 骑车 · F 变身';
const MANUAL_HINT_HUMAN = 'A/D 移动 · Shift 慢走 · Space 跳跃 / 持续推进飞行 · J/K 单手键盘 · 右键 Codex · 1 Bug · 2 超载 · 3/E 光子 · R 骑车 · F 变身';

function LiveBadge({ frame, playing }: { frame: Store<FrameState>; playing: boolean }) {
  const state = useStore(frame);
  if (state === null) return <span className="sc-live">{t('准备场景')}</span>;
  return <span className={`sc-live${state.waiting || !playing ? ' sc-waiting' : ''}`}>{t(state.waiting ? '已暂停调度' : playing ? '● 实时预览' : 'Ⅱ 已暂停')}</span>;
}

function SoundButtons({ frame, play, stop }: { frame: Store<FrameState>; play: () => void; stop: () => void }) {
  const state = useStore(frame);
  const disabled = state === null || state.waiting;
  return <>
    <button type="button" disabled={disabled} onClick={play}>{t('▶ 播放声音')}</button>
    <button type="button" disabled={disabled} onClick={stop}>{t('■ 停止声音')}</button>
  </>;
}

/** 状态文字来自游戏循环，由调用方负责语言。 */
function CardBottom({ frame, staticModel }: { frame: Store<FrameState>; staticModel: boolean }) {
  const state = useStore(frame);
  return (
    <div className="sc-card-bottom">
      <span>{state === null ? t('准备场景') : state.status}</span>
      <progress max={1} value={state === null ? 0 : state.progress} aria-label={t('动作进度')} hidden={staticModel} />
    </div>
  );
}

/** 一张预览卡；sharedScene 时作为角色展示场的操作栏，布局不同但控件与行为相同。 */
export function PreviewCard({ card, model, onNpcSound, views, sharedScene, hidden = false, onCloseControls }: {
  card: ShowcaseCard;
  model: ShowcaseModel;
  onNpcSound: NpcSound;
  views: Map<number, PreviewCardView>;
  sharedScene: boolean;
  hidden?: boolean;
  onCloseControls?: () => void;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const assetsRef = useRef<HTMLDivElement>(null);
  const cameraHostRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<ReturnType<typeof createModelCameraControls> | null>(null);
  const [frame] = useState(() => createStore<FrameState>(null));
  const entry = model.entry(card.entryId);
  const { actor } = entry;
  const isHistory = model.catalog.library === 'history';
  const animation = entry.grassyAnimation;
  const npcActor = actor === 'sam' || actor === 'tibo' ? actor : null;
  const forms = npcActor && NPCS[npcActor].forms.length > 1 ? NPCS[npcActor].forms : null;
  const equipmentCharacter = actor === 'human' && !isHistory;
  const d1Character = actor === 'd1';
  const photon = actor === 'human' && entry.action === 'photon_burst';
  const humanWorld = equipmentCharacter && animation !== undefined && card.humanView === 'world';
  const castAnimation = animation !== undefined && (isGrassyAttack(animation.clip) || photon);
  const actorInfo = model.catalog.subjects.find((a) => a.id === actor)!;
  const npc = entry.npcForm ? npcModel(actor as NpcKind, entry.npcForm) : null;
  const name = `${actorInfo.name}${npc ? ` · ${npc.label}` : ''}`;
  const flightLabel = animation?.flight ? ` · ${t(GRASSY_FLIGHTS.find((item) => item.id === animation.flight)!.label)}` : '';
  // 分段翻译：整句词典未必收录名字与动作的每种组合。
  const title = sharedScene ? t(entry.staticModel ? entry.label : name) : `${t(name)} · ${t(entry.label)}${flightLabel}`;
  const staticModel = entry.staticModel !== undefined || actor === 'human' && !animation || actor === 'ruler';
  const supportsModelView = actor !== 'ruler' && sharedScene || entry.staticModel !== undefined || entry.d1Animation !== undefined || isEnemyKind(actor) || (actor === 'human' && !humanWorld) || actor === 'luma';
  const facingHidden = sharedScene ? entry.staticModel !== undefined || entry.d1Animation !== undefined || actor === 'luma' : supportsModelView && !isEnemyKind(actor);
  const targetDodgeHidden = !((actor === 'sam' && entry.action === 'skill1') || ((actor === 'sam' || actor === 'tibo') && entry.action === 'attack'));
  const combatWide = humanWorld || actor === 'human' && animation !== undefined && ['keyboard_smash', 'codex_attack', 'bug_attack', 'server_overload'].includes(animation.clip);
  const photonStage = photon || (actor === 'pelican' || actor === 'luma') && entry.action === 'ultimate';

  // 展示场里静态模型版本与动画模型同列一个下拉；“动画模型”一项记住最近一次的动画条目，切回时恢复。
  const modelVersions = sharedScene ? model.catalog.entries.filter((item) => item.actor === actor && item.staticModel !== undefined) : [];
  const animatedEntry = !d1Character && modelVersions.length > 0 ? model.catalog.entries.find((item) => item.actor === actor && !modelVersions.includes(item)) : undefined;
  const lastAnimated = useRef(animatedEntry?.id);
  if (animatedEntry && !modelVersions.some((item) => item.id === card.entryId)) lastAnimated.current = card.entryId;
  const modelOptions: { value: string; label: string }[] = [
    ...(animatedEntry ? [{ value: lastAnimated.current!, label: t('动画模型') }] : []),
    ...(d1Character ? D1_ANIMATED_MODELS.map((item) => ({ value: item.id, label: t(item.label) })) : []),
    ...modelVersions.map((item) => ({ value: item.id, label: t(item.label) })),
  ];

  const groups = new Map<string, ShowcaseEntry<string>[]>();
  for (const item of model.catalog.entries.filter((e) => e.actor === actor && e.npcForm === entry.npcForm && (!equipmentCharacter || (animation !== undefined && e.grassyAnimation !== undefined && e.grassyAnimation.variant === animation.variant && (!(isGrassyAttack(e.grassyAnimation.clip) || e.action === 'photon_burst') || e.grassyAnimation.flight === animation.flight))))) {
    if (sharedScene && (item.staticModel !== undefined || item.d1HairVisible === false)) continue;
    groups.set(item.group, [...groups.get(item.group) ?? [], item]);
  }
  const changeGrassy = (variant: string, flight: string | undefined): void => {
    const current = model.entry(card.entryId);
    const next = model.catalog.entries.find((e) => e.grassyAnimation?.variant === variant && e.action === current.action && e.grassyAnimation.flight === flight)!;
    model.changeAction(card, next.id);
  };

  useLayoutEffect(() => {
    const view: PreviewCardView = {
      root: rootRef.current!, viewport: viewportRef.current!,
      // 每帧调用，只在内容变化时通知视图。
      update(status, progress, waiting) {
        const current = frame.get();
        if (current === null || current.status !== status || current.progress !== progress || current.waiting !== waiting) frame.set({ status, progress, waiting });
      },
    };
    views.set(card.id, view);
    return () => { views.delete(card.id); };
  }, []);
  useLayoutEffect(() => createCharacterAssets(assetsRef.current!, showcaseEntry(card.entryId).actor, card.id, isHistory,
    !sharedScene && model.activeDemo?.id !== 'pelican-combat' && !(actor === 'human' && card.humanView === 'world')), []);
  // 模型视角控件会接管画面区域的角色与说明（可拖动时改为按钮），所以按原顺序命令式设置，再由控件覆盖。
  useLayoutEffect(() => {
    const viewport = viewportRef.current!;
    viewport.setAttribute('role', 'img');
    viewport.setAttribute('aria-label', t('{name} {action} 效果预览').replace('{name}', t(name)).replace('{action}', t(entry.label)));
    viewport.title = t(entry.description);
  });
  useLayoutEffect(() => {
    if (!supportsModelView) return;
    const viewport = viewportRef.current!;
    const camera = createModelCameraControls(cameraHostRef.current!, sharedScene ? null : viewport, card, model);
    cameraRef.current = camera;
    return () => {
      camera.dispose(); cameraRef.current = null;
      viewport.setAttribute('role', 'img'); viewport.removeAttribute('title');
    };
  }, [supportsModelView]);
  useLayoutEffect(() => { cameraRef.current?.refresh(); });

  const nameBlock = (
    <div className="sc-card-name">
      <img className="sc-card-portrait" alt="" src={npc ? npc.image : actorInfo.image} />
      <strong title={title}>{title}</strong>
    </div>
  );
  const optionControls = <>
    {forms && <label className="sc-control"><span>{t('形态')}</span><Select label={t('形态')} value={entry.npcForm!} items={forms.map((form) => ({ value: form.id, label: t(form.label) }))} onValueChange={(form) => model.changeNpcForm(card, form)} /></label>}
    {forms && <button type="button" onClick={() => {
      model.changeNpcForm(card, model.entry(card.entryId).npcForm === 'human' ? 'monster' : 'human');
      model.update(card, { playing: true });
    }}>{t(entry.npcForm === 'human' ? '变为怪物' : '变为人形')}</button>}
    {forms && <button type="button" onClick={() => model.replayNpcTransformation(card)}>{t('重播变身')}</button>}
    {equipmentCharacter && !sharedScene && animation && <label className="sc-control"><span>{t('展示方式')}</span><Select label={t('展示方式')} value={card.humanView} disabled={photon}
      items={[{ value: 'world', label: t('横版实战') }, { value: 'model', label: t('模型查看') }] as const} onValueChange={(humanView) => model.update(card, { humanView, manual: false }, true)} /></label>}
    {humanWorld && castAnimation && animation.flight === undefined && <label className="sc-control"><span>{t('移动施法')}</span><Select label={t('移动施法')} value={card.attackMotion}
      items={[{ value: 'still', label: t('静止') }, { value: 'walk', label: t('行走') }, { value: 'run', label: t('跑步') }] as const} onValueChange={(attackMotion) => model.update(card, { attackMotion }, true)} /></label>}
    {equipmentCharacter && animation && <label className="sc-control"><span>{t('模型精细度')}</span><Select label={t('模型精细度')} value={animation.variant}
      items={GRASSY_ANIMATED_MODELS.map((item) => ({ value: item.id, label: t(item.label) }))} onValueChange={(variant) => changeGrassy(variant, model.entry(card.entryId).grassyAnimation!.flight)} /></label>}
    {equipmentCharacter && castAnimation && <label className="sc-control"><span>{t('施法姿态')}</span><Select label={t('施法姿态')} value={animation.flight ?? 'ground'}
      items={[{ value: 'ground', label: t('地面施法') }, ...GRASSY_FLIGHTS.map((item) => ({ value: item.id, label: t(item.label) }))]} onValueChange={(flight) => changeGrassy(model.entry(card.entryId).grassyAnimation!.variant, flight === 'ground' ? undefined : flight)} /></label>}
  </>;
  const actionList = (
    <div className="sc-action-list" role={sharedScene ? 'group' : undefined} aria-label={sharedScene ? t('动作与技能') : undefined}>
      {[...groups].map(([group, items]) => (
        <div key={group} className="sc-action-row">
          <span className="sc-action-label">{t(group)}</span>
          <div className="sc-action-buttons">
            {items.map((item) => {
              const selected = item.id === card.entryId || d1Character && entry.d1Animation !== undefined && item.d1Animation === entry.d1Animation;
              return <button key={item.id} type="button" className={`sc-action-button${selected ? ' sc-active' : ''}`} aria-pressed={selected} title={t(item.description)} onClick={() => model.changeAction(card, item.id)}>{t(item.label)}</button>;
            })}
          </div>
        </div>
      ))}
    </div>
  );
  const modelControls = <>
    {modelOptions.length > 0 && <label className="sc-control"><span>{t('模型版本')}</span><Select label={t('模型版本')} value={d1Character && entry.d1Animation ? card.d1Variant : card.entryId} items={modelOptions} onValueChange={(value) => {
      const animated = d1Character ? D1_ANIMATED_MODELS.find((item) => item.id === value) : undefined;
      if (animated) {
        model.update(card, { d1Variant: animated.id }, true);
        if (model.entry(card.entryId).staticModel) model.changeAction(card, 'd1.idle');
      } else model.changeAction(card, value);
    }} /></label>}
    {d1Character && <button type="button" className={card.d1HairVisible ? 'sc-active' : undefined} aria-pressed={card.d1HairVisible} disabled={entry.staticModel !== undefined}
      onClick={() => model.update(card, { d1HairVisible: !card.d1HairVisible }, true)}>{t('显示头发')}</button>}
    {d1Character && <label className="sc-control"><span>{t('渲染风格')}</span><Select label={t('渲染风格')} value={card.d1Shading} disabled={entry.staticModel !== undefined}
      items={D1_SHADINGS.map((item) => ({ value: item.id, label: t(item.label) }))} onValueChange={(d1Shading) => model.update(card, { d1Shading }, true)} /></label>}
    {!sharedScene && <label className="sc-control"><span>{t('环境')}</span><Select label={t('环境')} value={card.environment} items={environments()} onValueChange={(environment) => model.update(card, { environment }, true)} /></label>}
    <div ref={cameraHostRef} style={{ display: 'contents' }} />
  </>;
  const playback = <>
    <button type="button" hidden={sharedScene && staticModel} aria-label={t(card.playing ? '暂停此预览' : '播放此预览')} onClick={() => model.update(card, { playing: !card.playing })}>{t(card.playing ? 'Ⅱ 暂停' : '▶ 播放')}</button>
    <button type="button" onClick={() => model.update(card, { playing: true }, true)}>{t('重播')}</button>
    {npcActor && <SoundButtons frame={frame}
      play={() => { void onNpcSound(card, true).then(() => model.update(card, { playing: true }, !sharedScene)); }}
      stop={() => { void onNpcSound(card, false); }} />}
    <button type="button" className={card.loop ? 'sc-active' : undefined} aria-pressed={card.loop} onClick={() => model.update(card, { loop: !card.loop })}>{t('循环')}</button>
    <button type="button" hidden={facingHidden} onClick={() => model.update(card, { facing: card.facing === 1 ? -1 : 1 }, true)}>{t(card.facing === 1 ? '朝右 →' : '← 朝左')}</button>
    <button type="button" hidden={targetDodgeHidden} className={card.targetDodge ? 'sc-active' : undefined} aria-pressed={card.targetDodge}
      onClick={() => model.update(card, { targetDodge: !card.targetDodge, playing: true }, true)}>{t('目标躲避')}</button>
    <label className="sc-control"><span>{t('速度')}</span><Select label={t('速度')} value={card.speed} items={SPEEDS} onValueChange={(speed) => model.update(card, { speed })} /></label>
  </>;
  const viewport = (
    <div ref={viewportRef} className="sc-viewport" hidden={sharedScene} tabIndex={0}>
      <div className="sc-badges">
        <span className={card.environment}>{t(card.environment === 'surface' ? '☀ 地上' : '◐ 地下')}</span>
        <LiveBadge frame={frame} playing={card.playing} />
      </div>
      <div className="sc-manual-hint" hidden={!card.manual}>{t(humanWorld ? MANUAL_HINT_HUMAN : MANUAL_HINT)}</div>
    </div>
  );
  const assets = <div ref={assetsRef} style={{ display: 'contents' }} />;
  const className = `sc-card${sharedScene ? ' sc-stage-actor-body' : ''}${combatWide ? ' sc-combat-wide' : ''}${photonStage ? ' sc-photon-stage' : ''}${card.manual ? ' sc-manual' : ''}`;

  if (sharedScene) return (
    // 操作栏两行：动作与播放在标题行，模型选项与图片资料在视图行；画面区域隐藏，由共享舞台绘制。
    <article ref={rootRef} className={className} data-card-id={card.id} hidden={hidden}>
      <header className="sc-stage-control-label">
        {nameBlock}
        {actionList}
        {playback}
        <CardBottom frame={frame} staticModel={staticModel} />
        <button type="button" className="sc-stage-close-controls" aria-label={t('关闭角色操作栏')} onClick={onCloseControls}>×</button>
      </header>
      {viewport}
      <div className="sc-card-controls">
        <div className="sc-card-row sc-stage-view-row">
          {optionControls}
          {modelControls}
          <details className="sc-stage-control-assets"><summary>{t('图片资料')}</summary>{assets}</details>
          <button type="button" aria-label={t('从场景移除')} onClick={() => model.close(card.id)}>{t('移除')}</button>
        </div>
      </div>
    </article>
  );
  return (
    <article ref={rootRef} className={className} data-card-id={card.id} hidden={hidden}>
      <header className="sc-card-header">
        {nameBlock}
        <span className="sc-card-index" aria-hidden="true">{`#${String(card.id).padStart(2, '0')}`}</span>
        <button type="button" className="sc-close" aria-label={t('关闭预览')} onClick={() => model.close(card.id)}>×</button>
      </header>
      {assets}
      <div className="sc-actions" role="group" aria-label={t(actor === 'human' ? equipmentCharacter ? '角色动作与精细度' : '历史模型版本选择' : '动作选择')}>
        {optionControls}
        {actionList}
      </div>
      {viewport}
      <div className="sc-card-controls">
        <div className="sc-card-row">{modelControls}</div>
        <div className="sc-card-row" hidden={staticModel}>{playback}</div>
        <div className="sc-card-row sc-secondary">
          <button type="button" className="sc-compare" disabled={model.full} title={model.full ? t(`最多同时预览 ${model.catalog.maxCards} 张卡，请先关闭一张`) : t('添加同项目对照')} onClick={() => model.duplicate(card)}>{t('＋ 添加对照')}</button>
          <button type="button" hidden={actor !== 'pelican' && !humanWorld} className={card.manual ? 'sc-active' : undefined} onClick={() => { model.update(card, { manual: !card.manual }); viewportRef.current!.focus(); }}>{t('手动控制')}</button>
          <label className="sc-zoom">{t('缩放')}<Slider label={t('镜头缩放')} value={card.zoom} min={0.65} max={2.5} step={0.05} onValueChange={(zoom) => model.update(card, { zoom })} /></label>
        </div>
        <CardBottom frame={frame} staticModel={staticModel} />
      </div>
    </article>
  );
}

function ShowcasePanel({ model, revision, note, returnUrl, onNpcSound, views, rootRef, scrollRef }: {
  model: ShowcaseModel;
  revision: Store<number>;
  note: Store<string | null>;
  returnUrl: string;
  onNpcSound: NpcSound;
  views: Map<number, PreviewCardView>;
  rootRef: RefObject<HTMLDivElement | null>;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  useLanguage();
  useStore(revision);
  const noteText = useStore(note);
  const [query, setQuery] = useState('');
  const [speed, setSpeed] = useState(1);
  const { catalog, cards } = model;
  const isHistory = catalog.library === 'history';
  const subject = isHistory ? '历史角色' : '角色';
  const action = '动作';
  const needle = query.trim().toLocaleLowerCase();
  const actors = catalog.subjects.map((actor) => {
    const instances = cards.filter((c) => model.entry(c.entryId).actor === actor.id).length;
    const countEntries = catalog.entries.filter((e) => e.actor === actor.id);
    // 中文模式也按英文名搜索。
    const visible = [actor.name, actor.id, actor.description, translateShowcaseText(actor.name), translateShowcaseText(actor.description)].join(' ').toLocaleLowerCase().includes(needle);
    return { actor, instances, visible, disabled: instances === 0 && model.full, itemCount: actor.id === 'human' && !isHistory ? new Set(countEntries.map((entry) => entry.action)).size : countEntries.length };
  });
  const cardEnvironments = new Set(cards.map((c) => c.environment));
  return (
    <div ref={rootRef} className="showcase-app">
      <aside className="sc-sidebar">
        <div className="sc-brand">
          <span className="sc-brand-mark">P</span>
          <div><strong>{t(catalog.title)}</strong><span>PELICAN 429 · DEV STUDIO</span></div>
        </div>
        {catalog.demos && <nav className="sc-directory sc-demo-directory" aria-label={t('功能演示目录')}>
          {catalog.demos.map((demo) => (
            <button key={demo.id} type="button" className="sc-demo-choice" onClick={() => {
              model.showDemo(demo);
              const params = new URLSearchParams(location.search);
              params.set('demo', demo.id);
              history.replaceState(null, '', `${location.pathname}?${params}`);
            }}><strong>{t(demo.title)}</strong><span>{t(demo.description)}</span></button>
          ))}
        </nav>}
        <div className="sc-search">
          <span>⌕</span>
          <input type="search" placeholder={t(`搜索${subject}…`)} aria-label={t('搜索目录')} value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="sc-directory-heading">
          <span>{t(`${subject}目录`)}</span>
          <span>{`${new Set(cards.map((c) => model.entry(c.entryId).actor)).size} / ${catalog.subjects.length}`}</span>
        </div>
        <nav className="sc-directory" aria-label={t('角色多选目录')}>
          {actors.map(({ actor, instances, visible, disabled, itemCount }) => (
            <label key={actor.id} hidden={!visible} className={`sc-actor-card${instances > 0 ? ' sc-selected' : ''}${disabled ? ' sc-disabled' : ''}`}
              title={disabled ? t(`已达 ${catalog.maxCards} 张上限，请先关闭一张预览`) : t('选择{name}').replace('{name}', t(actor.name))}>
              <img className="sc-actor-image sc-character-image" src={actor.image} alt={t('{name}预览图片').replace('{name}', t(actor.name))} />
              <div className="sc-actor-info">
                <div className="sc-actor-title">
                  <strong>{t(actor.name)}</strong>
                  <input type="checkbox" aria-label={t('选择{name}').replace('{name}', t(actor.name))} checked={instances > 0} disabled={disabled} onChange={(event) => model.selectActor(actor.id, event.target.checked)} />
                </div>
                <span className="sc-actor-description">{t(actor.description)}</span>
                <div className="sc-actor-meta">
                  <span>{t(`${itemCount} 个${isHistory ? '历史模型' : action}`)}</span>
                  <span className="sc-instance-count">{instances > 0 ? t(`${instances} 张预览`) : t('未选择')}</span>
                </div>
              </div>
            </label>
          ))}
          <p className="sc-no-results" hidden={actors.some((item) => item.visible)}>{t(`没有匹配的${subject}`)}</p>
        </nav>
        <div className="sc-sidebar-bottom">
          <button type="button" onClick={() => model.clear()}>{t('清空选择')}</button>
          <a href={returnUrl}>{t('↗ 返回游戏')}</a>
          <a className="sc-home-link" href="./">{t('首页索引')}</a>
          <p>{t(`最多 ${catalog.maxCards} 张预览卡 · ${action}在右侧切换`)}</p>
        </div>
      </aside>
      <main className="sc-main">
        <div className="sc-toolbar">
          <button type="button" className="sc-primary" onClick={() => model.all({ playing: true })}>{t('▶ 全部播放')}</button>
          <button type="button" onClick={() => model.all({ playing: false })}>{t('Ⅱ 全部暂停')}</button>
          <button type="button" onClick={() => model.reset()}>{t('↺ 全部重置')}</button>
          <label className="sc-control"><span>{t('统一速度')}</span><Select label={t('统一速度')} value={speed} items={SPEEDS} onValueChange={(next) => { setSpeed(next); model.all({ speed: next }); }} /></label>
          <label className="sc-control"><span>{t('统一环境')}</span><Select<'' | ShowcaseCard['environment']> label={t('统一环境')} value={cardEnvironments.size === 1 ? cards[0]!.environment : ''}
            items={[{ value: '', label: t('各自设置') }, { value: 'surface', label: t('全部地上') }, { value: 'underground', label: t('全部地下') }] as const}
            onValueChange={(environment) => { if (environment) model.all({ environment }, true); }} /></label>
          <button type="button" className={model.synchronized ? 'sc-active' : undefined} aria-pressed={model.synchronized} title={t('从同一起点播放；任一对比画面离屏时整组暂停')} onClick={() => model.sync(!model.synchronized)}>{t('同步对比')}</button>
          <button type="button" className={model.worldScale ? 'sc-active' : undefined} aria-pressed={model.worldScale} title={t('按相同的世界尺寸取景，比较实际尺寸')} onClick={() => model.scale(!model.worldScale)}>{t('统一比例')}</button>
        </div>
        <div ref={scrollRef} className="sc-scroll">
          <div className="sc-empty" hidden={cards.length !== 0}>
            <div>◫</div>
            <h2>{t(`选择一个${subject}，开始查看`)}</h2>
            <p>{t(`勾选左侧${subject}卡；使用「添加对照」比较不同${action}或环境。`)}</p>
          </div>
          <div className={`sc-grid${cards.length === 1 ? ' sc-single' : ''}`}>
            {cards.map((card) => <PreviewCard key={card.id} card={card} model={model} onNpcSound={onNpcSound} views={views} sharedScene={false} />)}
          </div>
        </div>
        <footer className="sc-statusbar">
          <span>{noteText ?? t('独立预览 · 每个画面单独控制')}</span>
          <span>{t('真实角色 · 真实物理 · 真实光照')}</span>
        </footer>
      </main>
    </div>
  );
}

export function createShowcasePanel(parent: HTMLElement, model: ShowcaseModel, returnUrl: string, onNpcSound: NpcSound) {
  const { revision, unsubscribe } = modelRevision(model);
  // 状态栏文字由游戏循环每帧写入，未写入前显示默认说明。
  const note = createStore<string | null>(null);
  const views = new Map<number, PreviewCardView>();
  const rootRef = createRef<HTMLDivElement>();
  const scrollRef = createRef<HTMLDivElement>();
  const host = parent.appendChild(document.createElement('div'));
  host.style.display = 'contents';
  // 游戏循环紧接着按 views 与 scroll 读取画面，首帧前必须已经提交。
  const unmount = flushSync(() => mountReact(host, <ShowcasePanel model={model} revision={revision} note={note} returnUrl={returnUrl} onNpcSound={onNpcSound} views={views} rootRef={rootRef} scrollRef={scrollRef} />));
  return {
    root: rootRef.current!, scroll: scrollRef.current!, views,
    setNote(text: string) { note.set(text); },
    dispose() { unsubscribe(); unmount(); host.remove(); },
  };
}
