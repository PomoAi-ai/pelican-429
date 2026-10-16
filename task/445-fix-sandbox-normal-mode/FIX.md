# FIX -- 自由搭建场普通鼠标模式
## Status: done
## Task: 445
## Related: 443
## Baseline Commit: 64ef4a38

## Problem
工具栏只有铺设和清理刷，缺少普通鼠标模式。
## Root Cause
src/app/building-sandbox.ts 工具状态只支持两种编辑模式，默认进入铺设。
## Fix Plan
- [x] 添加普通模式并默认选中；阻止铺设/清理鼠标操作，隐藏预览和占格框。
- [x] 切换工具时终止旧笔画，保留镜头操作并同步说明。
## Verification
- [x] 类型检查和现有building-brush测试
- [x] 浏览器验证普通模式点击不改变构件数量、模式切换正确
- [x] diff-guard：只修改本次工具交互，无新增低价值测试、异常捕获或兜底。

类型检查通过，building-brush现有4项测试通过。浏览器验证普通点击0→0、铺设0→1、切普通点击1→1、清理1→0，最终停留普通模式且预览隐藏。本次单模块UI改动未重跑全量测试或构建。
