# FIX -- 保留右侧技能提示并额外显示箭头倒计时
## Status: blocked
## Task: 330
## Related: 327-fix-aim-cooldown, 328
## Baseline Commit: 2a5455a
## Problem
箭头倒计时应该额外添加，不能替代右侧已有提示。
## Root Cause
此前将技能组上方状态标签直接移动到箭头，导致右侧标签消失。
## Fix Plan
- [x] 恢复技能组上方独立标签，与箭头标签同时显示相同的实际等待时间。
- [x] 保留按钮内冷却数字和冷却环，取消/松手统一隐藏两处拖动标签。
## Verification
- [ ] npm run typecheck、npm run build 通过；HUD 单文件 12 项通过。全量运行长时间停在 worldgen-seed-sweep/worldgen-terrain/worldgen 三文件，已中断，不能声称全量通过。
- [x] diff-guard 自查通过：复用已有等待时间，两处标签同步更新并在 reset 隐藏，无新逻辑或防御性检查。
- [x] 844×390 触摸预览：释放光子后再次向左拖动，箭头、技能组上方、按钮内同时显示 7.8 秒；截图文件保存时浏览器超时，未保存文件。
