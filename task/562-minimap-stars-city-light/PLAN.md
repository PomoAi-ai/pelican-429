# PLAN -- 小地图边缘重画、WebGPU 星星、城区光照并入通用光场

## Status: done
## Task: 562
## Related: 560
## Baseline Commit: cd528040

## Goal
1. 小地图按区块重画时，相邻区块变化影响到的边缘像素也重画，不留旧像素。
2. WebGPU 下星星和 WebGL 一样大小可见，不再是 1 像素。
3. 光照只保留一套：以城区光照模型为唯一的材质光照模型，所有世界（城区、原野、机房、展示场、透视页、搭建场）都用它；WebGL 与 WebGPU 各一份实现、效果一致；删除现有通用简化着色（整体乘天光）与城区专用的独立路径。

## Non-goals
- 城区阴影合批与帧率优化。
- 小地图其他画法、星空外观的改动。
- 任务 561 的未提交改动（保持原样）。

## Acceptance Criteria
- 小地图：改动区块边界一侧的格子后，另一侧受影响的像素随之更新；有复现用例。
- WebGPU 星空画面与 WebGL 同等可见（浏览器截图对比）。
- 只剩一套光照着色：`light-field-city.ts` 的独立路径与通用简化着色都不再存在；所有世界走同一条 createWorldLight 路径。
- 城区 WebGL 画面不倒退（对比基线截图）；城区 WebGPU 与 WebGL 一致（太阳软阴影、窗下日光、门半透、灯具高光与遮挡、白天折灯、灯色反射、天色反弹、地下底光、实心深度渐隐）。
- 原野、机房改用城区模型后画面合理（洞穴、水下、地形暗化、光圈、萤火等现有效果保留），由用户在浏览器验收。
- typecheck、npm test、build 通过；种子哈希不变。

## Constraints
- 只在 worktree pelican-429-site-react 改；不提交；不碰 src/vendor/pelican-3d。
- 逻辑层不依赖 three/DOM；Fail-fast；不写兼容分支；测试按 AGENTS.md 收敛。

## Decisions
- 探索·小地图：只有水面像素跨区块读邻居（同一子格列正上/正下各 1 子格，minimap-model.ts:363/365，子格水量 1..127 时生效）；`hashChunk` 只哈希本区块子格（:304-316），`scanFluid` 只重算变化流体区块内部的小地图区块（:419-421），所以区块上下边界会残留或缺一行水线。已在 node 复现。修法：`hashChunk` 子格行上下各外扩 1 行、`scanFluid` 遍历的 cy 上下各外扩 1 区块（都夹紧），仍只在哈希变化时标脏。设计已逐文件明确，跳过 architect。
- 探索·星星：星空用 `PointsMaterial`（celestial-sky.ts:121），WebGPU 的点精灵替换只认 `isPoints && isShaderMaterial`（webgpu-shader-materials.ts:122），星星落到 three 原生 PointList（1 像素）。修法只改 webgpu-shader-materials.ts：替换条件放宽到 PointsMaterial；对 PointsMaterial 设 vertexNode = pointVertex(clip, size × DPR)，只支持 sizeAttenuation=false（否则抛错）；点精灵四边形补 uv 供 map 取值。WebGL 与星空数据不动。设计已明确，跳过 architect。
- 用户决定（2026-10-21「全部按照城区光照来,只保留一套, WebGPU 实现」）：城区光照模型成为唯一的光照模型，推广到所有世界，WebGPU 也实现；原野、机房画面会变，需重新验收。
- 探索·城区光照：光场生成、条带分帧、图集与上传城区已与其他世界共用 createWorldLight；独立的只有 light-field-city.ts 的 GLSL 光照模型（逐分量调制方向光/点光/间接光/镜面、主光 64 步柔化遮挡、窗下日光斑、门半透、灯具高光点光及遮挡、白天折灯、灯色反射、天色反弹、地下底光、实心深度渐隐），只在 WebGL 启用；WebGPU 城区走通用 light-map（整体乘天光）。第二个调用方是 building-sandbox。合并有真实分歧（移植全部效果到通用路径并写 TSL 版，还是删掉城区模型统一成通用简化版），等用户选择。

- 设计（architect）：城区 GLSL 并入 light-field-material.ts 的 injectLightMap，成为唯一注入，light-field-city.ts 删除；各世界同一着色器，只差 uniform（实心深度渐隐系数、undergroundTop、灯槽数）。光照材质逐分量：方向光乘天光、主光乘 64 步太阳透过率；点光乘 68 步可见度（灯槽点光只留高光）；间接光乘 gate·bounce（gate = lmCombine(max(城区天光曲线, 动态光, lightFloor), aura)），加地下底光、窗下日光、灯光场辐照度；镜面同城区；水下吸收保留。地形暗化改为受光前收敛反照率（terrainDarkAlbedo）。Basic/Matcap 用同一 gate 整体相乘；水体保留 lmWaterLight 曲线。原野/机房仍用 worldLightRules（'open' 会把山体洞穴照满）。灯槽、白天折灯、setSky、lamps 搬进 createWorldLight；机房 createFacilityLighting 的装置点光照旧作为“其他点光”。遮挡图总是打包，字节不变不标脏。WebGPU：覆盖 setupLightingModel 返回实例的 direct/indirect 钩子（three 0.180 NodeMaterial.js:1035、LightingModel.js:16-24、LightsNode.js:264-268），主光按 castShadow、灯槽按 userData.fieldLamp 在编译期识别；依赖 three 内部字段处 fail-fast。noLightMap 只保留“远景/自发光不接光”含义，块视图与建筑层不再标（原野里它们此前一直不接光）；删 takeBuildingChanges。搭建场改用 createWorldLight。读源码正则的旧测试删除。
- D1 地下底光：按用户“全部按照城区光照来”，所有世界用城区值（0.10, 0.12, 0.16），洞穴不再全黑；它是一个 uniform，验收后可按世界调。
- 无其他停止条件：用户已选定方向；改动可逆、不涉及存档/外部系统。

