# FIX -- 住宅视角与玩家控制独立

## Status: done
## Task: 493
## Related: N/A
## Baseline Commit: c292d188ad690a076f771a59ff5c1953155827f9

## Problem
正视、斜视、俯视切换会退出跟随；游玩视角会强制退出建造并开始游玩。

## Root Cause
src/app/residence-app.ts — 角度按钮复用了总览操作，游玩视角修改了玩家控制状态。
src/app/perspective-controls.ts — game 模式忽略角度。

## Fix Plan
- [x] 角度切换保留跟随状态，跟随镜头支持角度。
- [x] 游玩视角仅切换镜头，保留建造和暂停状态。

## Verification
- [x] npm run typecheck — 通过
- [x] npm test — 1977 个测试通过
- [x] npm run build — 通过（大 chunk 提示）
- [x] diff-guard：无新增兜底、内部校验或实现复述测试。
- 浏览器视觉和交互待人工验收；按仓库规则不添加 UI 自动测试。
