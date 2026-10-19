import { NPCS, npcModel, type NpcKind } from '../../config/npc.ts';
import type { SimWorld } from '../../sim/sim-world.ts';
import { t } from '../../config/i18n.ts';
import { onLanguageChange } from '../model/language.ts';

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
    title.textContent = t('Boss 场', 'boss');
    hint.textContent = t('点击头像召唤 · 再次点击重新挑战');
    for (const button of buttons) {
      const kind = button.dataset.kind as NpcKind;
      button.setAttribute('aria-label', t('召唤 {name}').replace('{name}', NPCS[kind].name));
      button.setAttribute('aria-pressed', String(kind === state.kind));
      button.title = `${NPCS[kind].name} · ${NPCS[kind].title}`;
    }
    const boss = world.entities.find(entity => entity.id === state.bossId);
    health.hidden = boss === undefined || state.phase === 'won' || state.phase === 'lost';
    if (boss) {
      bar.max = boss.health!.maxHp;
      bar.value = boss.health!.hp;
      bar.setAttribute('aria-label', t('{name} 生命值').replace('{name}', NPCS[boss.boss!.kind].name));
      healthLabel.textContent = `${NPCS[boss.boss!.kind].name} · ${bar.value.toFixed(2)} / ${bar.max.toFixed(2)}`;
    }
    announcement.hidden = state.phase === 'fighting';
    announcement.dataset.phase = state.phase;
    const text = state.phase === 'countdown' ? String(Math.ceil(state.countdownTicks * world.tuning.sim.step))
      : state.phase === 'won' ? t('挑战成功')
      : state.phase === 'lost' ? t('挑战失败')
      : t('选择你的对手');
    if (headline.textContent !== text) headline.textContent = text;
    const description = state.phase === 'countdown' ? t('准备开战')
      : state.phase === 'ready' ? t('点击顶部头像，召唤 Sam 或 Tibo')
      : t('已恢复人形 · 靠近交谈，或点击头像再战');
    if (detail.textContent !== description) detail.textContent = description;
  };
  for (const type of ['keydown', 'keyup', 'pointerdown', 'mousedown', 'wheel']) root.addEventListener(type, event => event.stopPropagation());
  parent.append(root);
  document.body.classList.add('boss-arena');
  update();
  const unsubscribe = onLanguageChange(update);
  return { update, dispose() { unsubscribe(); root.remove(); document.body.classList.remove('boss-arena'); } };
}
