/** Copy the concept page's existing headings, lists, tables and image references. */
export function addConceptCopyControls(page: HTMLElement, en: boolean): void {
  const t = (zh: string, english: string): string => en ? english : zh;
  const content = page.querySelector<HTMLElement>('.help-content')!;
  const economy = page.querySelector<HTMLElement>('#concept-economy')!;
  const economyHeader = economy.querySelector('header')!;
  const systemHeadings = [...economy.querySelectorAll<HTMLElement>(':scope > h2')];
  const draftIntro = [...economy.children].slice(1, [...economy.children].indexOf(systemHeadings[0]!));
  const addButton = (anchor: Element, label: string, id: string, source: () => Node[]): void => {
    const controls = document.createElement('div');
    controls.className = 'concepts-copy';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    controls.append(button, status);
    anchor.after(controls);
    button.addEventListener('click', async () => {
      button.disabled = true;
      status.textContent = t('正在复制…', 'Copying…');
      try {
        const url = new URL(location.href);
        url.hash = id;
        const text = [
          `# ${t('鹈鹕 429 · 概念资料', 'Pelican 429 · Concept reference')}`,
          `${t('来源', 'Source')}: ${url.href}`,
          t('阅读约定：区分当前实现、设计参照与草案，不要把示例和待选项当成最终规则。图片只复制文字说明和链接，不含图片本体；本地链接需要在运行此项目的电脑上打开，远程 LLM 无法直接读取，请另行附图。', 'Reading guide: distinguish current behavior, design references and drafts. Examples and open decisions are not final rules. Images are copied as descriptions and links, not image data. Local links require the computer running this project; attach images separately for a remote LLM.'),
          source().map(conceptMarkdown).join(''),
        ].join('\n\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        await navigator.clipboard.writeText(text);
        status.textContent = t('已复制，可粘贴给 LLM', 'Copied — ready to paste into an LLM');
      } catch {
        status.textContent = t('复制失败，请允许剪贴板访问后重试，或手动选择正文复制。', 'Copy failed. Allow clipboard access and retry, or select and copy the text manually.');
      } finally {
        button.disabled = false;
      }
    });
  };
  addButton(page.querySelector('.concepts-heading > h1')!, t('复制全部资料给 LLM', 'Copy all for an LLM'), '', () => [content]);
  const note = document.createElement('p');
  note.textContent = t('复制为带标题、列表和表格的 Markdown。图片会附说明与本地链接；给远程 LLM 看图时，请另外上传图片。', 'Copies Markdown with headings, lists and tables. Images include descriptions and local links; upload the images separately for a remote LLM.');
  page.querySelector('.concepts-reading-guide')!.append(note);
  for (const section of content.querySelectorAll<HTMLElement>(':scope > section')) {
    addButton(section.querySelector('h2')!, t('复制本节给 LLM', 'Copy section for an LLM'), section.id, () => [section]);
  }
  addButton(economyHeader.querySelector('h2')!, t('复制经济系统全文给 LLM', 'Copy economy document for an LLM'), economy.id, () => [economy]);
  for (const heading of systemHeadings) {
    addButton(heading, t('复制本章给 LLM', 'Copy chapter for an LLM'), heading.id, () => {
      const chapter: Node[] = [economyHeader, ...draftIntro, heading];
      let sibling = heading.nextElementSibling;
      while (sibling && sibling.tagName !== 'H2') {
        chapter.push(sibling);
        sibling = sibling.nextElementSibling;
      }
      return chapter;
    });
  }
}

function conceptMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent!.replace(/\s+/g, ' ');
  if (!(node instanceof Element) || node.matches('.concepts-copy, .home-eyebrow, nav')) return '';
  const children = (): string => [...node.childNodes].map(conceptMarkdown).join('');
  if (/^H[1-6]$/.test(node.tagName)) return `\n\n${'#'.repeat(Number(node.tagName[1]))} ${children().trim()}\n\n`;
  switch (node.tagName) {
    case 'TABLE': {
      const rows = [...(node as HTMLTableElement).rows].map(row => `| ${[...row.cells].map(cell => conceptMarkdown(cell).trim().replace(/\n+/g, '<br>').replace(/\|/g, '\\|')).join(' | ')} |`);
      rows.splice(1, 0, `| ${[...(node as HTMLTableElement).rows[0]!.cells].map(() => '---').join(' | ')} |`);
      return `\n\n${rows.join('\n')}\n\n`;
    }
    case 'UL': case 'OL':
      return `\n${[...node.children].map((item, index) => `${node.tagName === 'OL' ? `${index + 1}.` : '-'} ${conceptMarkdown(item).trim().replace(/\n/g, '\n   ')}`).join('\n')}\n\n`;
    case 'STRONG': return `**${children()}**`;
    case 'EM': return `*${children()}*`;
    case 'CODE': return `\`${children()}\``;
    case 'BR': return '\n';
    case 'IMG': {
      const image = node as HTMLImageElement;
      return `\n\n![${image.alt}](${image.src})\n\n`;
    }
    case 'A': return node.querySelector('img') ? children() : `[${children().trim()}](${(node as HTMLAnchorElement).href})`;
    case 'DT': return `\n\n**${children().trim()}**\n\n`;
    case 'P': case 'DD': case 'SUMMARY': case 'FIGCAPTION': return `\n\n${children().trim()}\n\n`;
    default: return children();
  }
}
