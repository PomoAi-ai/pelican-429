# FIX — 选择资源分类直接显示一批变体

## Status: done
## Task: 011
## Related: 010
## Baseline Commit: 无 HEAD，相关文件快照保存于 $TMPDIR/pelican-011-*

## Problem
选择树木后只显示一棵默认橡树，完整目录中其余树种没有直接打开。

## Root Cause
src/ui/showcase-panel.ts：左侧分类调用 selectActor 仅添加默认变体；顶部分类 change 只刷新按钮列表，未调用已有 showBatch。

## Fix Plan
- [x] 资源分类改为单选批次入口，左侧与顶部选择均复用 showBatch，同时同步目录和页码。
- [x] 保留单件名称点击检查以及下一批，8 张上限不变。
- [x] 角色页保持原有多选；资源分类满 8 张后仍可切换其他分类。

## Verification
- [x] npm run typecheck：通过。
- [x] node --test test/showcase.test.ts：14 项通过。
- [x] npm test：1465 项通过，0 失败。
- [x] npm run build：通过，保留已有 bundle 大小提示。
- [x] 浏览器检查：左侧选择树木直接 8 张，下一批仅第 9 种枯树；再次点击树木回到首批；满容量切换岩石成功，顶部切回树木显示 8 张。浏览器错误日志为空。
- [x] diff-guard：对比修改前快照，仅 UI 事件绑定与单选控件样式变化，不新增 UI 自动测试、错误兜底或防御检查。
