# PLAN -- WebGPU 第一阶段：网址开关并行后端

## Status: done
## Task: 542
## Related: 531
## Baseline Commit: a13fdd68

## Goal
游戏页（?mode=game）加 `?renderer=webgpu`：用 three/webgpu 的 WebGPURenderer 渲染同一场景，WebGL 仍为默认且行为不变。
WebGPU 后端按需动态加载，不增加 WebGL 首包；启动时输出材质清单（不兼容类型 / 依赖 onBeforeCompile 的材质），作为后续 TSL 移植的工作表。

## Non-goals
- 本阶段不移植 TSL 材质、不移植后期（GTAO、Bloom、调色、SMAA、引力透镜、地面反射），不接 WebGPU 时间戳查询。
- 不切换默认渲染器；不改其他页面（展示场、住宅、磁浮等）。

## Acceptance Criteria
- 默认（无参数 / renderer=webgl）画面、基准与动态分辨率不变。
- `?renderer=webgpu` 能进入原野并持续渲染；不支持 WebGPU 的浏览器明确报错（不静默退回 WebGL）。
- 非法 renderer 值在网址边界抛错；bench 与 renderer=webgpu 同时出现时抛错（基准依赖 WebGL 查询）。
- 控制台与 `window.__pelicanWebGpuInventory` 给出待移植材质清单。

## Constraints
- 逻辑层不受影响；vendor 不改；fail-fast，不加兜底。

## Decisions
- 分阶段、网址开关并行（用户选择）：每批移植后用户在浏览器验收，全部一致后才切默认。
- Stage 改为按渲染器泛型（缺省 WebGLRenderer）：只有游戏页拿到联合类型，类型检查直接列出依赖 WebGL 专有接口的调用点；其他页面类型不变。
- 第一阶段后期只做直接渲染到画布（渲染器自带色调映射与 sRGB 输出）；调色 uniform 仍提供以免天气/设施演出报错，但不生效，清单中注明。
- GPU 计时在 WebGPU 下返回不支持：动态分辨率因此不工作（与无计时扩展的设备一致）。
- WebGPU 舞台放在 app 层（src/app/webgpu-stage.ts）：架构测试只允许 app → app 的动态 import；构建产物为独立 474 kB 分块，WebGL 首包不含 three/webgpu。
- 后期接口去掉 sceneTarget，改为 PostFx.compile(root)：预编译要绑定的目标由后期自己决定；WebGL 专有的 composer/sceneTarget 留在 WebGLPostFx（测试使用）。
- PMREM 随后端：Stage.createPmrem()；createTransitSurface 改收生成器（游戏里的无人机、着陆舱用到局部反射环境）。
- onBeforeRender 收到的渲染器可能是 WebGPURenderer：luma 尾迹/粒子与 Grassy 粒子改用 currentViewportHeight。
- 浏览器实测（用户 Chrome，有其他 3D 标签页争用，数字只作参考）：原野森林 WebGPU 可渲染，绘制 554、三角 1.05M、CPU 13.6 ms（render 8.6）、约 20 FPS；同条件 WebGL CPU 8.9 ms（render 4.4）、GPU 6.35 ms、约 31 FPS。
- 材质清单 126 组：ShaderMaterial 不兼容（风线、粒子等，画成黑线/空白）；几乎所有 MeshStandard/Basic 材质都带 onBeforeCompile 补丁（云影、光照图、风、变体塌缩、地形层），WebGPU 下地形显示为白色、植物不摆动。下一批按 地形 → 植被 → 角色 → 后期 移植 TSL。

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | Done |
| npm test | yes | Done（2037/2037） |
| npm run build | yes | Done |
| 浏览器：默认 WebGL 与 ?renderer=webgpu 各进入原野 | yes | Done |
