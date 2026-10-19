# PLAN -- 渲染性能观测与基准体系（优化计划 P0）

## Status: done
## Task: 531
## Related: N/A
## Baseline Commit: a13fdd68（工作区含大量未提交改动，快照 `git stash create` = 185d05c8；对比用 `git diff 185d05c8`）

## Goal
为后续渲染优化（P1 画质分级/动态分辨率/光束、P2 几何提交、P3 阴影缓存、P4 主线程瘦身）建立可复现的度量：
1. 游戏主场景逐 pass 的 GPU 耗时（阴影、主场景、AO、Bloom、光束、Grade、SMAA 等），显示在性能面板。
2. `?bench=<场景>` 进入固定种子、固定镜头路径的基准场景，跑完输出一份 JSON 摘要（帧耗时分位数、各 pass GPU 时间、CPU 分段、draw call、三角形、显存、节点数、点光源数）。

## Non-goals
- 本任务不做任何画面/性能优化（P1-P4 另开任务，按本任务测出的基线决定顺序）。
- 不把基准加入 CI（全局规则：CI 禁止运行测试）。
- P5-P9（Worker 化、材质工厂、资源管线、WebGPU/TSL、GPU 驱动）不开工。

## Acceptance Criteria
- 性能面板展开时显示各 pass GPU 毫秒数（设备不支持 timer query 时明确显示“不支持”，不显示假数字）。
- `?bench=` 至少覆盖：森林、洞穴密集区、大面积流水、高速飞行、粒子满载 5 个场景；同一场景重复运行，镜头路径一致。
- 基准结束后 JSON 结果可从页面取得（控制台输出 + `window` 上可读），并可下载。
- 关闭性能面板、非 bench 模式下不增加每帧开销。
- typecheck、全量测试、build 通过。

## Constraints
- 工作区有用户未提交的改动（含 frame-loop.ts、game-app.ts 等），只在其上增量修改，不还原、不格式化无关代码。
- 遵守 AGENTS.md：逻辑层不引入 three/DOM/时钟；网址参数是边界，非法值抛错；不写防御式兜底；渲染/UI 不写自动测试。
- 不修改 `src/vendor/pelican-3d`。

## Decisions
- 基线健康：开工前 `npm run typecheck` 通过，`npm test` 2029/2029 通过。
- 计划拆分：优化计划每个阶段一个任务；本任务只做 P0，P1-P4 依据本任务测出的基线另开任务。
- 探索结论（Phase 2）：
  - 分层：core 不能用 three/window/performance；ui 不能依赖 three/render；render 不能依赖 ui。GPU 计时放 `src/render`，经 app 接线，数据以 core 类型（扩展 `PerfSnapshot`）交给面板。
  - 渲染链：`stage.render()` → `updateKeyLight()` → `postFx.render()` → composer：render / ao（prepass + GTAO）/ bloom / grade（含输出）/ smaa。阴影在 RenderPass 内部由 three 先画；光束是场景内 InstancedMesh，算在 render pass。原野背景另有一次 RT 渲染（precip-wiring 调用，计在 world 段）。
  - 单独计阴影：探索时设想手动 `renderer.shadowMap.render`，设计阶段证实不可行（见下）。
  - `renderer.info.autoReset=false`、frame-loop 每帧手动 reset，draw/tris 为整帧累计。
  - 性能面板只在展开时计时；`perfPanel` 无网址参数；原野启动后网址被改写（`bench` 不在删除名单）。
  - 镜头每帧跟随玩家插值位置；`placePlayer` 立即生效；输入可用 `tracker.press/release` 模拟；`pourAtWorld`、`projectileFx.sparks.emit` 可直接造水与粒子；`freeWorldRegions` 提供 forest / lake-i / cave-i / island-i 坐标；`window.__pelicanGame`（debug-tools exposeDebug）是现成的挂载先例；模拟按墙钟推进，基准路径须按帧号驱动才可复现。
