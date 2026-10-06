# FIX -- 主角与 NPC Boss 发梢动画

## Status: verifying
## Task: 257
## Related: N/A
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
主角与 Sam、Tibo 的头发缺乏随动作变化的次级运动。

## Root Cause
- src/render/grassy/grassy-animator.ts：仅纯待机传入呼吸相位，其余动作将发梢权重归零。
- src/render/npc/npc-rig.ts：两种形态均只有眨眼形变，没有头发形变或驱动。

## Fix Plan
- [x] 共享局部发梢形变与连续时钟驱动，保持发根和脸部固定。
- [x] 主角和两个 NPC 的游戏、展示场共用动画入口接入。

## Verification
- [x] npm run typecheck — 通过
- [ ] npm test — 已完整运行，1 个与本次渲染改动无关的战斗音效用例失败，详见下文
- [x] npm run build — 通过（已有 chunk 体积提示）
- [x] 浏览器视觉检查 — 三人同场、NPC 双形态、Sam 跑步、Tibo 锤击、主角快速飞行；无控制台错误
- [x] diff-guard — 仅本次改动，无新增依赖、自动渲染测试或内部防御检查

## Verification Notes
- 全量测试中的 `test/game-audio-cues.test.ts:126` 用例失败：释放事件预期 `[28,48]`，实际 `[48]`；单独执行 `node --test --test-name-pattern='超载与搬山下砸同帧互击' test/game-audio-cues.test.ts` 同样失败。该用例依赖战斗模拟与音效事件，不导入本次修改的渲染模块，未扩大范围修复。
- 子代理只读核对四份 NPC 模型，确认没有头发骨骼，给出避开脸部及耳朵的冠顶形变高度。
