# PLAN -- 动态分辨率（优化计划 P1）

## Status: done
## Task: 537
## Related: 531
## Baseline Commit: a13fdd68（工作区含大量未提交改动）

## Goal
基线显示 4K 屏 2× 像素比下 GPU 帧耗时 11-26 ms，主场景 render 段最大且随像素数增长。游戏页按 GPU 计时自动调像素比：超预算降，有余量回升。

## Non-goals
- 不按帧间隔调节：CPU 瓶颈时降分辨率省不下时间，只会变糊。
- 不覆盖开发机桌面的场景工作台（tile-scene 不经过 game-app）。
- 不加用户设置项；`minPixelRatio` 设为与 `maxPixelRatio` 相同即关闭。

## Acceptance Criteria
- game-app（正式发布、主线、手机、嵌入）按 GPU 均值调像素比；基准（`?bench=`）像素比固定。
- 不支持 timer query 的浏览器不调节，也不报错。
- typecheck、全量测试、build 通过。

## Decisions
- 跳过 explorer/architect：P0 已摸清渲染链与 GPU 计时器，改动逐文件明确。
- 调节器是 core 纯逻辑（`core/resolution-governor.ts`）：超预算按 `sqrt(预算/实测)` 一次降到位（GPU 填充约与像素比²成正比），按 `step` 量化、不低于下限；回升需连续 `raiseSamples` 个窗口满足“预估升一档后 ≤ 预算 × 0.85”，避免在两档间来回切。
- 默认 `render.lighting.dynamicResolution = { minPixelRatio: 1, targetGpuMs: 12, step: 0.25, raiseSamples: 4 }`，由 validateLightingTuning 校验；上限是初始像素比 `min(devicePixelRatio, maxPixelRatio)`。
- GPU 读数：面板与调节器共用 frame-loop 的 `readGpu`（读均值 → reset → 喂调节器）。面板展开时随面板刷新读，收起时每 30 帧读一次；调节器存在时每帧都开 GPU 计时（CPU 分段计时仍只在面板展开时开）。reset 会丢弃在途查询，换档后旧像素比的帧不会混进下一个窗口。
- `Stage.setPixelRatio`：`renderer.setPixelRatio` 后按当前 CSS 尺寸重走 `setSize`，后期目标（GTAO/bloom/SMAA）随之重建；原野背景 RT 每帧按绘制缓冲尺寸调整，不需要额外改动。
- 浏览器验证：嵌入 iframe 进入 game-app 原野森林，像素比由 2 降到 1（缓冲 1920×936 = CSS 尺寸），画面正常、无报错。本机同时开着其他 3D 页，GPU 被争用（帧 65 ms、CPU 10 ms），无法测得干净的前后对比；回升路径由单元测试覆盖。
- 无停止条件，直接实现。

## Implementation Map (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/core/resolution-governor.ts（新建） | 调节器 | — | ✓ |
| 2 | src/config/lighting-rules.ts | `dynamicResolution` 类型、默认值、校验 | 1 | ✓ |
| 3 | src/render/stage.ts | `setPixelRatio` | — | ✓ |
| 4 | src/app/frame-loop.ts | `resolution` 依赖、共用 `readGpu`、GPU 计时开关 | 1,3 | ✓ |
| 5 | src/app/game-app.ts | 非基准时创建调节器 | 4 | ✓ |
| 6 | test/perf-panel.test.ts | 调节器降档/回升/上下限用例 | 1 | ✓ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| `npm run typecheck` | yes | ✓ |
| `npm test`（2036/2036） | yes | ✓ |
| `npm run build` | yes | ✓ |
| 浏览器：game-app 下像素比自动下调、画面正常 | yes | ✓ |
