# PLAN -- D1 动漫风格渲染

## Status: done
## Task: 394
## Related: 393
## Baseline Commit: d2d72f4

## Goal

让游戏与展示场里的 D1 接近原画 `public/art-library/d1-seven/character-seven-views-slim-legs-v1.png` 的高亮、柔和动漫 3D 风格：(A) 自写角色着色器；(B) 修整眼睛贴图、头发表面与脸部法线并重导出 D1 运行时模型。

## Non-goals

不换渲染引擎、不新增运行时依赖；不改 D1 体型、骨架与动作；不改其他角色外观；不提交推送。

## Acceptance Criteria

- D1 全部动画变体（detailed/game/light/outfit/equipped）用新着色器：柔和明暗交界、暖色暗部、边缘光、头发高光、眼睛高光，可选细同色描边；游戏与展示场共用同一模块。
- 在地上/地下、不同太阳角度下角色清晰，蒙皮动画、阴影与现有压缩派生正常。
- 眼睛贴图接近原画（青蓝渐变、高光、细睫毛观感）；头发高光连续不碎；脸部无硬阴影。资源改动在 Blender 资产链脚本中完成，重导出 6 个 D1 GLB 及派生。
- 展示场与原画并排截图对比；typecheck、npm test、build 通过。

## Constraints

- 唯一运行时依赖 three；逻辑层不碰渲染。
- 展示场与游戏复用同一渲染与资源模块（AGENTS.md）。
- 渲染效果人工在浏览器验收，不写着色器/材质细节测试。
- 用户授权：效果优先，两条线都做。

## Decisions
- 原型（scratchpad/toon/index.html）：ShaderMaterial + skinning chunks、按材质名分角色暗部色、NoToneMapping；明显缩小肤色与饱和度差距。inverted hull 描边在双层衣片与头发分缝处出黑块，正式实现需按角色/材质控制。

- 运行时现状（explorer）：D1 只在角色展示场出现，游戏/家园/捏人不加载；入口唯一是 `src/render/grassy/d1-rig.ts` 的 `createD1Rig` 逐实例克隆材质处（:65-75），展示场经 `stage-actor.ts` 调用。本任务在该共享模块替换材质，D1 将来进游戏自动带上；接入游戏不在本任务范围。静态 D1（`grassy-static.ts`，含历史 Rodin 预览）不改。
- 材质方案：选 `MeshToonMaterial`（DataTexture ramp）+ 链式 onBeforeCompile，而不是纯 ShaderMaterial——仓库的光照图/云影/降水补丁（light-texture.ts、cloud-shadow.ts、precip-surface.ts）只识别内置材质并依赖 `common/project_vertex/opaque_fragment` 锚点，纯 ShaderMaterial 进游戏会丢失这些效果；也能自动拿到场景灯光、阴影与蒙皮。补光用材质 uniform，不新增 THREE.Light（避免全场景重编译）。
- 场景色调映射在后期 GradeOutputPass，材质输出线性 HDR；高光/边缘光保持在 bloom 阈值 1.6 以下。地下环境主光为 0，需角色补光保证可读。
- 风险点：`D1.Covered.*` 是 MASK+alpha 0 永久裁掉的面，需保留 alphaTest；Body/Neck 依赖顶点色；眼睛只在头部贴图里，眼睛高光按 UV 掩码；Flight 装备保留 PBR（金属与自发光）；测试夹具 `test/character-model.test.ts:269-307` 为无贴图无名材质，按 AGENTS 改夹具不加生产分支。

- 资源现状（explorer）：眼睛画在头部单一网格贴图上（左眼虹膜像素框 x1329–1602/y1636–1821，右眼 826–1003/1850–1988 且跨 u=0 接缝、分辨率仅左眼 0.65 倍），虹膜深宝蓝无高光，法线贴图刻有虹膜纹理；运行时默认 512² 贴图，高光点在 2K 下需 ≥8 px。头发为单一焊接网格，结块暗部烤进漫反射、法线贴图近平、粗糙度 ≈.84；fit 后 16% 焊接点法线分裂。下游 `surface_hash` 只比较位置与 UV，改贴图/法线不触发断言。
- 资源改法：新增 `body-v2/head-look/` 一步，读 `head-hair-fit/head-hair.glb`，按 3D 投影重画眼睛（青蓝渐变、两点高光、抹平眼部法线）、头发漫反射提亮缝隙与降粗糙度、头发法线平滑，导出 `head-hair-look.glb`；`assembled-base/assemble.py` 改读它，然后整条 body-v2 链重跑并重建派生。脸部柔和阴影在着色器里做（头部材质法线向头部中心球面法线插值），不改资源。资源线由主会话直接迭代（需逐轮看图），不派 dev-engineer。

