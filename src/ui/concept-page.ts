import { CONCEPT_DOCUMENTS } from './concept-documents.ts';
import { getLanguage, onLanguageChange } from './language.ts';
import { addConceptCopyControls } from './concept-copy.ts';
import { addConceptToc } from './concept-toc.ts';
import { conceptUrl, loadConceptMarkdown, renderConceptMarkdown } from './concept-markdown.ts';

export function mountConceptPage(page: HTMLElement, scroller: HTMLElement): void {
  page.className = 'help-page concepts-page';
  let documents: readonly string[] | null = null;
  let loadError: string | null = null;
  let releaseToc: (() => void) | null = null;
  const render = (): void => {
    const en = getLanguage() === 'en';
    const title = en ? 'Basic concepts' : '基础概念';
    document.title = `${title} · 鹈鹕 429`;
    if (loadError !== null) {
      page.textContent = `${en ? 'Concept documents could not load' : '基础概念载入失败'}：${loadError}`;
      return;
    }
    if (documents === null) {
      page.textContent = en ? 'Loading Markdown documents…' : '正在载入 Markdown 文档…';
      return;
    }
    releaseToc?.();
    const groups = [...new Set(CONCEPT_DOCUMENTS.map(entry => entry.group))];
    page.innerHTML = `
      <header class="concepts-heading"><h1>${title}</h1>
        <p class="concepts-reading-guide">${en ? 'Canonical Chinese Markdown sources. Use the document links or LLM index to read the same rules.' : '正文直接读取同一份 Markdown。复制 LLM 说明包含文档地址；本地地址只能在运行项目的电脑上访问。'}
          <a href="${conceptUrl('llms.txt').href}">llms.txt ↗</a></p>
      </header>
      <div class="help-layout">
        <button type="button" class="concepts-toc-toggle" aria-controls="concepts-toc" aria-expanded="false">${en ? 'Contents' : '目录'}</button>
        <nav id="concepts-toc" class="help-index" aria-label="${en ? 'Concept contents' : '基础概念目录'}">
          <input type="search" class="concepts-toc-search" placeholder="${en ? 'Filter contents' : '搜索目录'}" aria-label="${en ? 'Filter contents' : '搜索概念目录'}" />
          ${groups.map(group => `<details class="concepts-nav-group" name="concepts-toc"><summary>${group}</summary>${CONCEPT_DOCUMENTS.filter(entry => entry.group === group).map(entry => `<a href="#${entry.id}"><span>${entry.title}</span></a>`).join('')}</details>`).join('')}
        </nav>
        <div class="help-content"></div>
      </div>`;
    const content = page.querySelector('.help-content')!;
    CONCEPT_DOCUMENTS.forEach((entry, index) => content.append(renderConceptMarkdown(entry, documents![index]!)));
    addConceptCopyControls(page, en);
    releaseToc = addConceptToc(page, scroller);
    if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  };
  render();
  onLanguageChange(render);
  void Promise.all(CONCEPT_DOCUMENTS.map(loadConceptMarkdown)).then(loaded => {
    documents = loaded;
    render();
  }, error => {
    loadError = error instanceof Error ? error.message : String(error);
    render();
  });
}
