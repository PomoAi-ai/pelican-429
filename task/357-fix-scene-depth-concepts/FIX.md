# FIX -- 场景分层概念入口

## Status: verifying
## Task: 357
## Related: N/A
## Baseline Commit: 975f136

## Problem
三种场景分层透视图尚未接入基础概念定义，天空定义还需补齐云、太阳、月亮与星星。

## Root Cause
src/ui/site-pages.ts 的概念目录与场景组成内容未引用最新场景分层图片。

## Fix Plan
- [x] 在「资源 → 基础概念定义」新增默认展开的「场景分层」目录与五个对应锚点。
- [x] 展示山谷阶地、错落建筑、洞穴层叠及天空透视图，使用现有图片样式、双语说明、原图链接和懒加载。
- [x] 明确两层背景格子与示例三层远景、独立天空元素和待定参数，提供深度定义下载。

## Verification
- [ ] npm run typecheck：被本轮未修改的 src/app/furniture-player-inspection.ts:16 TS7006 阻塞，group 参数隐式 any。
- [x] npm test：1842 项通过，0 失败，约 67 秒。
- [x] npm run build：通过；现有大于 500 kB 的 chunk 提示仍在。
- [x] 浏览器人工查看默认展开的场景分层目录；山谷、建筑、洞穴、天空四图均可见，点击目录可跳到相应小节；天空页面截图见 sky-page.png。
- [x] diff-guard 仅检查本轮新增内容，无发现；未新增静态文案测试、防御分支或依赖。

## Limits
现有普通构建通过资源白名单排除全部 concepts 文件；开发服务器可直接提供概念资料，完整资源构建使用已有 full 模式，本轮未修改构建范围。未提交或推送。
