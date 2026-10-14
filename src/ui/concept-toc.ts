/** 概念目录：滚动高亮当前章节、同名 details 原生手风琴、关键字筛选，窄屏时作为抽屉打开。 */
export function addConceptToc(page: HTMLElement, scroller: HTMLElement): () => void {
  const toc = page.querySelector<HTMLElement>('#concepts-toc')!;
  const toggle = page.querySelector<HTMLButtonElement>('.concepts-toc-toggle')!;
  const search = toc.querySelector<HTMLInputElement>('.concepts-toc-search')!;
  const groups = [...toc.querySelectorAll<HTMLDetailsElement>('.concepts-nav-group')];
  const entries = [...toc.querySelectorAll<HTMLAnchorElement>('.concepts-nav-group a[href^="#"]')].map(link => {
    const target = page.querySelector<HTMLElement>(link.hash);
    if (!target) throw new Error(`概念目录指向不存在的章节：${link.hash}`);
    return { link, target, group: link.closest<HTMLDetailsElement>('details')! };
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
    const line = scroller.getBoundingClientRect().top + 96;
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
    if (!search.value) next.group.open = true;
    reveal(next.link);
  };
  const onScroll = (): void => { if (!frame) frame = requestAnimationFrame(spy); };

  search.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase();
    // 筛选时需要同时展开多个组，暂时去掉 name 解除互斥。
    for (const group of groups) {
      if (query) group.removeAttribute('name');
      else group.setAttribute('name', 'concepts-toc');
      let matches = 0;
      for (const link of group.querySelectorAll('a')) {
        link.hidden = query !== '' && !link.textContent!.toLowerCase().includes(query);
        if (!link.hidden) matches += 1;
      }
      group.hidden = matches === 0;
      group.open = query ? matches > 0 : group === active?.group;
    }
  });
  toggle.addEventListener('click', () => setDrawer(!toc.classList.contains('concepts-toc-open')));
  toc.addEventListener('click', event => {
    if (event.target instanceof Element && event.target.closest('a')) setDrawer(false);
  });
  scroller.addEventListener('scroll', onScroll, { passive: true });
  spy();
  return () => {
    cancelAnimationFrame(frame);
    scroller.removeEventListener('scroll', onScroll);
  };
}