- Phase 3：无需用户回答的开放问题，跳过。
- 设计（architect）：
  - 阴影计时不走手动 `shadowMap.render`（r180 中 `currentRenderState` 仅在 `renderer.render` 内有效，外部调用抛错），改为 GpuTimer 包装游戏渲染器的 `shadowMap.render`：计时帧内切到 `shadow` 段、画完切回原段；画面不变，仅 game-app 创建 GpuTimer，其他 createStage 调用方不受影响。
  - `src/render/gpu-timer.ts`：EXT_disjoint_timer_query_webgl2，查询池 + 最多 6 帧在途、disjoint 丢弃；不支持返回 `'unsupported'`。post-fx 各 pass（含 smaa）开始时 `mark(name)`；未启用计时时 mark 立即返回、零 GL 调用。
  - 主持人补充：frame-loop 在帧开始（`env.update` 前）`mark('world')`，把原野背景 RT 与纹理上传计入 GPU `world` 段，避免漏算。
  - 面板：`update` 增加 gpu 读取（null 隐藏 / 不支持 / 各段 + total），每次读取后 reset，展开时 reset。
  - 基准 `src/app/bench.ts`：`?mode=game&free=1&bench=forest|cave|water|flight|particles`；与 region/scene/inspect 同时出现或非原野即抛错；区域由场景决定；bench 下 elapsed 固定为一个 sim step（按帧号驱动）；预热 120 帧、采样 600 帧、排空 GPU 查询后输出 JSON（console.info + `window.__pelicanBench` + 下载）；bench 下跳过网址改写。
  - `frameTimeStats`（nearest-rank 分位数）放 core/frame-profiler.ts，用例加到 test/perf-panel.test.ts。
  - 已在本机 Chrome（ANGLE Metal / M5 Max）确认 `EXT_disjoint_timer_query_webgl2` 可用。
- 实现派发：各行接口紧耦合（GpuTimer ↔ post-fx ↔ frame-loop ↔ bench ↔ game-app），由一个 dev-engineer 按行序完成，避免并行接口漂移。
- 无停止条件（不涉及持久化数据迁移、外部副作用或公共契约），设计直接批准。
- 审查修正（reviewer Non-critical，主持人直接修改）：main.ts 在路由前校验 `?bench`，非原野入口不再静默忽略；JSON 的 GPU 名改用 `WEBGL_debug_renderer_info`；bench 下世界时钟按固定步长推进；面板仅在已读回帧时 reset，避免低帧率下一直显示“…”。
- 基线（2026-10-19，M5 Max / Chrome ANGLE Metal，3840×1872，像素比 2，每场景 600 采样帧）：
  | 场景 | 画质 | 帧 p50/p95/p99 ms | CPU ms（render/world/light） | GPU ms（render/shadow/ao/bloom/grade/smaa） | draw | tris |
  |---|---|---|---|---|---|---|
  | forest | high | 29.1/49.9/99.4 | 18.9（11.5/3.4/2.8） | 16.8（7.4/2.6/1.6/2.0/1.4/1.8） | 629 | 2.14M |
  | forest | low | 33.3/61.7/105 | 19.6（12.4/3.3/2.9） | 14.5（8.8/2.5/–/–/1.4/1.8） | 613 | 2.13M |
  | cave | low | 38.4/86.7/212 | 22.0（14.6/3.0/3.3） | 22.8（14.9/3.4/–/–/1.9/2.6） | 554 | 1.74M |
  | water | low | 37.5/70.8/258 | 21.1（10.2/3.9/6.0） | 25.8（16.2/4.8/–/–/2.0/2.8） | 609 | 1.92M |
  | flight | low | 28.8/50.1/100 | 16.7（9.5/3.0/3.1） | 13.4（6.3/4.7/–/–/0.9/1.5） | 345 | 1.83M |
  | particles | low | 29.2/46/50 | 16.6（9.4/3.4/2.5） | 10.9（6.3/1.9/–/–/1.1/1.5） | 778 | 2.19M |
  - 结论：CPU（约 17-22 ms，其中 render 提交 9-15 ms）与 GPU（11-26 ms，主场景 render 段最大）都超出 16.7 ms；AO/Bloom 合计仅约 3.6 ms，上一轮“高画质贵 25 ms”的结论系浏览器多页面争用所致，不成立。
  - 其他观察：常驻纹理 7888 个、场景节点约 1.76 万、点光源 25（可见 7）；p99 尖峰 100-260 ms。
