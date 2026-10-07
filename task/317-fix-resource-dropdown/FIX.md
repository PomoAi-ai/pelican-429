# FIX -- 首页资源展示下拉菜单

## Status: done
## Task: 317
## Related: N/A
## Baseline Commit: 2a5455a964e5b71781c766c36abb5245c5f3e903

## Problem
首页资源展示需要直接下拉选择入口。

## Root Cause
index.html 的资源展示是跳转目录页的普通链接，窄屏还会隐藏。

## Fix Plan
- [x] 首页导航改为原生 popover，提供角色展示、历史资料、画质对比、场景资源、声音、场景功能与完整目录入口。
- [x] 增加菜单样式和手机导航布局，沿用中英文翻译。

## Verification
- [x] npm run typecheck：通过
- [x] npm test：1807/1808 通过；唯一失败为世界生成性能阈值（中位数 430.2ms）。单独复跑 `node --test --test-name-pattern='生成耗时中位数' test/worldgen.test.ts` 1/1 通过，未修改测试或生成逻辑。
- [x] npm run build：通过，仅现有大包提示
- [x] 浏览器：7 个入口展开、Esc 关闭、390px 手机布局均已检查；截图 /tmp/pelican-resource-dropdown.jpg。
- [x] diff-guard：未新增防御逻辑或实现细节测试。
