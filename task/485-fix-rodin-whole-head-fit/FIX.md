# FIX -- Rodin 整头配准与头发预览

## Status: done
## Task: 485
## Related: 484
## Baseline Commit: c292d188ad690a076f771a59ff5c1953155827f9

## Problem
40 号拆分头发基于不同头型，耳周和头皮边界无法与游戏角色对应；需要整体头部配准后再拆分头发，并保留旧版本对比。

## Root Cause
40 号资产先按源头尺寸映射，再局部调整耳周，缺少源整头与目标整头的解剖标志对应，局部缩放无法消除整体头型差异。

## Fix Plan
- [x] 在 `rodin-whole-head-fit-01` 使用 34 个头部标志点对完整源头连续配准，再分离头发；保留脸、双耳、颈部分区到 Blender 文件。
- [x] 发布 `d1-outfit-rodin-ear-aligned-v1.glb`，沿用目标身体、眼睛与动作。
- [x] `src/app/d1-lab-hair-catalog.ts`、`render-lab.html` 登记「41 · Rodin · 整头配准〔修正版〕」，预览与全部头发目录共用。

## Verification
- [x] `npm run typecheck`（通过）
- [x] `npm test`（1966 项通过，0 失败）
- [x] `npm run build`（通过；现有 chunk 体积提醒）
- [x] 非头发网格/节点、完整原始二进制数据、骨骼及动画与 31 号一致（使用现有 `read_glb` 做逐项断言）。
- [x] Docker 5174 实时加载41号，正面、左右侧、背面及跑步切换检查通过，控制台 error 为空；截图存于资产目录。
- [x] Blender 检查顶部及整个头部；配准场的源顶点采样无反折，最终网格顶点检查无大于 .002 的头部穿入，坐标有限。
- [x] 定向 diff 检查通过；无新增测试、异常吞掉或静默兜底。

## Limits
源模型头皮被头发遮挡，头顶和后脑标志点使用估计包络；关键点误差不能代替最终外观检查。旧 40 号保留。
