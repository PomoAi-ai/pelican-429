import { useLayoutEffect, useRef, useSyncExternalStore } from 'react';
import { NPCS, npcModel, type NpcKind } from '../../config/npc.ts';
import { createNpcDialoguePicker, type NpcConversation } from '../../config/npc-dialogue.ts';
import { t } from '../../config/i18n.ts';
import type { Entity } from '../../entities/entity.ts';
import type { SimWorld } from '../../sim/sim-world.ts';
import type { WorldToScreen } from '../hud/hud.ts';
import { onLanguageChange } from '../model/language.ts';
import { mountReact } from '../react/mount.tsx';
import { createStore, type Store } from '../react/store.ts';
import { useLanguage } from '../react/use-language.ts';
import './npc-dialogue.css';

interface Talk {
  readonly speaker: NpcKind;
  readonly conversation: NpcConversation;
  readonly index: number;
}

function NpcDialogueView({ store, onNext, onClose }: { store: Store<Talk | null>; onNext: () => void; onClose: () => void }) {
  const lang = useLanguage() === 'en' ? 1 : 0;
  const talk = useSyncExternalStore(store.subscribe, store.get);
  const dialog = useRef<HTMLDialogElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  // 原生模态 dialog：Esc、焦点限制与 ::backdrop 都由浏览器处理，游戏侧也靠 dialog[open] 判断对话中。
  useLayoutEffect(() => {
    if (talk === null || dialog.current!.open) return;
    dialog.current!.showModal();
    next.current!.focus();
  }, [talk]);
  return (
    <dialog ref={dialog} className="npc-dialogue" data-speaker={talk?.speaker} aria-labelledby="npc-dialogue-name" aria-describedby="npc-dialogue-line" onClose={onClose}>
      {talk && <>
        <div className="npc-dialogue-portrait"><img alt="" draggable={false} src={npcModel(talk.speaker, 'human').image} /></div>
        <div className="npc-dialogue-content">
          <header><h2 id="npc-dialogue-name">{NPCS[talk.speaker].name}</h2><span className="npc-dialogue-topic">{talk.conversation.topic[lang]}</span></header>
          <p id="npc-dialogue-line" aria-live="polite" aria-atomic="true">{talk.conversation.lines[talk.index]![lang]}</p>
          <footer>
            <button ref={next} type="button" data-next="" onClick={onNext}><span>{t('继续聊')}</span><span aria-hidden="true">→</span></button>
            <button type="button" data-close="" aria-keyshortcuts="Escape" onClick={() => dialog.current!.close()}><span>{t('告别')}</span><kbd>Esc</kbd></button>
          </footer>
        </div>
      </>}
    </dialog>
  );
}

export function createNpcDialogue(parent: HTMLElement, world: SimWorld, project: WorldToScreen, options: {
  blocked: () => boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  // 交谈按钮每帧按世界坐标定位，与其他每帧 HUD 一样保持原生；对话内容由 React 渲染。
  const targets = document.createElement('div');
  targets.className = 'npc-talk-targets';
  const container = document.createElement('div');
  parent.append(targets, container);
  const pick = createNpcDialoguePicker(world.level.seed!);
  const store = createStore<Talk | null>(null);
  const unmount = mountReact(container, <NpcDialogueView
    store={store}
    onNext={() => {
      const talk = store.get()!;
      store.set(talk.index + 1 === talk.conversation.lines.length
        ? { speaker: talk.speaker, conversation: pick(talk.speaker), index: 0 }
        : { ...talk, index: talk.index + 1 });
    }}
    onClose={() => {
      store.set(null);
      options.onClose();
    }}
  />);
  // Block gameplay presses from the resident buttons. Releases still clear held inputs because game keyup listeners run in the window capture phase; the dialogue's keys stop at its KeyFence.
  for (const root of [targets, container]) {
    for (const event of ['pointerdown', 'mousedown', 'click']) root.addEventListener(event, e => e.stopPropagation());
  }
  targets.addEventListener('keydown', e => e.stopPropagation());
  targets.addEventListener('keyup', e => {
    // The game cancels Space on release; native buttons need that default action.
    if (e.code === 'Space') e.stopPropagation();
  });
  const residents: Array<{ entity: Entity; button: HTMLButtonElement; chip: HTMLSpanElement }> = [];
  function addResident(entity: Entity): void {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'npc-talk-target';
    button.hidden = true;
    const chip = document.createElement('span');
    button.append(chip);
    targets.append(button);
    button.addEventListener('click', () => {
      const speaker = entity.npc!.kind;
      store.set({ speaker, conversation: pick(speaker), index: 0 });
      options.onOpen();
    });
    residents.push({ entity, button, chip });
  }
  const syncLanguage = (): void => {
    for (const { entity, button, chip } of residents) {
      button.setAttribute('aria-label', t('与 {name} 交谈').replace('{name}', NPCS[entity.npc!.kind].name));
      chip.textContent = t('交谈');
    }
  };
  const unsubscribe = onLanguageChange(syncLanguage);
  return {
    get open() { return store.get() !== null; },
    update(): void {
      const current = world.entities.filter(entity => entity.npc && !entity.removed);
      if (current.length !== residents.length || current.some((entity, index) => entity !== residents[index]!.entity)) {
        for (const { button } of residents) button.remove();
        residents.length = 0;
        for (const entity of current) addResident(entity);
        syncLanguage();
      }
      const player = world.entities.find(entity => entity.id === world.playerId)!;
      for (const { entity, button } of residents) {
        const near = !entity.removed && Math.abs(player.body.x - entity.body.x) < 5 && Math.abs(player.body.y - entity.body.y) < 3;
        const head = project(entity.body.x, entity.body.y + NPCS[entity.npc!.kind].visualHeight);
        const feet = project(entity.body.x, entity.body.y);
        button.hidden = !near || world.respawnTicks > 0 || options.blocked() || head === null || feet === null;
        if (button.hidden || head === null || feet === null) continue;
        const height = Math.abs(feet.y - head.y);
        button.style.left = `${head.x}px`;
        button.style.top = `${head.y}px`;
        button.style.height = `${height}px`;
        button.style.width = `${Math.max(44, height * .55)}px`;
      }
    },
    dispose(): void { unsubscribe(); unmount(); container.remove(); targets.remove(); },
  };
}
