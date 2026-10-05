# FIX -- Tibo 薯条攻击

## Status: done
## Task: 104
## Related: 101
## Baseline Commit: 无 HEAD；修改前文件保存于 $TMPDIR/tibo-fries-baseline

## Problem
Tibo 第一技能应为薯条攻击，当前文案和飞行食物误用了薯片。

## Root Cause
`src/render/npc/npc-effects.ts` 的第一技能生成薄圆片；`src/config/npc.ts` 与翻译表沿用了薯片嘲讽名称。

## Fix Plan
- [x] npc-effects.ts — 金黄色立体长条薯条，技能标题 FRIES ATTACK，对白先来根薯条。
- [x] npc.ts / showcase-language.ts — 中英文名称和说明一致。

## Verification
- [x] npm run typecheck — 通过，上轮其他模块的类型错误已消除。
- [x] npm test — 1528/1528 通过，300 suites，68.461 秒。
- [x] npm run build — 通过，5.59 秒；仅既有 chunk 体积提示。
- [x] 浏览器检查技能标题、薯条造型及原命中反馈；不新增渲染自动测试。截图 `evidence/fries-attack.png`，控制台 warn/error 为空。
- [x] diff-guard 局部审查 — 子代理 Approved，无待修项。

日志位于 `$TMPDIR/tibo-fries-{typecheck,test,build}.log`。未提交推送。
