import { getLanguage, onLanguageChange } from './language.ts';

/** The resource directory uses the same links as navigation, including release filtering. */
export function mountSitePage(mode: 'catalog' | 'about', navigation: HTMLElement): void {
  document.body.classList.add('site-home');
  const page = document.getElementById('dev-index')!;
  const section = page.querySelector('section')!;
  const render = (): void => {
    const en = getLanguage() === 'en';
    const title = mode === 'catalog' ? (en ? 'Resource library' : '资源总览') : (en ? 'Help & about' : '帮助与关于');
    document.title = `${title} · ${en ? 'Pelican' : '鹈鹕'} 429`;
    section.innerHTML = `<p class="home-eyebrow">PELICAN 429 / ${mode === 'catalog' ? 'LIBRARY' : 'HELP'}</p><h1>${title}</h1>`;
    if (mode === 'catalog') {
      const description = document.createElement('p');
      description.className = 'dev-catalog-description';
      description.textContent = en ? 'Explore the characters, environments and sounds used in the game.' : '集中查看游戏里的角色、场景素材、声音与画质展示。';
      const links = document.createElement('nav');
      links.id = 'dev-catalog';
      links.setAttribute('aria-label', title);
      for (const source of navigation.querySelectorAll<HTMLAnchorElement>('#home-resources-menu a:not([data-page="catalog"])')) {
        const link = document.createElement('a');
        link.href = source.href;
        link.textContent = source.textContent;
        links.append(link);
      }
      const cast = document.createElement('a');
      cast.href = './#home-cast';
      cast.textContent = en ? 'Meet the characters' : '角色介绍';
      links.append(cast);
      section.append(description, links);
      if (import.meta.env.PROD && import.meta.env.MODE !== 'full') {
        const note = document.createElement('p');
        note.className = 'dev-catalog-description';
        note.textContent = en ? 'Interactive asset showcases are available in the local full edition.' : '交互式角色、场景和声音展示在本地完整版中提供。';
        section.append(note);
      }
    } else {
      section.className = 'help-page';
      section.innerHTML = aboutPage(en);
    }
  };
  render();
  onLanguageChange(render);
  page.hidden = false;
  document.getElementById('loading')!.hidden = true;
}

