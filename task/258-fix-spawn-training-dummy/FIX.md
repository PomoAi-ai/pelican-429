# FIX -- 移除出生点训练假人

## Status: verifying
## Task: 258
## Related: N/A
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
移除截图中自由世界出生点 Sam 身边的黄色训练假人。

## Root Cause
src/world/free-world.ts 继承野外生成器的训练假人位置，模拟初始化后生成该实体。

## Fix Plan
- [x] 自由世界不再放置训练假人，保留展示场与测试关卡的假人能力。
- [x] 在现有营地用例中验证实际实体列表没有训练假人，修改前已复现失败。

## Verification
- [x] `npm run typecheck` 通过。
- [x] `npm run build` 通过（chunk 大小警告）。
- [x] `node --test --test-name-pattern='不同种子的真实区域' test/free-world.test.ts` 通过。
- [x] diff-guard 检查通过：仅移除自由世界假人生成位置，补充实际实体回归断言，无额外防御逻辑。
- [ ] `npm test` 未全绿：战斗互击用例仍失败，实际命中 [48]，预期 [28,48]；与前一轮相同，未修改无关代码与断言。
- 未进行浏览器视觉验收。
