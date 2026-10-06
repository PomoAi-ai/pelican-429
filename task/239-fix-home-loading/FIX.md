# FIX -- 首页压缩资源与渐进加载

## Status: done
## Task: 239
## Related: N/A
## Baseline Commit: 8a8fe8c

## Problem
首页资源加载重，缺少渐进呈现，需复用已有压缩精简资源。

## Root Cause
src/app/home-hero.ts 使用 light 原始模型（2.7 MB），该路径不在 WEB_MODEL_SOURCES 中，绕过默认 KTX2 compact 映射；且等待模型后才开始创建背景。

## Fix Plan
- [x] 首页改用与游戏一致的 game 档位，默认命中约 2.1 MB compact 产物，保留显式纹理档位参数。
- [x] 复用现有 92 KB WebP 预览，首屏绘制后启动实时模块；背景先呈现，再加载角色环境。
- [x] 背景已使用 KTX2，无需重复转换资源；不新增渲染细节或源码匹配测试。

## Verification
- [x] npm run typecheck：通过。
- [x] npm test：1766 项全部通过。
- [x] npm run build：通过，仍有超过 500 kB 的代码块警告。
- [x] 浏览器呈现验收：实时背景、鹈鹕及乐谱正常显示，ready 状态已设置，错误面板隐藏。未进行限速网络下的阶段耗时测量。
- [x] 基于编辑前副本核对本次 diff，未改动已有其他工作；按 diff-guard 检查，无新增防御性检查或低价值测试。
