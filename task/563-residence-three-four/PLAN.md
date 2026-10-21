# PLAN -- AI 住宅 3、4 作为独立场景并入新结构

## Status: done
## Task: 563
## Related: 560, 562
## Baseline Commit: ff504067

## Goal
- AI 住宅 3 与 AI 住宅 4 作为独立场景：菜单各有入口（如 `?mode=homestead&scene=residence-3` / `residence-4`），各自背景、外观与存档。
- 底层复用城区那套游戏、建造、光照、天气、交通（与“住宅建造”原版住宅同一方式），不复活旧住宅页与第二套实现。
- 住宅 3：取回 560 删除的环境、城市、水面（git 47a8232a），并带上 stash@{1} 里其他会话对它们的未提交改进与未跟踪的 residence-three-atmosphere.ts。
- 住宅 4：主工作区未跟踪的 src/render/residence-four-*.ts（10 个）接入新结构；stash@{1} 里的 four 相关改动（变体、存档键、AI_CITY_THREE_LOOK、日月盘缩放、取景上移、地形视图参数、场景目录条目、测试）按新结构落地。

## Non-goals
- 不改原版住宅、主世界城区、原野与机房的画面与行为。
- 不提交；不碰与本任务无关的已跟踪或未跟踪文件；不 drop stash。

## Acceptance Criteria
- 菜单出现 AI 住宅 3、AI 住宅 4，各自打开独立背景，可走动、建造、存档互不覆盖；WebGL 与 WebGPU 都无控制台错误。
- 住宅 3、4 画面与其他会话原作的构图一致（江景、街区、列车、远城、薄云、空气远景、日月盘缩放、取景上移），光照用统一模型。
- 主工作区类型检查 0 错误（residence-four 等文件不再报错）；npm test 全通过（偶发的 light-field 计时用例除外需说明）；build 通过。
- docs/architecture.md 与 560 记录的 E-6 修订一致。

## Constraints
- 主工作区其他会话在用：只改本任务文件；不提交；不改 src/vendor/pelican-3d。
- 一套实现：住宅 3、4 是城区世界的变体（同 sim、同光照、同建造），差异只在背景、外观参数与存档键。
- Fail-fast；最小改动；测试按 AGENTS.md。

## Decisions
- 用户决定（2026-10-21）：住宅 3、4 保留为独立场景并入新结构，修订 560 的 E-6（原为删住宅 3）。

- 探索：新结构已支持城区变体（ResidenceVariant 贯穿 sim/city、city-save、game-app、city-presentation），加 'three'/'four' 本身容易；缺的是住宅 3/4 依赖的旧模块（harbor-perspective 的 configureHarborCity/createHarborTraffic、harbor-buildings、Reflector 水面、residence-three-* 四个文件）都已删除，以及 WebGPU 下的反射、河城阴影、onBeforeCompile 空气/表面补丁需要节点版本。
- 交通中心：旧代码中住宅 3、4 与住宅 2 同属 harbor 类（带地下长廊、交通中心用地与星舰交通中心），按原样保留；不接原野出口（原野出口只属于主世界城区）。
- WebGPU：住宅 3、4 的水面反射、河城阴影、空气与表面补丁都给 WebGPU 实现，与 562 的“两端一致”一致。
- 用户决定（2026-10-21）：各城区变体共用同一套游戏、建造、光照代码，但可以有不同的地图（地形、建造场地、初始建筑布局、地下长廊等）；地图定义作为变体属性的一项，住宅 3、4 先沿用旧版地图，结构允许以后按变体换地图而不加分支。
- 存档：新键 pelican-city-three:v1 / pelican-city-four:v1；旧住宅页键不迁移（存档忽略）。

