import { ART_LIBRARY_GROUPS } from '../config/art-library.ts';
import { getLanguage, onLanguageChange } from './language.ts';

type ArtEntry = (typeof ART_LIBRARY_GROUPS)[number]['entries'][number];

const STATUS_LABELS = {
  confirmed: ['已确认原画', 'Confirmed artwork'],
  derived: ['确认稿派生', 'Derived from approved design'],
  candidate: ['待核对', 'Pending confirmation'],
} as const;

export function mountArtLibrary(): void {
  document.body.classList.add('site-home');
  const page = document.getElementById('dev-index')!;
  const section = page.querySelector('section')!;
  section.className = 'showcase-app sc-character-stage art-library';
  let selected: ArtEntry = ART_LIBRARY_GROUPS[0]!.entries[0]!;
  let includeCandidates = false;
  let query = '';
  const text = (value: readonly [string, string]): string => value[getLanguage() === 'en' ? 1 : 0];

  const renderDetail = (): void => {
    const detail = section.querySelector<HTMLElement>('.art-library-detail')!;
    detail.innerHTML = `
      <header class="art-library-entry-heading">
        <span class="art-library-status" data-status="${selected.status}">${text(STATUS_LABELS[selected.status])}</span>
        <h2 id="art-library-entry-title">${text(selected.title)}</h2>
        <p>${text(selected.description)}</p>
      </header>
      <div class="art-library-evidence"><strong>${text(['确认与来源', 'Approval & provenance'])}</strong><p>${text(selected.evidence)}</p></div>
      <div class="art-library-images">
        ${selected.images.map((image, index) => `
          <figure>
            <a href="${image.path}" target="_blank" rel="noopener" aria-label="${text(image.label)} · ${text(['新标签打开原图', 'Open original in a new tab'])}">
              <img src="${image.path}" alt="${text(image.label)}" loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async" />
            </a>
            <figcaption><span>${text(image.label)}</span><a href="${image.path}" target="_blank" rel="noopener">${text(['查看原图', 'Open original'])} ↗</a></figcaption>
          </figure>`).join('')}
      </div>`;
    for (const button of section.querySelectorAll<HTMLButtonElement>('[data-art-entry]')) {
      button.setAttribute('aria-current', button.dataset.artEntry === selected.id ? 'true' : 'false');
      button.parentElement!.classList.toggle('sc-selected', button.dataset.artEntry === selected.id);
    }
  };

  const renderDirectory = (): void => {
    const search = query.trim().toLocaleLowerCase();
    const groups = ART_LIBRARY_GROUPS.map(group => ({
      ...group,
      entries: group.entries.filter(entry => (includeCandidates || entry.status !== 'candidate')
        && [...group.label, ...entry.title, ...entry.description].join(' ').toLocaleLowerCase().includes(search)),
    })).filter(group => group.entries.length > 0);
    const count = groups.reduce((sum, group) => sum + group.entries.length, 0);
    section.querySelector('.art-library-count')!.textContent = String(count);
    const directory = section.querySelector('.sc-stage-directory')!;
    directory.innerHTML = groups.map(group => `
      <div class="art-library-group">
        <h3>${text(group.label)}<span>${group.entries.length}</span></h3>
        ${group.entries.map(entry => `
          <div class="sc-stage-directory-row ${entry.id === selected.id ? 'sc-selected' : ''}">
            <button type="button" class="sc-stage-select" data-art-entry="${entry.id}" aria-current="${entry.id === selected.id}">
              <img src="${entry.images[0]!.path}" alt="" loading="lazy" decoding="async" />
              <span class="sc-stage-subject"><strong>${text(entry.title)}</strong><span class="sc-stage-subject-count" data-status="${entry.status}">${text(STATUS_LABELS[entry.status])} · ${entry.images.length} ${text(['张', 'images'])}</span></span>
            </button>
          </div>`).join('')}
      </div>`).join('');
    if (count === 0) directory.innerHTML = `<p class="sc-no-results">${text(['没有匹配的原画', 'No matching artwork'])}</p>`;
    for (const group of groups) {
      for (const entry of group.entries) {
        directory.querySelector<HTMLButtonElement>(`[data-art-entry="${entry.id}"]`)!.addEventListener('click', () => {
          selected = entry;
          renderDetail();
          section.querySelector('.art-library-detail')!.scrollTop = 0;
          section.classList.remove('sc-directory-open');
          section.querySelector('.sc-stage-directory-toggle')!.setAttribute('aria-expanded', 'false');
        });
      }
    }
  };

  const render = (): void => {
    const title = text(['原画资料库', 'Concept art library']);
    document.title = `${title} · ${text(['鹈鹕', 'Pelican'])} 429`;
    section.innerHTML = `
      <aside class="sc-sidebar" id="art-library-directory">
          <div class="sc-brand"><span class="sc-brand-mark" aria-hidden="true">P</span><div><h1>${title}</h1><span>PELICAN 429 · ART ARCHIVE</span></div></div>
          <nav class="sc-library-tabs" aria-label="${text(['角色资料库导航', 'Character library navigation'])}">
            <a href="./?mode=showcase">${text(['角色场景', 'Characters'])}</a>
            <a href="./?mode=showcase&library=history">${text(['历史资料', 'History'])}</a>
            <a href="./?mode=compare">${text(['画质对比', 'Graphics'])}</a>
          </nav>
          <nav class="sc-library-tabs" aria-label="${text(['设计资料', 'Design references'])}">
            <a href="./?mode=concepts">${text(['基础概念定义', 'Basic concepts'])}</a>
            <a href="./art-library/roster-24/index.html">${text(['24款角色定义', '24 character definitions'])}</a>
            <a href="./?mode=art-library" aria-current="page">${title}</a>
          </nav>
          <div class="sc-search"><input type="search" placeholder="${text(['搜索原画…', 'Search artwork…'])}" aria-label="${text(['搜索原画目录', 'Search artwork index'])}" /></div>
          <label class="art-library-filter"><input type="checkbox" ${includeCandidates ? 'checked' : ''} />${text(['包含待核对稿', 'Include unconfirmed drafts'])}</label>
          <div class="sc-directory-heading"><span>${text(['原画目录', 'Artwork index'])}</span><span class="art-library-count"></span></div>
          <nav class="sc-stage-directory" aria-label="${text(['原画目录', 'Artwork index'])}"></nav>
          <div class="sc-stage-sidebar-bottom"><a class="art-library-source" href="./art-library/SOURCE.md" target="_blank" rel="noopener">${text(['查看完整来源记录', 'View full provenance'])} ↗</a></div>
      </aside>
      <div class="sc-stage-main">
        <header class="sc-stage-toolbar">
          <button type="button" class="sc-stage-directory-toggle" aria-controls="art-library-directory" aria-expanded="false">☰ ${text(['目录', 'Directory'])}</button>
          <div class="sc-stage-title"><strong>${text(['原画浏览', 'Artwork viewer'])}</strong></div>
          <span class="art-library-hint">${text(['点击图片查看原尺寸', 'Click an image to view the original'])}</span>
        </header>
        <article class="art-library-detail" aria-labelledby="art-library-entry-title" aria-live="polite"></article>
      </div>`;
    const searchInput = section.querySelector<HTMLInputElement>('.sc-search input')!;
    searchInput.value = query;
    searchInput.addEventListener('input', () => {
      query = searchInput.value;
      renderDirectory();
    });
    section.querySelector<HTMLInputElement>('.art-library-filter input')!.addEventListener('change', event => {
      includeCandidates = (event.currentTarget as HTMLInputElement).checked;
      if (!includeCandidates && selected.status === 'candidate') selected = ART_LIBRARY_GROUPS[0]!.entries[0]!;
      renderDirectory();
      renderDetail();
    });
    section.querySelector('.sc-stage-directory-toggle')!.addEventListener('click', event => {
      const open = section.classList.toggle('sc-directory-open');
      (event.currentTarget as HTMLButtonElement).setAttribute('aria-expanded', String(open));
    });
    renderDirectory();
    renderDetail();
  };

  render();
  onLanguageChange(render);
  page.hidden = false;
  document.getElementById('loading')!.hidden = true;
}
