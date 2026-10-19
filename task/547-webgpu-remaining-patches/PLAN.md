# PLAN -- WebGPU 第六批：其余着色器补丁

## Status: done
## Task: 547
## Related: 542, 543, 544
## Baseline Commit: a13fdd68

## Goal
翻译清单中剩余的 pending 补丁（角色羽毛、鹈鹕羽毛遮蔽与围巾、降水湿润、鱼尾、树影风摆、地表岩石、洞穴装饰与洞壁、机房墙、水面/水波/水纹等），使 WebGPU 清单清零。

## Non-goals
- 不切换默认渲染器（等用户验收全部批次后再定）；WebGL 默认路径画面与性能不变。

## Acceptance Criteria
- WebGL：typecheck、npm test、build 通过，画面不变，首包不含 three/tsl、three/webgpu。
- WebGPU：对应效果与 WebGL 对比一致，控制台无新增 WGSL/WebGPU 错误。

## Decisions
- 用户要求一次开发完毕后统一验收（“你完成开发吧，开发完毕我在看”）；三批并行，文件边界见各批说明。
- 补丁登记：`render/node-patches.ts` 的 NodePatch 联合去掉 `pending`，每个补丁带上翻译需要的 uniform/纹理/常量（如 `pelican-scarf` 的 ribbon、`cave-wall` 的四个 uniform、`natural-building` 的草顶纹理与周期）；各 render 文件只改 addNodePatch 那一行与类型，GLSL 字符串未动。`pendingPatchLabels` 与清单里的“未翻译补丁”项随之删除。
- 翻译按主题拆文件：`webgpu-node-utils.ts`（共享工具：shared/sharedTexture、deformBeforeInstance、deformAfterSkinning、beforeLighting、addDiscard 等）、`webgpu-light-map.ts`（原 light-map/cloud-shadow/depth-haze 搬出）、`webgpu-patches-characters|water|ground|city.ts`；`webgpu-materials.ts` 只保留入口、表与树/地形等原有翻译，并 re-export `shared` 给 546 的 `webgpu-shader-nodes`。
- 节点构建缓存：three 把节点属性只按“有/无”计入渲染对象缓存键，补丁节点直接绑定各自 uniform/几何，所以登记了补丁的节点材质在 customProgramCacheKey 后追加 `|np${material.uuid}`，避免两份材质（如两条围巾）共用同一份构建结果。
- 几何相关的缓冲（羽毛的 aFeatherStage 打包成 vec2 属性 `aFeatherPack`）必须是几何属性并在构建前挂上：renderObject 包装按补丁调用 `GEOMETRY_PREPARERS`。直接引用缓冲节点会被其他网格共用，WebGPU 报 “Vertex range requires a larger buffer”。
- 顶点变形位置：GLSL 在 begin_vertex（实例/批次变换之前）改 transformed 的补丁用 deformBeforeInstance（改写 setupPosition）；蒙皮之后的（鹈鹕喙收拢）用 positionNode。围巾改写 setupPosition 同时改法线，遇到蒙皮或实例直接抛错。
- 阴影：WebGPU 阴影通道用共享 ShadowMaterial，只复制原材质的 positionNode，不读 customDepthMaterial。renderObject 包装在阴影通道里按网格 customDepthMaterial 的补丁临时设置覆盖材质的 positionNode/colorNode（树影风摆、围巾），节点按深度材质缓存、带唯一 customCacheKey，渲染后还原。场景只有主平行光投影，customDistanceMaterial 不涉及。
- 降水湿润：normalView 等构建缓存变量在第一次被引用的位置赋值；第一次引用落在 `If(wet||snow)` 里时，不进分支的片元（晴天）后续受光读到零法线，地形和树整片发黑。prUp 提到分支外先算；粗糙度在分支里只记两次混合的权重，分支外按 GLSL 同序 mix。
- 有意与 WebGL 不同的地方：
  - water-ripples：WebGL 的 `Object.assign(shader.uniforms, sharedWindUniforms, …)` 传的是函数本身，风 uniform 实际没进 GLSL（WebGL 现有缺陷，未改）；WebGPU 用 `sharedWindUniforms()` 的共享风值，即设计意图。
  - npc/teleport 的抖动溶解按 screenCoordinate 取格，WebGPU 屏幕 y 向下，图案上下翻转（视觉等价）。
  - pelican-plumage-occlusion 的负 alpha 标记（-0.8）只在渲染到后期目标时写入，依赖 545 后期调色按 `src.a < 0` 取 AO 权重；直接输出到画布时不改。
  - harbor-shore-haze 与 depth-haze 同时登记会抛错（两者都改写 setupFog，现有场景没有这种组合）。
  - tree-shadow-wind 主材质翻译直接抛错（只应出现在 customDepthMaterial 上）；阴影翻译遇到实例/批次网格抛错。
- 浏览器验收里看到但不属本批的问题：WebGPU 整体比 WebGL 暗（天空背景、机房、洞穴最明显）。545 已在同一加载里对比直接渲染与后期两条路径，结论是与后期无关；本批补丁也不改背景天空，原因待单独排查（可能在光照图或色彩空间/光源强度换算）。
- 港口（level=harbor 走 residence-app）与 transit 不走 game-app 的 WebGPU 入口，ai-city-finish、gate-dissolve、harbor-* 系列在游戏里无法用 ?renderer=webgpu 看到，只经 typecheck/build 与代码对照 GLSL 验证。

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | 通过 |
| npm test | yes | 通过（2037/2037） |
| npm run build | yes | 通过；TSL/WGSL 只在 webgpu-stage 分包 |
| 浏览器：WebGL 与 ?renderer=webgpu 对比 | yes | forest（晴/暴雨）、cave-0、lake-0、facility cathedral、homestead、鹈鹕变身；清单只剩 546 范围的 ShaderMaterial，控制台无 WGSL/WebGPU 校验错误；整体亮度差异见 Decisions |
