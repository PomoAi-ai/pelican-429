# FIX -- 首页游戏与全部开发场景入口

## Status: done
## Task: 141
## Related: 139
## Baseline Commit: e5fb3bf

## Problem
首页需要明确提供进入游戏与资源展示两个入口；资源展示应包含全部现有 dev 场景。

## Root Cause
index.html 首屏只有主线与序章，开发工具折叠在底部，且未包含所有开发导航场景。

## Fix Plan
- [x] index.html — 首屏与导航增加独立资源展示目录，游戏入口直接进入 story。
- [x] src/main.ts、src/config/showcase.ts — 支持 dev 目录路由，直接复用已有开发导航生成全部场景入口。
- [x] src/ui/homepage.css — 资源目录响应式卡片布局。

## Verification
- [x] npm run typecheck
- [x] npm test
- [x] npm run build
- [x] 浏览器进入游戏和资源目录，核对全部 dev 入口并打开角色展示。
- [x] diff-guard 审查；UI变化不新增复述实现的测试。

## Results
- 资源目录直接复用开发导航全部11个场景链接，浏览器核对两组URL完全一致，避免两套清单漏项。
- 首屏和顶部导航提供进入游戏/资源展示；序章仍在下方章节区；删除main中按class重写story链接的逻辑，HTML直接链接story。
- typecheck通过；npm test 1613/1613、301组通过；build通过。CSS选择器优先级修复后再次build通过。
- 子代理diff-guard审查发现并修复移动导航资源链接被隐藏的问题；390px浏览器验收可见。无新增测试、依赖或防御检查。
- 浏览器从资源目录进入角色展示成功；进入游戏到达mode=story序章；截图$TMPDIR/pelican-website-evidence/dev-catalog.jpg。
