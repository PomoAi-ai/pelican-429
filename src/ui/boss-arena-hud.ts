import { NPCS, npcModel, type NpcKind } from '../config/npc.ts';
import type { SimWorld } from '../sim/sim-world.ts';
import { getLanguage, onLanguageChange } from './language.ts';

export function createBossArenaHud(parent: HTMLElement, world: SimWorld, onSummon: (kind: NpcKind) => void) {
  const root = document.createElement('section');
  root.className = 'boss-arena-hud';
  root.innerHTML = `<div class="boss-arena-toolbar"><strong></strong><div class="boss-arena-portraits"></div><span class="boss-arena-hint"></span></div>
    <div class="boss-arena-health" hidden><span></span><progress></progress></div>
    <div class="boss-arena-announcement" role="status" aria-live="polite"><b></b><span></span></div>`;
  const portraits = root.querySelector('.boss-arena-portraits')!;
  const buttons = (['sam', 'tibo'] as const).map(kind => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.kind = kind;
    const image = document.createElement('img');
    image.src = npcModel(kind, 'monster').image;
    image.alt = '';
    const name = document.createElement('span');
    name.textContent = NPCS[kind].name;
    button.append(image, name);
    button.addEventListener('click', () => onSummon(kind));
    portraits.append(button);
    return button;
  });
  const title = root.querySelector('strong')!;
  const hint = root.querySelector('.boss-arena-hint')!;
  const health = root.querySelector<HTMLElement>('.boss-arena-health')!;
  const healthLabel = health.querySelector('span')!;
  const bar = health.querySelector('progress')!;
  const announcement = root.querySelector<HTMLElement>('.boss-arena-announcement')!;
  const headline = announcement.querySelector('b')!;
  const detail = announcement.querySelector('span')!;
  const update = (): void => {
    const state = world.bossArena!;
    const en = getLanguage() === 'en';
    title.textContent = en ? 'BOSS ARENA' : 'Boss 场';
    hint.textContent = en ? 'Choose a portrait to start a fresh round' : '点击头像召唤 · 再次点击重新挑战';
    for (const button of buttons) {
      const kind = button.dataset.kind as NpcKind;
      button.setAttribute('aria-label', `${en ? 'Summon' : '召唤'} ${NPCS[kind].name}`);
      button.setAttribute('aria-pressed', String(kind === state.kind));
      button.title = `${NPCS[kind].name} · ${NPCS[kind].title}`;
    }
    const boss = world.entities.find(entity => entity.id === state.bossId);
    health.hidden = boss === undefined || state.phase === 'won' || state.phase === 'lost';
    if (boss) {
      bar.max = boss.health!.maxHp;
      bar.value = boss.health!.hp;
      bar.setAttribute('aria-label', `${NPCS[boss.boss!.kind].name} ${en ? 'health' : '生命值'}`);
      healthLabel.textContent = `${NPCS[boss.boss!.kind].name} · ${bar.value.toFixed(2)} / ${bar.max.toFixed(2)}`;
    }
    announcement.hidden = state.phase === 'fighting';
    announcement.dataset.phase = state.phase;
    const text = state.phase === 'countdown' ? String(Math.ceil(state.countdownTicks * world.tuning.sim.step))
      : state.phase === 'won' ? en ? 'VICTORY' : '挑战成功'
      : state.phase === 'lost' ? en ? 'DEFEATED' : '挑战失败'
      : en ? 'CHOOSE YOUR BOSS' : '选择你的对手';
    if (headline.textContent !== text) headline.textContent = text;
    const description = state.phase === 'countdown' ? en ? 'GET READY' : '准备开战'
      : state.phase === 'ready' ? en ? 'Summon Sam or Tibo from the portraits above' : '点击顶部头像，召唤 Sam 或 Tibo'
      : en ? 'Human form restored · Approach to talk, or choose a portrait to fight again' : '已恢复人形 · 靠近交谈，或点击头像再战';
    if (detail.textContent !== description) detail.textContent = description;
  };
  for (const type of ['keydown', 'keyup', 'pointerdown', 'mousedown', 'wheel']) root.addEventListener(type, event => event.stopPropagation());
  parent.append(root);
  document.body.classList.add('boss-arena');
  update();
  const unsubscribe = onLanguageChange(update);
  return { update, dispose() { unsubscribe(); root.remove(); document.body.classList.remove('boss-arena'); } };
}