function aboutPage(en: boolean): string {
  const t = (zh: string, english: string): string => en ? english : zh;
  const controls = [
    ['A / D · ← / →', t('左右奔跑；按住 Shift 慢走', 'Run left / right; hold Shift to walk')],
    ['Space / W / ↑', t('跳跃；按住跳得更高', 'Jump; hold to jump higher')],
    ['S / ↓', t('穿过悬浮平台；空中俯冲；水中下潜', 'Drop through platforms; dive in air or water')],
    [t('左键 / J / K', 'Left click / J / K'), t('普攻：鹈鹕吐水，Grassy 砸键盘', 'Attack: water spray as Pelican, keyboard strike as Grassy')],
    ['F', t('切换鹈鹕与 Grassy（主线随剧情解锁）', 'Switch between Pelican and Grassy (unlocked in the story)')],
    ['R', t('上车 / 下车；骑行腾空后按空格弃车起飞', 'Mount / dismount; press Space while riding in air to launch')],
    [t('右键', 'Right click'), t('副攻：鹈鹕释放鱼群轰炸', 'Secondary attack: fish barrage as Pelican')],
    ['1 · 2 · 3 / E', t('释放技能；鹈鹕对应突进、反击、光子爆裂', 'Use skills: wing dash, counter and Photon Burst as Pelican')],
    ['M', t('打开地图；滚轮或 + / − 缩放', 'Open map; use the wheel or + / − to zoom')],
    ['Esc / O · H', t('打开设置并暂停 · 显示 / 隐藏操作提示', 'Open settings and pause · show / hide control hints')],
  ];
  const questions = [
    [t('进度保存在哪里？换设备能继续吗？', 'Where is my progress saved? Can I switch devices?'), t('主线会自动保存在当前浏览器中，包括阶段推进和离开页面时的进度。请使用同一设备、同一浏览器和同一网址继续；目前没有账号或云端同步，清除网站数据会丢失存档。', 'Story progress saves automatically in this browser, including phase changes and when leaving the page. Continue on the same device, browser and site address. There are no accounts or cloud saves; clearing site data removes your save.')],
    [t('如何继续，或重新开始？', 'How do I continue or start over?'), t('顶部“继续游戏”会读取已有主线进度。点它右侧的下拉箭头，选择“重新开始”，确认后才会清除主线存档；取消会保留原进度。', 'Use Continue game in the top navigation to resume. Its adjacent arrow offers Start over, which asks for confirmation before clearing story progress. Cancelling keeps your save.')],
    [t('为什么飞不起来，或在水里掉血？', 'Why can’t I fly, or why am I losing health underwater?'), t('鹈鹕在空中按住空格飞行，松开滑翔，飞行受能量限制。水中按住空格 / W 上浮，到水面后再按一次跃出；氧气耗尽会持续扣血。留意游戏里的能量与氧气提示。', 'As Pelican, hold Space in air to fly and release to glide; flight uses energy. Hold Space / W underwater to rise, then press again at the surface to jump out. Running out of oxygen drains health. Watch the energy and oxygen indicators.')],
    [t('画面卡顿或没有声音怎么办？', 'What if the game is slow or silent?'), t('打开设置 → 画面，尝试低画质，并开启 FPS 查看帧率变化。没有声音时，先点击游戏画面，再检查设备音量和浏览器标签页是否静音。', 'Open Settings → Graphics, try low quality and enable FPS to check performance. For silent audio, first click the game, then check your device volume and whether the browser tab is muted.')],
    [t('手机如何全屏或添加到主屏幕？', 'How do I use fullscreen or install on mobile?'), t('使用游戏画面上方的“全屏”和“添加到主屏幕”入口；安装指引会按当前浏览器显示。横屏游玩能留出更多操作空间，也可在游戏菜单中切换“电脑 · 键鼠”和“手机 · 横屏”布局。', 'Use Fullscreen and Add to Home Screen above the game; the installation guide adapts to your browser. Landscape gives the controls more room. The game menu also lets you switch between Desktop and Mobile layouts.')],
  ];
  return `
    <header class="help-hero">
      <div><p class="home-eyebrow">PELICAN 429 / FIELD GUIDE</p>
        <h1>${t('冒险，从这里上手。', 'Your adventure starts here.')}</h1>
        <p>${t('怎么移动、如何战斗、进度存在哪——出发前需要知道的，都在这里。', 'Movement, combat and saved progress. Everything you need before heading out.')}</p>
        <a class="help-primary" href="./?mode=story">${t('进入主线', 'Enter the story')} <span aria-hidden="true">→</span></a>
        <a class="help-text-link" href="./?mode=game">${t('去自由世界练习', 'Practice in free world')} <span aria-hidden="true">↗</span></a>
      </div>
      <figure><img src="./resources/home/fortress-overview.webp" alt="${t('山体堡垒与海边都市的游戏实景', 'In-game view of the mountain fortress and coastal city')}" /><figcaption>01 / ${t('山体堡垒 · 开发中试玩', 'MOUNTAIN FORTRESS · IN DEVELOPMENT')}</figcaption></figure>
    </header>
    <div class="help-layout">
      <nav class="help-index" aria-label="${t('帮助页目录', 'Help contents')}">
        <p>${t('帮助与关于', 'Help & about')}</p>
        <a href="#help-start">01 <span>${t('快速开始', 'Quick start')}</span></a>
        <a href="#help-controls">02 <span>${t('操作指南', 'Controls')}</span></a>
        <a href="#help-faq">03 <span>${t('常见问题', 'Common questions')}</span></a>
        <a href="#help-about">04 <span>${t('关于这个世界', 'About this world')}</span></a>
      </nav>
      <div class="help-content">
        <section id="help-start" class="help-block">
          <p class="home-eyebrow">01 / GET STARTED</p><h2>${t('选一条出发的路', 'Choose where to begin')}</h2>
          <div class="help-start-grid">
            <a href="./?mode=story"><span class="help-tag">${t('首次游玩', 'FIRST TIME')}</span><h3>${t('跟随主线', 'Follow the story')} <span aria-hidden="true">↗</span></h3><p>${t('从序章进入山体堡垒，跟随剧情熟悉探索与战斗。已有存档会继续进度。', 'Begin with the prelude and explore the fortress. An existing save resumes your progress.')}</p></a>
            <a href="./?mode=game"><span class="help-tag">${t('自由练习', 'EXPLORE')}</span><h3>${t('自由世界', 'Free world')} <span aria-hidden="true">↗</span></h3><p>${t('试试移动、飞行、变身和技能，按自己的节奏探索。', 'Try movement, flight, transformations and skills at your own pace.')}</p></a>
            <a href="./?mode=intro&amp;opening=finale"><span class="help-tag">${t('了解故事', 'THE PRELUDE')}</span><h3>${t('观看序章', 'Watch the prelude')} <span aria-hidden="true">↗</span></h3><p>${t('一场 AGI 降智风暴，一个被 429 截断的未来。看看一切如何开始。', 'An AGI storm. A future interrupted by 429. See how it all began.')}</p></a>
          </div>
        </section>
        <section id="help-controls" class="help-block">
          <p class="home-eyebrow">02 / CONTROLS</p><h2>${t('先学会走，再试着飞', 'Walk first. Then take flight.')}</h2>
          <p>${t('以下为默认键位。技能随形态变化，当前技能与冷却以游戏内技能栏为准。', 'Default controls are listed below. Skills change with your form; check the in-game skill bar for abilities and cooldowns.')}</p>
          <div class="help-controls-grid"><div class="help-keyboard"><h3>${t('键盘与鼠标', 'Keyboard & mouse')}</h3><dl>${controls.map(([key, description]) => `<div><dt><kbd>${key}</kbd></dt><dd>${description}</dd></div>`).join('')}</dl></div>
            <aside class="help-touch"><span class="help-tag">${t('触屏游玩', 'TOUCH CONTROLS')}</span><h3>${t('左手移动，右手行动', 'Move left. Act right.')}</h3>
              <p>${t('左侧摇杆轻推慢走、推远奔跑，上推跳跃或飞行，下推下平台或下潜。右侧按钮负责跳跃、普攻、变身和骑乘；按住普攻会自动瞄准屏内最近的敌人。', 'Push the left stick gently to walk, farther to run, up to jump or fly, and down to drop or dive. Use the right buttons to jump, attack, transform and ride. Hold attack to target the nearest enemy on screen.')}</p>
              <p>${t('轻点技能键快速释放；支持瞄准的技能可按住拖动方向，松手释放。', 'Tap a skill for a quick cast. For aimable skills, hold and drag to choose a direction, then release to cast.')}</p>
              <a class="help-text-link" href="./?mode=controls&amp;level=test">${t('试用触屏操作', 'Try touch controls')} <span aria-hidden="true">→</span></a>
              <div class="help-tip"><strong>${t('随时暂停', 'Take a break')}</strong><p>${t('键盘按 Esc / O，或打开游戏菜单 → 设置。H 可随时重新显示操作提示。', 'Press Esc / O, or open the game menu → Settings. Press H whenever you need control hints.')}</p></div>
            </aside>
          </div>
        </section>
        <section id="help-faq" class="help-block">
          <p class="home-eyebrow">03 / GOOD TO KNOW</p><h2>${t('遇到问题，先看这里', 'A few useful answers')}</h2>
          <div class="help-faq">${questions.map(([question, answer]) => `<details><summary>${question}</summary><p>${answer}</p></details>`).join('')}</div>
        </section>
        <section id="help-about" class="help-block help-about">
          <img src="./resources/home/pelican.webp" alt="${t('戴绿帽、系红围巾的鹈鹕', 'Pelican in a green hat and red scarf')}" loading="lazy" />
          <div><p class="home-eyebrow">04 / BEYOND THE 429</p><h2>${t('一只鹈鹕，一个不愿放弃的世界。', 'A pelican. A world that won’t give up.')}</h2>
            <p>${t('《鹈鹕 429》是小草正在制作的横版动作冒险游戏。跟随 Grassy 与鹈鹕，穿过自然遗迹与巨大机房，在算力与废墟之间寻找下一条路。', 'Pelican 429 is a side-scrolling action adventure in development by Grassy. Follow Grassy and Pelican through natural ruins and vast server halls, searching for a way forward.')}</p>
            <p>${t('当前提供序章和主线试玩，剧情与关卡仍在完善。发现问题时，请附上所在场景、设备与浏览器、复现步骤和截图。', 'The prelude and a playable story are available, with more work underway. When reporting an issue, include the scene, device, browser, reproduction steps and a screenshot.')}</p>
            <div class="help-about-links"><a href="https://github.com/PomoAi-ai/pelican-429" target="_blank" rel="noopener">GitHub ↗</a><a href="https://github.com/PomoAi-ai/pelican-429/issues" target="_blank" rel="noopener">${t('反馈问题', 'Report an issue')} ↗</a><a href="https://x.com/grassy429" target="_blank" rel="noopener">${t('关注作者', 'Follow the creator')} ↗</a><button type="button" popovertarget="home-wechat-pop">${t('微信交流群', 'WeChat community')}</button></div>
          </div>
        </section>
        <footer class="help-footer">PELICAN 429 <span>${t('准备好了，就出发。', 'Ready when you are.')} <a href="./?mode=story">${t('进入游戏', 'Play now')} →</a></span></footer>
      </div>
    </div>`;
}
