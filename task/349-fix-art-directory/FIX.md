# FIX -- 原画资料库侧栏目录

## Status: done
## Task: 349
## Related: 348
## Baseline Commit: 975f136

## Problem
原画资料库需按用户截图使用角色展示场式侧栏：品牌与资料导航、搜索、缩略图列表和选中状态。

## Root Cause
src/ui/art-library.ts、art-library.css 使用居中文章布局及纯文字列表，与已有角色展示场的全高独立滚动目录不同。

## Fix Plan
- [x] 复用 showcase / character-stage 的侧栏、导航、搜索和缩略图行样式；右侧保留原画与来源。
- [x] 目录与内容独立滚动，窄屏复用可展开目录；支持搜索、双语和候选筛选。

## Verification
- [x] npm run typecheck、npm test、npm run build
- [x] 浏览器检查桌面、窄屏、搜索、空结果、切换和双语
- [x] 本次增量 diff-guard

## Decisions
- 局部 UI 调整，不修改资料索引和确认状态，不新写渲染/UI 自动测试。
- 复用已有 sc-* 样式，不改共享展示场布局规则。

## Outcome
- 原画页改成同款 sc-sidebar 品牌、两行资料导航、搜索、缩略图行、选中高亮，原图与目录独立滚动。仅修改原画页两个模块，资料及确认状态不变。
- 搜索复用目录过滤方式，保留输入焦点；支持中英文名称/说明检索、空结果与候选开关。窄屏目录按钮展开，选择后自动收起。
- npm run typecheck 退出 0；npm test 1842/1842 通过，0 失败；npm run build 退出 0，保留既有 chunk 体积提示。
- 浏览器验证桌面、390×844 窄屏、搜索/空结果、筛选、双语及选择后收起；无控制台警告/错误，无横向溢出。截图见 evidence/desktop.jpg 与 mobile.jpg。
- 独立子代理完成 core-review/diff-guard，只读审查通过。未增加 UI 自动测试，未提交或推送。
