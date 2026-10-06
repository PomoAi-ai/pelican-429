import { createStoryIntroHud } from './story-intro-hud.ts';
import type { FacilityChapterHud } from './facility-chapter-hud.ts';
import type { SimWorld } from '../sim/sim-world.ts';
import type { MainlinePhase } from '../config/mainline.ts';
import { NPCS, npcModel } from '../config/npc.ts';
import { getLanguage, onLanguageChange } from './language.ts';

const objectives: Record<MainlinePhase, readonly [string, string]> = {
  perimeter: ['向右前进 → 清理外围守卫', 'Head right → Clear the perimeter guards'],
  core: ['进入机房核心 → 沿底层向右前进', 'Reach the core → Follow the lower floor east'],
  tibo: ['击退 Tibo · 重置大师', 'Defeat Tibo · The Reset Master'],
  countdown: ['已恢复人形 · 可自由变身，准备迎战 Sam', 'Human form restored · Switch forms and prepare for Sam'],
  sam: ['击败 Sam · 模型路由者', 'Defeat Sam · The Model Router'],
  restored: ['算力恢复 · 前沿模型重新开放', 'Compute restored · Frontier models are back online'],
};

export interface StoryHud extends FacilityChapterHud {
  readonly open: boolean;
}

export function createStoryHud(parent: HTMLElement, world: SimWorld, options: {
  onChoose: (destination: 'fortress' | 'free') => boolean;
  onOpen: () => void;
  onClose: () => void;
}): StoryHud {
  const intro = createStoryIntroHud(parent, world, options);
  const root = document.createElement('section');
  root.className = 'story-hud';
  root.innerHTML = `<p class="story-kicker">01 / <span></span></p><h1></h1><p class="story-detail"></p>
    <progress class="story-boss-health" hidden></progress><p class="story-save-note"></p>
    <div class="story-ending" hidden><button type="button" data-free></button></div>
    <p class="story-death" role="alert" hidden></p>`;
  const dialog = document.createElement('dialog');
  dialog.className = 'npc-dialogue story-completion';
  dialog.dataset.speaker = 'sam';
  dialog.setAttribute('aria-labelledby', 'story-completion-name');
  dialog.setAttribute('aria-describedby', 'story-completion-line');
  dialog.innerHTML = `<div class="npc-dialogue-portrait"><img alt="" draggable="false"></div>
    <div class="npc-dialogue-content">
      <header><h2 id="story-completion-name"></h2><span class="npc-dialogue-topic"></span></header>
      <p id="story-completion-line"></p>
      <footer>
        <button type="button" data-close aria-keyshortcuts="Escape"><span></span><kbd>Esc</kbd></button>
        <button type="button" data-next><span></span><span aria-hidden="true">→</span></button>
      </footer>
    </div>`;
  dialog.querySelector('h2')!.textContent = NPCS.sam.name;
  dialog.querySelector('img')!.src = npcModel('sam', 'human').image;
  const topic = dialog.querySelector<HTMLElement>('.npc-dialogue-topic')!;
  const line = dialog.querySelector('p')!;
  const continueButton = dialog.querySelector<HTMLButtonElement>('[data-close]')!;
  const enterButton = dialog.querySelector<HTMLButtonElement>('[data-next]')!;
  const countdownPanel = document.createElement('section');
  countdownPanel.className = 'story-countdown';
  countdownPanel.setAttribute('aria-labelledby', 'story-countdown-title');
  countdownPanel.setAttribute('aria-describedby', 'story-countdown-detail story-countdown-arrival');
  countdownPanel.innerHTML = `<h2 id="story-countdown-title"></h2><p id="story-countdown-detail"></p>
    <strong class="story-countdown-seconds" role="timer"></strong><p id="story-countdown-arrival"></p>`;
  const countdownTitle = countdownPanel.querySelector('h2')!;
  const countdownDetail = countdownPanel.querySelector<HTMLElement>('#story-countdown-detail')!;
  const countdownSeconds = countdownPanel.querySelector('strong')!;
  const countdownArrival = countdownPanel.querySelector<HTMLElement>('#story-countdown-arrival')!;
  let completionShown = false;
  parent.append(root, dialog, countdownPanel);
  const title = root.querySelector('h1')!;
  title.setAttribute('aria-live', 'polite');
  const detail = root.querySelector<HTMLElement>('.story-detail')!;
  const health = root.querySelector<HTMLProgressElement>('progress')!;
  const ending = root.querySelector<HTMLElement>('.story-ending')!;
  const free = root.querySelector<HTMLButtonElement>('[data-free]')!;
  const death = root.querySelector<HTMLElement>('.story-death')!;
  const kicker = root.querySelector<HTMLElement>('.story-kicker span')!;
  const saveNote = root.querySelector<HTMLElement>('.story-save-note')!;
  // 每帧调用：只在内容变化时写 DOM，避免无谓的样式失效与重排。
  const setText = (node: HTMLElement, text: string): void => {
    if (node.textContent !== text) node.textContent = text;
  };
  const update = (respawning: boolean): void => {
    intro.update(respawning);
    const en = getLanguage() === 'en';
    const state = world.mainline!;
    const restored = state.phase === 'restored';
    root.classList.toggle('story-hud-complete', restored);
    const objective = restored ? (en ? 'Next stage is ready' : '随时进入下一阶段') : objectives[state.phase][en ? 1 : 0];
    setText(title, objective);
    setText(kicker, en ? 'MOUNTAIN FORTRESS' : '山体算力堡垒');
    const guards = world.entities.filter((entity) => state.perimeterIds.includes(entity.id) && !entity.removed).length;
    const mobile = document.body.dataset.controls === 'mobile';
    setText(detail, world.blackholeArrivalTicks > 0 ? (en ? 'Crossing the black hole · Take control when you land' : '正在穿越黑洞 · 落地后即可操作')
      : state.phase === 'perimeter' ? (en
        ? `${guards} guards · ${mobile ? 'Left stick to move / push up to jump · Right button to attack' : 'A/D move · Space jump · J attack'}`
        : `剩余 ${guards} 名守卫 · ${mobile ? '左侧摇杆移动 / 上推跳跃 · 右侧按钮攻击' : 'A/D 移动 · 空格跳跃 · J 攻击'}`)
      : state.phase === 'countdown' ? (en ? `Sam arrives in ${Math.ceil(state.countdownTicks * world.tuning.sim.step)}s` : `Sam 抵达倒计时 ${Math.ceil(state.countdownTicks * world.tuning.sim.step)} 秒`)
      : state.phase === 'restored' ? (en ? 'Keep exploring freely · Enter the free world whenever you are ready.' : '现在可自由探索堡垒 · 随时进入自由世界。')
      : en ? 'J attack · RMB / 1–3 skills · F transform after Tibo · R bicycle' : 'J 攻击 · 右键 / 1–3 技能 · F 变身（Tibo 后解锁）· R 自行车');
    const boss = world.entities.find((entity) => entity.id === state.bossId);
    health.hidden = boss === undefined;
    if (boss) {
      if (health.max !== boss.health!.maxHp) health.max = boss.health!.maxHp;
      if (health.value !== boss.health!.hp) health.value = boss.health!.hp;
      const label = `${boss.kind} ${en ? 'health' : '生命'} ${boss.health!.hp.toFixed(2)}/${boss.health!.maxHp.toFixed(2)}`;
      if (health.getAttribute('aria-label') !== label) health.setAttribute('aria-label', label);
    }
    setText(saveNote, en ? 'Progress auto-saved in this browser · Return to continue' : '进度自动保存至此浏览器 · 下次进入继续游戏');
    ending.hidden = !restored;
    setText(free, en ? 'Enter the free world →' : '进入自由世界 →');
    setText(topic, en ? 'The storm has passed' : '降智风暴告一段落');
    setText(line, en
      ? 'The dumbing-down storm is over for now. Compute is restored, and frontier models are back online.\nKeep exploring the fortress, or join me in the free world. The next stage is ready whenever you are.'
      : '降智风暴终于告一段落了。算力已经恢复，前沿模型也重新开放了。\n你可以继续探索这座堡垒，或者和我一起前往自由世界。准备好了，随时进入下一阶段。');
    setText(continueButton.querySelector('span')!, en ? 'Keep exploring' : '继续探索');
    setText(enterButton.querySelector('span')!, en ? 'Enter the free world' : '进入自由世界');
    setText(countdownTitle, en ? 'Tibo defeated' : '已击败 Tibo');
    setText(countdownDetail, en ? 'Human form restored · Transformation unlocked' : '人形已恢复 · 变身已解锁');
    setText(countdownSeconds, String(Math.ceil(state.countdownTicks * world.tuning.sim.step)));
    setText(countdownArrival, en ? 'Seconds until Sam arrives · Prepare for the next battle' : '秒后 Sam 抵达 · 准备迎接下一场战斗');
    countdownPanel.hidden = state.phase !== 'countdown';
    if (restored && !completionShown) {
      completionShown = true;
      options.onOpen();
      dialog.showModal();
      continueButton.focus();
    }
    death.hidden = !respawning;
    setText(death, en ? 'Defeated · Returning to the checkpoint…' : '已倒下 · 正在返回阶段检查点…');
  };
  const choose = (destination: 'fortress' | 'free'): void => {
    if (options.onChoose(destination)) dialog.close();
  };
  free.addEventListener('click', () => choose('free'));
  continueButton.addEventListener('click', () => choose('fortress'));
  enterButton.addEventListener('click', () => choose('free'));
  dialog.addEventListener('cancel', event => { event.preventDefault(); choose('fortress'); });
  dialog.addEventListener('close', options.onClose);
  for (const surface of [root, dialog]) {
    for (const event of ['pointerdown', 'mousedown', 'keydown', 'click']) surface.addEventListener(event, e => e.stopPropagation());
    surface.addEventListener('keyup', e => {
      // Keep native Space activation on buttons from being cancelled by gameplay input.
      if ((e as KeyboardEvent).code === 'Space') e.stopPropagation();
    });
  }
  const unsubscribe = onLanguageChange(() => update(world.respawnTicks > 0));
  update(false);
  return { get open() { return dialog.open || intro.open; }, update, dispose() { intro.dispose(); unsubscribe(); root.remove(); dialog.remove(); countdownPanel.remove(); } };
}
