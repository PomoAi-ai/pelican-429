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
      section.insertAdjacentHTML('beforeend', en ? `
        <div class="dev-catalog-description">
          <h2>Start your adventure</h2><p>Start game begins the story. Continue game resumes progress saved in this browser. Start over asks for confirmation before clearing that progress.</p>
          <h2>Explore and navigate</h2><p>Free world opens free exploration. Resources contains asset showcases; Scenes contains chapters, the prelude and mobile controls.</p>
          <h2>Controls</h2><p>Use the in-game help and settings for keyboard, mouse and touch controls. Open Scenes → Mobile showcase to try the touch interface.</p>
          <h2>More room to explore</h2><p>Use the top handle to collapse navigation on showcase pages. In the game, use its own Home / Navigation control.</p>
          <h2>About Pelican 429</h2><p>An independent side-scrolling action adventure in development. Follow Grassy and Pelican through a world of computing power and ruins. Source code, updates and the community are available through the GitHub, X and WeChat icons above.</p>
        </div>` : `
        <div class="dev-catalog-description">
          <h2>开始冒险</h2><p>“开始游戏”进入主线；有存档时显示“继续游戏”，从当前浏览器保存的进度继续。“重头开始”会先询问确认，再清除主线进度。</p>
          <h2>探索与导航</h2><p>“自由世界”进入自由探索；“资源”集中查看游戏素材；“场景”可进入章节、序章动画和手机展示。</p>
          <h2>操作帮助</h2><p>键盘、鼠标和触屏操作可在游戏内的帮助与设置中查看。想体验触屏界面，可打开“场景 → 手机展示”。</p>
          <h2>留出更多画面</h2><p>展示页面可点击顶部把手收起导航。游戏场景使用游戏界面已有的“首页·导航”按钮展开菜单。</p>
          <h2>关于鹈鹕 429</h2><p>一款正在制作中的独立横版动作冒险游戏。跟随 Grassy 与鹈鹕，在算力与废墟交织的世界里探索。源码、动态和交流群入口位于顶部的 GitHub、X、微信图标。</p>
        </div>`);
    }
  };
  render();
  onLanguageChange(render);
  page.hidden = false;
  document.getElementById('loading')!.hidden = true;
}
