# FIX -- Roadster 车体和离子推进效果

## Status: done
## Task: 491
## Related: 490
## Baseline Commit: c292d188

## Problem
现有程序化车辆过于方正，喷气像白色锥体；用户要求还原 Roadster 轮廓，改为离子效果，并加入发光轮毂。

## Root Cause
src/render/flying-roadster-view.ts — 车身使用无倒角的全宽挤压块体，轮拱缺失；喷流使用固定透明圆柱/锥体，没有沿长度和边缘渐隐。

## Fix Plan
- [x] 重绘低矮楔形车体、真实轮拱、内收座舱与连续深灰玻璃。
- [x] 银色轮毂加入细发光环；前灯、尾灯与喷口使用明确发光材质。
- [x] 后推和托举都使用渐隐离子流，运动时尾流增强。白天使用透明蓝色混合保留颜色，亮芯在夜间突出。
- [x] 保持现有车顶承托尺寸与实体运动不变。

## Verification
- [x] npm run typecheck
- [x] node --test test/entity-collision.test.ts test/perspective-player.test.ts（50/50）
- [x] npm run build（通过，既有 chunk 体积提示）
- [x] npm test（1976/1976 通过）
- [x] 浏览器检查白天/夜间车体和离子流，玩家持续随车移动，截图 evidence/ion-flight-night.png
- [x] diff 检查，只改相关渲染文件

实机证据：evidence/ion-flight-night.png 和 evidence/ion-flight-day.png。轮毂光环、前后灯与喷口保持自发光；离子尾流随速度增强，底部离子束持续托举。车顶尺寸和运动/承托逻辑未修改，未新增渲染结构断言测试。
