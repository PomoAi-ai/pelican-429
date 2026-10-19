# PLAN -- WebGPU 第五批：ShaderMaterial 效果

## Status: done
## Task: 546
## Related: 542, 543, 544
## Baseline Commit: a13fdd68

## Goal
把游戏页用到的 ShaderMaterial / RawShaderMaterial（风线、天气、降水、光柱、粒子、Luma 尾迹、Grassy 粒子等）在 ?renderer=webgpu 下转换为等效节点材质，画面与 WebGL 一致（风线颜色、粗细、透明与运动）。

## Non-goals
- 不切换默认渲染器（等用户验收全部批次后再定）；WebGL 默认路径画面与性能不变。

## Acceptance Criteria
- WebGL：typecheck、npm test、build 通过，画面不变，首包不含 three/tsl、three/webgpu。
- WebGPU：对应效果与 WebGL 对比一致，控制台无新增 WGSL/WebGPU 错误。

## Decisions
- 用户要求一次开发完毕后统一验收（“你完成开发吧，开发完毕我在看”）；三批并行，文件边界见各批说明。
- 按材质名登记转换：`src/app/webgpu-shader-materials.ts` 包装 `renderer.library.fromMaterial`，ShaderMaterial 按 `material.name` 查表（weather / fx / facility / transit 四个 `webgpu-shader-*.ts`），表里没有就抛错（fail-fast，不退回黑色空白材质）。无名材质只补 `name`，着色器不动。
- 节点材质只负责着色：`setupDiffuseColor` 直接 `diffuseColor.assign(color)`，不乘 opacity、不做 alpha=0 丢弃、不预乘、不加雾，对应 GLSL 直接写 gl_FragColor；blending/transparent/depthWrite/depthTest/side/colorWrite 由 three 取自原材质。uniform 共享原 IUniform，现有每帧写值的代码不变。
- 色调映射：WebGL 在 OutputPass 统一做，WebGPU 在输出时统一做，ShaderMaterial 的 toneMapped / colorspace_fragment 两边都不起作用，节点版本不处理。
- 点精灵：WebGPU 原生点只有 1 像素，渲染 Points+ShaderMaterial 时换成每点一个四边形的实例化网格（原属性以同名实例属性镜像同一数组，渲染前同步 version/updateRanges，count 取 drawRange），`pointVertex`/`pointCoord` 对应 gl_PointSize/gl_PointCoord。包装 `renderer.renderObject` 而不是 setRenderObjectFunction，使 compileAsync 预编译也走四边形版本。
- 视口高度：WebGL 侧写入 uPixels/viewportHeight 的 uniform 在 WebGPU 下是逻辑像素，节点版本统一用 `viewportSize.y`；transit-time-corridor 的 onBeforeRender 改用 currentViewportHeight（原来调 WebGL 专有的 getCurrentViewport）。
- 纹理 uniform：每次采样新建 texture 节点并挂 onRenderUpdate 跟随 IUniform.value（TextureNode.sample/level 的复制件不带回调）。
- 与 GLSL 的语义差异逐处处理：反向 smoothstep 用 `smoothstepGlsl` 按公式算（WGSL/Metal 内置未定义）；GLSL mod 手写 `a - b*floor(a/b)`；负底数 pow(x,2) 写成 x*x；uniform bool 按 float 传；gl_FragDepth 用 depthNode。
- 常量单一来源：各 render 模块导出 `XXX_SHADER` 参数表，GLSL 用 `glslFloat` 或原有格式化插值生成，节点版本 import 同一张表。WebGL 着色器逐字节不变：构造时记录 vertex+fragment 哈希，改前改后对比（测试构造的材质 + 手写夹具构造 facility、workstation、roadster、transit、fx），全部一致。
- 覆盖 30 个游戏可达材质：weather-lines、weather-clouds、precip-rain-streaks/splashes/drips、precip-snow、precip-veil、light-shafts、cave-fx-points、luma-trail、luma-rig-light、luma-burst、grassy-particle-cloud、grassy-thruster-beam、grassy-overload-shockwave、photon-exhaust、npc-arrival-column、drone-exhaust、facility-signals-ribbon、facility-coolant-surface、facility-blackhole、roadster-ion-jet、workstation-orb-shell、transit-plume/cruise-exhaust/engine-core/light-trail/time-corridor/arrival-flash/pad-cloud。post-fx 的 ShaderMaterial 属 545。
- 港口（level=harbor）不走 renderer=webgpu，仍是 WebGL 画布，本批不涉及。

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | ✓ |
| npm test | yes | ✓ 2037 通过 0 失败 |
| npm run build | yes | ✓ TSL 与节点版本只在 webgpu-stage 分块 |
| 浏览器：WebGL 与 ?renderer=webgpu 对比 | yes | ✓ 森林（暴雨、强风）、湖、堡垒、洞穴、boss 场材质清单“不兼容材质”为空；风线为细的渐隐弧线随天光着色，不再是黑粗线；雨、雪、Luma、无人机尾焰、黑洞盘与逃逸轨迹正常。差异：WebGPU 整体偏暗（主会话另查）、堡垒画面上下颠倒（疑 545 后期/引力透镜）、两次加载游戏时间不同，只能定性对比 |
