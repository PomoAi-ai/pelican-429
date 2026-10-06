# FIX -- 玩家死亡动画

## Status: done
## Task: 180
## Related: 179
## Baseline Commit: 3a35077

## Problem
溺水扣血归零后角色仍直立，等待重生期间缺少死亡动作。

## Root Cause
src/render/player-view.ts:37 — 人形选动作只判断骑行、飞行和接地，没有生命归零分支；src/sim/sim-world.ts:297 已有 72 tick 重生等待，渲染未利用这段时间。

## Fix Plan
- [x] 在玩家视图生命归零时优先播放死亡表现，复活清除死亡姿态。
- [x] 复用共享 Grassy 骨骼和既有屈膝姿态，制作倒下、失力与水中缓慢侧倾，不缩放角色。
- [x] 保持死亡动作随游戏暂停冻结；复用已有重生等待，不新增死亡系统。

## Verification
- [x] 浏览器实际溺水死亡与重生验收。
- [x] npm run typecheck
- [x] npm test
- [x] npm run build
- [x] core-review / diff-guard 审查本次增量。

渲染动作按项目规则通过浏览器验收，不新增骨骼或网格细节断言。

## Results
- 新增共享 grassy-death.ts，复用 land 接地屈膝段与原骨骼，低头后倒伏。地面约 .78 秒、水中约 1.05 秒完成，保持原尺寸。
- player-view 根据 HP 优先播放死亡；暂停时停止推进；复活重置姿态混合和移动时钟。鹈鹕死亡时停止原动画并侧倒。
- npm run typecheck、npm test（1708/1708）、npm run build 全通过；独立子代理 core-review/diff-guard Approved，diff --check 通过。
- 浏览器在本次已构建版本真实完成水下耗氧、扣血至 0、死亡倒伏、暂停保持姿态、继续后恢复 100/100 并移动。证据 drowning-death.png。
- 验收期间开发服务遇到并行模型编辑的短暂加载错误，因此使用构建预览验收；结束前确认原 5174 开发页面已恢复正常。未修改这部分并行代码。
- 未提交或推送。
