# FIX -- Pages 源码依赖与项目子路径

## Status: done
## Task: 207
## Related: N/A
## Baseline Commit: 74c55040f66b0a8fb812939ed798c8e8d5cd6b91

## Problem

首次 GitHub Pages 流水线在 Vite 构建阶段失败，无法解析游戏音频模块。

## Root Cause

`src/app/game-app.ts:38` 与 `src/app/frame-loop.ts:36` 已引用 `game-audio.ts`，但对应文件未提交。工作区同名文件已有后续功能，不能直接混入旧版发布。

首次成功部署后，浏览器发现首页入口和运行时资源配置使用域名根路径，访问时离开 Pages 项目子目录。Vite 的构建 base 不会自动改写普通导航链接或运行时字符串。

## Fix Plan

- [x] 以本地历史双参音频模块为基础，去除已发布版本未包含的黑洞音效依赖，复用既有音频类型、节拍和音量；仅暂存兼容模块，保留工作区后续开发内容。
- [x] 在 TypeScript 配置中添加 `vite/client`，补齐 Vite CSS 类型声明。
- [x] 提交并推送最小修复 `9a4faca`，重新部署 Pages。
- [x] 将项目入口、模型、角色图片与场景资源改为项目相对地址；角色图片解析区分项目相对路径与角色目录相对路径，保留工作区其他开发内容。
- [x] 复核修正历史图库和展示场的首页链接、角色图片 CSS 选择器。

## Verification

- [x] 首次 Actions 构建复现模块缺失。
- [x] 独立源码副本的类型检查复现缺失模块及 CSS 类型声明。
- [x] 发布源码独立副本 `npm run typecheck` 通过。
- [x] 执行发布源码独立副本 `npm test`：1,596 项中 1,592 项通过、4 项失败。三项架构失败来自原有 UI 音频模块的 CSS 导入规则和 UI→app 类型依赖；相关文件逐字节与修复前版本一致。性能用例受并行负载影响，单独重跑通过。本次没有修改断言或跳过用例。
- [x] 独立审查确认音频接口兼容，没有新增吞异常或成功形兜底。
- [x] GitHub Actions 的 `npm ci`、`npm run build`、Pages artifact 上传成功；没有在 CI 中运行测试。
- [x] 子路径修复后，发布源码独立副本类型检查再次通过。
- [x] 子路径修复后，现有 `test/showcase.test.ts` 28 项全部通过。
- [x] 提交 `bba2d25` 的 GitHub Actions 构建与部署通过，运行记录：https://github.com/PomoAi-ai/pelican-429/actions/runs/37437606412 。
- [x] 线上首页 HTTP 200，七张首页图片加载成功；导航保留项目子路径。浏览器进入测试关卡并完成鹈鹕到人形切换，模型正常显示，控制台无错误。

## Follow-up

三项既有架构规则失败未在发布修复中扩大处理。GitHub 另报告开发依赖 `source-map-js` 的高危拒绝服务告警，修复版本为 1.2.2：https://github.com/PomoAi-ai/pelican-429/security/dependabot/1 。
