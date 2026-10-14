import { ART_LIBRARY_GROUPS, type ArtLibraryGroup } from '../config/art-library.ts';
import { buildClassicsGroup, buildRosterGroup, type ClassicsDefinitions, type RosterDefinitions } from '../config/art-library-sets.ts';
import { getLanguage, onLanguageChange } from './language.ts';
import { guidedImageUrl } from './ruler-guides.ts';

type ArtEntry = ArtLibraryGroup['entries'][number];

const STATUS_LABELS = {
  confirmed: ['已确认原画', 'Confirmed artwork'],
  derived: ['确认稿派生', 'Derived from approved design'],
  candidate: ['待核对', 'Pending confirmation'],
} as const;

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} 读取失败：${response.status}`);
  return response.json() as Promise<T>;
}

/** 24 款与古典角色的条目来自 public 下的定义 JSON；读取一次，排在角色设定之后。 */
export async function loadArtLibraryGroups(): Promise<readonly ArtLibraryGroup[]> {
  const [roster, classics] = await Promise.all([
    fetchJson<RosterDefinitions>('./art-library/roster-24/definitions/roster.json'),
    fetchJson<ClassicsDefinitions>('./art-library/classics-7/definitions.json'),
  ]);
  const [characters, ...rest] = ART_LIBRARY_GROUPS;
  return [characters!, buildRosterGroup(roster), buildClassicsGroup(classics, roster.common.proportion.targetHeads), ...rest];
}

/**
 * 原画资料库页（?mode=catalog）：顶部标签切换分组，每组是一张长页，左侧目录按锚点跳转。
 */
export function mountArtLibraryView(section: HTMLElement, groups: readonly ArtLibraryGroup[]): void {
  section.className = 'showcase-app sc-character-stage art-library';
  const entries = groups.flatMap(group => group.entries);
  const groupOf = (entry: ArtEntry): ArtLibraryGroup => groups.find(group => group.entries.includes(entry))!;
  // 地址锚点可以是条目 id（切到所在分组并滚到该条）或分组 id（只切标签）；未知锚点忽略。
  const fromHash = (): ArtEntry | undefined => {
    const id = decodeURIComponent(location.hash.slice(1));
    return groups.find(group => group.id === id)?.entries[0] ?? entries.find(entry => entry.id === id);
  };
  let current: ArtEntry = fromHash() ?? entries[0]!;
  let tab = groupOf(current);
  let query = '';
  let frame = 0;
  const text = (value: readonly [string, string]): string => value[getLanguage() === 'en' ? 1 : 0];
  const detail = (): HTMLElement => section.querySelector<HTMLElement>('.art-library-detail')!;
  const sectionOf = (entry: ArtEntry): HTMLElement => section.querySelector<HTMLElement>(`#${CSS.escape(entry.id)}`)!;

  const entryHtml = (entry: ArtEntry, index: number): string => {
    const subgroup = entry.subgroup && entry.subgroup[0] !== tab.entries[index - 1]?.subgroup?.[0]
      ? `<p class="art-library-entry-subgroup">${text(entry.subgroup)}</p>` : '';
    return `
    <section class="art-library-entry" id="${entry.id}" aria-labelledby="${entry.id}-title">
      ${subgroup}
      <header class="art-library-entry-heading">
        <span class="art-library-status" data-status="${entry.status}">${text(STATUS_LABELS[entry.status])}</span>
        <h2 id="${entry.id}-title">${text(entry.title)}</h2>
        <p>${text(entry.description)}</p>
      </header>
      <div class="art-library-evidence"><strong>${text(['确认与来源', 'Approval & provenance'])}</strong><p>${text(entry.evidence)}</p></div>
      ${entry.facts ? `<dl class="art-library-facts">${entry.facts.map(([label, value]) => `<dt>${text(label)}</dt><dd>${value}</dd>`).join('')}</dl>` : ''}
      ${entry.files ? `<p class="art-library-files"><strong>${text(['附件', 'Files'])}</strong>${entry.files.map(file => `<a href="${file.path}" target="_blank" rel="noopener">${text(file.label)} ↗</a>`).join('')}</p>` : ''}
      <div class="art-library-images">
        ${entry.images.map((image, imageIndex) => `
          <figure>
            <a href="${image.path}" target="_blank" rel="noopener" aria-label="${text(image.label)} · ${text(['新标签打开原图', 'Open original in a new tab'])}">
              <img src="${image.path}" alt="${text(image.label)}" loading="${index === 0 && imageIndex === 0 ? 'eager' : 'lazy'}" decoding="async" />
            </a>
            <figcaption><span>${text(image.label)}</span><span class="art-library-figure-actions">${image.guides ? `<button type="button" data-art-guides="${image.guides}" data-art-plain="${image.path}" aria-pressed="true">${text(['隐藏虚线', 'Hide guides'])}</button>` : ''}<a href="${image.path}" target="_blank" rel="noopener">${text(['查看原图', 'Open original'])} ↗</a></span></figcaption>
          </figure>`).join('')}
      </div>
    </section>`;
  };

  const markCurrent = (): void => {
    for (const button of section.querySelectorAll<HTMLButtonElement>('[data-art-entry]')) {
      const on = button.dataset.artEntry === current.id;
      button.setAttribute('aria-current', String(on));
      button.parentElement!.classList.toggle('sc-selected', on);
      if (on) button.scrollIntoView({ block: 'nearest' });
    }
  };

  const renderDirectory = (): void => {
    const search = query.trim().toLocaleLowerCase();
    // 不搜索时只列当前标签；搜索时跨全部分组，点结果会切到对应标签。
    const visible = (search ? groups : [tab]).map(group => ({
      ...group,
      entries: group.entries.filter(entry => [...group.label, ...entry.title, ...entry.description].join(' ').toLocaleLowerCase().includes(search)),
    })).filter(group => group.entries.length > 0);
    const count = visible.reduce((sum, group) => sum + group.entries.length, 0);
    section.querySelector('.art-library-count')!.textContent = String(count);
    const row = (entry: ArtEntry): string => `
          <div class="sc-stage-directory-row">
            <button type="button" class="sc-stage-select" data-art-entry="${entry.id}">
              <img src="${entry.images[0]!.path}" alt="" loading="lazy" decoding="async" />
              <span class="sc-stage-subject"><strong>${text(entry.title)}</strong><span class="sc-stage-subject-count" data-status="${entry.status}">${text(STATUS_LABELS[entry.status])} · ${entry.images.length} ${text(['张', 'images'])}</span></span>
            </button>
          </div>`;
    section.querySelector('.sc-stage-directory')!.innerHTML = count === 0
      ? `<p class="sc-no-results">${text(['没有匹配的原画', 'No matching artwork'])}</p>`
      : visible.map(group => `
      <div class="art-library-group">
        ${search ? `<h3>${text(group.label)}<span>${group.entries.length}</span></h3>` : ''}
        ${group.entries.map((entry, index) => {
          const title = entry.subgroup && entry.subgroup[0] !== group.entries[index - 1]?.subgroup?.[0]
            ? `<h4 class="art-library-subgroup">${text(entry.subgroup)}<span>${group.entries.filter(item => item.subgroup?.[0] === entry.subgroup![0]).length}</span></h4>` : '';
          return title + row(entry);
        }).join('')}
      </div>`).join('');
    markCurrent();
  };

  // 长页阅读位置：取最后一个顶边越过阅读线的条目，同步目录高亮与地址锚点。
  const spy = (): void => {
    frame = 0;
    const line = detail().getBoundingClientRect().top + 80;
    let next = tab.entries[0]!;
    for (const entry of tab.entries) if (sectionOf(entry).getBoundingClientRect().top <= line) next = entry;
    if (next === current) return;
    current = next;
    history.replaceState(null, '', `#${current.id}`);
    markCurrent();
  };

  // 标尺图的虚线由程序叠画，默认显示；按钮在叠线图与原图之间切换。
  const setGuides = (button: HTMLButtonElement, on: boolean): void => {
    const plain = button.dataset.artPlain!;
    const image = button.closest('figure')!.querySelector('img')!;
    button.setAttribute('aria-pressed', String(on));
    button.textContent = text(on ? ['隐藏虚线', 'Hide guides'] : ['显示虚线', 'Show guides']);
    if (!on) { image.src = plain; return; }
    void guidedImageUrl(plain, button.dataset.artGuides!).then((url) => {
      if (button.getAttribute('aria-pressed') === 'true') image.src = url;
    });
  };
  // 一页可能有几十张大图，滚到附近才叠线，避免进页时全部解码。
  const guidesObserver = new IntersectionObserver((records) => {
    for (const record of records) {
      if (!record.isIntersecting) continue;
      guidesObserver.unobserve(record.target);
      const button = record.target.querySelector<HTMLButtonElement>('[data-art-guides]')!;
      if (button.getAttribute('aria-pressed') === 'true') setGuides(button, true);
    }
  }, { rootMargin: '600px 0px' });

  const renderPage = (): void => {
    guidesObserver.disconnect();
    detail().innerHTML = tab.entries.map(entryHtml).join('');
    for (const button of section.querySelectorAll('[data-art-guides]')) guidesObserver.observe(button.closest('figure')!);
    for (const button of section.querySelectorAll<HTMLButtonElement>('[data-art-tab]')) {
      button.setAttribute('aria-selected', String(button.dataset.artTab === tab.id));
    }
    renderDirectory();
  };

  const show = (entry: ArtEntry): void => {
    if (groupOf(entry) !== tab) {
      tab = groupOf(entry);
      renderPage();
    }
    current = entry;
    history.replaceState(null, '', `#${entry.id}`);
    sectionOf(entry).scrollIntoView({ block: 'start' });
    markCurrent();
    section.classList.remove('sc-directory-open');
    section.querySelector('.sc-stage-directory-toggle')!.setAttribute('aria-expanded', 'false');
  };

  const render = (): void => {
    const title = text(['原画资料库', 'Concept art library']);
    document.title = `${title} · ${text(['鹈鹕', 'Pelican'])} 429`;
    section.innerHTML = `
      <aside class="sc-sidebar" id="art-library-directory">
          <div class="sc-brand"><span class="sc-brand-mark" aria-hidden="true">P</span><div><h1>${title}</h1><span>PELICAN 429 · ART ARCHIVE</span></div></div>
          <div class="sc-search"><input type="search" placeholder="${text(['搜索全部原画…', 'Search all artwork…'])}" aria-label="${text(['搜索原画目录', 'Search artwork index'])}" /></div>
          <div class="sc-directory-heading"><span>${text(['本页目录', 'On this page'])}</span><span class="art-library-count"></span></div>
          <nav class="sc-stage-directory" aria-label="${text(['原画目录', 'Artwork index'])}"></nav>
          <div class="sc-stage-sidebar-bottom"><a class="art-library-source" href="./art-library/SOURCE.md" target="_blank" rel="noopener">${text(['查看完整来源记录', 'View full provenance'])} ↗</a></div>
      </aside>
      <div class="sc-stage-main">
        <header class="sc-stage-toolbar">
          <button type="button" class="sc-stage-directory-toggle" aria-controls="art-library-directory" aria-expanded="false">☰ ${text(['目录', 'Directory'])}</button>
          <nav class="art-library-tabs" role="tablist" aria-label="${text(['原画分类', 'Artwork categories'])}">
            ${groups.map(group => `<button type="button" role="tab" data-art-tab="${group.id}">${text(group.label)}<span>${group.entries.length}</span></button>`).join('')}
          </nav>
        </header>
        <div class="art-library-detail"></div>
      </div>`;
    const searchInput = section.querySelector<HTMLInputElement>('.sc-search input')!;
    searchInput.value = query;
    searchInput.addEventListener('input', () => {
      query = searchInput.value;
      renderDirectory();
    });
    section.querySelector('.sc-stage-directory-toggle')!.addEventListener('click', event => {
      const open = section.classList.toggle('sc-directory-open');
      (event.currentTarget as HTMLButtonElement).setAttribute('aria-expanded', String(open));
    });
    detail().addEventListener('scroll', () => { if (!frame) frame = requestAnimationFrame(spy); }, { passive: true });
    renderPage();
    sectionOf(current).scrollIntoView({ block: 'start' });
    section.querySelector('[aria-selected="true"]')!.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  // 标签与目录按钮共用一个委托；section 只挂一次，语言切换重绘不会重复绑定。
  const onClick = (event: Event): void => {
    if (!(event.target instanceof Element)) return;
    const tabButton = event.target.closest<HTMLElement>('[data-art-tab]');
    if (tabButton) {
      tab = groups.find(group => group.id === tabButton.dataset.artTab)!;
      current = tab.entries[0]!;
      history.replaceState(null, '', `#${tab.id}`);
      renderPage();
      detail().scrollTop = 0;
      return;
    }
    const guidesButton = event.target.closest<HTMLButtonElement>('[data-art-guides]');
    if (guidesButton) {
      setGuides(guidesButton, guidesButton.getAttribute('aria-pressed') !== 'true');
      return;
    }
    const entryButton = event.target.closest<HTMLElement>('[data-art-entry]');
    if (entryButton) show(entries.find(entry => entry.id === entryButton.dataset.artEntry)!);
  };
  const onHashChange = (): void => {
    const entry = fromHash();
    if (entry && entry !== current) show(entry);
  };
  render();
  section.addEventListener('click', onClick);
  window.addEventListener('hashchange', onHashChange);
  onLanguageChange(render);
}
