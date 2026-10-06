# FIX -- Sam 待机轮流说两句台词

## Status: done
## Task: 264
## Related: N/A
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
Sam 待机除了“AGI 降临”，也需要说“我又稳稳的接住了你!”。

## Root Cause
src/render/npc/npc-effects.ts 的 createNpcEffects 只创建固定的一句 Sam 待机字幕。

## Fix Plan
- [x] 在共享特效模块中轮流显示两句台词，复用 SAM_CATCHPHRASE 及语言切换、淡入淡出和资源释放机制。
- [x] 保持已有待机动作节奏，不添加渲染细节或文案自动测试。

## Verification
- [x] npm run typecheck：通过。
- [x] npm test：1786 项通过，0 失败。
- [x] npm run build：通过，存在 chunk 大小和插件耗时提示。
- [x] diff-guard：仅检查本次差异，无新增防御性检查、异常兜底或低价值测试。
- 浏览器视觉效果待人工验收。
