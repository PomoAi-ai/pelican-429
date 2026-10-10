import type { Texture } from 'three';
import { loadInteriorBackgroundTexture } from '../render/free-world-interior-textures.ts';
import { CHARACTER_CATALOG, CHARACTER_HISTORY_CATALOG } from '../config/showcase.ts';
import type { ShowcaseCard } from '../config/showcase.ts';
import { RESOURCE_CATALOG, LAB_CATALOG } from '../render/resource-catalog.ts';
import { TUNING, validateTuning } from '../config/tuning.ts';
import { createShowcaseRenderer } from '../render/showcase-renderer.ts';
import { createShowcaseModel } from '../ui/showcase-model.ts';
import { createShowcasePanel } from '../ui/showcase-panel.ts';
import { createShowcaseSession } from './showcase/session.ts';
import type { ShowcaseSession } from './showcase/session.ts';
import { createShowcaseInput } from './showcase/input.ts';
import { disposeGrassyStaticAssets } from '../render/grassy/grassy-static.ts';
import { loadGrassyAsset, disposeGrassyAssets } from '../render/grassy/grassy-rig.ts';
import { loadEnemyAsset, disposeEnemyAssets } from '../render/enemy-rig.ts';
import { isEnemyKind } from '../config/enemy-models.ts';
import { disposeNpcAssets } from '../render/npc/npc-rig.ts';
import { startCharacterStage } from './character-stage-app.ts';
import { CHARACTER_STAGE_PARAMS, readCharacterStageLocation } from '../ui/character-stage-location.ts';

