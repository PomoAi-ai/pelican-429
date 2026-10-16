import { CONCEPT_DOCUMENTS } from './concept-documents.ts';
import { conceptUrl } from './concept-markdown.ts';

export function addConceptCopyControls(page: HTMLElement, en: boolean): void {
  const addButton = (heading: Element, title: string, file?: string): void => {
    const controls = document.createElement('div');
    controls.className = 'concepts-copy';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = en ? 'Copy LLM instructions' : '复制 LLM 说明';
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    controls.append(button, status);
    if (file) {
      const source = document.createElement('a');
      source.href = conceptUrl(`concepts/${file}`).href;
      source.textContent = en ? 'Open Markdown ↗' : '打开 Markdown ↗';
      controls.append(source);
    }
    heading.after(controls);
    button.addEventListener('click', async () => {
      button.disabled = true;
      status.textContent = en ? 'Copying…' : '正在复制…';
      const text = [
        `鹈鹕 429 基础概念：${title}。`,
        '请先读取当前文档，再通过索引查阅关联规则。区分已确认标准、当前实现、草案与历史资料。',
        ...(file ? [`当前文档：${conceptUrl(`concepts/${file}`).href}`] : []),
        `文档索引：${conceptUrl('llms.txt').href}`,
      ].join('\n');
      try {
        await navigator.clipboard.writeText(text);
        status.textContent = en ? 'Copied' : '已复制说明与文档地址';
      } catch {
        status.textContent = en ? 'Copy failed. Allow clipboard access and retry.' : '复制失败，请允许剪贴板访问后重试。';
      } finally {
        button.disabled = false;
      }
    });
  };
  addButton(page.querySelector('.concepts-heading > h1')!, '资源分类、尺度、建筑、自然资源与经济系统');
  for (const entry of CONCEPT_DOCUMENTS) {
    addButton(page.querySelector(`#${entry.id} > h2`)!, entry.title, entry.file);
  }
}
