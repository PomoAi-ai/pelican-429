# FIX -- 首页黑洞与乐谱启动延迟

## Status: done
## Task: 250
## Related: 248
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
首页静态内容已显示，黑洞与乐谱仍延后出现。保留首页压缩 WebP 和游戏现有行为。

## Root Cause
- src/main.ts：首页实时场景等待 window.load，之后再通过 requestIdleCallback 调度。
- src/app/home-hero.ts：乐谱初始化和动画循环被场景贴图及 facility-environment 动态导入、世界初始化串行阻塞。
- 本地加载时间线：load 222 ms，home-hero 请求 260 ms，贴图请求 453 ms，环境模块请求 887 ms。此数据仅说明依赖顺序，不代表生产冷缓存耗时。

## Fix Plan
- [x] 首屏可见时下一帧启动，不等待整页 load 或空闲回调；保留离屏和隐藏页限制。
- [x] 乐谱先绘制，黑洞场景就绪后启动动画；环境初始化独立完成后接入。

## Verification
- [x] npm run typecheck
- [x] npm test（1772 通过，0 失败）
- [x] npm run build（通过，有 chunk 大小提示）
- [x] 浏览器验证首页场景与乐谱正常显示、无控制台错误。
- [x] diff-guard：仅检查本次变更，无新增防御或低价值测试。

浏览器可见验证：背景仍为占位图时乐谱已绘制；随后黑洞、鹈鹕与天气完整显示，无控制台 error。未新增自动化渲染测试。未进行生产冷缓存性能测试。
