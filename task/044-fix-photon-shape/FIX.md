# FIX -- 光子轮廓与表情

## Status: verifying
## Task: 044
## Related: 042-fix-photon-reference
## Baseline Commit: 无 HEAD；修改前副本 $TMPDIR/photon-clean-before

## Problem
用户认为参考图修正版仍然难看：光体过曝、轮廓毛糙、表情细碎，未表现出参考图里干净圆润的精灵。

## Root Cause
高密度粒子使用加色混合，使中心累积过曝；大尺寸光点扩散边界，五官使用随机采样导致形状不稳。

## Fix Plan
- [x] 重做粒子光体的混合、形状与描边，收敛泛光；主体普通透明混合，圆润比例与青色细描边。
- [x] 稳定眼睛与微笑的粒子采样，保留背面表情隐藏。
- [x] 更新角色说明与真实预览缩略图；截图 output/luma-preview/photon-clean.jpg、photon-clean-page.jpg。

## Verification
- [ ] npm run typecheck：未通过。两次检查均为任务外的风力档位类型错误：src/ui/lab-controls.ts:30、35 与 src/ui/showcase-panel.ts:168 的标签映射缺少 gale/moderate。未修改这些模块。
- [x] npm test：1492 项通过、0 失败，日志 $TMPDIR/photon-clean-tests.log。
- [x] npm run build：通过，保留超过 500 kB 的产物体积提示。
- [x] 浏览器外观、五动作、明暗、正面/三分之四/背面及暂停重播检查。
- [x] diff-guard：对照修改前副本检查，改动仅涉及共享粒子模型、角色高度配置、说明与截图。无新增测试、防御性兜底或错误吞没。