- 设计（architect）：新模块 `src/render/grassy/d1-anime-material.ts` 导出 `createD1Material(source, geometry)`，按材质名分角色（skin: Body/Neck…；face: model；hair: model.001/Golden hair roots；cloth: D1 V3 dress/D1 refined *；PBR 克隆: `D1.Covered.*`、`Flight / *`），未登记名抛错。MeshToonMaterial 拷 color/map/vertexColors/side/alphaTest（hair/cloth 另拷 normalMap），不用 gradientMap：重写 `RE_Direct` 为 smoothstep(-0.25,0.35) 暖色暗部并把方向光投影并入同一交界线（替换 `lights_fragment_begin` 中方向光 getShadow 一句，替换失败在模块加载时抛错）；`lights_fragment_end` 后乘 D1_GAIN（≈0.5，抵消 keyLight 3.4/π 与曝光 1.25 造成的过亮与色调映射压缩）、加视线补光 D1_FILL 与边缘光；face 在 `beginnormal_vertex` 后把法线向头部包围盒中心球面法线插值（前半球，0.6）。注入用现有 `injectAfter`，不动其他补丁锚点；设 `customProgramCacheKey`（face 与非 face 不同）；onBeforeCompile 只用闭包 uniform（传送残影会复用）。常量放模块内，不进 config。
- 与设计的差异：头发高光带不画进贴图，改在着色器 hair 角色里加视空间“天使环”（原型效果好，贴图 UV 不适合画连续光带）。描边本轮不做（原型在分缝/耳朵/双层衣片出黑块，边缘光与暖色暗部已撑住轮廓）。
- 资源线：face 不读法线贴图，眼部法线抹平无副作用；资源线只需漫反射改动。无停止条件（设计无分叉、可逆、仅仓库内），直接实现。
- 追加（用户：头发、皮肤、边线需要着色器；分区域处理；原画对比做成功能）：
  - 头发：天使环改为发丝方向 Kajiya-Kay 双层高光（顶点着色器由发旋点算切线并随蒙皮变换；主高光白窄、副高光发色宽；贴图亮度驱动逐发束偏移，并按亮度压暗发束缝隙）。贴图在着色器里是线性空间，亮度基准按线性均值取。
  - 皮肤：明暗交界叠加暖红散射带（scatter）。
  - 分区校色：各角色 grade（线性按通道）与 lift 共用掩码；衣服按贴图颜色分白布/蓝布/金边分别校色。系数来自原画与展示场截图的分区中位色比对。
  - 描边：外壳（背面、沿按位置合并的平滑法线外扩并后推）。不用 Basic（地下发亮）也不用 Lambert（主光在角色后方时背面发黑），复用部件自身的动漫着色、受光法线朝向镜头，再乘描边系数（在提亮之后乘，否则皮肤会被提亮拉回白色）；描边不画发丝高光。
  - 展示场右侧"原画对比"栏：按 D1 变体显示原画资料库对应条目，支持滚轮缩放、拖动平移、双击复位，左边缘拖动调宽度，工具栏按钮开关。D1 变体→原画路径登记在 config/showcase.ts，启动时校验路径在原画资料库中。

## Implementation Map (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/render/grassy/d1-anime-material.ts | 新建：材质名→角色表与 createD1Material（toon 注入、PBR 克隆、缓存键、加载时校验） | | ✅ |
| 2 | src/render/grassy/d1-rig.ts | createD1Rig 逐实例材质改调 createD1Material | 1 | ✅ |
| 3 | test/character-model.test.ts | 夹具材质命名 'model.001' | 1,2 | ✅ |
| 4 | body-v2/head-look/build.py、assembled-base/assemble.py | 眼睛/眉毛/头发贴图与头发法线；装配改读 head-hair-look.glb；整链重导出 | | ✅ |
| 5 | public/characters/human/customization/d1-*.glb 与派生、d1-base-front.png | 复制新 GLB、重建派生与缩略图 | 4 | ✅ |
| 6 | src/render/grassy/d1-anime-material.ts | 追加：发丝高光、皮肤散射、分区校色、描边材质与平滑法线 | 1 | ✅ |
| 7 | src/render/grassy/d1-rig.ts | 读模型时生成描边法线；实例挂描边外壳并释放其材质 | 6 | ✅ |
| 8 | src/config/showcase.ts、src/ui/character-stage-panel.ts、src/ui/character-stage.css | 展示场右侧原画对比栏 | | ✅ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| Blender 链各 validate 脚本 | yes | ✅ |
| npm run typecheck | yes | ✅ |
| npm test | yes | ✅ |
| npm run build | yes | ✅ |
| 浏览器展示场：地上/地下、五变体、侧背面、压缩档，与原画并排截图 | yes | ✅ |
