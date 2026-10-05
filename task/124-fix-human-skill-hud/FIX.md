# FIX -- 人形专属技能栏

## Status: verifying
## Task: 124
## Related: 121
## Baseline Commit: 无提交

## Problem
切换人形时，技能栏和操作帮助仍显示鹈鹕技能。

## Root Cause
src/ui/weapon-hud.ts 固定使用鹈鹕技能列表和冷却；实际控制器已支持 Codex、Bug、服务器超载。

## Fix Plan
- [x] 人形显示三项正式专属技能及真实冷却、施放状态、骑行限制。
- [x] 沿用已有按键：1 Codex，2 Bug，3 / 4 / E 服务器超载。
- [x] 帮助提示随形态与语言切换，变回鹈鹕恢复四技能。
- [x] 仅修改 UI，无新增 UI 自动测试。

## Verification
- [x] npm run typecheck：通过。
- [x] node --test test/weapons-render.test.ts test/hud.test.ts test/player-transform.test.ts：21 项通过。
- [x] node --test test/human-combat.test.ts：6 项通过。
- [x] npm run build：通过，存在包体大小提示。
- [ ] npm test：再次长时间停留在早期输出，已停止，未取得全量结果。
- [ ] 浏览器视觉验收未执行。
- [x] diff-guard：无静默兜底或额外内部校验。
