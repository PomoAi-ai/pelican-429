# FIX -- 头发总览滚动保留画面

## Status: verifying
## Task: 454
## Related: 453
## Baseline Commit: 64ef4a38

## Problem
滚出视口后删除iframe，返回时卡片空白且等待重新加载，妨碍快速对比。

## Root Cause
src/app/d1-hair-gallery.ts的IntersectionObserver离屏移除全部三维内容，没有保留画面。

## Fix Plan
- [x] 每张卡片保留真实WebGL预览截图，离屏时只释放三维上下文。
- [x] 三维重新加载时继续显示快照，首帧完成后再显示实时画面。
- [x] 旋转与缩放后更新快照，定时任务在页面销毁时清理。
- [x] 首次未加载模型显示明确文字，不以空白充当成功。

## Verification
- [ ] npm run typecheck：首次通过；最终复跑被其他改动的residence-lighting.ts引用缺失residence-light-field.ts阻塞，本次文件无类型报错。
- [x] npm test：1949项全通过
- [x] npm run build
- [x] 浏览器滚动往返快照保留、实时恢复及同步拖转
- [x] core-review / diff-guard：两项发现已修复，复审Approved

## Results
- 首屏10个预览生成快照，滚动后累计23个；离屏首卡firstCached=true、firstLive=false，返回首屏完整显示。
- 主动切风格/预设角度清除旧快照，不将旧效果混入新对比；失败时显示原iframe中的真实错误。
- 窗口尺寸变化后更新截图，缓存按比例显示，不拉伸；销毁时清除截图计时器。
- 截图output/hair-gallery/retained-previews.png；未提交或推送。最终类型检查有无关文件缺失，保留verifying状态。
