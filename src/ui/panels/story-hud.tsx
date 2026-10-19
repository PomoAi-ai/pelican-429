import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { createStoryIntroHud } from './story-intro-hud.tsx';
import type { FacilityChapterHud } from '../hud/facility-chapter-hud.ts';
import type { SimWorld } from '../../sim/sim-world.ts';
import type { MainlinePhase } from '../../config/mainline.ts';
import { NPCS, npcModel } from '../../config/npc.ts';
import { t } from '../../config/i18n.ts';
import { mountReact } from '../react/mount.tsx';
import { createStore, type Store } from '../react/store.ts';
import { useLanguage } from '../react/use-language.ts';
import './npc-dialogue.css';
import './story.css';

const objectives: Record<MainlinePhase, string> = {
  perimeter: '向右前进 → 清理外围守卫',
  core: '进入机房核心 → 沿底层向右前进',
  tibo: '击退 Tibo · 重置大师',
  countdown: '已恢复人形 · 可自由变身，准备迎战 Sam',
  sam: '击败 Sam · 模型路由者',
  restored: '算力恢复 · 前沿模型重新开放',
};

export interface StoryHud extends FacilityChapterHud {
  readonly open: boolean;
}

/** 每帧从世界取出的展示值；全是原始值，逐项比较即可判断是否需要重渲染。 */
interface HudView {
  readonly phase: MainlinePhase;
  readonly guards: number;
  readonly mobile: boolean;
  readonly arriving: boolean;
  readonly seconds: number;
  readonly bossKind: string | null;
  readonly bossHp: number;
  readonly bossMaxHp: number;
  readonly respawning: boolean;
  readonly completion: boolean;
}

function StoryHudView({ store, onChoose, onClose }: { store: Store<HudView>; onChoose: (destination: 'fortress' | 'free') => boolean; onClose: () => void }) {
  useLanguage();
  const view = useSyncExternalStore(store.subscribe, store.get);
  const dialog = useRef<HTMLDialogElement>(null);
  const continueButton = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (!view.completion || dialog.current!.open) return;
    dialog.current!.showModal();
    continueButton.current!.focus();
  }, [view.completion]);
  const choose = (destination: 'fortress' | 'free'): void => {
    if (onChoose(destination)) dialog.current!.close();
  };
  const restored = view.phase === 'restored';
  const detail = view.arriving ? t('正在穿越黑洞 · 落地后即可操作')
    : view.phase === 'perimeter' ? `${t('剩余 {n} 名守卫').replace('{n}', String(view.guards))} · ${view.mobile ? t('左侧摇杆移动 / 上推跳跃 · 右侧按钮攻击') : t('A/D 移动 · 空格跳跃 · J 攻击')}`
    : view.phase === 'countdown' ? t('Sam 抵达倒计时 {n} 秒').replace('{n}', String(view.seconds))
    : restored ? t('现在可自由探索堡垒 · 随时进入主世界。')
    : t('J 攻击 · 右键 / 1–3 技能 · F 变身（Tibo 后解锁）· R 自行车');
  return <>
    <section className={`story-hud${restored ? ' story-hud-complete' : ''}`}>
      <p className="story-kicker">01 / <span>{t('山体算力堡垒')}</span></p>
      <h1 aria-live="polite">{restored ? t('随时进入下一阶段') : t(objectives[view.phase])}</h1>
      <p className="story-detail">{detail}</p>
      {view.bossKind !== null && <progress
        className="story-boss-health"
        max={view.bossMaxHp}
        value={view.bossHp}
        aria-label={`${view.bossKind} ${t('生命')} ${view.bossHp.toFixed(2)}/${view.bossMaxHp.toFixed(2)}`}
      />}
      <p className="story-save-note">{t('进度自动保存至此浏览器 · 下次进入继续游戏')}</p>
      <div className="story-ending" hidden={!restored}><button type="button" data-free="" onClick={() => choose('free')}>{t('进入主世界 →')}</button></div>
      <p className="story-death" role="alert" hidden={!view.respawning}>{t('已倒下 · 正在返回阶段检查点…')}</p>
    </section>
    <dialog
      ref={dialog}
      className="npc-dialogue story-completion"
      data-speaker="sam"
      aria-labelledby="story-completion-name"
      aria-describedby="story-completion-line"
      onCancel={(event) => { event.preventDefault(); choose('fortress'); }}
      onClose={onClose}
    >
      <div className="npc-dialogue-portrait"><img alt="" draggable={false} src={npcModel('sam', 'human').image} /></div>
      <div className="npc-dialogue-content">
        <header><h2 id="story-completion-name">{NPCS.sam.name}</h2><span className="npc-dialogue-topic">{t('降智风暴告一段落')}</span></header>
        <p id="story-completion-line">{t('降智风暴终于告一段落了。算力已经恢复，前沿模型也重新开放了。\n你可以继续探索这座堡垒，或者和我一起前往主世界。准备好了，随时进入下一阶段。')}</p>
        <footer>
          <button ref={continueButton} type="button" data-close="" aria-keyshortcuts="Escape" onClick={() => choose('fortress')}><span>{t('继续探索')}</span><kbd>Esc</kbd></button>
          <button type="button" data-next="" onClick={() => choose('free')}><span>{t('进入主世界')}</span><span aria-hidden="true">→</span></button>
        </footer>
      </div>
    </dialog>
    <section className="story-countdown" aria-labelledby="story-countdown-title" aria-describedby="story-countdown-detail story-countdown-arrival" hidden={view.phase !== 'countdown'}>
      <h2 id="story-countdown-title">{t('已击败 Tibo')}</h2>
      <p id="story-countdown-detail">{t('人形已恢复 · 变身已解锁')}</p>
      <strong className="story-countdown-seconds" role="timer">{view.seconds}</strong>
      <p id="story-countdown-arrival">{t('秒后 Sam 抵达 · 准备迎接下一场战斗')}</p>
    </section>
  </>;
}