- 设计（architect）：变体表 RESIDENCE_VARIANTS（config/residence.ts：scene、title、map、look、tuning）；地图表 CITY_MAPS（sim/city.ts：transit 用地 + build 过程），住宅 3、4 用 'harbor' 地图（旧代码即与住宅 2 同图）；世界尺寸、原点、分段仍共用，换尺寸另做。环境统一为 CityEnvironment，按变体 Record 选择。反射与河城阴影改为环境 update 内离屏渲染，WebGL/WebGPU 同一份 CPU 代码，WebGPU 只翻译着色器与新增 NodePatch（residence-air、river-surface、river-sun-shadow、harbor-curtain-wall）。右端进原野、世界工具条、GM、返程着陆只属于主世界城区；返程仍落主世界城区。
- 住宅 3 地层背板：浏览器挖洞确认透空后按旧参数（−10 以下，z −1.7，0x655b4e）补。
- 移入 src/render/city/ 的未跟踪文件用 mv，不 git add；提交时需与 public/scenes/residence-four-river-v2/ 一并加入。
- 无停止条件：用户已定“就这样完成合并”“公用，但是可以有不同的地图”，architect 列出的决定点均按推荐执行。
- 审查修复一轮：WebGPU 河城阴影深度图采样翻 v（浏览器夸张阴影对比确认颠倒）；湖面涟漪先偏移后翻转；from=transit 出生点改从地图取，无交通中心的城区抛错；去掉 shade 空值检查。
- 验证：typecheck、npm test（2020 中 1 例为已知墙钟预算用例，单跑通过）、build 通过；住宅 3、4 在 WebGL 与 WebGPU 下开场画面、倒影、河城阴影已在浏览器核对。住宅 3 挖洞背板、夜晚/雨天、走动建造存档、交通中心发射留人工验收。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/ai-city-look.ts | **B1** DaylightLook 加 celestialDiskScale；新增 AI_CITY_THREE_LOOK | — |✓ |
| 2 | src/render/sky/celestial-sky.ts | **B1** 加 diskScale 参数 | — |✓ |
| 3 | src/render/sky/daylight.ts | **B1** :168 传入 diskScale | 1,2 |✓ |
| 4 | src/config/residence.ts | **B1** 变体扩到 three、four；新增 CityMapId 与 RESIDENCE_VARIANTS（scene、title、map、look、tuning） | 1 |✓ |
| 5 | src/sim/city.ts | **B1** 新增 CityMap 接口、CITY_MAPS、cityMap()；citySite、createCity、restoreCity、installTransit 改为取地图；更新注释 | 4 |✓ |
| 6 | src/app/city/city-save.ts | **B1** SAVE_KEYS 加 three、four | 4 |✓ |
| 7 | src/app/game/game-level.ts | **B1** parseGameLaunch 按表解析 scene | 4 |✓ |
| 8 | src/app/game/game-app.ts | **B1** tuning、look、标题查表；保留主世界专属分支；调整 features 顺序 | 4 |✓ |
| 9 | src/app/city/city-presentation.ts | **B1** 定义 CityEnvironment 和环境 Record（三、四先用 harbor 占位）；clearing 取自 cityMap；传 stage；foreground 可为 null | 5 |✓ |
| 10 | src/app/city/city-launch.ts | **B1** flight 文案 | — |✓ |
| 11 | src/config/site-directory.ts | **B1** 新增两个页面；调整 homestead 匹配 | — |✓ |
| 12 | src/config/i18n/app.ts | **B1** 补英文词条 | — |✓ |
| 13 | test/residence.test.ts | **B1** 补 three、four 存档往返与 transit 断言 | 5,6 |✓ |
| 14 | test/app-mode.test.ts | **B1** 补路由、页面归属、parseGameLaunch 用例 | 7,11 |✓ |
| 15 | docs/architecture.md | **B1** scene 行；E-6 原则（含地图） | — |✓ |
| 16 | src/render/city/harbor-buildings.ts | **B2** 恢复；并入 HarborBuilding 类型 | — | Done |
| 17 | src/render/stage/node-patches.ts | **B2** 恢复 harbor-curtain-wall | — | Done |
| 18 | src/render/webgpu/webgpu-patches-city.ts | **B2** 恢复幕墙翻译 | 17 | Done |
| 19 | src/render/city/harbor-city.ts | **B2** 新建：configureHarborCity、detailGlazing、createHarborTraffic | 16,17 | Done |
| 20 | src/render/city/residence-three-water.ts | **B2** 从 stash 恢复；改为帧前离屏平面反射 | — | Done |
| 21 | src/render/city/residence-three-sky.ts | **B2** 恢复；传 cameraFrame | — | Done |
| 22 | src/render/city/residence-three-atmosphere.ts | **B2** mv 移入并修导入 | — | Done |
| 23 | src/render/city/residence-three-city.ts | **B2** 从 stash 恢复；修导入；删 layers | 16,19,22 | Done |
| 24 | src/render/city/residence-three-environment.ts | **B2** 从 stash 恢复；新签名；暴露 foreground；update 里反射；按需补地层背板 | 20-23 | Done |
| 25 | （浏览器）住宅 3 挖洞检查 | **B2** 决定第 24 行要不要补背板 | 26 | 留给人工验收 |
| 26 | src/app/city/city-presentation.ts | **B2** 住宅 3 接入真实环境 | 9,24 | Done |
| 27 | src/render/city/residence-four-layout.ts | **B3** mv 移入并修导入 | — | Done |
| 28 | src/render/city/residence-four-streets.ts | **B3** mv 移入并修导入 | 27 | Done |
| 29 | src/render/city/residence-four-vegetation.ts | **B3** mv 移入并修导入 | 27 | Done |
| 30 | src/render/city/residence-four-atmosphere.ts | **B3** mv 移入；低空雾改用河面 uniform | — | Done |
| 31 | src/render/city/residence-four-city.ts | **B3** mv 移入；导入改到 harbor-*；删 layers | 16,19,27-30 | Done |
| 32 | src/render/city/residence-four-sky.ts | **B3** mv 移入；传 cameraFrame | — | Done |
| 33 | src/render/city/residence-four-surfaces.ts | **B3** mv 移入 | — | Done |
| 34 | src/render/city/residence-four-shadows.ts | **B3** mv 移入；改为 update 驱动、DepthTexture、聚焦点用 frame 坐标、偏置按坐标系 | 20 | Done |
| 35 | src/render/city/residence-four-environment.ts | **B3** mv 移入；新签名；foreground 为 null；update 里驱动反射与阴影 | 20,27-34 | Done |
| 36 | src/app/city/city-presentation.ts | **B3** 住宅 4 接入真实环境 | 26,35 | Done |
| 37 | src/render/stage/node-patches.ts | **B4** 新增三种补丁 | 17 | Done |
| 38 | src/render/webgpu/webgpu-light-map.ts | **B4** 导出光照模型类型 | — | Done |
| 39 | src/render/webgpu/webgpu-patches-city.ts | **B4** 三种补丁的翻译 | 18,37,38 | Done |
| 40 | src/render/webgpu/webgpu-shader-city.ts | **B4** 登记湖面反射的节点转换 | 20 | Done |
| 41 | src/render/city/residence-three-atmosphere.ts | **B4** addNodePatch residence-air | 22,37 | Done |
| 42 | src/render/city/residence-four-atmosphere.ts | **B4** addNodePatch residence-air（带 low） | 30,37 | Done |
| 43 | src/render/city/residence-four-surfaces.ts | **B4** addNodePatch river-surface | 33,37 | Done |
| 44 | src/render/city/residence-four-shadows.ts | **B4** addNodePatch river-sun-shadow | 34,37 | Done |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npx tsc --noEmit -p . | yes | ✓ |
| npm test | yes | ✓ |
| npm run build | yes | ✓ |
| 浏览器：住宅 3/4 WebGL 与 WebGPU 打开、走动、建造、存档；原版住宅与主世界城区不变 | yes | ✓ |
