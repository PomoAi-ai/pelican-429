# PLAN -- WebGPU 第二批：节点材质接入层 + 地形

## Status: done
## Task: 543
## Related: 542
## Baseline Commit: a13fdd68

## Goal
在 ?renderer=webgpu 下让地形（tile-layers）与其通用光照补丁（光照图、云影、景深雾）用 TSL 节点材质正确渲染，画面与 WebGL 对齐；
同时建立以后各批共用的“材质补丁 → 节点材质”接入层。

## Non-goals
- 植被、角色、水、粒子、后期留给后续批次；WebGL 默认路径画面与性能不变。

## Acceptance Criteria
- WebGL：typecheck、npm test、build 通过，画面不变；WebGL 首包不引入 three/tsl / three/webgpu。
- WebGPU：原野森林地形有纹理、圆角/有机轮廓、过渡、暗部收敛，光照图与云影生效；材质清单中地形相关项不再出现。

## Decisions
- 接入层：render 层只登记数据（WeakMap：材质 → 有序补丁描述），不引入 TSL；WebGPU 分块（app/webgpu-*）包装 renderer.library.fromMaterial，
  按登记顺序把补丁翻译成节点。这样以后各批只需在原补丁函数旁登记一条描述，并在 WebGPU 分块里加一个翻译函数。
- 用户选择分批、网址开关并行；本批完成后由用户在浏览器统一验收。
- fromMaterial 包装不缓存节点材质：three 每次构建渲染对象都重新复制原材质（材质 version 变化即重建），缓存复制件会让 transparent/side 等属性失步；
  翻译只在构建时运行。共享 uniform 按 IUniform 对象缓存成一个 uniform 节点（WeakMap，所有材质共用），onRenderUpdate 每次渲染读 IUniform.value；
  光照图动态光用 uniformArray 引用同一 Vector4 数组；光照图纹理、水色等对象型值直接引用同一对象。WebGL 侧每帧写 uniform 的代码不用改。
- r180 NodeMaterial.setupPosition 中 positionNode 在实例变换之后，而方块变形在实例变换之前：地形翻译改写 setupPosition——先在丢弃的栈里跑一次
  InstanceNode.setup 取得实例矩阵节点，变形写 positionLocal/normalLocal 后再把 InstanceNode 正式入栈（复用已建节点，只变换一次，保留矩阵版本同步）。
  方块材质只用于 InstancedMesh，非实例网格直接抛错。光照补丁改写 setupLighting（对应 GLSL opaque_fragment 之前改 outgoingLight，emissive 属性即 totalEmissiveRadiance），
  按登记顺序链式包裹；景深雾改写 setupFog（同 #ifdef USE_FOG，要求线性 THREE.Fog）。世界坐标统一用 positionWorld（含 instancing/batching 与变形）。
- 地形着色器用 wgslFn + code 写成 WGSL（app/webgpu-tile-wgsl.ts），函数与 GLSL 逐个同名同式；GLSL 全局 attribute/varying 改为 var<private> 由入口写入，
  常量由 TILE_SHADER_PARAMS / ORGANIC_PARAMS / RELIEF_PARAMS 同表生成。纹理数组层号按 GLSL 规则 floor(l+.5)；非一致控制流里的 textureSample
  依赖 three 已为片元着色器关闭的 derivative_uniformity 诊断（Firefox 除外）。光照图/云影/景深雾用 TSL 节点（体量小）。
- WebGPU 限制：适配器 maxVertexBuffers=8、默认顶点输入 16 个、跨阶段变量 16 个。方块 8 个实例属性在 WebGPU 侧按几何拷贝打包成一个 InstancedInterleavedBuffer
  （tile-view 只在建块时写实例数据，改动即重建几何，故不同步 version；代码里以 shortcut 注明），每个属性只建一个节点；
  片元所需实例数据走 flat varying 并按 vec4 打包（layers+kind、cell+aShape，aShape 在片元解包）。
- 材质清单：patched = 有 onBeforeCompile 且没有任何登记的节点补丁；登记了翻译表外的 kind 直接抛错。注意：植被等材质同时带光照图/云影（已登记）和风/变体补丁（未登记），
  按此规则不再列出，清单由 126 组降到 10 组（全为 ShaderMaterial）——低估了剩余工作量，后续批次需改为“补丁全部登记才算已移植”（例如风补丁也登记为未翻译 kind）。
- 浏览器对比（原野森林，同一视角）：WebGPU 地形纹理、草顶与草边垂挂、泥土正面、有机轮廓与圆角、侧壁渐暗均与 WebGL 一致；WebGPU 整体对比略低，来自尚未移植的后期
  （GTAO、调色、Bloom），不是地形材质差异。光照图暗部（地下）、云影漂移未专门进洞/长时间观察，留给用户验收。

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | Done |
| npm test | yes | Done（2037/2037） |
| npm run build | yes | Done（WGSL/TSL 只在 webgpu-stage 分块，592 kB） |
| 浏览器：WebGL 与 ?renderer=webgpu 原野森林地形对比截图 | yes | Done（地表一致；地下光照图、云影待用户验收） |
