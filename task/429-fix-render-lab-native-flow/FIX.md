# FIX -- 独立渲染页接入原生发束校色阶段稿

## Status: done
## Task: 429
## Related: N/A
## Baseline Commit: d2d72f4dc50da560b61b71ebeadda6bdbedcec64

## Problem

独立渲染页需要增加原生发束贴根与校色阶段稿，供用户与所有既有版本切换比较。此任务仅接入页面选项，不包含资产制作。

## Root Cause

`src/app/d1-render-lab.ts:15`、`:18`、`:49` 的类型、模型路径和 URL 值校验尚未包含新稿；`render-lab.html:29` 的模型选择框尚无对应选项。

## Fix Plan

- [x] `src/app/d1-render-lab.ts` — 增加 `blender-native-flow` 类型、资源路径和既有校验链分支，保持默认值及共享渲染代码不变。
- [x] `render-lab.html` — 追加“Blender · 原生发束贴根与校色〔阶段稿〕”选项，保留所有旧选项及默认选择。

## Verification

- [x] 检查本次增量 diff，只包含新版本接入及此追踪记录；按 diff-guard 检查新增行，无问题。
- [x] `npm run typecheck` — 通过。
- [x] `npm test` — 1913 个测试、301 个 suite 全部通过，0 失败、0 跳过。
- [x] `npm run build` — 通过；保留既有大于 500 kB 的 chunk 警告。
- [x] 浏览器验证 — 新阶段实际载入；10 种渲染两列滚动展示；正面、45°、侧面及全身切换；半闭眼、闭眼；idle/walk/run/jump、惯性开关、刚性跟随切换；旧眼周版本仍可载入。HTML 默认选项未改。

页面接入完成。浏览器发现的资源总高和材质角色名称问题已在独立预览资产中修正，未放宽共享校验。实际截图与资产契约保存在 `assets/characters/grassy/customization/models/d1-render-lab-blender-hair/paid-tools-crown-study-01/draft-12/`。造型仍是阶段稿，美术验收未完成。
