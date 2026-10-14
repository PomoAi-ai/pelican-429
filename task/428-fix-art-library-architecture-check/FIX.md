# FIX -- 原画说明触发架构扫描误报

## Status: done
## Task: 428
## Related: N/A
## Baseline Commit: d2d72f4

## Problem

提交前全量测试中，架构检查将原画英文说明里的 `platform/window sizes` 识别为浏览器 `window` API。

## Root Cause

`src/config/art-library.ts:606` 的说明包含独立英文单词 `window`；现有架构扫描保留字符串内容，因而产生误报。配置没有调用浏览器 API。

## Fix Plan

- [x] 将说明等义改为 `the sizes of some platforms and windows`，保留尺寸偏差的含义。
- [x] 保持现有架构规则与断言。

## Verification

- [x] `npm run typecheck`：通过。
- [x] `node --test test/architecture.test.ts`：21 项全部通过。
- [x] `npm run build`：通过；保留既有大分块提示。
- [x] Diff Guard：仅等义文案修改，无新增分支、校验、异常处理或测试。

首次全量 `npm test`：1913 项，1912 通过，1 项为上述误报；修正后重跑受影响的架构测试。
