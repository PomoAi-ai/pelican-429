# FIX -- 加大呆毛摆幅

## Status: done
## Task: 306
## Related: 304-fix-visible-hair-motion
## Baseline Commit: a2f1a92

## Problem
用户要求头顶呆毛浮动更大，继续固定发根和头型。

## Root Cause
src/render/grassy/grassy-rig.ts 的局部弯折目标幅度仍偏保守。

## Fix Plan
- [x] 仅提高呆毛前后弯折目标角度 .65→.85、起落弯折 .40→.60；选区、发根和其他头发保持不变。

## Verification
- [x] npm run typecheck — 通过
- [x] npm test — 1806 项通过，0 失败/跳过
- [x] npm run build — 通过，既有大分块提示
- [x] 浏览器默认压缩模型快跑近景检查通过，头型与面部保持不变。
- [x] diff-guard：单行视觉调参，无新增防御逻辑或测试。
