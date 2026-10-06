import { NPCS, npcModel, type NpcKind } from '../config/npc.ts';
import { createNpcDialoguePicker, type NpcConversation } from '../config/npc-dialogue.ts';
import type { Entity } from '../entities/entity.ts';
import type { SimWorld } from '../sim/sim-world.ts';
import type { WorldToScreen } from './hud.ts';
import { getLanguage, onLanguageChange } from './language.ts';

export function createNpcDialogue(parent: HTMLElement, world: SimWorld, project: WorldToScreen, options: {
  blocked: () => boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const targets = document.createElement('div');
  targets.className = 'npc-talk-targets';
  const dialog = document.createElement('dialog');
  dialog.className = 'npc-dialogue';
  dialog.setAttribute('aria-labelledby', 'npc-dialogue-name');
  dialog.setAttribute('aria-describedby', 'npc-dialogue-line');
  dialog.innerHTML = `<div class="npc-dialogue-portrait"><img alt="" draggable="false"></div>
    <div class="npc-dialogue-content">
      <header><h2 id="npc-dialogue-name"></h2><span class="npc-dialogue-topic"></span></header>
      <p id="npc-dialogue-line" aria-live="polite" aria-atomic="true"></p>
      <footer>
        <button type="button" data-next><span></span><span aria-hidden="true">→</span></button>
        <button type="button" data-close aria-keyshortcuts="Escape"><span></span><kbd>Esc</kbd></button>
      </footer>
    </div>`;
  parent.append(targets, dialog);
  const name = dialog.querySelector('h2')!;
  const line = dialog.querySelector('p')!;
  const portrait = dialog.querySelector('img')!;
  const topic = dialog.querySelector('.npc-dialogue-topic')!;
  const close = dialog.querySelector<HTMLButtonElement>('[data-close]')!;
  const next = dialog.querySelector<HTMLButtonElement>('[data-next]')!;
  const pick = createNpcDialoguePicker(world.level.seed!);
  let speaker: NpcKind = 'sam';
  let conversation: NpcConversation;
  let index = 0;
  const sync = (): void => {
    const en = getLanguage() === 'en';
    dialog.dataset.speaker = speaker;
    name.textContent = NPCS[speaker].name;
    portrait.src = npcModel(speaker, 'human').image;
    topic.textContent = conversation.topic[en ? 1 : 0];
    line.textContent = conversation.lines[index]![en ? 1 : 0];
    close.querySelector('span')!.textContent = en ? 'Goodbye' : '告别';
    next.querySelector('span')!.textContent = en ? 'Keep talking' : '继续聊';
  };
  close.addEventListener('click', () => dialog.close());
  next.addEventListener('click', () => {
    if (++index === conversation.lines.length) {
      conversation = pick(speaker);
      index = 0;
    }
    sync();
  });
  dialog.addEventListener('close', options.onClose);
  // Block gameplay presses, but let releases clear held inputs (including GM tools).
  for (const root of [targets, dialog]) {
    for (const event of ['keydown', 'pointerdown', 'mousedown', 'click']) {
      root.addEventListener(event, e => e.stopPropagation());
    }
    root.addEventListener('keyup', e => {
      // The game cancels Space on release; native buttons need that default action.
      if ((e as KeyboardEvent).code === 'Space') e.stopPropagation();
    });
  }
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
      speaker = entity.npc!.kind;
      conversation = pick(speaker);
      index = 0;
      sync();
      options.onOpen();
      dialog.showModal();
      next.focus();
    });
    residents.push({ entity, button, chip });
  }
  const syncLanguage = (): void => {
    if (dialog.open) sync();
    for (const { entity, button, chip } of residents) {
      const who = NPCS[entity.npc!.kind].name;
      button.setAttribute('aria-label', getLanguage() === 'en' ? `Talk to ${who}` : `与 ${who} 交谈`);
      chip.textContent = getLanguage() === 'en' ? 'Talk' : '交谈';
    }
  };
  syncLanguage();
  const unsubscribe = onLanguageChange(syncLanguage);
  return {
    get open() { return dialog.open; },
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
    dispose(): void { unsubscribe(); dialog.remove(); targets.remove(); },
  };
}
