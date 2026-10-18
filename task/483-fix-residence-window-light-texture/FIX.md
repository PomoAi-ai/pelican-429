# FIX -- 住宅室内光从窗与门进入、逐格材质变化、去黄

## Status: done
## Task: 483
## Related: 471, 456
## Baseline Commit: c292d188

## Problem
471 调整后的反馈：
- 室内像被正面均匀照亮。2D 世界里玩家这一面不存在，室内光只能来自窗户、室内灯，以及开着的门；关闭的能量门透过约一半光。
- 材质感不够：每一格砖、墙板都应有随机且看得出的差别。
- 整体变黄。

## Root Cause
- `src/sim/residence-light.ts:52` — 天空光在空气中每半格只减 8，窗种子 210 能传约 13 格；住宅室内（窗距墙角 2～4 格）天空光处处 .5～.8，环境光按它缩放后整间屋均匀明亮，看不出光从窗进来。白天灯按天光 ≥.35 折减到约 12%，室内灯也被关掉。
- `src/sim/residence-light.ts:136` — 关闭的能量门按实心计入遮挡，太阳经门的透过与实心墙相同。
- `src/render/definition-kit.ts:253` — 逐格变化只是 8 档 ±3.5% 明度的材质克隆，墙板完全没有逐格变化，大面积看起来是同一块板。
- `src/config/ai-city-look.ts:9-12`、`src/render/residence-lighting.ts:260`、`src/render/ai-city-lighting.ts:35` — 暖金主光、黄褐地面半球光、橙色地平线与室内暖反弹叠加，偏黄。

## Fix Plan
- [x] src/sim/residence-light.ts — 空气中天空光按比例衰减（带最小步长保证有限传播），窗附近亮、离窗迅速变暗；关闭能量门记为半透明，导出遮挡度（实心 2、半透明 1）
- [x] src/render/residence-lighting.ts — 太阳柔化遮挡按遮挡度计，门只挡一半；点光可见性只认实心；室内暖反弹减弱
- [x] src/render/ai-city-architecture.ts — 以构件原点哈希做逐格明度、冷暖、粗糙度与纹理相位的随机变化，砖面内加轻微渐变
- [x] src/render/definition-kit.ts — 删去被着色器取代的 8 档材质克隆
- [x] src/config/ai-city-look.ts、src/render/ai-city-lighting.ts — 主光、半球地面光、地平线去黄
- [x] test/residence.test.ts — 遮挡度断言随接口更新；新增“离窗越远天空光越弱、房间中部明显暗于窗边”“关闭能量门透光介于开门与实心之间”

## Verification
- [x] npm run typecheck — 通过
- [x] node --test test/residence.test.ts — 46/46
- [x] npm test — 1966/1966
- [x] npm run build — 通过
- [x] 浏览器 15:30：窗边亮、房间中部暗，灯下有光池；墙砖、岩板逐块可见明度与冷暖差；整体回到中性偏暖；开门后门内侧下部变亮（evidence/）
- [x] 00:13 夜景：灯光池正常，砖面逐块变化可见

## Decisions
- 空气衰减取每半格 ×.82、最小步长 6；试过 ×.86/5，房间中部只亮一档，且 1 格封口下的微光尾巴拖进横洞，放弃。
- 能量门对天空光与灯光沿用实心半格透过 .4（门只有半格厚，约一半）；太阳柔化遮挡按半透明计，点光高光不被门挡。
- 逐块变化放在共享材质着色器，以构件原点为种子；定义构件原先的 8 档材质克隆随之删除，墙板、家具也获得同样的逐块差别。
