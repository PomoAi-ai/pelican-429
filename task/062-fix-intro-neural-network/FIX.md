# FIX -- 开场下方神经网络律动

## Status: verifying
## Task: 062
## Related: N/A
## Baseline Commit: 无（仓库尚无 HEAD，现有文件均未跟踪）

## Problem
在万声归一现有开场下方加入随音乐律动的神经网络。

## Root Cause
`src/render/intro-finale.ts` 的开场合成仅包含谱带、文字与场景，尚无神经网络层。

## Fix Plan
- [x] 在同一渲染器添加九层神经节点、连接与逐层流动的信号，复用颜色、绘图函数和时间轴。
- [x] 与 120 BPM 拍点及现有重音同步；构建段降低亮度，静默前淡出；暂停、拖动和目录预览共用效果。
- [x] 纯视觉改动，不新增自动测试、依赖或配置。

## Verification
- [x] `npm run typecheck`：最终通过。首次因 facility-app.ts 的 CSS 导入失败；工作区该导入随后由任务外修改移除，本任务未修改它。
- [ ] `npm test`：1501 项中 1498 通过、3 失败。facility CSS 导入引起的架构失败随后单独重跑 `node --test test/architecture.test.ts`，21/21 通过；另有 render-tiles.test.ts:79 的 tiles-climb-0-0 断言失败、worldgen.test.ts:420 的生成性能中位数 482.1ms 超过 250ms。均不涉及本次修改的开场渲染器，未修改相关代码与断言。
- [x] `npm run build`：通过（现有大 chunk 提示）。
- [x] 浏览器观察播放、暂停、拖动、13.2 秒感知段、19.2 秒高潮和 22.8 秒静默转场；控制台无错误或警告。
- [x] diff-guard 检查本次改动：无新增依赖、内部防御校验、错误兜底或实现复述测试。

视觉需求已实现；全仓验证存在上述无关失败，因此保留 verifying 状态。
