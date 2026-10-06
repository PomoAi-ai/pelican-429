# FIX -- 骑车自动衔接飞行

## Status: done
## Task: 299
## Related: N/A
## Baseline Commit: 072a48ec0bc171f09012f05effd623d621fd3022

## Problem
骑车持续按住跳跃无法衔接飞行，必须松开重按。

## Root Cause
src/entities/pelican-ride.ts 的 canTakeoff 强制要求 jumpPressed，使持续按住无法退出骑行。

## Fix Plan
- [x] 保留骑车跳跃上升过程，持续按住在顶点自动弃车起飞；空中重按仍可提前起飞。
- [x] 复用现有下车事件和飞行逻辑，保留能量、下穿和入水限制。
- [x] 更新同主题测试，验证自动转换与下车事件不重复。

## Verification
- [x] 修复前回归用例失败：持续按住 120 tick 后仍处于骑行。
- [x] node --test test/pelican-ride.test.ts
- [x] npm run typecheck
- [x] npm test
- [x] npm run build
- [x] diff-guard 审查

骑车专项 35 项通过；类型检查、全量测试、Vite 构建及 git diff --check 通过。diff-guard 未发现问题。浏览器视觉与操作手感未人工验收。
