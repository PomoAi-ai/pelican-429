# FIX -- 工作站随机轮播间隔

## Status: done
## Task: 436
## Related: 435
## Baseline Commit: 64ef4a38

## Problem
将固定两秒切换改为每次随机 2～5 秒，保留靠近保持窗口及离开立即恢复。

## Root Cause
src/render/workstation-display-state.ts 使用全局相位计算固定周期。

## Fix Plan
- 改为逐次抽取下一次切换期限，恢复轮播重新抽取。
- 更新已有用例，捕捉只抽取一次或每帧重置期限的错误；不新增测试专用接口。

## Verification
修改前新行为用例失败；修改后定向 5 项通过。类型检查通过，全量 1925 项测试通过，构建通过（大包体积提示）。限定 diff 审查通过，无新增依赖或测试专用接口。

本次未重新进行浏览器动画观感验收，原有过渡动画保持。
