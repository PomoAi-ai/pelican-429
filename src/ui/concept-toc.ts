/** 概念目录：滚动高亮当前章节、同名 details 原生手风琴、关键字筛选，窄屏时作为抽屉打开。 */
export function addConceptToc(page: HTMLElement, scroller: HTMLElement): () => void {
  const toc = page.querySelector<HTMLElement>('#concepts-toc')!;
  const toggle = page.querySelector<HTMLButtonElement>('.concepts-toc-toggle')!;
  const search = toc.querySelector<HTMLInputElement>('.concepts-toc-search')!;
  const groups = [...toc.querySelectorAll<HTMLDetailsElement>('.concepts-nav-group')];
  const entries = [...toc.querySelectorAll<HTMLAnchorElement>('.concepts-nav-group a[href^="#"]')].map(link => {
    const target = document.getElementById(decodeURIComponent(link.hash.slice(1)));
    if (!target) throw new Error(`概念目录指向不存在的章节：${link.hash}`);
    return { link, target, group: link.closest<HTMLDetailsElement>('.concepts-nav-group')!,
      category: link.closest<HTMLDetailsElement>('.concepts-nav-category') };
  });
  let active: (typeof entries)[number] | null = null;
  let frame = 0;

  const setDrawer = (open: boolean): void => {
    toc.classList.toggle('concepts-toc-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };
  const reveal = (link: HTMLElement): void => {
    const box = toc.getBoundingClientRect();
    const row = link.getBoundingClientRect();
    if (row.top < box.top || row.bottom > box.bottom) toc.scrollTop += row.top - box.top - box.height / 3;
  };
  const spy = (): void => {
    frame = 0;
    const line = scroller.getBoundingClientRect().top + 40;
    // 章节按文档顺序排列；取最后一个已越过阅读线的章节。折叠内容里的锚点高度为 0，自然跳过。
    let next = entries[0]!;
    for (const entry of entries) {
      const rect = entry.target.getBoundingClientRect();
      if (rect.height > 0 && rect.top <= line) next = entry;
    }
    if (next === active) return;
    active?.link.removeAttribute('aria-current');
    active = next;
    next.link.setAttribute('aria-current', 'location');
    if (!search.value) {
      next.group.open = true;
      if (next.category) next.category.open = true;
    }
    if (next.link.getBoundingClientRect().height > 0) reveal(next.link);
  };
  const onScroll = (): void => { if (!frame) frame = requestAnimationFrame(spy); };

  search.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase();
    // 筛选时需要同时展开多个组，暂时去掉 name 解除互斥。
    for (const group of groups) {
      if (query) group.removeAttribute('name');
      else group.setAttribute('name', 'concepts-toc');
      const groupMatches = group.querySelector('summary')!.textContent.toLowerCase().includes(query);
      for (const link of group.querySelectorAll('a')) {
        const category = link.closest('.concepts-nav-category');
        const categoryMatches = category !== null && category.querySelector('summary')!.textContent.toLowerCase().includes(query);
        link.hidden = query !== '' && !groupMatches && !categoryMatches && !link.textContent.toLowerCase().includes(query);
      }
      for (const category of group.querySelectorAll<HTMLDetailsElement>('.concepts-nav-category')) {
        category.hidden = !category.querySelector('a:not([hidden])');
        // 命中具体材料时保留它的类别，避免搜索结果失去所属关系。
        category.querySelector<HTMLAnchorElement>('summary a')!.hidden = category.hidden;
        category.open = query ? !category.hidden : category === active?.category;
      }
      group.hidden = !groupMatches && !group.querySelector('a:not([hidden])');
      const titleLink = group.querySelector<HTMLAnchorElement>(':scope > summary a');
      if (titleLink) titleLink.hidden = group.hidden;
      group.open = query ? !group.hidden : group === active?.group;
    }
    if (!query && active) reveal(active.link);
  });
  toggle.addEventListener('click', () => setDrawer(!toc.classList.contains('concepts-toc-open')));
  toc.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>('a');
    if (!link) return;
    const entry = entries.find(item => item.link === link)!;
    entry.group.open = true;
    if (entry.category) entry.category.open = true;
    if (!link.closest('summary')) setDrawer(false);
  });
  const onHash = (): void => {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target && page.contains(target)) target.scrollIntoView();
    onScroll();
  };
  scroller.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('hashchange', onHash);
  onHash();
  return () => {
    cancelAnimationFrame(frame);
    scroller.removeEventListener('scroll', onScroll);
    window.removeEventListener('hashchange', onHash);
  };
}
