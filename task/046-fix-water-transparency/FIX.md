# FIX -- 水体透出背景

## Status: done
## Task: 046
## Related: N/A
## Baseline Commit: 无 HEAD；相关文件快照 $TMPDIR/pelican-water-transparency-before

## Problem
水体挡住背景，呈现不透明色块。

## Root Cause
src/render/water-shading.ts — 前面使用透明混合，但背板是不透明材质并写入深度，背景完全被遮挡；顶面透明度为 0.72–0.94，下沿色带为 0.82，进一步加重遮挡。

## Fix Plan
- [x] 共享水体背板改为 0.12 不透明度的淡色透明层，关闭深度写入。
- [x] 顶面按视角增加反射遮挡、岸边泡沫局部增强；下沿色带减轻遮挡，保留水体原有深浅渐变。
- [x] 明确背板先于水中微粒和前面绘制；游戏与展示场共用修改。

## Verification
- [x] npm run typecheck：通过。
- [x] npm test：1499/1499 通过，无跳过。
- [x] npm run build：通过，存在产物体积提示。
- [x] diff-guard 审查：修改限于共享水体材质、绘制说明与过时测试断言，无新增防御分支或渲染细节测试。
- 原测试要求背板不透明，与新需求相反，移除该过时断言，保留其他现有检查。
- 浏览器视觉验收：前序工具 URL 安全策略阻止访问本地页面，未绕过；最终观感待浏览器人工验收，不新增渲染细节自动测试。
