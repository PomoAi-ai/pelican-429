# FIX -- D1 基础装配模型查看入口

## Status: done
## Task: 385
## Related: N/A
## Baseline Commit: d2d72f4dc50da560b61b71ebeadda6bdbedcec64

## Problem
新制作的 D1 无外服赤脚基础装配模型需要在现有展示场检查。

## Root Cause
src/config/grassy.ts — D1_MODELS 尚未登记新装配资产，现有目录只包含旧裙装模型。

## Fix Plan
- [x] 在共享 D1_MODELS 配置增加静态基础版；沿用共享加载器和展示场控制。
- [x] 从验证后的装配结果复制 public 静态与动画 GLB；共享 D1 动画配置指向新基础模型，旧文件保留。
- [x] 更新角色目录缩略图与描述，动作仍复用同一 D1 骨架加载器。

## Verification
- [x] npm run typecheck
- [x] npm test — 1876 passed, 0 failed
- [x] npm run build — passed, existing chunk-size warning
- [x] 浏览器实际加载静态模型并截图检查正侧视图
- [x] 浏览器实际检查四动作与隐藏头发，无控制台 error
- [x] 检查本次差异，没有新增测试复述配置、兜底或多余校验
