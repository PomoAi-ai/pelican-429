# FIX -- 首页按需加载与无用模型清理

## Status: done
## Task: 240
## Related: 239
## Baseline Commit: 8a8fe8c

## Problem
进一步减少首页资源开销，完善渐进加载。

## Root Cause
首页只展示鹈鹕，却通过双形态玩家视图加载隐藏人形。首页实时模块在两帧后立即下载，未检查首屏或页面可见性。

## Fix Plan
- [x] 复用共享鹈鹕视图，首页不下载人形 GLB；游戏保留双形态。
- [x] 首屏可见且页面激活时，在浏览器空闲时开始加载，离开首屏或切换后台停止帧循环。
- [x] 乐谱分辨率沿用游戏像素比上限，预览图保留到场景淡入结束。
- [x] 分离入口模式与存档键配置，移除首页对展示目录及完整调参模块的静态依赖；环境模块在背景首次绘制后动态导入。

## Verification
- [x] npm run typecheck：通过。
- [x] npm test：1745 项通过，架构入口扫描因不允许跨层动态导入失败；修正为仅 app → app 动态导入后，node --test test/architecture.test.ts 的 21 项全部通过。
- [x] npm run build：通过。初始 index 从 126.57 kB 降至 95.70 kB，并移除 53.63 kB tuning 预加载；当前仅额外 preload 0.22 kB language。
- [x] 浏览器首页和请求验证：首页背景、鹈鹕与乐谱正常；无 GLB 请求，四张背景为 KTX2；直接进入页尾锚点时无 home-hero/GLB/KTX2 请求。
- [x] 从页尾返回首屏后实时场景启动且无错误；子代理按 core-review/diff-guard 复核通过。

## Decisions
- 继续局部 fix 流程；不改变视觉资源、游戏规则或引入独立预览实现。
- 渲染与 UI 改动通过浏览器验收，不新增源码匹配或 three.js 细节测试。
