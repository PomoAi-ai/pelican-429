import { CONCEPT_DOCUMENTS } from './concept-documents.ts';
import { getLanguage, onLanguageChange } from './language.ts';
import { addConceptCopyControls } from './concept-copy.ts';
import { addConceptToc } from './concept-toc.ts';
import { conceptUrl, loadConceptMarkdown, renderConceptMarkdown } from './concept-markdown.ts';

function addMaterialCatalog(page: HTMLElement): void {
  const catalog = page.querySelector<HTMLElement>('[data-catalog="material-library"]')!;
  const linkTo = (heading: Element): HTMLAnchorElement => {
    const link = document.createElement('a');
    link.href = `#${heading.id}`;
    const label = document.createElement('span');
    label.textContent = heading.textContent;
    link.append(label);
    return link;
  };
  for (const heading of page.querySelectorAll('#material-library > h3')) {
    const resources: Element[] = [];
    for (let element = heading.nextElementSibling; element && element.tagName !== 'H3'; element = element.nextElementSibling) {
      if (element.tagName === 'H4') resources.push(element);
    }
    // 通用说明仍保留在正文；只有包含具体资源的章节进入分类目录。
    if (resources.length === 0) continue;
    const category = document.createElement('details');
    category.className = 'concepts-nav-category';
    const summary = document.createElement('summary');
    summary.append(linkTo(heading));
    const children = document.createElement('div');
    children.className = 'concepts-nav-sub';
    children.append(...resources.map(linkTo));
    category.append(summary, children);
    catalog.append(category);
  }
}

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
          ${groups.map(group => group === '材料与构件库'
            ? `<details class="concepts-nav-group" name="concepts-toc" data-catalog="material-library"><summary><a href="#material-library"><span>${group}</span></a></summary></details>`
            : `<details class="concepts-nav-group" name="concepts-toc"><summary>${group}</summary>${CONCEPT_DOCUMENTS.filter(entry => entry.group === group).map(entry => `<a href="#${entry.id}"><span>${entry.title}</span></a>`).join('')}</details>`).join('')}
        </nav>
        <div class="help-content"></div>
      </div>`;
    const content = page.querySelector('.help-content')!;
    CONCEPT_DOCUMENTS.forEach((entry, index) => content.append(renderConceptMarkdown(entry, documents![index]!)));
    addMaterialCatalog(page);
    addConceptCopyControls(page, en);
    releaseToc = addConceptToc(page, scroller);
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
