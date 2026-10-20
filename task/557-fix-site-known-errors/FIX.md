# FIX -- 站点已知错误：首页断图、概念文档断链、过时说明、居民按钮空格无效

## Status: done
## Task: 557
## Related: 551
## Baseline Commit: 59f1b361

## Problem
1. 首页与导航的图片、微信二维码全部 404。
2. 岩层定义文档中的演示链接打开 `/concepts/?mode=…`；空间定义文档链到岩层章节的锚点打开原始 Markdown，不跳到页内章节。
3. 原画库与概念资料来源说明写着已不存在的入口与源码路径。
4. 焦点在居民“交谈”按钮上按空格无法触发按钮。

## Root Cause
- src/ui/site/home-page.tsx:78 等 13 处、src/ui/site/site-navigation.tsx:80 — 图片路径写成 `./resourcesprivate-source/`，实际资源在 `public/resources/home/`（改造前 index.html 已如此，迁移时原样带入）。
- public/concepts/natural-rock-definitions.md:37-39,55 — 相对链接 `./?mode=` 以文档所在 `/concepts/` 为基准解析；其余文档用 `../?`。
- public/concepts/natural-spatial-definitions.md:22 — 跨文档锚点写成 `natural-rock-definitions.md#…`；概念页把各文档渲染在同一页，章节 id 为 `<文档 id>--<标题>`，应写 `/?mode=concepts#natural-rock--空岛底岩的逐行连接`。
- public/art-library/SOURCE.md:9 — 入口写 `?mode=art-library`，实际为 `?mode=catalog`。
- public/concepts/SOURCE.txt:13,15,25 — 仍写“不在默认发布资源清单内”（concepts 目录已在发布白名单），并引用已删除的 src/ui/concept-*.ts 与已改为跳转的 docs/*.md。
- src/input/keyboard-mouse.ts:88-98 — 游戏的 keyup 在 window 捕获阶段对所有已绑定键 preventDefault；即使 keydown 已被 UI 拦下、游戏从未按下该键，松开空格也会取消焦点按钮的原生激活。src/ui/panels/npc-dialogue.tsx 在按钮上 stopPropagation 无法撤销已发生的 preventDefault。

## Fix Plan
- [x] src/ui/site/home-page.tsx、src/ui/site/site-navigation.tsx — 路径改为 `./resources/home/`
- [x] public/concepts/natural-rock-definitions.md — `./?mode=` 改为 `../?mode=`
- [x] public/concepts/natural-spatial-definitions.md — 锚点改为概念页章节 id
- [x] public/art-library/SOURCE.md — 入口改为 `?mode=catalog`
- [x] public/concepts/SOURCE.txt — 更新发布与来源说明
- [x] src/input/keyboard-mouse.ts — keyup 只对游戏按住的动作 preventDefault
- [x] src/ui/panels/npc-dialogue.tsx — 删除无效的 Space keyup 拦截
- [x] test/render-integration.test.ts — 复现用例：UI 拦下 keydown 的空格，松开不取消默认动作

## Verification
- [x] node --test test/render-integration.test.ts（先失败后通过，41/41）；npm test 2038/2038
- [x] npm run typecheck
- [x] npm run build
- [x] 源码与 public 中不再有 `resourcesprivate-source`
- [x] Bug is fixed（node 用例复现并通过；浏览器中空格激活按钮与首页图片未人工复核）
