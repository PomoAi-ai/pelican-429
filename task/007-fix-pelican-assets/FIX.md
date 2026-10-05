# FIX — 补齐鹈鹕原始角色资源

## Status: done
## Task: 007
## Related: 002
## Baseline Commit: 仓库尚无提交；本轮涉及文件备份在 $TMPDIR/pelican-assets-baseline/

## Problem
角色展示场只有游戏截图，缺少原目录已有的插画、立体参考、模型截图及历史版本。

## Root Cause
src/config/showcase.ts 的角色只登记单张缩略图；src/ui/showcase-panel.ts 没有原资源入口。原资源位于 ../鹈鹕/pelican-3d/standing-reference/ 及原项目根目录。

## Fix Plan
- [x] 原样恢复原项目已整理的参考资源，记录来源与 SHA-256。
- [x] 为鹈鹕登记按类别分组的资源，左侧使用原角色插画。
- [x] 角色卡直接显示资源类别和缩略图，点击看大图和打开原文件；保留实时模型和动作控制。
- [x] 明确 3D 风格图片、历史模型截图与当前可操作模型的区别。

## Decisions
- 当前任务属于已授权角色卡图片资源的补齐，直接沿用现有展示场；在本会话完成，不调用其他会话或子代理。
- 不改模型快照；原模型为 Three.js 程序化网格，已在本项目接入站立及骑行模型。原项目非依赖、非临时目录未发现 GLB/GLTF/FBX/OBJ/BLEND 文件。
- 图片使用原文件与原缩略图，不生成或转换图片；历史截图不标作可切换的实时模型。
- UI 依照 AGENTS.md 在浏览器验收，不新增自动 UI/源码匹配测试。

## Verification
- [x] 原文件与复制文件逐字节哈希一致：105 个图片文件（63 项完整资源、42 张原有缩略图），覆盖原 standing-reference 的全部 98 个文件；另附 2 份原始提示词。
- [x] npm run typecheck
- [x] npm test：最终全量 1460/1460 通过，0 失败；日志 $TMPDIR/pelican-assets-tests-final.log。
- [x] npm run build：通过，保留大 chunk 提示。
- [x] 浏览器核对六类分类、看图翻页、原文件链接、SVG 加载、收起图片、骑行/游泳独立切换与两张对照卡；可见图片无加载失败。

## Integration Notes
- 同一工作区同时加入场景资源展示场，本轮图库仅挂在角色模式，不改场景资源功能。
- 首次全量测试为 1439 通过、1 个架构测试文件失败：同时新增的 ShowcaseCard.resource 使用 import() 类型表达式，架构扫描器禁止该语法。仅改为等价的静态 import type；架构文件单独重跑 21/21 通过，随后重跑全量测试。
- 任务编号因工作区同时新增 006-resource-showcase，调整为 007。
- 截图：[local source path removed]。
