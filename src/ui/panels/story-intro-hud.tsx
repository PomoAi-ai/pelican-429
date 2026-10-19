import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import type { SimWorld } from '../../sim/sim-world.ts';
import { t } from '../../config/i18n.ts';
import { PELICAN_SKILL_SLOTS } from '../hud/weapon-hud.ts';
import { mountReact } from '../react/mount.tsx';
import { createStore, type Store } from '../react/store.ts';
import { useLanguage } from '../react/use-language.ts';
import './story.css';

interface IntroView {
  readonly open: boolean;
  readonly mobile: boolean;
}

function StoryIntroView({ store, onClose }: { store: Store<IntroView>; onClose: () => void }) {
  useLanguage();
  const { open, mobile } = useSyncExternalStore(store.subscribe, store.get);
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    if (open && !dialog.current!.open) dialog.current!.showModal();
  }, [open]);
  return (
    <dialog ref={dialog} className="story-intro" aria-labelledby="story-intro-title" onClose={onClose}>
      <header><p className="story-intro-kicker">{t('01 / 山体算力堡垒')}</p><h2 id="story-intro-title">{t('落地就绪，准备出发')}</h2></header>
      <p className="story-intro-pause">{t('游戏已暂停，关闭提示后开始行动。')}</p>
      <section>
        <h3>{t('移动与下车')}</h3>
        <p>{mobile ? t('左摇杆移动，上推跳跃；右侧「攻击」吐水攻击。') : t('A / D 或 ← / → 移动，空格 / W 跳跃；左键 / J 吐水攻击。')}</p>
        <p>{mobile ? t('点「骑乘」上下车；下车后可使用全部技能。') : t('按 R 下车 / 上车；下车后可使用全部技能。')}</p>
      </section>
      <section>
        <h3>{t('鹈鹕技能')}</h3>
        <ul>
          {PELICAN_SKILL_SLOTS.map((skill, index) => (
            <li key={skill.key}>
              <kbd>{mobile ? t('点按') : index === 0 ? t(skill.key, 'key') : skill.key}</kbd>
              {` ${t(skill.name)}`}
              {index === 1 && t('（突进期间无敌）')}
            </li>
          ))}
        </ul>
        <p>{mobile ? t('击败 Tibo 后解锁人形，点击角色切换按钮变身。') : t('击败 Tibo 后解锁人形，按 F 自由变身。')}</p>
      </section>
      <section>
        <h3>{t('当前任务')}</h3>
        <p>{t('向右清理外围守卫 → 沿底层进入机房核心 → 击败 Tibo 与 Sam，恢复算力、结束降智风暴。')}</p>
      </section>
      <footer>
        <button
          type="button"
          onClick={() => dialog.current!.close()}
          onKeyDown={(event) => {
            // 游戏在捕获阶段取消 Space 松开的默认动作，按钮收不到原生点击，所以按下即关闭。
            if (event.code !== 'Space') return;
            event.preventDefault();
            dialog.current!.close();
          }}
        >{t('知道了，开始游戏')}</button>
      </footer>
    </dialog>
  );
}

export function createStoryIntroHud(parent: HTMLElement, world: SimWorld, options: {
  onOpen: () => void;
  onClose: () => void;
}) {
  let pending = world.mainline!.phase === 'perimeter';
  const isMobile = (): boolean => document.body.dataset.controls === 'mobile' || (!document.body.dataset.controls && matchMedia('(pointer: coarse)').matches);
  const store = createStore<IntroView>({ open: false, mobile: isMobile() });
  const container = document.createElement('div');
  parent.append(container);
  const unmount = mountReact(container, <StoryIntroView store={store} onClose={() => {
    store.set({ ...store.get(), open: false });
    options.onClose();
  }} />);
  for (const event of ['pointerdown', 'mousedown', 'click']) container.addEventListener(event, e => e.stopPropagation());
  return {
    get open() { return store.get().open; },
    update(respawning: boolean): void {
      if (respawning) pending = false;
      if (pending && world.blackholeArrivalTicks === 0 && world.entities.find(entity => entity.id === world.playerId)!.body.onGround) {
        pending = false;
        store.set({ open: true, mobile: isMobile() });
        options.onOpen();
      }
    },
    dispose(): void { unmount(); container.remove(); },
  };
}
