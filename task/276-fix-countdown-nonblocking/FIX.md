# FIX -- 收窄倒计时提示并允许继续操作

## Status: done
## Task: 276
## Related: 274
## Baseline Commit: 8a8fe8c

## Problem
倒计时提示不应左右铺满，也不应影响玩家继续游玩。

## Root Cause
原生模态 dialog 使其他游戏界面不可交互；100vw 样式横向铺满。

## Fix Plan
- [x] 改普通 section，按阶段显隐，不抢焦点、不清输入、不拦截事件。
- [x] 顶部居中窄卡片，最大480px，半透明并允许鼠标穿透。
- [x] 沿用倒计时和自动开战，不新增UI自动测试。

## Verification
- [x] 浏览器确认倒计时期间画布持有焦点，D移动、空格输入及Codex技能可操作；6秒时截图确认“释放中”和实际弹道。临时存档已还原，截图playing.jpg。
- [x] npm run typecheck — 通过。
- [x] npm test — 1788通过，世界生成性能检查中位数276.9ms超250ms；无关UI。单独node --test test/worldgen.test.ts复跑29/29通过，未修改断言。
- [x] npm run build — 通过。
- [x] diff-guard — 通过；未新增防御检查或UI测试。
