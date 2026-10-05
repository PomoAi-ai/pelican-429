# PLAN -- Grassy 静态造型与表面精修

## Status: validating
## Task: 036
## Related: 030-grassy-static-models
## Baseline Commit: 无 HEAD；相关脚本、源模型和精细渲染已另存 before-refinement

## Goal
以已确认的四方向参考、尤其右侧母版，重新修整 Grassy 静态模型的轮廓、脸部与材质，提供真实 Blender 同角度渲染对比和共享游戏资源。

## Non-goals
不制作动作，不改鹈鹕，不修改世界逻辑；不以面数或代码检查替代外观验收。

## Acceptance Criteria
- 眼睑和眼球贴合自然，脸颊、鼻、下巴和后脑弧线连贯。
- 头发有体积、自然方向和细纹，避免均匀叶片堆叠外观。
- 圆领针织毛衣、丹宁牛仔裤、鞋面与鞋底呈现不同材质，褶皱、卷边、缝线有合理尺度。
- 精细源文件可编辑，GLB 保留真实三维表面和材质，全高维持 3.10 格，游戏简化版从同一个精细源派生。
- 提供原参考、旧版和新版同方向视觉对照，实查正侧背及近景；未达到参考的部分如实列明。

## Constraints
- 保持现有共享加载器、资源路径和静态姿势；代码与资源均在本仓库可回退。
- 不新增网格细节、常量或源码文本断言测试。视觉由真实渲染和浏览器检查。

## Decisions
- 探索与设计由头脸、头发、衣身三路独立进行；现有装配/导出结构已读完，可直接复用。
- 采用贴合眼睑的眼表面、较少但自然交叠的发束、带稳定 UV 的织物材质；保留旧模型与旧渲染作对比。
- 实际渲染修正：去除眼周垫圈；发束按头皮表面投影，消除头皮遮盖刘海；按部件稳定 UV，并在导出合并前统一 UVMap 名；修正鞋眼片镜像法线与对比页快速切换方向的异步错配。
- 启动故障已定位为受限运行环境下 Blender Metal 初始化空指针，非建模脚本异常；本机授权方式运行后渲染成功。
- 无需用户再批准：参考、静态范围和尺寸均已有确认，本地修改可回退。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | scripts/blender_grassy/static_head.py | 头脸、眼睑、耳朵和细部 | — | yes |
| 2 | scripts/blender_grassy/static_hair.py | 发型弧线和方向纹理 UV | — | yes |
| 3 | scripts/blender_grassy/static_body.py | 衣身手鞋形态和 UV | — | yes |
| 4 | scripts/blender_grassy/static_materials.py | 导出可用的织物、头发和鞋面材质 | — | yes |
| 5 | scripts/blender_grassy/build_static.py | 装配、渲染及导出 | 1,2,3,4 | yes |
| 6 | assets/characters/grassy/model-static 与 public/characters/human/models | 源模型、渲染和三档共享资源 | 5 | yes |
| 7 | public/characters/human/SOURCE.md | 最新实际数据与限制 | 6 | yes |

## Validation
| Command / Check | Required | Done |
|-----------------|----------|------|
| Blender 实际构建、正侧背近景渲染与目视对照 | yes | yes — 15 张全身 + 4 张近景，源文件已在 Blender GUI 正常打开 |
| GLB 尺寸、贴图、静态导出检查 | yes | yes — 二进制顶点/节点变换/UV/18 张嵌入图；3.10 格，1024/512/256 贴图，0 动作/蒙皮 |
| 浏览器模型展示场与真实场景查看 | yes | yes — 旋转、版本与视角切换、近景和游戏视距；对比页正/侧/背与细节 |
| npm run typecheck | yes | yes — 子代理首次通过；最后受同时变动的天气接口影响失败，接口恢复后重新运行通过 |
| npm test | yes | yes — 1492/1492 通过；中断后重新完整运行 |
| npm run build | yes | yes — 首次 316 模块；最终天气接口恢复后 317 模块通过；chunk 体积警告 |

## Review
- 子代理复审通过：对照页异步方向错配、鞋眼片镜像法线、材质与图片独立降采样、眼部虹膜裁剪均已复核。
- 最新眼部修正让上眼睑遮住虹膜上缘，下睑贴合脸面；实际近景已重新渲染。
- 游戏标准版为 44,846 三角面 / 4.95 MiB；轻量版为 18,391 三角面 / 1.43 MiB；精细版 1,981,238 三角面 / 69.23 MiB。

## Visual acceptance remaining
当前精修与游戏资源已输出，代码与资源检查完成；保留 validating 表示外观尚不应宣布为最终定稿。侧脸鼻下至下巴偏直，部分发束偏宽、独立块状感仍明显，丹宁洗水与布料色差比原画简单。已提供原画/旧模型/当前模型真实渲染对照，不以通过代码检查替代这些视觉差距。

## Deliverables
- `assets/characters/grassy/model-static/refinement-compare.html`：四方向与四张细节。
- `grassy-detailed.blend`、`grassy-variants.blend` 与共享三档 GLB。
- `refinement-compare-front.png`、`refined-showcase.png`、`refined-in-scene.png`、`refined-game-distance.png`、`blender-refined-open.png`：实际查看记录。
- `public/characters/human/SOURCE.md` 与 `asset-paths.txt` 已更新。
- 没有新增模型细节断言测试，没有修改天气接口、TS 游戏逻辑、动作或鹈鹕，没有提交或推送。
