# FIX -- 主角头发持续蠕动

## Status: done
## Task: 316
## Related: 314-grassy-layered-motion
## Baseline Commit: 2a5455a

## Problem
主角站立时整头独立发束持续扭动，产生虫爬观感。

## Root Cause
src/render/hair-rig.ts — 每束随机相位和不同弹簧频率造成错相拱动，中段参与弯曲过大。
src/render/grassy/grassy-animator.ts — 恒定.24扰动使静止状态一直大幅波动。

## Fix Plan
- [x] 主角取消静止扰动；运动时统一气流相位和弹簧频率，主要弯发梢，提高阻尼。
- [x] 近景文案与实际静止行为同步。
- [x] Boss原有分支保持不变，不动本轮模型文件。

## Verification
- [x] 真实GLB临时诊断：站立收稳、受力时运动、发根和头骨固定。
- [x] 浏览器固定头部检查站立、冲锋、下落和恢复。
- [x] npm run typecheck、npm test、npm run build。
- [x] diff-guard增量审查。

## Results
- 真实A资产8355采样点：静止moving=0，数值残差小于.000001；冲锋/下落峰值约.078，停止1秒后小于.000005；发根位移0，头骨旋转/缩放不变。
- 当前浏览器页面已更新，窄窗口裁头问题同步修正；站立默认选项停止蠕动，冲锋仍有梢端后掠，保留静止预览。
- 验证代理运行 typecheck、1808个测试、build，各一次，全部通过。无新增测试。diff-guard增量检查未发现兜底、防御校验或低价值测试。
- 本轮仅修运动，模型外形仍偏厚重分片；未声称美术造型通过验收。
