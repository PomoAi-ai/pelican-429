# FIX -- 顶部头发版本按钮

## Status: verifying
## Task: 444
## Related: 441
## Baseline Commit: 64ef4a38

## Problem
头发切换藏在下方下拉框，用户要求移到顶部直接用按钮。

## Root Cause
render-lab.html将版本选项放在侧栏select中。

## Fix Plan
- [x] 全部版本移到顶部换行按钮。
- [x] 保留URL、选中态、加载锁定与球眼兼容限制。

## Verification
- [ ] npm run typecheck
- [ ] npm test
- [ ] npm run build
- [x] 浏览器切换与选中态：Rodin与独立重制版往返成功，保留body/45参数，截图/private/tmp/hair-buttons-top.png
- [x] diff-guard：仅改控件、选择事件、兼容限制与样式，无新增测试或防御分支

## Check limitations
本次三项全仓命令均已运行；typecheck/build因scene-workspace引用tile-material-gallery.ts缺失失败；npm test因同一缺失及building-sandbox.css导入违反既有架构检查失败。这些文件不属于本次改动，保留verifying状态，不修改其他任务文件。
