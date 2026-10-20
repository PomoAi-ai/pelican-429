import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { t } from '../../config/i18n.ts';
import { useLanguage } from '../react/use-language.ts';
import { CONCEPT_DOCUMENTS } from './concept-documents.ts';
import { conceptUrl, loadConceptMarkdown, renderConceptMarkdown, type RenderedConcept } from './concept-markdown.ts';
import { addConceptToc } from './concept-toc.ts';

interface CatalogHeading { readonly id: string; readonly text: string }

/** 材料库按 h3 分类、h4 资源列进目录；通用说明仍保留在正文，只有包含具体资源的章节进入分类目录。 */
function materialCatalog(bodyHtml: string): readonly (CatalogHeading & { readonly resources: readonly CatalogHeading[] })[] {
  const template = document.createElement('template');
  template.innerHTML = bodyHtml;
  const heading = (element: Element): CatalogHeading => ({ id: element.id, text: element.textContent });
  return [...template.content.children].filter(element => element.tagName === 'H3').map(category => {
    const resources: CatalogHeading[] = [];
    for (let element = category.nextElementSibling; element && element.tagName !== 'H3'; element = element.nextElementSibling) {
      if (element.tagName === 'H4') resources.push(heading(element));
    }
    return { ...heading(category), resources };
  }).filter(category => category.resources.length > 0);
}

/** 基础概念页：正文直接渲染同源 Markdown，左侧目录可筛选、随滚动高亮。 */
export function ConceptPage({ scroller }: { scroller: RefObject<HTMLElement | null> }) {
  useLanguage();
  const [documents, setDocuments] = useState<readonly RenderedConcept[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const page = useRef<HTMLElement>(null);
  const title = t('基础概念');
  useEffect(() => { document.title = `${title} · ${t('鹈鹕')} 429`; }, [title]);
  useEffect(() => {
    void Promise.all(CONCEPT_DOCUMENTS.map(loadConceptMarkdown)).then(
      loaded => setDocuments(loaded.map((markdown, index) => renderConceptMarkdown(CONCEPT_DOCUMENTS[index]!, markdown))),
      (error: unknown) => setLoadError(error instanceof Error ? error.message : String(error)),
    );
  }, []);
  // 目录交互作用在已渲染的节点上：只在文档就绪时接一次，语言切换只改文字，不重建节点。
  useEffect(() => {
    if (documents) return addConceptToc(page.current!, scroller.current!);
  }, [documents, scroller]);
  const groups = useMemo(() => [...new Set(CONCEPT_DOCUMENTS.map(entry => entry.group))], []);
  const materials = useMemo(() => {
    const index = CONCEPT_DOCUMENTS.findIndex(entry => entry.id === 'material-library');
    return documents ? materialCatalog(documents[index]!.bodyHtml) : [];
  }, [documents]);
  if (loadError !== null) return <section className="help-page concepts-page">{t('基础概念载入失败')}：{loadError}</section>;
  if (documents === null) return <section className="help-page concepts-page">{t('正在载入 Markdown 文档…')}</section>;
  return (
    <section ref={page} className="help-page concepts-page">
      <header className="concepts-heading"><h1>{title}</h1>
        <CopyControls title="资源分类、尺度、建筑、自然资源与经济系统" />
        <p className="concepts-reading-guide">{t('正文直接读取同一份 Markdown。复制 LLM 说明包含文档地址；本地地址只能在运行项目的电脑上访问。')}
          <a href={conceptUrl('llms.txt').href}>llms.txt ↗</a></p>
      </header>
      <div className="help-layout">
        <button type="button" className="concepts-toc-toggle" aria-controls="concepts-toc" aria-expanded="false">{t('目录')}</button>
        <nav id="concepts-toc" className="help-index" aria-label={t('基础概念目录')}>
          <input type="search" className="concepts-toc-search" placeholder={t('搜索目录')} aria-label={t('搜索概念目录')} />
          {groups.map(group => group === '材料与构件库'
            ? (
              <details key={group} className="concepts-nav-group" name="concepts-toc" data-catalog="material-library">
                <summary><a href="#material-library"><span>{t(group)}</span></a></summary>
                {materials.map(category => (
                  <details key={category.id} className="concepts-nav-category">
                    <summary><a href={`#${category.id}`}><span>{category.text}</span></a></summary>
                    <div className="concepts-nav-sub">{category.resources.map(resource => <a key={resource.id} href={`#${resource.id}`}><span>{resource.text}</span></a>)}</div>
                  </details>
                ))}
              </details>
            )
            : (
              <details key={group} className="concepts-nav-group" name="concepts-toc">
                <summary>{t(group)}</summary>
                {CONCEPT_DOCUMENTS.filter(entry => entry.group === group).map(entry => <a key={entry.id} href={`#${entry.id}`}><span>{t(entry.title)}</span></a>)}
              </details>
            ))}
        </nav>
        <div className="help-content">
          {CONCEPT_DOCUMENTS.map((entry, index) => {
            const rendered = documents[index]!;
            return (
              <section key={entry.id} className="help-block concepts-markdown" id={entry.id} data-document={`${entry.id}.md`}>
                <h2 id={rendered.titleId} dangerouslySetInnerHTML={{ __html: rendered.titleHtml }} />
                <CopyControls title={entry.title} file={`${entry.id}.md`} />
                <div style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: rendered.bodyHtml }} />
              </section>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** 复制给 LLM 的说明保持中文：它描述的是中文原文文档，与界面语言无关。 */
function CopyControls({ title, file }: { title: string; file?: string }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'copying' | 'copied' | 'failed' | null>(null);
  const copy = async (): Promise<void> => {
    setBusy(true);
    setStatus('copying');
    const text = [
      `鹈鹕 429 基础概念：${title}。`,
      '请先读取当前文档，再通过索引查阅关联规则。区分已确认标准、当前实现、草案与历史资料。',
      ...(file ? [`当前文档：${conceptUrl(`concepts/${file}`).href}`] : []),
      `文档索引：${conceptUrl('llms.txt').href}`,
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setStatus('copied');
    } catch {
      setStatus('failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="concepts-copy">
      <button type="button" disabled={busy} onClick={() => void copy()}>{t('复制 LLM 说明')}</button>
      <span role="status">{status === 'copying' ? t('正在复制…') : status === 'copied' ? t('已复制说明与文档地址') : status === 'failed' ? t('复制失败，请允许剪贴板访问后重试。') : ''}</span>
      {file && <a href={conceptUrl(`concepts/${file}`).href}>{t('打开 Markdown ↗')}</a>}
    </div>
  );
}
