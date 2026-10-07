# FIX -- 拖动瞄准冷却倒计时
## Status: verifying
## Task: 327
## Related: 319, 324
## Baseline Commit: 2a5455a
## Problem
技能冷却时拖动瞄准仍显示正常金色，无法在手指遮挡按钮时清楚判断何时可释放。
## Root Cause
weapon-hud 的冷却文字仅位于按钮内，瞄准预览未表达冷却状态。
## Fix Plan
- [x] 沿用现有真实技能冷却，在技能组上方显示一位小数倒计时，避开手指；就绪时显示松手释放。
- [x] 冷却时预览变淡偏灰，按钮细圆环显示恢复进度；结束恢复金色。
- [x] 吞弹期间可二次释放不误标冷却；不改战斗和释放逻辑，不新增 UI 自动化测试。
## Verification
- [x] npm run typecheck、npm test（1808 项通过）、npm run build 均通过。
- [ ] 浏览器视觉检查未完成：两次创建本地预览页均因浏览器连接策略加载失败而无法访问页面。
- [x] 独立 core-review / diff-guard 与限定 diff 检查通过。