export function createStoryHud(parent: HTMLElement, world: SimWorld, options: {
  onChoose: (destination: 'fortress' | 'free') => boolean;
  onOpen: () => void;
  onClose: () => void;
}): StoryHud {
  const intro = createStoryIntroHud(parent, world, options);
  let completionShown = false;
  let completion = false;
  const snapshot = (respawning: boolean): HudView => {
    const state = world.mainline!;
    const boss = world.entities.find((entity) => entity.id === state.bossId);
    return {
      phase: state.phase,
      guards: world.entities.filter((entity) => state.perimeterIds.includes(entity.id) && !entity.removed).length,
      mobile: document.body.dataset.controls === 'mobile',
      arriving: world.blackholeArrivalTicks > 0,
      seconds: Math.ceil(state.countdownTicks * world.tuning.sim.step),
      bossKind: boss === undefined ? null : boss.kind,
      bossHp: boss === undefined ? 0 : boss.health!.hp,
      bossMaxHp: boss === undefined ? 0 : boss.health!.maxHp,
      respawning,
      completion,
    };
  };
  const store = createStore(snapshot(false));
  const container = document.createElement('div');
  parent.append(container);
  const unmount = mountReact(container, <StoryHudView store={store} onChoose={options.onChoose} onClose={() => {
    completion = false;
    store.set({ ...store.get(), completion });
    options.onClose();
  }} />);
  for (const event of ['pointerdown', 'mousedown', 'click']) container.addEventListener(event, e => e.stopPropagation());
  // 每帧调用：只在展示值变化时通知视图，避免无谓的重渲染。
  const update = (respawning: boolean): void => {
    intro.update(respawning);
    if (world.mainline!.phase === 'restored' && !completionShown) {
      completionShown = true;
      completion = true;
      options.onOpen();
    }
    const shown = store.get();
    const next = snapshot(respawning);
    if ((Object.keys(next) as (keyof HudView)[]).some((key) => shown[key] !== next[key])) store.set(next);
  };
  update(false);
  return { get open() { return completion || intro.open; }, update, dispose() { intro.dispose(); unmount(); container.remove(); } };
}
