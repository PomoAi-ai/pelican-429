# FIX -- 加载提示文案

## Status: verifying
## Task: 118
## Related: N/A
## Baseline Commit: 无（仓库尚无提交）

## Problem
统一将中文加载提示替换为“AGI 降临…”，英文为“AGI arrives…”，随界面语言切换。

## Root Cause
index.html:258 定义加载提示，src/ui/dom-language.ts:34 提供对应英文翻译。

## Fix Plan
- [x] 替换加载提示，保留省略号，并同步英文翻译。

## Verification
- [x] npm run typecheck：通过。
- [ ] npm test：1565 项通过，1 项地形生成耗时检查失败（中位数 409.3ms）。单独执行 `node --test --test-name-pattern='生成耗时中位数' test/worldgen.test.ts` 仍失败（635.7ms）。本次只改加载文案，不涉及地形生成；未改测试断言。
- [x] npm run build：通过，有分块大小提示。
- [x] 检查全部匹配位置与修改内容；无残留旧提示，无新增逻辑或测试。
