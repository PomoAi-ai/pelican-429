# PLAN -- WebGPU 第三批：补丁全量登记 + 植被

## Status: done
## Task: 544
## Related: 542, 543
## Baseline Commit: a13fdd68

## Goal
1. 让 WebGPU 材质清单如实反映剩余工作：游戏会用到的每个 onBeforeCompile 补丁都登记到 node-patches；尚未翻译的补丁登记为待移植项，清单按补丁列出，不再因材质已有部分登记而漏报。
2. 在 ?renderer=webgpu 下移植植被相关补丁（风摆、变体塌缩、树材质/树风、灌木、地被、攀援、水生植物等），画面与动态与 WebGL 对齐。

## Non-goals
- 角色、水体、粒子、ShaderMaterial、后期留给后续批次；WebGL 默认路径不变。

## Acceptance Criteria
- WebGL：typecheck、npm test、build 通过，画面不变，首包不含 three/tsl。
- WebGPU：原野森林植被摆动、变体正确、光照与云影生效；清单列出的剩余补丁与实际一致。

## Decisions
- 待移植补丁也登记（只带标签），渲染时跳过、清单列出；已翻译的补丁缺翻译函数仍抛错。
- 登记范围：从 game-app 静态/动态 import 可达的 render 模块里每个 onBeforeCompile 补丁旁加一行登记（植被为带数据的 kind，其余为 pending + 稳定 label）；
  player-transform 撤补丁时同步 removeNodePatch。跳过（只用于其他页面）：grassy/d1-*（渲染实验室）、residence-lighting、white-concrete-material、
  harbor-lake-backdrop、definition-inspection。传送溶解的克隆材质只登记 teleport-dissolve，其委托的原材质补丁不复制登记（短时效果）。
- 材质清单改为“材质 × 剩余项”：剩余项 = pending label / 不兼容材质（无对应节点材质，含 ShaderMaterial）/ 未登记补丁（有 onBeforeCompile 但没有任何登记）；
  同时按剩余项汇总（console.table）。customDepth/DistanceMaterial 一并列出其补丁（WebGPU 阴影通道不用它们），但不计“不兼容”。pending label 按材质去重。
- 植被批的 kind：flora-wind（花草风摆 + 草地扰动 + 蝴蝶 + 实例色只乘 aPetal + 薄片法线不翻转）、variant-collapse、instance-fade（水中悬浮物 aFade）、
  tree-wind（叶层颤动 + 枝弯曲 + 主弯曲，叶与树皮共用）、tree-bark（通道选择、屏幕导数凹凸、边缘压暗）、shrub-disturb（灌木草地扰动）。
  createWindMaterial/createLeafMaterial 内登记，灌木、攀援、地被、水生、沙漠装饰、天岛根须等复用它们的材质自动覆盖。
- 常量单一来源：花草风摆与叶层颤动的着色器常量提成 FLORA_WIND_SHADER（flora.ts）、LEAF_WIND / BARK_EDGE_SHADE（tree-material.ts），
  GLSL 改为由表生成（wind.ts 导出 glslFloat 复用格式化）；枝/主弯曲用 TREE_BEND，风场用 GUST_VARY/TAU，扰动用 DISTURB_*。
  校验：用 ShaderLib 源跑全部植被材质的 onBeforeCompile，改动前后的 GLSL、uniform 名与缓存键逐字节一致（WebGL 不变）。
- 顶点变形顺序：抽出 preInstance（实例：丢弃栈里先跑 InstanceNode.setup 取矩阵；批次：按 three BatchNode 同式自算 batchingMatrix，BatchNode 不暴露它）
  与 deformBeforeInstance（同一材质多个变形按登记顺序串在一个 setupPosition 里，与 GLSL begin_vertex → project_vertex 注入顺序一致），地形 tile-layers 也改用 preInstance。
  WGSL 没有 inverse：inverse(mat3(M))·v 用列向量叉积/行列式实现（奇异矩阵同 GLSL 得到非有限值）。GLSL 中只在 USE_INSTANCING/USE_BATCHING 下生效的分支，普通网格同样跳过。
- 变体塌缩：BatchedMesh 路径由 three 原生多绘制处理（批次子几何不含 aVar，GLSL 分支本就不生效），翻译只对 InstancedMesh（水中悬浮物）生效。
- 顶点缓冲上限：花草标量 aTip/aPetal/aFly/aVar 在 WebGPU 侧按几何拷贝打包成一个 vec4 交错缓冲（shortcut：几何建好后不改写，不同步 version），
  悬浮物从 10 个缓冲降到 ≤ 8。
- 实例色：在 setupDiffuseColor 之后按 GLSL color_vertex 重算 rgb（base × 顶点色 × mix(1, 实例/批次色, aPetal)），alpha 与 alphaTest 由 three 原逻辑处理。
- 未做：树影随风（WebGPU 阴影通道不读 customDepthMaterial，登记为 pending tree-shadow-wind）；降水湿润 precip-surface 仍为 pending，植被行因此仍出现在清单里。
- 浏览器对比（原野森林，同一视角）：WebGPU 的树干/树皮、叶团、柳丝、灌木、花草与 WebGL 构图一致；隔约 1 秒两张截图中柳丝与树冠明显随阵风摆动、树干弯曲。
  差异：风线（ShaderMaterial）在 WebGPU 下画成黑线，地面无树影/AO 偏弱（后期与阴影未移植），均不属植被材质。水中悬浮物所在湖面不在该视角，未目测；
  地表小花草的摆动在缩小截图里难以逐株分辨。
- 剩余清单（该视角，按剩余项：材质组/网格）：不兼容材质 10/76；feather-surface-growth 55/230；precip-surface 11/50；pelican-plumage-occlusion 1/43；
  pelican-scarf 4/12；fish-tail 1/7；tree-shadow-wind 2/4；surface-rocks 1/3；cave-decor-glow 2/2；facility-wall 1/2；water-surface 1/2；water-wave 1/2；
  cave-wall 1/1；water-ripples 1/1；未登记补丁 0。

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | Done |
| npm test | yes | Done（2037/2037） |
| npm run build | yes | Done（TSL/WGSL 只在 webgpu-stage 分块，599 kB） |
| 浏览器：WebGL 与 ?renderer=webgpu 原野森林植被对比 | yes | Done（植被一致、摆动；水中悬浮物未入镜） |
