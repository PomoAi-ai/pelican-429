# FIX -- Pages 构建缺失源码依赖

## Status: verifying
## Task: 207
## Related: N/A
## Baseline Commit: 74c55040f66b0a8fb812939ed798c8e8d5cd6b91

## Problem

首次 GitHub Pages 流水线在 Vite 构建阶段失败，无法解析游戏音频模块。

## Root Cause

`src/app/game-app.ts:38` 与 `src/app/frame-loop.ts:36` 已引用 `game-audio.ts`，但对应文件未提交。工作区同名文件已有后续功能，不能直接混入旧版发布。

## Fix Plan

- [x] 以本地历史双参音频模块为基础，去除已发布版本未包含的黑洞音效依赖，复用既有音频类型、节拍和音量；仅暂存兼容模块，保留工作区后续开发内容。
- [x] 在 TypeScript 配置中添加 `vite/client`，补齐 Vite CSS 类型声明。
- [ ] 提交并推送最小修复，重新部署 Pages。

## Verification

- [x] 首次 Actions 构建复现模块缺失。
- [x] 独立源码副本的类型检查复现缺失模块及 CSS 类型声明。
- [x] 发布源码独立副本 `npm run typecheck` 通过。
- [ ] 发布源码独立副本 `npm test` 通过。
- [ ] GitHub Actions 构建与部署通过。
- [ ] 线上页面及资源可访问。
