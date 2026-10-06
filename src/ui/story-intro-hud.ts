import type { SimWorld } from '../sim/sim-world.ts';
import { getLanguage, onLanguageChange } from './language.ts';
import { PELICAN_SKILL_SLOTS } from './weapon-hud.ts';

export function createStoryIntroHud(parent: HTMLElement, world: SimWorld, options: {
  onOpen: () => void;
  onClose: () => void;
}) {
  let pending = world.mainline!.phase === 'perimeter';
  const dialog = document.createElement('dialog');
  dialog.className = 'story-intro';
  dialog.setAttribute('aria-labelledby', 'story-intro-title');
  dialog.innerHTML = `<header><p class="story-intro-kicker"></p><h2 id="story-intro-title"></h2></header>
    <p class="story-intro-pause"></p><section><h3 data-controls></h3><p data-movement></p><p data-mount></p></section>
    <section><h3 data-skills></h3><ul></ul><p data-transform></p></section>
    <section><h3 data-mission></h3><p data-objective></p></section>
    <footer><button type="button" autofocus></button></footer>`;
  const button = dialog.querySelector('button')!;
  const translate = (): void => {
    const en = getLanguage() === 'en';
    const mobile = document.body.dataset.controls === 'mobile' || (!document.body.dataset.controls && matchMedia('(pointer: coarse)').matches);
    const text = (selector: string, zh: string, english: string): void => {
      dialog.querySelector(selector)!.textContent = en ? english : zh;
    };
    text('.story-intro-kicker', '01 / 山体算力堡垒', '01 / MOUNTAIN FORTRESS');
    text('h2', '落地就绪，准备出发', 'Landed and ready to go');
    text('.story-intro-pause', '游戏已暂停，关闭提示后开始行动。', 'Game paused. Close this guide to begin.');
    text('[data-controls]', '移动与下车', 'Movement & bicycle');
    text('[data-movement]', mobile ? '左摇杆移动，上推跳跃；右侧「攻击」吐水攻击。' : 'A / D 或 ← / → 移动，空格 / W 跳跃；左键 / J 吐水攻击。',
      mobile ? 'Left stick to move, push up to jump; tap Attack to spray water.' : 'A / D or ← / → to move, Space / W to jump; left click / J to spray water.');
    text('[data-mount]', mobile ? '点「骑乘」上下车；下车后可使用全部技能。' : '按 R 下车 / 上车；下车后可使用全部技能。',
      mobile ? 'Tap Ride to mount / dismount. Dismount to use all skills.' : 'Press R to dismount / mount. Dismount to use all skills.');
    text('[data-skills]', '鹈鹕技能', 'Pelican skills');
    const list = dialog.querySelector('ul')!;
    list.replaceChildren(...PELICAN_SKILL_SLOTS.map((skill, index) => {
      const item = document.createElement('li');
      const key = document.createElement('kbd');
      key.textContent = mobile ? (en ? 'Tap' : '点按')
        : en && index === 0 ? 'RMB' : skill.key;
      item.append(key, ` ${en ? skill.en : skill.name}`);
      if (index === 1) item.append(en ? ' (invincible while dashing)' : '（突进期间无敌）');
      return item;
    }));
    text('[data-transform]', mobile ? '击败 Tibo 后解锁人形，点击角色切换按钮变身。' : '击败 Tibo 后解锁人形，按 F 自由变身。',
      mobile ? 'Defeat Tibo to unlock human form, then tap the form switch.' : 'Defeat Tibo to unlock human form, then press F to transform.');
    text('[data-mission]', '当前任务', 'Your mission');
    text('[data-objective]', '向右清理外围守卫 → 沿底层进入机房核心 → 击败 Tibo 与 Sam，恢复算力、结束降智风暴。',
      'Head right and clear the guards → Follow the lower floor into the core → Defeat Tibo and Sam to restore compute and end the storm.');
    button.textContent = en ? 'Got it — start playing' : '知道了，开始游戏';
  };
  button.addEventListener('click', () => dialog.close());
  button.addEventListener('keydown', event => {
    if (event.code === 'Space') {
      event.preventDefault();
      dialog.close();
    }
  });
  dialog.addEventListener('close', options.onClose);
  for (const event of ['pointerdown', 'mousedown', 'keydown', 'keyup', 'click']) {
    dialog.addEventListener(event, e => e.stopPropagation());
  }
  parent.append(dialog);
  translate();
  const unsubscribe = onLanguageChange(translate);
  return {
    get open() { return dialog.open; },
    update(respawning: boolean): void {
      if (respawning) pending = false;
      if (pending && world.blackholeArrivalTicks === 0 && world.entities.find(entity => entity.id === world.playerId)!.body.onGround) {
        pending = false;
        translate();
        options.onOpen();
        dialog.showModal();
      }
    },
    dispose(): void { unsubscribe(); dialog.remove(); },
  };
}
