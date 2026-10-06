# FIX -- 序章堡垒前哨环境衔接

## Status: done
## Task: 218
## Related: 215
## Baseline Commit: 8a8fe8c

## Problem
序章新版堡垒只加载建筑和黑洞，前哨地表、植物与游戏雨雪没有同步。镜头回到黑洞时石柱缺少地面承托，进入游戏后地表与雨雪突然出现。

## Root Cause
src/app/intro-fortress.ts 仅调用 createFacilityPresentation，而真实游戏还通过 createWorldViews / createWorldPrecip 加载关卡地形与环境。原二维 world 函数的降水层删除后没有替代。

## Fix Plan
- [x] src/app/intro-fortress.ts — 复用关卡地表与天气模块，不创建角色，不复制模型；暂停/拖动不传负时间，完整释放资源。

## Verification
- [x] 浏览器查看序章黑洞近景和全景，确认地表、雨雪、暂停/拖动正常；暂停两次截图一致，倒拖后可继续播放，结尾自动进入主线，控制台无错误或警告。
- [x] npm run typecheck — 通过。
- [x] npm test — 1756/1756 通过，约 51 秒。
- [x] npm run build — 通过，479 模块；保留已有 chunk 大小提示。
- [x] diff-guard 范围内审查通过；未新增防御检查或测试，无吞错和静默兜底。
- [x] Bug is fixed

## Decisions
- 只补齐上一轮遗漏的共享环境，不修改战斗、存档、入口和前半段序章。
- 本次是视觉装配修复，按项目规则不新增自动视觉、源码或网格断言测试。
- 子代理完成环境装配，主线程核对共享配置、资源释放与浏览器表现；成功和失败路径均逆序释放，不清理角色模型缓存。
- 浏览器证据：output/intro-fortress/environment-overview.jpg、environment-near.jpg、environment-game.jpg。
