# FIX -- 更新赞助方地址

## Status: verifying
## Task: 242
## Related: N/A
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
赞助方地址应使用 https://www.pomoai.ai。

## Root Cause
index.html:334、index.html:359、src/ui/homepage-language.ts:101、README.md:114 使用旧赞助域名。

## Fix Plan
- [x] 首页赞助按钮、页脚链接、英文文案及 README 统一改为 www.pomoai.ai。
- [x] 保留赞助标题与介绍，以及游戏自身域名。

## Verification
- [x] npm run typecheck — 通过
- [ ] npm test — 1770 项中 1767 通过，3 项失败：human-combat.test.ts:125、151 与 showcase.test.ts:140，均涉及战斗行为，本次仅替换赞助域名，未修改这些逻辑或测试。
- [x] npm run build — 通过，现有大 chunk 警告。
- [x] 审查本次替换，无新增逻辑、防御检查或测试。
