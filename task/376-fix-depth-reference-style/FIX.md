# FIX -- 参考图中的半透明格面

## Status: done
## Task: 376
## Related: 374
## Baseline Commit: 975f136

## Problem
用户提供截图明确要求淡色半透明格面、格子边线和可辨认的厚度，而非完全没有表面的纯线框。

## Root Cause
definition-inspection线框模式把表面材质设为不可见，丢失参考图所需体积。

## Fix Plan
- [x] 线框检查模式保留低透明度无纹理格面，墙与实体按不同透明度显示，原材质可恢复。
- [x] 更新按钮说明和定义文档。

## Verification
- [x] npm run typecheck / npm test / npm run build
- [x] 浏览器对照半透明格面、真实视角恢复。
- [x] diff-guard / 空白检查。

## Results
参考图样式应用到六景的透视线框显示：纹理暂时去除，实体面透明度0.38、墙面0.18，恢复原格网/几何边缘透明度；克隆保留平台模板遮罩和材质钩子，原材质未修改。角色与自然资源保持真实显示。按钮名称为透视线框，概念文档镜像同步。

类型检查通过；1872项测试通过、0失败；构建通过（既有大chunk提示）。浏览器已确认全景和玩家视角下的淡色格面与实景恢复，最终页面留在透视线框。截图/tmp/depth-reference-translucent.png。diff-guard无问题，未新增视觉实现细节测试；未提交或部署。