export async function startShowcase(mode: 'showcase' | 'resources' | 'lab'): Promise<void> {
  validateTuning(TUNING);
  document.body.classList.add('showcase-mode');
  const params = new URLSearchParams(location.search);
  if (mode === 'resources' && params.has('scene')) {
    const scene = params.get('scene');
    if (scene !== 'room' && scene !== 'settlement' && scene !== 'depth') throw new Error(`未知资源场景：${scene}`);
    const { startRoomScenePreview } = await import('./room-scene-preview.ts');
    await startRoomScenePreview(scene);
    return;
  }
  const library = params.get('library');
  if (mode === 'showcase' && library !== null && library !== 'history') throw new Error(`未知角色资料库：${library}`);
  const historicalDemo = CHARACTER_HISTORY_CATALOG.demos!.some((demo) => demo.id === params.get('demo'));
  const isHistory = mode === 'showcase' && (library === 'history' || historicalDemo);
  if (isHistory) { params.set('library', 'history'); history.replaceState(null, '', `${location.pathname}?${params}`); }
  const catalog = mode === 'lab' ? LAB_CATALOG : mode === 'resources' ? RESOURCE_CATALOG : isHistory ? CHARACTER_HISTORY_CATALOG : CHARACTER_CATALOG;
  document.title = `${catalog.title} · Pelican 429`;
  const app = document.getElementById('app')!;
  const loading = document.getElementById('loading')!;
  const model = createShowcaseModel(catalog);
  const stageLocation = mode === 'showcase' && !isHistory ? readCharacterStageLocation(params, catalog) : null;
  if (mode === 'showcase') { model.clear(); model.selectActor('human', true); }
  if (mode === 'lab' || mode === 'resources' || (mode === 'showcase' && params.has('demo'))) {
    const demoId = params.get('demo') ?? (mode === 'resources' ? 'building-kit' : 'compositions');
    const demo = catalog.demos!.find((item) => item.id === demoId);
    if (!demo) throw new Error(`未知的场景功能演示：${demoId}`);
    model.showDemo(demo);
  }
  params.delete('demo');
  params.delete('library');
  for (const key of CHARACTER_STAGE_PARAMS) params.delete(key);
  params.set('mode', 'game');
  const returnUrl = `${location.pathname}${params.size ? `?${params}` : ''}`;
  if (mode === 'showcase' && !isHistory) {
    if (stageLocation) {
      model.clear();
      for (const card of stageLocation.cards) {
        model.addActor(model.entry(card.entryId).actor);
        model.update(model.cards[model.cards.length - 1]!, { ...card, environment: stageLocation.environment });
      }
    }
    startCharacterStage(app, model, returnUrl, stageLocation ?? { zoom: 1, angle: 0, environment: model.cards[0]?.environment ?? 'surface' });
    return;
  }
  const panel = createShowcasePanel(app, model, returnUrl, async (card, enabled) => {
    const session = sessions.get(card.id);
    if (!session?.setSoundEnabled) throw new Error('Boss 模型尚未就绪，请加载完成后播放声音。');
    if (enabled) {
      for (const [id, other] of sessions) if (id !== card.id && other.setSoundEnabled) void other.setSoundEnabled(false);
    }
    await session.setSoundEnabled(enabled);
  });
  const host = createShowcaseRenderer(app);
  let caveBackground: Texture | null = null;
  const sessions = new Map<number, ShowcaseSession>();
  const sessionKeys = new Map<number, string>();
  const preparing = new Set<number>();
  const sessionKey = (card: ShowcaseCard): string => {
    const entry = model.entry(card.entryId);
    if (entry.npcForm) return entry.actor;
    return entry.grassyAnimation ? `human:${card.humanView}:${entry.grassyAnimation.variant}` : entry.actor;
  };
  const input = createShowcaseInput(() => {
    const manual = model.cards.find((c) => c.manual);
    return manual ? panel.views.get(manual.id)!.viewport : null;
  });
  let stopped = false;
  let raf = 0;
  let last = performance.now();
  let syncTime = 0;
  let syncRevision = '';
  const unsubscribe = model.subscribe(() => {
    input.clear();
    const revision = model.cards.map((c) => `${c.id}:${c.revision}`).join(',');
    if (!model.synchronized || revision !== syncRevision) syncTime = 0;
    syncRevision = revision;
  });

  const dispose = (): void => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    unsubscribe(); input.dispose();
    for (const session of sessions.values()) session.dispose();
    sessions.clear();
    caveBackground?.dispose();
    host.dispose(); panel.dispose();
    disposeGrassyAssets(); disposeEnemyAssets();
    if (mode === 'showcase') { disposeGrassyStaticAssets(); disposeNpcAssets(); }
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    window.removeEventListener('pagehide', dispose);
    document.removeEventListener('visibilitychange', onVisibility);
  };
  const fail = (error: unknown): void => {
    dispose();
    console.error(error);
    document.getElementById('error-message')!.textContent = error instanceof Error ? `${error.message}\n\n${error.stack}` : String(error);
    document.getElementById('error')!.hidden = false;
    loading.hidden = true;
  };
  const onError = (event: ErrorEvent): void => fail(event.error ?? event.message);
  const onRejection = (event: PromiseRejectionEvent): void => fail(event.reason);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  window.addEventListener('pagehide', dispose);
  const onVisibility = (): void => {
    if (document.hidden) for (const session of sessions.values()) session.advance(0, false, null);
  };
  document.addEventListener('visibilitychange', onVisibility);

  try {
    await loadGrassyAsset('game');
    if (stopped) return;
    caveBackground = await loadInteriorBackgroundTexture(host.renderer, 'cave');
    if (stopped) { caveBackground.dispose(); return; }
  }
  catch (error) { fail(error); return; }
  if (stopped) return;
  last = performance.now();

  const frame = (now: number): void => {
    if (stopped) return;
    try {
      let elapsed = Math.min(Math.max(0, (now - last) / 1000), TUNING.sim.maxFrameTime);
      last = now;
      for (const [id, session] of sessions) {
        const card = model.cards.find((item) => item.id === id);
        if (!card || sessionKeys.get(id) !== sessionKey(card)) {
          session.dispose(); sessions.delete(id); sessionKeys.delete(id);
        }
      }
      const clip = panel.scroll.getBoundingClientRect();
      const cards = model.cards.map((card) => {
        const view = panel.views.get(card.id)!;
        const rect = view.viewport.getBoundingClientRect();
        const visible = rect.bottom > clip.top && rect.top < clip.bottom && rect.right > clip.left && rect.left < clip.right && !document.hidden;
        return { card, view, rect, visible };
      });
      // 每帧最多构造一个角色，勾选整个目录时页面仍能响应。
      const pending = cards.find((c) => c.visible && !sessions.has(c.card.id) && !preparing.has(c.card.id));
      if (pending) {
        const { card } = pending;
        const entry = model.entry(card.entryId);
        const actor = entry.actor;
        const key = sessionKey(card);
        const asset = entry.grassyAnimation ? loadGrassyAsset(entry.grassyAnimation.variant) : isEnemyKind(actor) ? loadEnemyAsset(actor) : null;
        if (asset) {
          preparing.add(card.id);
          void asset.then(() => {
            preparing.delete(card.id);
            if (!stopped && model.cards.includes(card) && sessionKey(card) === key) {
              sessions.set(card.id, createShowcaseSession(host.renderer, card, caveBackground!));
              sessionKeys.set(card.id, key);
            }
          }).catch(fail);
        } else {
          sessions.set(card.id, createShowcaseSession(host.renderer, card, caveBackground!));
          sessionKeys.set(card.id, key);
        }
        elapsed = 0; last = performance.now();
      }
      // 先完成全部重置，再统一推进；否则重建耗时会让同一帧后面的卡片少走一步。
      for (const { card, visible } of cards) {
        const session = sessions.get(card.id);
        if (session && visible && (session.needsReset || (!model.synchronized && card.playing && card.loop && !card.manual && session.complete))) {
          session.reset(); elapsed = 0; last = performance.now();
        }
      }
      const syncWaiting = model.synchronized && cards.some((c) => {
        const session = sessions.get(c.card.id);
        return !c.visible || !session || ('ready' in session && !session.ready);
      });
      const syncPlaying = model.synchronized && !syncWaiting && model.cards.every((c) => c.playing);
      const syncDuration = Math.max(0, ...[...sessions.values()].map((s) => s.duration));
      if (syncPlaying) syncTime += elapsed * (model.cards[0]?.speed ?? 1);
      if (syncPlaying && syncDuration > 0 && syncTime >= syncDuration) {
        for (const session of sessions.values()) session.reset();
        syncTime = 0; elapsed = 0; last = performance.now();
      }
      input.refresh();
      host.begin();
      for (const { card, view, rect, visible } of cards) {
        const session = sessions.get(card.id);
        if (!session) { view.update(visible ? '正在准备预览…' : '滚动到此处以加载', 0, true); continue; }
        if (!visible) { session.advance(0, false, null); view.update('离屏暂停 · 保留当前进度', session.progress, true); continue; }
        const playing = card.playing && !syncWaiting;
        const manual = card.manual ? () => session.aim(input.pointer.x, input.pointer.y, rect) : null;
        const dt = session.advance(elapsed, playing, manual ? () => input.consume(input.pointer.inside ? manual() : null) : null);
        const texture = session.render(rect, dt, model.worldScale);
        host.draw(texture, rect, clip);
        view.update(syncWaiting ? '同步组等待全部预览就绪' : session.status, session.progress, syncWaiting);
      }
      panel.setNote(syncWaiting ? '同步对比已暂停：请让全部画面可见并等待资源加载' : model.synchronized ? '同步对比 · 统一起点与速度' : `独立预览 · ${cards.filter((c) => c.visible).length} 个画面可见 · 离屏自动暂停`);
      loading.hidden = true;
      raf = requestAnimationFrame(frame);
    } catch (error) { fail(error); }
  };
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  last = performance.now();
  raf = requestAnimationFrame(frame);
}
