import { writeFileSync } from 'node:fs';
import { CONCEPT_DOCUMENTS } from '../src/ui/site/concept-documents.ts';

const groups = Map.groupBy(CONCEPT_DOCUMENTS, doc => doc.group);
const sections = [...groups].map(([group, docs]) =>
  `## ${group}\n\n${docs.map(doc => `- [${doc.title}](concepts/${doc.id}.md)`).join('\n')}`);

writeFileSync(new URL('../public/llms.txt', import.meta.url), `# 鹈鹕 429 · 基础概念与建造资源

> 横版瓦片世界，二维玩法与三维表现。以下 Markdown 是基础概念网页的同一份正文。

先读资源分类与命名、材料与构件库，再读相关专项规则。区分已确认标准、当前实现、设计草案与历史资料；图片不等于玩法已实现。资料中的游戏交互入口可在同一站点打开。

${sections.join('\n\n')}
`);
