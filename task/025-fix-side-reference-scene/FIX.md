# FIX -- 侧面绘制图放入游戏场景

## Status: done
## Task: 025
## Related: 012-grassy-character-cards
## Baseline Commit: N/A（仓库尚无提交）

## Problem
用户需要直接查看最新 3.1 头身侧面图片在真实场景内的效果，并与现有鹈鹕比较。

## Root Cause
assets/characters/grassy/proportion-compare.html:46 — 当前对照只放置旧人形模型，无法展示新侧面绘制图。

## Fix Plan
- [x] public/characters/human/turnaround-3p1/right-cutout.png — 从右侧参考图去背景，保留同一角色。
- [x] assets/characters/grassy/side-reference-scene.html — 复用游戏世界、灯光和鹈鹕模型，按非透明人物高度 2.85 格贴地摆放图片，提供近景和游戏视距。
- [x] 在当前浏览器打开新预览并保存近景、游戏视距截图，最终停留在门前近景。

## Verification
- [x] 透明图和场景浏览器视觉检查：人物完整、贴地、无卡片背景；近景和游戏视距可切换，远景使用短标签避免遮挡。
- [x] npm run typecheck — 通过。
- [x] npm test — 首次 1470/1471 通过；唯一失败是架构扫描器把既有 intro.ts 英文文案中的 window 单词识别为 DOM 依赖。此预览不修改 src，该文件随后在工作区中被其他工作改成 view，针对失败文件重跑 node --test test/architecture.test.ts，21/21 通过。未改测试或跳过用例。
- [x] npm run build — 通过，已有主包大于 500 kB 的体积提示。
- [x] 子代理按 core-review/diff-guard 复核新增 HTML，通过；alpha 边界和贴地公式正确，无隐藏错误兜底或多余防御检查，没有新增渲染断言测试。
