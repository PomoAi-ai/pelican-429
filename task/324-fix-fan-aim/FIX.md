# FIX -- 扇形长度、中心箭头与按钮间距
## Status: verifying
## Task: 324
## Related: 319
## Baseline Commit: 2a5455a
## Problem
扇形偏短、缺少中心箭头，技能拖动圆盘与邻近按钮拥挤且遮挡画面。
## Root Cause
weapon-hud 提示最大仅 220px；扇形只有轮廓；拖动盘外扩 17px、触点位移 34px，与 50px 技能按钮的紧凑布局不匹配。
## Fix Plan
- [x] 提示长度 96–340px；扇形收窄并降低填充不透明度，加入中心方向箭头。
- [x] 拉开上排技能按钮和变身按钮间距，拖动盘外扩降为 8px、触点最大位移 24px。
- [x] 清除已不使用的进度环变量；保持原释放机制。
## Verification
- [x] npm run typecheck、npm test（1808 项通过）、npm run build 均通过。
- [ ] 浏览器横屏视觉核对未完成：已读取 844×390 下按钮新位置，但触摸截图时浏览器连接超时，随后两次重连均无法加载浏览器连接策略。不能声称外观已验收。
- [x] 独立 core-review / diff-guard 与限定 diff 检查通过，无发现。
