# FIX — 树木变化页统一选择与站立位置标注

## Status: done
## Task: 013
## Related: 012-fix-tree-comparison-selector
## Baseline Commit: 无 HEAD；快照 $TMPDIR/pelican-013-*.before.ts

## Problem
第五组同时出现完整资源目录、统一树种和单卡树种切换，无法形成简单的同种树变化页面；树上可站立位置没有标注。

## Root Cause
showcase-panel.ts 复用通用目录时未收敛第五组的控件；resource-preview.ts 未展示现有树平台碰撞数据。

## Fix Plan
- [x] 第五组仅在顶部选择树种，隐藏完整资源目录和单卡变体按钮，下方保留同种树各个种子的变化。
- [x] 树木预览用青色横线和端点标出真实平台跨度 x0 到 x1 + 1、站立高度 ty + 1；读取 level.trees，不新增平台规则。
- [x] 增加清晰图例，说明标记表示固定碰撞位置，树木风动继续复用游戏逻辑。

## Decisions
- 继续使用 fix：局部展示修正，仅涉及已有面板与预览检查标记，无游戏逻辑或资源结构调整。
- UI 和渲染人工浏览器验证，不新增复述实现的测试。

## Verification
- [x] npm run typecheck：通过。
- [x] npm test：1465 项通过，0 失败。
- [x] npm run build：通过，保留原有 bundle 大小提示。
- [x] 浏览器确认第五组完整目录和单卡变体控件均隐藏；顶部切换阔叶树后四卡种子仍为 429/430/431/432；主冠与侧枝平台标记可见。第六组完整目录与单卡切换保持可用，浏览器错误日志为空。
- [x] diff-guard 检查修改前后快照：仅面板展示与平台检查标记，无新增防御检查、渲染资源副本或自动测试。
