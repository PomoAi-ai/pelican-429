# FIX -- 演示场景角色切换

## Status: verifying
## Task: 121
## Related: N/A
## Baseline Commit: 无（仓库尚无提交，现有文件全部未跟踪）

## Problem
游戏改名演示场景，允许切换角色以检查人形表现。

## Root Cause
现有 F 键已支持正式变身，但缺少可点击入口。

## Fix Plan
- [x] 首页、导航、标题改名，同步英文。
- [x] 武器面板增加切换按钮，复用正式输入与变身逻辑。
- [x] 同步已有测试调用方，无新增 UI 自动测试。

## Verification
- [x] npm run typecheck：通过
- [ ] npm test：默认并发与降低并发均长时间无新增输出，已停止，未取得全量结果。
- [x] node --test test/player-transform.test.ts test/weapons-render.test.ts：21 项通过
- [x] npm run build：通过，有包体大小提示
- [x] diff-guard：无新增防御检查、兜底、低价值测试。
- [ ] 浏览器人工验收：浏览器工具打开页面超时，尚未验收；本地预览 http://127.0.0.1:5175/?mode=game
