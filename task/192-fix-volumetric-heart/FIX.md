# FIX -- 饱满立体红心

## Status: done
## Task: 192
## Related: 188-fix-health-heart
## Baseline Commit: 3a35077

## Problem
红心应有清晰的三维体积，原先浅挤出外观偏平。

## Root Cause
`src/render/health-pack-view.ts` 原先为薄挤出几何，正反面平坦。

## Fix Plan
- [x] 将现有球体几何映射为双面鼓起的心形，厚度 0.48；复用材质与光照，增加缓慢侧转展示曲面。
- [x] 不改变掉落概率、拾取体或回血规则，不引入依赖或外部模型资源。

## Verification
- [x] `npm run typecheck`、`npm test`（1723/1723）、`npm run build` 均通过。曲面接缝平滑后再次类型检查与构建通过；保留既有 chunk 大小提示。
- [x] 浏览器直接复用游戏 `createHealthPackView` 检查正面、斜侧与侧面；证据 `heart-three-views.png`。完整游戏启动被另一处 GLTF 资源返回 HTML 的错误阻断，因此本次采用共享模型独立预览，没有声称完成完整场景验收。
- [x] diff-guard 自查与相关文件 `git diff --check` 通过；采用已有 three 工具合并接缝顶点并重新计算平滑法线，无额外依赖、无渲染细节测试。

## Notes
预览只在临时浏览器标签页渲染同一模型工厂，无复制模型、无持久预览代码；截图后已关闭。未提交、未推送。
