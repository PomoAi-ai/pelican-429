import { marked } from 'marked';
import type { ConceptDocument } from './concept-documents.ts';

export function conceptUrl(path: string): URL {
  return new URL(path, new URL(import.meta.env.BASE_URL, location.href));
}

export async function loadConceptMarkdown(entry: ConceptDocument): Promise<string> {
  const url = conceptUrl(`concepts/${entry.file}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`文档载入失败：${url.pathname}（HTTP ${response.status}）`);
  const markdown = await response.text();
  if (!/^#\s+\S/m.test(markdown) || /^\s*<!doctype html/i.test(markdown)) {
    throw new Error(`文档不是 Markdown：${url.pathname}`);
  }
  return markdown;
}

/** Sources are repository-owned Markdown, never arbitrary user input. */
export function renderConceptMarkdown(entry: ConceptDocument, markdown: string): HTMLElement {
  const section = document.createElement('section');
  section.className = 'help-block concepts-markdown';
  section.id = entry.id;
  section.dataset.document = entry.file;
  section.innerHTML = marked.parse(markdown, { async: false, gfm: true });
  // 材料库旧章节转成显式别名后，仍沿用原来生成的文档前缀。
  if (entry.id === 'material-library') {
    for (const anchor of section.querySelectorAll<HTMLElement>('span[id]')) anchor.id = `${entry.id}--${anchor.id}`;
  }
  const headingCounts = new Map<string, number>();
  for (const heading of section.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    const replacement = document.createElement(`h${Math.min(6, Number(heading.tagName[1]) + 1)}`);
    replacement.innerHTML = heading.innerHTML;
    const slug = heading.textContent.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-');
    const count = headingCounts.get(slug) ?? 0;
    headingCounts.set(slug, count + 1);
    replacement.id = `${entry.id}--${slug}${count ? `-${count}` : ''}`;
    heading.replaceWith(replacement);
  }
  const source = conceptUrl(`concepts/${entry.file}`);
  for (const element of section.querySelectorAll<HTMLAnchorElement | HTMLImageElement | HTMLIFrameElement>('a[href], img[src], iframe[src]')) {
    const attribute = element instanceof HTMLAnchorElement ? 'href' : 'src';
    const original = element.getAttribute(attribute)!;
    const url = original.startsWith('/concepts/') || original.startsWith('/?')
      ? conceptUrl(original.slice(1)) : new URL(original, source);
    if (original.startsWith('#')) element.setAttribute(attribute, `#${entry.id}--${original.slice(1)}`);
    else element.setAttribute(attribute, url.href);
  }
  for (const table of section.querySelectorAll('table')) {
    const wrapper = document.createElement('div');
    wrapper.className = 'concepts-table-scroll';
    table.replaceWith(wrapper);
    wrapper.append(table);
  }
  for (const image of section.querySelectorAll('img')) {
    image.loading = 'lazy';
    image.decoding = 'async';
    if (!image.closest('a')) {
      const link = document.createElement('a');
      link.href = image.src;
      link.target = '_blank';
      link.rel = 'noopener';
      image.replaceWith(link);
      link.append(image);
    }
  }
  return section;
}