- 优化后复测（任务 532-539 之后，同机同分辨率，低画质；本机同时开着其他 3D 页，GPU 被争用、帧 p50 约 65 ms，GPU 与帧耗时不可比，只比 CPU 与 draw）：
  | 场景 | CPU ms 前 → 后（render 段） | draw 前 → 后 | tris 前 → 后 |
  |---|---|---|---|
  | forest | 19.6 → 6.8（12.4 → 3.0） | 613 → 275 | 2.13M → 1.95M |
  | cave | 22.0 → 8.3（14.6 → 4.7） | 554 → 324 | 1.74M → 1.39M |
  | water | 21.1 → 8.9（10.2 → 3.8） | 609 → 340 | 1.92M → 1.62M |
  | flight | 16.7 → 7.0（9.5 → 3.2） | 345 → 234 | 1.83M → 1.46M |
  | particles | 16.6 → 9.3（9.4 → 4.4） | 778 → 423 | 2.19M → 1.87M |
  - 任务 540 后森林视野三角形再降到约 0.92M（性能面板实测，含逐实例剔除），draw 约 351。
- 整帧对比（不受硬件 GPU 争用影响）：P0 快照（`185d05c8` + 当时的未跟踪源文件，`public/` 共用）与当前版本依次在 Playwright 无头 Chromium + SwiftShader 软件渲染下跑原野森林（game-app，960×540，像素比 1，低画质，预热到帧间隔稳定后测 40 秒）：帧 p50 250 → 216.6 ms、均值 252.5 → 228.1 / 223.4 ms（当前测两次），总工作量约 −11~13%。这个条件下片元开销小、动态分辨率不生效，主要反映提交与顶点的节省；硬件 GPU 上 4K 的填充开销需在无其他 3D 页面时用 `?bench=` 复测。
- 实现细节：`Bench.drive()` 不带参数，帧号由 bench 自己计数；`GpuTimer.reset()` 同时丢弃在途查询（面板读数后、展开时、采样开始时调用）；面板在 GPU 尚无读回帧时显示占位“…”；JSON 额外记录 `worldTime`（原野时钟取真实时刻开局，昼夜会影响结果，对比时需看这一项）。默认种子 20260930 下 forest / cave-0 / lake-0 / wilds 均存在，未替换区域。

## Implementation Map (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/core/frame-profiler.ts | 新增 `frameTimeStats`（p50/p95/p99/max/mean，nearest-rank） | — | ✓ |
| 2 | test/perf-panel.test.ts | `frameTimeStats` 用例；同步 `formatPerfText` 新签名 | 1,5 | ✓ |
| 3 | src/render/gpu-timer.ts（新建） | 查询池/在途环、disjoint、分段 mark、阴影包装、`'unsupported'` | — | ✓ |
| 4 | src/render/post-fx.ts | `setGpuTimer`；各 pass 与 smaa 开始时 mark | 3 | ✓ |
| 5 | src/ui/perf-panel.ts | `update`/`formatPerfText` 接收 gpu（null 隐藏 / 不支持 / 各段） | — | ✓ |
| 6 | src/app/scene-game-overlays.ts | 调用方传 `() => null` | 5 | ✓ |
| 7 | src/app/bench.ts（新建） | 网址解析、场景表与 drive、阶段控制、JSON 汇总输出 | 1,3 | ✓ |
| 8 | src/app/frame-loop.ts | gpu/bench 依赖；bench 固定 elapsed；计时开关；帧首 mark('world')；begin/end；bench drive/afterFrame；面板 gpu 读取与展开 reset | 3,5,7 | ✓ |
| 9 | src/app/game-app.ts | 解析 bench、覆盖 region、跳过网址改写、prof windowSize、创建 GpuTimer 并 setGpuTimer、bench 接线、dispose | 4,7,8 | ✓ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| `npm run typecheck` | yes | ✓ |
| `node --test test/perf-panel.test.ts` | yes | ✓ |
| `npm test` | yes | ✓ |
| `npm run build` | yes | ✓ |
| 浏览器：面板展开显示各 pass GPU；5 个 bench 场景各跑一次并产出 JSON | yes | ✓ |