- B1 结果：新模块 render/stage/light-field-lighting.ts（城区光照模型 GLSL、injectLightingModel、createLampSlots）；injectLightMap 为唯一注入（受光材质逐分量 / Basic·Matcap 乘 lmGate / 水体曲线），地形暗化改反照率（terrainDarkAlbedo）；createWorldLight 的 city 参数块、lamps、setSky，删 atlas 字段；图集总带遮挡图且字节不变不重传；删 light-field-city.ts、FRAGMENT_APPLY_TERRAIN/UNLIT、takeBuildingChanges、块视图与建筑层 noLightMap。偏差：地下底光写为着色器常量（全世界同值，不预留 uniform）；uSolidDepthScale 存乘数；搭建场只给场地子树接光。typecheck、npm test 2024、build 通过；WebGL 四页无着色器错误。

| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/render/stage/light-field-atlas.ts | B1 遮挡图总是打包、非空；遮挡字节不变不标脏 | — | ✓ |
| 2 | src/render/stage/light-field-material.ts | B1 并入城区 GLSL 为唯一注入；新 uniform；city 参数块；灯槽/白天折灯/setSky/lamps 搬入；terrainDarkAlbedo；缓存标签 v2；删 APPLY_LIT/TERRAIN/UNLIT | 1 | ✓ |
| 3 | src/render/stage/node-patches.ts | B1 light-map 补丁描述加 lampSlots | 2 | ✓ |
| 4 | src/app/game/lighting-wiring.ts | B1 城区传 {rules, undergroundTop, lampSlots}，按画质 | 2 | ✓ |
| 5 | src/app/game/game-app.ts | B1 传画质；worldLight 交给环境 | 4, 9 | ✓ |
| 6 | src/app/facility/facility-environment.ts | B1 传画质 | 4 | ✓ |
| 7 | src/app/showcase/npc-world.ts | B1 传画质 | 4 | ✓ |
| 8 | src/app/showcase/session.ts | B1 传画质 | 4 | ✓ |
| 9 | src/app/game/precip-wiring.ts | B1 daylight 分支调 worldLight.setSky(night, skyTint) | 2 | ✓ |
| 10 | src/app/city/city-presentation.ts | B1 删城区光照与 WebGL 分支；scene.add(worldLight.lamps) | 2 | ✓ |
| 11 | src/app/perspective/building-sandbox.ts | B1 改用 createWorldLight | 2 | ✓ |
| 12 | src/render/stage/light-field-city.ts | B1 删除 | 10, 11 | ✓ |
| 13 | src/render/tile/piece-view.ts | B1 去 noLightMap；update 返回 void | 10, 11, 15 | ✓ |
| 14 | src/render/building/building-layer-view.ts | B1 去 unlit；update 返回 void | 10, 11, 15 | ✓ |
| 15 | src/render/stage/world-views.ts | B1 删 takeBuildingChanges | 10 | ✓ |
| 16 | test/terrain-dark.test.ts | B1 改测 terrainDarkAlbedo；删正则测试 | 2 | ✓ |
| 17 | test/light-aura-water.test.ts | B1 删正则测试 | 2 | ✓ |
| 18 | test/cave-island.test.ts | B1 删 :495-523 正则测试 | 2 | ✓ |
| 19 | test/render-hut-detail.test.ts | B1 改夹具类型，删正则 | 2 | ✓ |
| 20 | test/light-field-material.test.ts, test/water-shot-view.test.ts | B1 injectLightMap 补参数；灯槽不进动态光 | 2 | ✓ |
| 21 | src/render/webgpu/webgpu-light-map.ts | B2 setupLightingModel 实例钩子；TSL 透过率/可见度/窗光；地形 beforeLighting；Basic/水体乘法 | 2, 3 | ✓ |
| 22 | light-field-material.ts, webgpu-light-map.ts | B3 场顶精确提前退出（bench 有回归才加） | 21 | 不做（用户：性能另开任务） |
| 23 | docs/architecture.md | B3 一句话：材质光照模型一套、各世界只差 uniform | 21 | ✓ |
| 24 | src/ui/model/minimap-model.ts, test/minimap.test.ts | 小地图区块边界水线（已完成，复现用例先败后过） | — | ✓ |
| 25 | src/render/webgpu/webgpu-shader-materials.ts | WebGPU 星星点精灵（已完成，待浏览器确认） | — | ✓ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | ✓ |
| npm test | yes | ✓ 2017/2017 |
| npm run build | yes | ✓ |
| bench forest/cave/water/flight 基线 cd528040 与改后对比（WebGL） | no（用户：性能另开任务） | 部分：vsync 下帧率不变；GPU 计时总量 +70% 但后期段同比翻倍，归因不可靠；无垂直同步实测原野 WebGPU 7–10 FPS，基线对照未测成 |
| 浏览器：城区 WebGL/WebGPU 白天、夜间、雨天截图对比；WebGPU 星空；原野挖掘后小地图 | yes | ✓ 城区 GL 与基线一致、GPU 与 GL 一致；星空 GPU 可见；小地图由复现用例覆盖，未在浏览器挖掘 |
