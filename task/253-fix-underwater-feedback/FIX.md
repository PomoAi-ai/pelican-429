# FIX -- 水下呼吸与缺氧反馈

## Status: verifying
## Task: 253
## Related: N/A
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
水下耗氧与缺氧扣血缺少清晰的画面反馈。

## Root Cause
src/sim/player-breath.ts 已实现耗氧；src/render/world-views.ts 只装配水面涟漪，HUD 只有氧气条，没有水下呼吸气泡与缺氧屏幕反馈。

## Fix Plan
- [x] 共享世界视图增加头部水下气泡，低氧时加密；气泡出水消失。
- [x] HUD 增加低氧与缺氧边缘脉动，露头/死亡停止，区分免伤。
- 不更改耗氧、伤害与角色动作规则；不新增渲染/UI自动测试。

## Verification
- [x] npm run typecheck：通过。
- [ ] npm test：1775 通过、1 失败。test/game-audio-cues.test.ts:106 的超载/搬山互击断言期望 [28,48]、实际 [48]；单独运行 node --test test/game-audio-cues.test.ts 同样失败。该用例依赖未修改的战斗、模拟与音效代码，不经过本次渲染/UI修改，未修改断言。
- [x] npm run build：通过，存在分包大小与插件耗时提示。
- [x] 浏览器视觉验收：真实湖底可见上浮气泡与红色脉动；低氧、免伤、露头恢复、死亡状态均核对。截图 drowning.png；临时浏览器调试状态在验收后随页面关闭清除。
- [x] diff-guard 检查：没有新增防御式校验或 UI 自动测试；既有测试仅补必需的 headSubmerged 夹具字段。git diff --check 通过。
