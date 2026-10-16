# FIX -- 基础概念补齐加深格透视

## Status: done
## Task: 437
## Related: 434
## Baseline Commit: 64ef4a38

## Problem
基础概念的深度图及下载说明尚未展示已实现的加深格标准。

## Root Cause
src/ui/site-pages.ts 的 building-depth 节和 draw_depth_reference.py 仅包含普通深2；public 下载文档未同步 docs。

## Fix Plan
- 更新既有绘图源与图：普通/加深对比、扩展尺寸、禁墙和组合规则。
- 更新概念页说明、图片尺寸、真实透视入口和下载文档。

## Verification
- 绘图脚本尺寸断言和图片视觉检查。
- npm run typecheck、npm test、npm run build。
- 浏览器检查基础概念页面；git diff --check。

## Results
- 绘图源更新原图D区；页面中英说明、图片高3700和实际试放链接同步；public下载文档同步docs。
- python3绘图通过原有投影/尺寸断言，已查看完整图片及浏览器排版。uv先遇缓存权限问题，再遇系统配置panic，改用已安装Pillow的python3完成，无新增依赖。
- typecheck和build通过。全量1925项中1924通过，仅未修改的worldgen耗时测试255.8ms略超250ms；单独重跑该文件29/29通过，未改断言。
- git diff --check通过；本次差异无新增防御逻辑、无多余测试。
- 浏览器验收图：concept-depth.jpg。正式游戏、存档未修改。
