# FIX -- Mistral 睡觉字符画

## Status: done
## Task: 070
## Related: 065
## Baseline Commit: 无 HEAD

## Problem
用字符图像表达睡觉，不直接写“在睡觉”。

## Root Cause
src/render/intro-finale.ts 中的彩蛋仍使用说明文字。

## Fix Plan
- [x] 保留模型名称，将说明文字替换为等宽字符画 `(-_-) z Z`。

## Verification
- [x] npm run typecheck 通过；npm test 1508/1508 通过；npm run build 通过，保留大 chunk 警告。
- [x] 浏览器在 13.5 秒确认字符画，截图 $TMPDIR/mistral-sleep-glyph.jpg。
- [x] diff-guard：仅修改显示文字与字体，无新逻辑、依赖或测试。
