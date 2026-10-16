# FIX -- 发束贴合阶段稿的独立预览

## Status: done
## Task: 433
## Related: 429
## Baseline Commit: 64ef4a38a9a5f9b2a97c97ea573b69729aeea260

## Problem

已购买的 Blender 工具已安装。继续制作冠发与后脑贴合阶段稿，保留此前所有模型，新增可选择的独立预览；美术目标仍是贴合头皮并接近原画，本次入口接入不代表整体美术验收完成。

## Root Cause

`export_shp_assembly.py:54` 固定八条原生发束；新增两条冠顶薄衬复用原有颜色图，现有按对象分配八格图集的方式会越界。`src/app/d1-render-lab.ts:15` 与 `render-lab.html:29` 的模型选项尚无本阶段。

## Fix Plan

- [x] 独立导出器按八张唯一图片分配图集，多条发束复用同一格。
- [x] 保存新阶段源模型、制作配方、量测和预览资产，不覆盖 draft12。
- [x] 加入单独模型选项和 URL 映射，保留原默认值与游戏入口。

## Verification

- [x] Blender 导出与重新导入检查；根绑定、T/flow、眼睛和动作数据保留。
- [x] 浏览器检查新阶段、旧阶段、正侧面、眨眼和动作。
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run build`
- [x] Diff guard：只改任务相关内容，不新增镜像渲染实现或低价值测试。

## Results

新选项已在浏览器加载并完成旧版切换检查。Blender 独立导出/重导入、Three 标准高度与四动作校验通过；1919 个测试通过，typecheck/build 通过。独立 diff guard 和真实 GLB UV 解码审查通过。整体彩色造型仍未达到近原画目标，已在 draft13/review.md 明确记录，未把本入口任务完成解释为美术目标完成。

最终固定镜头量测：本稿正/侧全发IoU .695854/.723684，draft12为.696842/.725632，整体轮廓未提升；冠顶与后脑覆盖局部改善。新稿只作为独立比较阶段保留，未升为最佳稿。
