# FIX -- 光子移动时贴近玩家

## Status: verifying
## Task: 058
## Related: 052
## Baseline Commit: 无 HEAD；模块基线存于 $TMPDIR/photon-follow-before.ts

## Problem
玩家行进时光子仍大范围游走，距离过远。

## Root Cause
src/render/luma/luma-companion.ts 的游弋振幅未区分移动与静止。

## Fix Plan
- [x] 移动时平滑收拢横向、纵向及深度振幅，前导距离降到 1.4 格，提高跟随速度。
- [x] 停下后渐变恢复原有游弋振幅；保留光子外观、照明及尾迹。

## Verification
- [x] `npm run typecheck`、`npm run build` 通过；构建有既有大 chunk 提示。
- [ ] `npm test`：1498/1499 通过；世界生成性能测试中位数 434.7 ms 超过 250 ms，测试不调用本次渲染模块。未改测试阈值。
- [x] 浏览器按键移动及停止后观察，控制台无错误；短按输入不能代替持续按住，补充临时内存模拟持续行进验证。
- [x] 临时 60 Hz 模拟：静止横向跨度 10.19 格，5 格/秒行进时跨度 0.79 格，停下后恢复 10.10 格；无新增测试文件。
- [x] diff-guard：没有新增防御性判断、吞错或实现细节测试。
