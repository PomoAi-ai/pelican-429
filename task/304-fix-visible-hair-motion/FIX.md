# FIX -- 发梢运动的可见性

## Status: done
## Task: 304
## Related: 302-character-hair-motion
## Baseline Commit: a2f1a92

## Problem
用户反馈头发调整几乎没有可见变化，进一步明确主要是头顶呆毛。优先针对局部呆毛，必须保持头骨、脸与耳朵不变形。

## Root Cause
`src/render/grassy/grassy-rig.ts` 与 `src/render/npc/npc-rig.ts` 的冠顶遮罩收缩至极少数顶部顶点，并叠加很低幅度，正常镜头下接近亚像素变化。

## Fix Plan
- [x] 实际三档模型定位主角顶部呆毛：中心 X=.025/Z=.14、半径 .13、发根 Y=2.94；选区外及发根以下新增位移为零。
- [x] 仅修改 src/render/grassy/grassy-rig.ts，以根部渐增的旋转弯折覆盖局部形变；不扩大头顶整层、不改 Boss。

## Verification
- [x] npm run typecheck — 通过
- [x] npm test — 1806 项通过，0 失败、0 跳过
- [x] npm run build — 通过，保留既有大分块提示
- [x] 浏览器同姿势左右对照：左固定发梢、右共享驱动；明确看到冲锋后弯、下落上翘，头型/脸/耳保持一致。正式默认压缩资源展示场快跑预览正常。临时对照页已移除。

## Constraints
不改 vendor，不提交推送，不以移动或缩放头骨实现头发运动；渲染不新增自动测试。

## Measurements
子代理基于实际 GLB 量化：游戏标准版局部影响244顶点；跑步最大位移约2.56→10.73cm，超过1cm的顶点58→128。精细/标准/轻量版下落最高点上升4.54/4.49/4.25cm，选区外新增位移均为零。未新增渲染自动测试；diff-guard无新增问题。
