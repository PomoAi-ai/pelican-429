# FIX -- 环境风与跳跃驱动玩家发梢

## Status: done
## Task: 280
## Related: 270
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
玩家头发需要自然回应环境风、走跑及跳跃，保持已加强的待机呼吸。

## Root Cause
`src/render/grassy/grassy-animator.ts` 只接入水平移速绝对值，未读取场景风和垂直速度；匀速移动只有固定后偏，步频没有驱动发梢起伏。
原版与 compact GLB 实际蒙皮后采样确认单位冠顶形变均约0.052，材质保留原生morph链，没有压缩或蒙皮吞掉位移。

## Fix Plan
- [x] 游戏、设施与两种模拟展示场传入真实 WindController，露天采样与草木共享风场。
- [x] 将环境风与水平移速合成为有方向的相对气流，按角色朝向映射；垂直速度驱动独立 HairLift 形变。
- [x] 走跑使用已有片段相位产生与落脚一致的上下起伏，两个方向各自平滑，限制最大形变，保留发根和脸部遮罩。

## Verification
- [x] `npm run typecheck`。
- [x] `npm run build`，通过，有chunk体积提示。
- [x] `node --test --test-concurrency=2 'test/**/*.test.ts'`，1791/1791通过。
- [x] 临时浏览器诊断页直接复用默认压缩模型及生产动画：固定站姿，风改变冠顶世界x约0.055；起跳/下落冠顶世界y约3.04/3.15，截图确认实际轮廓变化。
- [x] 正式展示场快跑、跳跃目视检查。
- [x] 子代理 Diff Guard 增量审查，无必修问题。
- [x] 删除临时诊断页，不添加渲染细节自动测试。
