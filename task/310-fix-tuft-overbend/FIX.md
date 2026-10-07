# FIX -- 收小呆毛弯折

## Status: done
## Task: 310
## Related: 306-fix-tuft-amplitude, 308-hair-lock-motion

## Problem
头顶呆毛摆动过分夸张，用户要求收敛。

## Root Cause
`src/render/grassy/grassy-rig.ts` 的独立呆毛弯角仍为 Sway -.85 / Lift .60，明显大于其他发束 .16–.21。

## Fix Plan
- [x] 呆毛弯角降至 -.28 / .20（约原幅度三分之一），同步作用于已有位置与法线旋转；固定发根、头脸选区与弹簧时序不变。
- 条件性绘图备选不启用：根因明确，可在真实模型上直接调小并验证。

## Verification
- [x] npm run typecheck
- [x] npm test
- [x] npm run build
- [x] 浏览器检查站立、快跑与跳跃；diff-guard 检查

最终验证：typecheck/build通过；1806测试全通过，67.8秒；浏览器检查站立、快跑、跳跃，diff无无关改动。用户随后要求按311从模型基础重建，取代继续局部调参。
