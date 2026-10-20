# PLAN -- 游戏一套实现、向标准合并

## Status: done
## Task: 560
## Related: 557, 558
## Baseline Commit: 59f1b361（557、558 未提交，叠在其上）

## Goal
- 游戏只保留一套代码、一个实现：3D 渲染、2D 横版视角；玩耍层是一个基于格子的自由世界模拟，特殊场景可放自带碰撞的特殊构件；背景是 3D 空间里的 2D 贴图平面或 3D 模型，只负责显示。
- 城区、原野、交通中心、机房章节、Boss 场、家园、主线、测试关都是同一实现的世界数据；特别入口用网址参数组合（世界、剧情、开发开关：GM、自由镜头/预设视角、调试句柄、bench、着陆测试）。
- 向标准合：格子与透视以 public/concepts/core-coordinates.md、depth-definitions.md、core-glossary.md、scene-composition.md、character-ruler-standard.md 为准。玩法系统沿用 game-app（实体、战斗、NPC、主线、存档、HUD、输入、设置）；世界层采用已按标准实现的定义构件（definition-kit、definition-collision、tile-definition-collision、方案 G 层距、前景格子、加深格），正式游戏补齐 core-coordinates.md 第 5 节差异。
- 渲染统一：一个渲染器工厂、一个舞台；展示家具、人物演练场、头发预览、渲染实验、场景透视等非游戏页面只换镜头、灯光预设、面板，复用游戏资源。返程穿梭层是唯一例外（独立上下文，配置走工厂）。
- 一个 HTML 入口：render-lab、d1-hair-gallery、harbor-perspective、maglev-track 并入 index 的 mode；所有非游戏页面登记在同一份资源列表，菜单由它生成。
- 新建 docs/architecture.md 记录上述原则（引用标准文档，不重定义），AGENTS.md 加一行引用。

## Non-goals
- 头发方案本身（材质、发型取舍、资源归档）不改，只把页面并入入口和资源列表。
- 不新增玩法、关卡内容或美术资源。

## Acceptance Criteria
- 每个可玩网址只走一条装配；src 中不再有第二个游戏帧循环、游戏相机或游戏 HUD 装配。
- tile-scene、wilds-scene、facility-app 删除；residence-app、transit-app 不再自带循环、相机、HUD。
- 正式游戏的格子尺寸、深度分区、平台、墙、门、层距符合标准文档；第 5 节差异表清空或文档同步更新。
- 只剩一个渲染器工厂；除返程穿梭层外无直接 new WebGLRenderer。
- 只剩 index.html 一个 HTML 入口；顶栏菜单与资源列表同源。
- 旧存档不迁移；格式不兼容时明确报错或丢弃。
- docs/architecture.md 存在且 AGENTS.md 引用。
- typecheck、npm test、build 通过；浏览器人工验收清单交给用户。

## Constraints
- 设计完成后停下等用户批准（删除大量文件、改网址、存档迁移）。
- 分批交付，每批可玩、可验证。
- 不改 src/vendor/pelican-3d；不碰主工作区（其他会话在用），只在本 worktree 改。
- 遵守 AGENTS.md 分层、fail-fast、测试与验证规则；渲染与 UI 人工验收。
- 分歧处理：正式游戏表现为默认，工作区独有功能改为参数或开发开关。

## Decisions
- 任务号 560：主工作区已有 558、559 目录，避免合并冲突。
- 合并方向“向标准合”：用户确认（标准已在定义构件与透视侧实现，正式游戏格子世界未同步）。
- 补齐标准与合并一起做：用户确认“向标准合”，不分两步。
- 探索结论（详见会话 scratchpad findings-560.md）：
  - 两套游戏装配实为原野、机房（game-app vs tile-scene/wilds-scene/facility-app）；城区、交通中心另有独立运行时（residence-app + perspective-player + definition-collision；transit-app/station/pilot）。
  - sim-world 只走 tile-collision，从未用多边形移动；城区 4043 构件中大部分可栅格化，余下（上半砖、K-N 形、半宽平台、家具承托面、门、太阳能板、舰体、电梯、甲板）需特殊构件或扩展格子形状。
  - core-coordinates §5 表数值取自 building-kit（正式游戏不渲染）需先修正；真实差距：地形前面 +0.5→+1、墙/背墙/洞壁、平台挂墙与半砖/左右半、形态 4→标准、背景层（方案 G、前景格子、雾）未接、让位未接。
  - 渲染：5 处直接 new WebGLRenderer、3 份合成器、2 套昼夜、约 18 份帧循环；全局 configureCharacterTextures 耦合需先解开。

- 用户纠正（格子标准）：玩耍层直接采用新标准格子模型——一个逻辑格可放多块互不重叠构件（B+C、K+L、M/N/O/P、互补斜块），33 种形态全支持（tile-shape-definitions.md、tile-connections.md、resource-classification.md、material-library.md）；上半砖、K-N、半宽平台、对齐半格的家具承托面都是格子原生能力；碰撞与光照最小单位按标准细分。舰体、电梯、门、太阳能板为特殊构件，必须支持。由此住宅/定义构件侧是标准实现，正式游戏格子世界升级到该模型。
- 存档：用户不在乎，不做迁移；不兼容的旧存档明确报错或丢弃。
- 设计（architect，待用户批准）：
  - 世界数据：格块层（主块稠密 Uint16 材料+Uint8 形态 0..32+深度位，同格附加块按区块稀疏表；平台为独立块类型 6 变体）+ 派生 1/4 栅格（solidMask/platformMask Uint16）+ 背景墙层 + 摆放物件层（半格锚点、承托面、光源）+ 特殊构件层（门、太阳能、舰体、电梯、甲板，按格分桶，只在 stepSim 内改）。保留 set/setShape/load 单块写入，worldgen 输出逐格不变；新增 placePiece/removePiece；shapeAt 遇多块格抛错。
  - 碰撞：统一多边形求解器（以 definition-collision 的 moveDefinitionBody 为基础，按扫掠包围盒取格内多边形，1/4 掩码粗筛），moveAndCollide 等签名不变，旧 tile-collision 实现删除。
  - 城区：sim/residence.ts 规则改为按格查询的 sim/building.ts，CITY_ORIGIN=(1152,63) 写入格子；城区功能做成 app/city/city-feature.ts（GameFeature 插件）；存档新键，旧三键提示后丢弃。
  - 交通：TransitState 进 SimWorld 按 tick；舰体/电梯/甲板为特殊构件；E 键只在提示可见时捕获接管；前往机房改为穿梭层+整页跳转。
  - 光照/天气：daylight 一套（由 ai-city-lighting 泛化，按世界 look）；天气以 sim env 为唯一来源；局部光以 residence-light（1/4、RGB、天光）泛化为 world/light-field.ts 区块增量；删 light-map、free-world-daylight、residence-weather。
  - 背景：render/backdrop 数据驱动，config/depth-layers 方案 G 默认、每世界可覆盖；接 depth-haze 雾；前景格子下沉 1、压暗 .82、近景模糊（WebGL 与 WebGPU 都实现）。
  - 渲染：createRenderer(preset: game|studio|thumbnail) 唯一工厂（含 WebGPU），角色贴图改页级 bindCharacterTextures；合成器只留 showcase-renderer；light-presets.ts；帧循环两个（frame-loop、view-loop）。
  - game-app 保持整页，不处理 DOM 耦合；scene-loading、scene-map-button 移出 workspace。
  - 透视/检视页走动角色改跑同一 sim（unlimitedFlight 开发选项），删 perspective-player、definition-ride-probe、tile-definition-collision。
  - 页面登记：config/site-directory.ts 唯一登记表，顶栏与工作区侧栏都由它生成；实验页改 ?mode=；vite 只剩 index。
  - 分批 B0 文档 → B1 游戏入口单一 → B2 渲染工厂/单入口/登记表 → B3 世界模型 → B4 物理 → B5 1/4 光照流体视线小地图 → B6 城区并入 → B7 交通并入 → B8 昼夜天气背景深度标准 → B9 检视页统一 sim → B10 收尾；B3→B7 强依赖，每批独立提交可回滚。约 +7k/−7.5k 行（±40%）。
- 停止条件：删除大量文件、改网址、丢弃存档、改测试断言 → 设计交用户批准。

- 用户批准设计（“开始!”），E-1～E-15 全部采用推荐：1 碰撞精确多边形+1/4 栅格粗筛与光照/流体/视线/小地图；2 流体 1/4 子格+活跃集合，性能不达标退回逐格；3 1/4 光场全世界区块增量；4 手感契约=上下坡不腾空、上台阶、下穿、高速不穿透；5 原野背景格子①②由地表派生压暗剪影；6 保留原版住宅为城区变体，删住宅 3 与住宅演示条目；7 删港口透视页；8 删 scene=original；9 城区飞行上限=建造上限+28；10 近景模糊保留（用户改定：近景=比建设层更近的前景格子层，所有世界含住宅都模糊，参数按方案 G，WebGL 与 WebGPU 都实现；depth-definitions 已同步）；11 删独立交通中心页，from=transit、flight= 移到城区；12 前往机房改穿梭层+整页跳转；13 批准 tile-shapes/physics-slopes/perspective-player 测试变更；14 丢弃旧住宅三键；15 渔屋、洞壁只做深度对齐。
- 557、558 未提交，用户未要求提交；本任务在其上继续，不自动提交。
- 实施顺序：B0 与 B1 并行（文档不影响构建），其余按批串行，避免同一工作树里多名工程师同时改动互相干扰 typecheck/test。

- B1 结果：pageRoute(params, release) 只剩 release；新增 parseDevCamera（cam 只接受 free，发布版报错）；dev-camera.ts 按需动态加载，开发暂停停住 sim；mode=lab 默认 sandbox；residence-three-* 与 facility-view.ts 随入口删除。已知遗留：城区/交通/原版住宅暂不读 cam（B6 并入后解决）；机房章节带 cam=free 时章节面板被 free-world.css 隐藏；自由镜头左键拖动与攻击冲突（原工作区同样）。typecheck/test 2037/build 通过。

- B2 结果：createRenderer(preset: game|studio|thumbnail) 唯一工厂，WebGPU 经工厂；角色贴图改 bindCharacterTextures，页主渲染器放 app/shell/page-renderer.ts（page-context 在首页主包，放进去会带入 three），后绑定者接管；?mode=render-lab|hair-gallery|maglev，4 个 HTML 与港口透视页删除，vite 只剩 index；site-directory 为唯一登记表（SitePage.entries 承载侧栏条目，资源主题名移 config/resource-subjects.ts，卡片上限移 config/showcase-limits.ts 避免首页包膨胀）；头发预览与渲染实验归“角色与模型”，磁悬浮归“实验室”；地下检视光统一为 #172b3b/半球 .65/主光 0。遗留：residence-app 仍自建渲染器（B7 删除时解决）；return-corridor-overlay 仍直接 new（B7 改走工厂）；ai-city-lighting PMREM、definition-depth-layout 模糊四边形留 B8；level=transit 不在登记表（B7）。typecheck/test 2037/build/build:full 通过，浏览器 18 个网址无报错。

- B3 结果：多块格（主块稠密+区块稀疏附加块，形态字节低7位形态码、0x80 加深）、33 形态与 6 平台变体（轮廓单一来源 config/definition-kit）、写入即更新的 1/4 solidMask/platformMask、LevelData.building（墙层+物件层+加深互斥）与 LevelData.parts（特殊构件），sim/definition-depth 删除、residence 重叠规则改用 world 层。固定种子逐格哈希不变（主世界 17459819）。大型原野掩码约 +3 MiB。typecheck/test 2044/build 通过。接口摘要见会话 scratchpad api-560.md。行 52 推到 B6。

- B4 结果：唯一多边形求解器（world/collision-geometry.ts 的 CollisionSource + physics/tile-collision.ts），格块/平台/物件承托/特殊构件统一 gather；building/parts 移入 TileMap；definition-ride-probe 提前删除（行 141）；definition-collision 仅留旧调用方最小接口待 B6/B7/B9 删除。手感契约用例全绿；“全 FULL 逐位一致”改为三条不变量（不嵌入、着地必有支撑、同输入逐位相同），原因：水平子步、空中跨沿、下穿语义统一。单步耗时增 <0.25ms。typecheck/test 2050/build 通过，6 个网址冒烟无报错。待用户手感试玩。

- B5 结果：world/light-field.ts 1/4 子格光场（条带存储、镜头附近流式计算、增量与全量逐位一致、RGB 灯与天空光），world/light-field-tiles.ts 读掩码、墙层、物件灯、水面子格、树冠、浮空岛、洞穴发光源；render 端 light-field-atlas（16 条带环形图集，每帧最多挪一条）+ light-field-material（替代 light-texture，0.42 改引用 WATER_FRONT_Z）+ light-field-city（替代 residence-lighting）；城区住宅暂经 sim/residence-light-source.ts 桥接（与旧实现逐位一致，B6 并入格子后删）。流体走回退“逻辑格流体”，且只取保守版：任一实心子格即整格实心；按空子格折算容量会改 cave-island、tile-shapes、terrain-compositions 3 条断言，待用户批准。小地图、遮雨、free-world 拼接、worldgen-verify 改用掩码与 pieces。性能（node，旧 = 提交 59f1b361 的整图光照）：首帧大型原野 93→111~137ms；挖一格 0.65→3~6ms 中位；水流扫描帧 p95 3→6~7ms；镜头横移补条带 ≤5ms/帧；常驻约 11.8MB 条带 + 6.4MB 图集。typecheck、test 2049、build 通过。


- B6 结果：城区并入格子世界。config/residence 加 CITY_ORIGIN=(1152,63)、CITY_MAP（建造上限 +28 格飞行余量，E-9）与资源→块/墙/物件/特殊构件映射；DEFAULT_TILES 加 ceramic/alloy/ashlar 与 ceramicplatform/alloyplatform（行 52；平台 key 不带连字符，守住“key 只用小写字母”的既有用例）；sim/building.ts 由 sim/residence 改写（按格规则写入 TileMap，门与太阳能为特殊构件），building-brush 适配；sim/city.ts 管城区状态（createCity/captureCity/restoreCity/findCitySpawn，stepCity 在 stepSim 内逐 tick 推进门与太阳能，太阳角经 setCitySunAngle 命令）；新存档 pelican-city:v1 / pelican-city-original:v1，旧三键读到即删除并提示，不迁移；piece-view（多块格与建筑块按区块实例化定义构件）、tile-view 只画自然单块、building-layer-view（墙按区块实例化，物件与特殊构件独立）由 world-views 挂载；game-app 装配城区（app/city 的 city-save、city-presentation、city-feature），frame-loop 加 GameFeature 钩子（城区表现、城区建造两个插件，建造时暂停模拟）；residence-hud 只留建造面板；小地图同时订阅 onMaskChange；原版住宅保留为城区变体（E-6）；light-field-city 改读游戏光场的同一图集，保留为城区建筑着色并记为遗留（昼夜统一时并入游戏材质）。提前做了 B7 的两项：residence-app 删除（行 108，它依赖本批删除的 sim/residence 等）、harbor/residence 路由改进游戏页（mountCity 处理 landing=1 穿梭层开场；app-mode 未改，行 110 仍归 B7）。城区光场（node，harbor 城区镜头附近 16 条带）：开关门 sync 中位 3.6ms（首次 11.8ms）、放一块 2.4ms、拆一块 2.6ms，B5 桥接为 38ms。遗留：交通中心未进格子世界（用地内暂留方石街面，from=transit 只落在街面，transit-station 的 hosted 分支已无调用方，均归 B7）；城区 walkZ/深度过渡与天气背景统一归 B8，城区不支持 renderer=webgpu（ai-city-lighting 的 PMREM，进入时明确报错）；建造沿用游戏镜头，只能在视野内建造（无轨道平移）；城区未接 GameAudio；scene-workspace.css 的旧 .residence 规则与 i18n 里住宅页专用文案已无调用方。typecheck、test 2039、build 通过；浏览器冒烟 9 个网址无报错，城区建造放置与自动存档已实测。
- B7 结果：交通中心并入模拟层。sim/transit 加 transitElevatorY、TransitStation（addTransitStation 把舰体实心、登船甲板与电梯支撑线登记为特殊构件 hull/deck/elevator）与命令 requestTransitLift / enterTransitCabin / launchTransitFlight / steerTransit；stepSim 在交通中心非 ground 阶段走冻结分支（只推进 stepTransitStation：电梯构件逐 tick 升降、人随电梯或沿舱门通道移动、回到 ground 放到出口；跟随机照常追表现层目标，免得解冻那帧冲过玩家把人顶飞，浏览器实测出现过后补了用例）；乘梯请求在 ground 阶段接管移动走向电梯，玩家自己移动、跳跃或下蹲即取消。交通中心用地改为清空地面及以上全部构件，地面一行铺新瓦片 paving（TILE_PAVING=16，实心 B 半格；不是建造构件，瓦片层与块视图都不画，画面由交通中心模型的前庭铺面负责，资源展示场按“交通中心模型”标注），替代 B6 暂留的方石街面。transit-station 改为 GameFeature（模型、镜头只在非 ground 阶段接管、界面叠层、音效、玩家视图摆位、舱门提示时暂停模拟、E 只在提示可见时捕获），起飞进入航道后城区表现 leave() 并隐藏场景，complete 后穿梭层 depart 整页跳转到设施关卡（带 landing=1）；return-corridor-overlay 渲染器改走 createRenderer 工厂并收成 depart/progress/hide。game-app 删除 GameStartupPresentation/mountCity，landing=1 统一用穿梭层作启动画面并在城区与设施都从网址去掉；flight=<目的地> 直接发射（未知目的地或非城区即抛错）。删除 transit-pilot、transit-app、transit-handoff；app-mode/routes 去掉 transit/harbor/residence，?mode=transit（或 level=transit）与 ?mode=residence 抛错并给出新网址；landing-lab 的发射链接改为 ?mode=game&from=transit&flight=…。清理：transit-station 的 hosted 分支随重写消失，transit-controls 只留界面，transit.css 只留叠层样式，transit-center-model 去掉 streetEnds/码头墙，scene-workspace.css 的旧 .residence 规则、i18n 中住宅页与独立交通页的 56 条无调用方文案删除。scene-game-overlays 未删（workspace/scene-demo-stage 仍在用，行 109 移交 B9）。行为变化：residence 用地测试改为断言用地内无建造构件、地面为 paving B 格；设施 landing=1 用后也从网址去掉。已知简化：座舱/电梯里的角色朝向旋转未保留；登舱走路动画靠 body.vx；舱门提示期间模拟暂停（待机动画停）；交通中心文案不随语言即时切换；城区仍不支持 renderer=webgpu；game-app 仍超 800 行；跟随机落在甲板上会把玩家推着走（既有实体碰撞行为）。typecheck、test 2043、build 通过；浏览器冒烟：from=transit 乘梯上甲板→开舱→选目的地→发射→航道→跳到设施、flight=cathedral/fortress 直发、城区 landing=1、?mode=transit 与 ?mode=residence 报错提示、原野 medium、资源展示场，无控制台报错。

- E-2 修订（用户 2026-10-20「流体 先开发,后面在优化」）：流体改为真正的 1/4 子格流体，取消“超门槛回退整格”；当前性能（原型：大型首帧约 609ms、内存约 88MB、倒水每步 p95 约 2ms）接受为基线，优化另行处理。锁定整格存储的旧测试按新行为更新。批次 B5b，在 B7 之后、B8 之前执行。
- E-3 补充：光照重算分摊到多帧（每帧预算约 2ms）随 B8 一起做。

- 交通中心（用户 2026-10-21）：开舱门到穿越结束隐藏游戏 HUD 与小地图（body[data-transit-cabin]）；跟随机在甲板上推玩家的实体碰撞行为不改。

- B5b 结果：流体改为真正的 1/4 子格流体（E-2 修订）。FluidMap 以子格为存储与流动单位（cells/solid 为 4W×4H 子格，每子格满 255，只占 solidMask 为空的子格；掩码变化逐子格同步，变实心的子格水计入 lostMass），去掉 capacity/add/maskAt 与 cellWaterTop；逻辑格查询 amountAt（ceil(子格和/16)）、surfaceAt（各子列最高水面），子格查询 subAt/subTopAt，写入 set(格, 水位)/setSub/addSub，chunkRevisions/chunkSize 供多个只读消费者只重扫变化区块。fluid-sim 同一 F1 算法跑在子格上（删带上限均分），advanceFluid 每次推进 4 个子步保持格/秒流速，sim 按 stepInterval 调它。生成：fillWaterBody 灌湖、洞穴水潭、浅水盆后，再灌满岸边斜坡/半砖格里与水四连通的空子格，生成即静止不留缝（洞穴水潭 600 tick 不变仍成立）；worldgen-verify 的出生区/沙漠无水检查只看无实心子格的格。同步：fluid-contact 按子列累加（游泳/憋气/浸没/投射物入水）、light-field-tiles 水面子格（中心在水面下）且 scanWater 只重扫版本变了的区块、water-depth 改读 FluidQuery、水面/水草/涟漪用 surfaceAt、水底延伸看下方子格行、小地图按子格画并按区块版本重算哈希、降水落点沿格心子列找水面、洞穴装饰/滴水/发光规划读 amountAt、free-world 拼接按子格复制、调试倒水按格内 4 列子格一格满水；无存档涉及流体。锁定整格存储的 14 个测试文件按新行为更新（清单见会话汇报），新增斜坡流入/半砖旁/挖开 3 条守恒用例。性能（node，原型 = b5-fluid-proto 同口径）：建流体图+灌水 小 67~71ms / 大 134~135ms（原型 222/421ms）；常驻约 44/88MB（与原型同：cells/solid/marks + 扫描戳）；倒水每次推进中位 0.19~0.21 / 0.18~0.22ms、p95 1.37~1.42 / 1.42~1.65ms（原型 0.25/1.53、0.25/1.59）；空闲推进 0.001ms；光照首帧 小 155~166 / 大 204~223ms（B5 为 124/111ms，水下深度图改走 amountAt，全图约 +40ms）。typecheck、test 2047、build 通过；浏览器冒烟原野中/大（湖、洞穴水潭、挖岸、F 倒水守恒且 8s 内静止）、机房 abyss、城区、场景透视、原野 WebGPU 无控制台报错。遗留：原野 ?debug 在首帧改写网址时被去掉（调试句柄要用 gm=1）；WebGPU 下未做倒水交互冒烟。

- B8b 结果：背景层统一到 render/backdrop。config/depth-layers 定义景别层 id、层表 DepthScheme（层距、近景下沉、是否启用雾与模糊）、默认方案 G（近景 +3 下沉 1）、旧层距 DEPTH_FLAT（远景按它建模）、覆盖函数 depthScheme 与城区层表 CITY_DEPTH（五层城景对应景别层，近景不下沉）。backdrop.ts 建六个层组：三层远景绕 pivot 按 (D−新)/(D−旧) 放大补偿，近景组下沉；近景（近景组 + blur 登记）在视线与正面夹角 ≤18° 且层表启用时单独渲染到半分辨率目标（相机层 2），σ=画面高 0.24%、压暗 82% 叠回，仍照常投影；WebGL 主通道用 onBeforeRender 关颜色/深度写入，WebGPU 因管线按材质缓存改为把近景移出层 0、阴影相机开层 2；两种后端的模糊与叠加同式（foreground-filter GLSL / webgpu-foreground-filter TSL，后者临时关渲染器输出变换由节点做色调映射与色彩空间）。距离雾：haze 挂 depth-haze 补丁，setHazeColor 非空时才接管场景雾（只给透视预览；游戏世界雾归昼夜）。stage.addBackdrop 返回 Backdrop 并暴露 stage.backdrop，render 前后由舞台调用；远山搬到 backdrop-hills。接入：普通关卡挂种子远山；原野 free-world-background 往背景格子①②挂地形派生的整格剪影（cell-silhouette：地表滑动平均错位抬高、顶部 4 行画格缝，颜色按区域色、天光雾色 depthHazeAmount(层距)、昼夜 paint 与天气亮度，露天系数控制显隐，E-5）；facility-sky 四层按方案 G 三层远景层距；城区 ai-city-environment 城景按 DEPTH_G 建模推到城区层距并返回前景格子组，city-presentation 交给 backdrop.blur；definition-depth-layout 删掉自带的模糊四边形与雾，改用 addBackdrop(DEPTH_FLAT)+setScheme 切换，透视预览的近景模糊与雾与游戏同一份。标准深度：BLOCK_FRONT_Z/BACK_Z 由 DEFINITION_DEPTH 推出（+1/−1），薄板 [−.5,.5]；前沿滚圆随 +1，侧壁后收从 min(前沿−滚圆深, 0) 起（角色平面之前保持竖直，reliefRings 直段末加一环）；小屋背墙 [−1.2,−1]、屋顶/立面/外饰跟随，屋瓦下沿夹在檐口线上（更深的屋顶让随机歪斜越出檐口 0.0003 格）；洞壁到后沿取 −1.2（与背墙同厚，仅深度对齐 E-15）；flora-cover/shrubs 写死值改引用常量；家园家具 [−1,0]（scale.z=−1 镜像定义构件）、太阳能板居中 z=0；render/building/walk-depth 统一让位（横向 1 格内平滑让到前沿 +.5，站上承托面回深度中心），entity-views 鹈鹕 Z 阻尼跟随，definition-scene-layout 的 walkAround 改用同一函数。测试调整：render-relief/render-slopes 环数按 reliefRings 实际直段、render-hut 屋顶/背墙 z 改按新标准、render-smallflora 探针取 COVER_Z[1]、render-integration/lighting 改从 backdrop-hills 引入；building-layers 加让位用例。已知：原野与机房目前没有前景格子内容，近景模糊机制已挂但无物可糊（浏览器里用调试注入的近景物体验证了两种后端一致）；透视预览页只有 WebGL；城区/原版住宅 WebGPU 因 harbor-residence-environment 与 ai-city-painted-water 的 ShaderMaterial 无节点版本启动失败（B8a 范围），城区近景模糊只验了 WebGL。typecheck、test 2049、build 通过；浏览器冒烟见汇报。
- B8a 结果：昼夜、天气、光照统一。render/sky/daylight 是唯一昼夜系统：按时钟算日月方向与 daylight，写 PrecipSkyBase（灯强/灯色/环境强度/天空渐变/sky 亮度），带 atmosphere 的 look（城区/住宅/港湾）另建曝光、调色、补光方向、雾与按天空渐变生成的环境图（1 s 节流、按辐亮度归一），两种后端都经 stage.createPmrem；config/ai-city-look 拆成 DaylightLook（白天/夜间强度表 + 可选 atmosphere），新增原野 WILDS_LOOK（由 TUNING 推出，atmosphere 为 null）。降水视图是唯一写灯光方：precip-sky 把 base 乘天气写主光/半球/补光（含 groundColor 与补光色），阴天天色乘天空亮度；天气只来自 sim 环境；precip-view 改收 PrecipColumns + drips（levelPrecipSource 从关卡取），新增 setOvercast。删除 free-world-daylight、ai-city-lighting、residence-weather，游戏（game-app/precip-wiring/city-presentation）、检视页（新 app/workspace/workspace-weather，scene-demo-stage/building-field-stage/building-sandbox）、磁浮实验页全部改接。城区 ?renderer=webgpu：去掉 WebGL 独占的环境图依赖；harbor-residence-environment 地下城远景、ai-city-backdrop 绘制层与水面补节点版本（webgpu-shader-city，与 GLSL 同式）；WebGPU 下城区建筑用通用光照图（markLightMap），light-field-city 未并入通用光照场（其日光步进、窗光与灯可见性只有城区 GLSL，没有通用/TSL 等价物），仍只在 WebGL。修两处 three WebGPU 缓存问题：GLSL 相同的 ShaderMaterial 共用第一份节点构建（按材质 uuid 补 customProgramCacheKey）；原材质不带节点时共用材质的网格每次渲染只有第一个上传 uniform（refreshEveryRender 在补丁/转换的原材质上挂节点标记，原版住宅左段天空、城区水带接缝即此）。E-3：光照重算分摊（每帧约 2 ms 预算、镜头近处优先），图集只上传变化的行段（WebGL updateRanges；WebGPU 整张），水深首帧回退只算所需区域；“增量等于全量”用例保留。性能（node，B5/B5b 同口径）：首帧 小 56~61 / 大 70~82 / 城区 111~119ms（原 141~162 / 198~214 / 171~173）；挖一格 p95 2.1ms（原 5.6~6.9，最大 20~39→2.3）；水流 p95 2.2~2.4ms（原 7.9~8.5）；城区开关门 p95 3.2~3.5ms（原 4.0~4.3）；单次变化上传 挖 0.3KB / 水流 5~7KB（原整张约 7MB）。城区 WebGL 帧时间单测：1280×760@2x 约 42 FPS，postFx.render CPU 约 19ms，每帧约 3400 次绘制（阴影 1800，其中太阳能板 492），关掉近景模糊不变——瓶颈是未合批的阴影投射体，不是 B8a/B8b。typecheck、test 2049、build 通过；浏览器冒烟见汇报。遗留：港湾湖画面层（painted-backdrop cameraFacing 用代理相机位置当世界坐标）落在画面外；WebGPU 星星只有 1 像素；城区离开到交通走廊后天空与灯保持城区状态。
- B10 文档结果：标准文档按现状同步，只改文档。core-coordinates §5 由差异表改为运行时对照（格子、33 形态与 1/4 子格、平台六变体、墙层、物件、特殊构件、渔屋背墙、洞壁、背景层、让位各列代码落点），只留渔屋门与洞壁“仅深度对齐”一句，§8 去草案并指向方案 G 与 config/depth-layers；depth-definitions 去掉“正式游戏尚未同步”，写明方案 G 默认可按世界覆盖（城区前景不下沉）、近景模糊两后端同式、游戏雾归昼夜（原野剪影取固定雾量）、原野背景格子为地表派生剪影、原野与机房暂无前景格子内容，城区建造的加深格进城区存档；core-glossary 补子格、特殊构件、层表与景别层 id，形态改 PIECE_SHAPE_IDS，水量/损失水量改子格口径，主世界定义改为城区与原野两个格子世界经出口相连，“近景”归前景格子（原可玩层停用叫法“近景”与 depth-definitions 冲突，已去掉）；liquid-definitions、liquid-display-definitions 改为 1/4 子格水量与推进节奏、§7 尺寸表按 BLOCK_FRONT_Z=+1 与 WATER_FRONT_Z=+0.92；scene-composition 植物与远景坐标按现值（地被 −0.83～+0.9、原野剪影 −7/−16、要塞四层 −150/−140/−70/−35）；tile-shape-definitions、room-layout-definitions、building-overview、platform-definitions、door-definitions、chapter-1、resource-classification 改掉已删文件与“仅四种/尚未接入”表述及失效的住宅演示链接。docs/architecture.md 补入口参数表、四层落点、GameFeature、碰撞/流体/光场模块、pageRoute 与 site-directory；AGENTS.md 只改 src/app 子目录列举。未改：material-library.md 由 scripts/build-material-library.ts 生成（其中“AI 住宅 ?mode=lab&demo=residence”已失效，需改脚本后重新生成）；view-loop 尚不存在，architecture 未写其路径；README.md 的 ?mode=facility&scene=original 链接失效（不在本行范围）。未运行命令（只改文档）。
- B9 结果：检视页、场景组合、搭建场全部跑游戏 SimWorld，全仓只剩一套碰撞与角色控制。sim/definition-world 把定义构件布局写成格子世界：实体轮廓按所在格匹配 33 形态（跨格或非标准形态即抛），平台线段拆成整/半宽平台变体（被实体顶到同高的半格跳过，其余重叠即抛），家具、大石顶面写成物件承托面，太阳能板交给模拟登记为特殊构件（sim-world 选项 solar、trackSolarSun；城区与检视页共用 building.stepSolarParts）；布局坐标为负时整体平移 offset（只平移不留边，住宅 y+8，房间 y+1，纵深 0），布局根节点、分区、观察点与远山同步平移；地图左右下边界为墙、上方留 28 格飞行空间。sim-world 新增开发选项 unlimitedFlight（检视页按住空格持续飞行）。definition-scene-layout/settlement/depth 输出 data（solids/platforms/stands/solar），不再自带碰撞；试放区换砖经 syncDepthTrial(map, offset) 改格子。perspective-controls 直接 stepSim 同一 SimWorld，传送走 placePlayer，HUD 地面高度用 terrainHeightAt；小地图画格子世界。scene-demo-app 把各样本拼成一张 TileMap（含水与沙漠）建关卡 SimWorld；building-sandbox、tile-material-gallery 用 mapLevel 建 SimWorld（画廊改为按格对齐摆放）；scene-demo-stage、building-field-stage 天气只来自世界环境（workspace-weather 经环境命令写设置，降水视图用 levelPrecipSource）。删除 perspective-player、physics/definition-collision、physics/tile-definition-collision、workspace/scene-game-overlays（场景组合页的性能面板与工具栏地图按钮随之去掉，M/Esc 仍开关大地图）与 test/perspective-player.test.ts；定义场多边形列表的碰撞/探测用例随实现删除，住宅走跳用例改跑 SimWorld（骑车两端留刹车距离，因地图边界现在是墙），新增全部检视条目可写成格子世界并落地的用例，无限飞行用例移到 pelican-controller。另修港湾湖景远景跑出屏幕：painted-backdrop 用代理相机算朝向时先换回世界坐标。
- B10 代码结果：新增 app/shell/view-loop（createViewLoop(frame(dt, now), onError) → start/stop/running；dt 夹到 [0, VIEW_MAX_DT]，恢复后首帧 dt=0，回调抛错即停止并交给错误出口）。改用它的页面：检视页（room-scene-preview、resource-inspection）、场景组合与搭建场（scene-demo-stage、building-field-stage）、工作区观察时钟、角色展示场与角色舞台、角色编辑预览、渲染实验、磁悬浮、首页英雄区、序章、贴图对比。不改：游戏帧循环（app/game/frame-loop）、头发预览（按需重绘，不是逐帧循环）、加载层动画与返程穿梭画面。展示场单帧上限从 TUNING.sim.maxFrameTime 改为 VIEW_MAX_DT（帧率低于 20 时播放变慢而不是跳步），会话重建后用 stop/start 让下一帧 dt 为 0。
- Phase 6 修复：光照场三处分帧缺陷——探测改动时把正在计算中的条带也排入天空光重算；条带计算与天空光共用同一次读取的介质窗口，中途改动不会让条带介质与天空光输入不一致；同步启动时先探测改动再算镜头所需条带；随机对照 600 个种子与全量重算逐子格一致，挖格/倒水帧耗与 B8a 持平。启动期网址错误（scene=original、landing=2、未知 level 等）不再被加载层盖住：游戏装配移到 app/game/game-mount，只有 WebGPU 渲染器加载阶段的错误显示在加载层（可重试），其余收起加载层交给错误页，只报一次；scene=original 报“已移除”并给出新网址。改变碰撞的状态只在 stepSim 内变更：城区放置/拆除与太阳角是下一 tick 应用的命令（sim/city），建造模式是模拟层冻结（city.editing）而不是暂停功能；交通中心进舱/发射/取消经 requestTransit 命令，冻结分支移到 sim/transit，着陆舱分支移到 sim/pod-landing；直接发射（flight=）是首个 tick 前的初始状态，仍直接写入。game-app、sim-world 拆到 800 行以内（city-launch、city-toolbar、landing-pod-presentation、game-mount）。删除未引用的港口绘制场景与对应 WebGPU 补丁；tile-collision 内部函数不再导出，CollisionSource 保留（作为参数类型被多处使用）。

- 修复轮后补：城区拆除点选只在格中心命中（实体砖用带容差的重叠判断，微小探针被容差吃掉），改为点在凸轮廓内判断，先写复现用例。最终 typecheck、npm test 2026、build 通过。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | docs/architecture.md | B0 新建原则文档 | — | ✓ |
| 2 | AGENTS.md | B0 加一行引用 | 1 | ✓ |
| 3 | public/concepts/core-coordinates.md | B0 §5 表改为真实运行时对象 | — | ✓ |
| 4 | src/config/app-mode.ts | B1 删 isSceneGameLevel/opensSceneGame/mode=facility | — | ✓ |
| 5 | src/main.ts | B1 删 sceneGame 分支 | 4 | ✓ |
| 6 | src/app/shell/scene-loading.ts | B1 从 workspace 移入 | — | ✓ |
| 7 | src/ui/hud/scene-map-button.ts | B1 createSceneMapButton 移出 | — | ✓ |
| 8 | src/app/game/dev-camera.ts | B1 新建 cam=free 自由镜头与预设视角 | — | ✓ |
| 9 | src/app/game/game-app.ts | B1 用 6/7，挂 8 | 6,7,8 | ✓ |
| 10 | src/app/game/frame-loop.ts | B1 自由镜头跳过 cameraRig.update | 8 | ✓ |
| 11 | src/app/workspace/tile-scene.ts | B1 删除 | 9 | ✓ |
| 12 | src/app/workspace/wilds-scene.ts | B1 删除 | 9 | ✓ |
| 13 | src/app/facility/facility-app.ts | B1 删除 | 9 | ✓ |
| 14 | src/app/workspace/scene-catalog.ts | B1 删 world 分区游戏条目 | 4 | ✓ |
| 15 | src/app/workspace/scene-workspace.ts | B1 删游戏 case | 14 | ✓ |
| 16 | src/app/residence/residence-app.ts | B1 删 hosted/mountMainWorld/mountResidenceDemo | 15 | ✓ |
| 17 | src/app/transit/transit-app.ts | B1 删工作区 mountTransit | 15 | ✓ |
| 18 | src/app/transit/transit-handoff.ts | B1 删 {open} 分支 | 17 | ✓ |
| 19 | src/config/site-directory.ts | B1 去掉 mode=facility 匹配 | 4 | ✓ |
| 20 | src/world/facility-level.ts | B1 按 E-8 删 createOriginalLevel | E-8 | ✓ |
| 21 | src/config/facility-scenes.ts | B1 按 E-8 删 original | 20 | ✓ |
| 22 | test/app-mode.test.ts | B1 路由断言更新 | 4 | ✓ |
| 23 | src/render/stage/stage.ts | B2 唯一工厂 createRenderer(preset)，去 configureCharacterTextures | — | ✓ |
| 24 | src/render/character/character-model.ts | B2 bindCharacterTextures 页级 | — | ✓ |
| 25 | src/app/shell/page-context.ts | B2 页主渲染器懒创建并绑定贴图 | 23,24 | ✓ |
| 26 | src/app/game/game-app.ts | B2 用页渲染器 | 25 | ✓ |
| 27 | src/render/webgpu/webgpu-stage.ts | B2 经工厂创建 | 23 | ✓ |
| 28 | src/app/character/character-editor.ts | B2 studio 预设 | 23 | ✓ |
| 29 | src/app/character/open-character-editor.ts | B2 适配 24 | 24 | ✓ |
| 30 | src/render/resource/resource-thumbnail.ts | B2 thumbnail 预设 | 23 | ✓ |
| 31 | src/render/stage/light-presets.ts | B2 新建摄影棚灯组、地下检视光 | — | ✓ |
| 32 | src/app/lab/d1-render-lab.ts | B2 工厂+31，模板入模块，URLModifier 卸载还原 | 23,31 | ✓ |
| 33 | src/app/lab/d1-hair-gallery.ts | B2 用 31，删覆写，模板入模块 | 31 | ✓ |
| 34 | src/app/lab/maglev-track.ts | B2 模板入模块，路由挂载 | 39 | ✓ |
| 35 | src/render/stage/showcase-renderer.ts | B2 唯一合成器 | — | ✓ |
| 36 | src/render/grassy/d1-hair-game-stage.ts | B2 用 35 | 35 | ✓ |
| 37 | src/app/perspective/resource-inspection.ts | B2 用 35 | 35 | ✓ |
| 38 | src/render/transit/transit-center-model.ts | B2 PMREM 走 stage | — | ✓ |
| 39 | src/config/app-mode.ts | B2 新增 render-lab/hair-gallery/maglev mode | — | ✓ |
| 40 | src/app/shell/routes.ts | B2 新路由 | 39 | ✓ |
| 41 | render-lab.html 等 4 个 HTML | B2 删除 | 32,33,34,45 | ✓ |
| 42 | vite.config.ts | B2 PAGES 只留 index | 41 | ✓ |
| 43 | src/config/site-directory.ts | B2 唯一页面登记表 | 39 | ✓ |
| 44 | src/app/workspace/scene-catalog.ts | B2 条目由 43 生成 | 43 | ✓ |
| 45 | src/app/lab/harbor-perspective.ts | B2 按 E-7 删除或改工厂 | E-7 | ✓ |
| 46 | test/app-mode.test.ts | B2 新 mode 断言 | 39 | ✓ |
| 47 | src/world/tile-shapes.ts | B3 33 形态+6 平台变体+1/4 掩码+重叠判定 | — | ✓ |
| 48 | src/world/tile-map.ts | B3 多块格、placePiece/removePiece、派生掩码 | 47 | ✓ |
| 49 | src/world/building-layers.ts | B3 新建墙层、物件层、加深与墙互斥 | 48 | ✓ |
| 50 | src/sim/definition-depth.ts | B3 删除 | 49 | ✓ |
| 51 | src/world/special-parts.ts | B3 新建特殊构件层 | 48 | ✓ |
| 52 | src/world/tile-types.ts | B6 建筑材料进 DEFAULT_TILES（随 piece-view；可用形态规则已在 placePiece） | 91 | ✓ |
| 53 | src/world/level.ts | B3 LevelData 带 walls/objects/parts | 48,49,51 | ✓ |
| 54 | src/world/spawn-home.ts | B3 topAt/掩码 | 48 | ✓ |
| 55 | src/render/character/entity-views.ts | B3 脚底高度 topAt | 48 | ✓ |
| 56 | src/render/character/entity-surroundings.ts | B3 topAt | 48 | ✓ |
| 57 | src/app/game/debug-tools.ts | B3 pieces 查询 | 48 | ✓ |
| 58 | test/tile-shapes.test.ts | B3 4→33 种（需批准） | 47 | ✓ |
| 59 | test/residence.test.ts | B3 同格组合/重叠/互斥移到格子 API | 48,49 | ✓ |
| 60 | src/physics/tile-collision.ts | B4 改写为多边形求解器，签名不变 | 48,51 | ✓ |
| 61 | src/physics/definition-collision.ts | B4 截面工具并入 60，其余删除 | 60 | ✓ |
| 62 | src/world/ride-clearance.ts | B4 格内多边形与特殊构件 | 48,51 | ✓ |
| 63 | src/physics/ride-probe.ts | B4 单一实现 | 62 | ✓ |
| 64 | src/physics/entity-collision.ts | B4 位移走 60 | 60 | ✓ |
| 65 | src/physics/line-of-sight.ts | B4 1/4 掩码步进 | 48 | ✓ |
| 66 | src/sim/player-space.ts | B4 playerFits 含物件与特殊构件 | 60 | ✓ |
| 67 | test/physics-slopes.test.ts | B4 契约用例保持，新增 C/K/L/承托面/门 | 60 | ✓ |
| 68 | test/definition-collision.test.ts | B4 并入 67 | 61 | ✓ |
| 69 | src/world/light-field.ts | B5 由 residence-light 泛化 1/4 光场 | 48,49 | ✓ |
| 70 | src/world/light-map.ts | B5 删除 | 69 | ✓ |
| 71 | src/sim/residence-light.ts | B5 删除 | 69 | ✓ |
| 72 | src/render/stage/light-field-material.ts | B5 由 residence-lighting 泛化 | 69 | ✓ |
| 73 | src/render/stage/light-texture.ts | B5 删除 | 72 | ✓ |
| 74 | src/render/webgpu/webgpu-light-map.ts | B5 对接 72 | 72 | ✓ |
| 75 | src/app/game/lighting-wiring.ts | B5 接 69/72 | 72 | ✓ |
| 76 | src/world/fluid-map.ts | B5 1/4 子格+活跃集合 | 48 | ✓（B5b 子格） |
| 77 | src/world/fluid-sim.ts | B5 子格步进 | 76 | ✓（B5b 子格） |
| 78 | src/physics/fluid-contact.ts | B5 子格浸没 | 76 | ✓ |
| 79 | src/render/water/water-view.ts | B5 子格水面 | 76 | ✓ |
| 80 | src/ui/model/minimap-model.ts | B5 1/4 掩码 | 48 | ✓ |
| 81 | src/render/sky/precip-columns.ts | B5 遮雨用掩码 | 48 | ✓ |
| 82 | src/config/residence.ts | B6 CITY_ORIGIN、资源→块/物件/特殊构件映射 | 49,51 | ✓ |
| 83 | src/sim/building.ts | B6 由 sim/residence.ts 改写，按格规则，写入格子 | 48,49,82 | ✓ |
| 84 | src/sim/building-brush.ts | B6 适配 | 83 | ✓ |
| 85 | src/sim/city.ts | B6 新建城区状态、门/太阳能按 tick、建造命令 | 51,83 | ✓ |
| 86 | src/sim/sim-world.ts | B6 city 钩子、太阳角命令 | 85 | ✓ |
| 87 | src/app/game/game-level.ts | B6 parseGameLaunch，加城区世界 | 85 | ✓ |
| 88 | src/app/city/city-save.ts | B6 新存档，旧键丢弃 | 83 | ✓ |
| 89 | src/app/city/city-feature.ts | B6 建造 UI | 85,88 | ✓ |
| 90 | src/app/city/city-presentation.ts | B6 环境平移、城区 look | 87 | ✓ |
| 91 | src/render/tile/piece-view.ts | B6 多块格区块实例化 | 48 | ✓ |
| 92 | src/render/tile/tile-view.ts | B6 自然单块走原路径，其余交 91 | 91 | ✓ |
| 93 | src/render/building/building-layer-view.ts | B6 由 residence-view 改写 | 49,51 | ✓ |
| 94 | src/render/residence/residence-terrain.ts | B6 删除 | 91 | ✓ |
| 95 | src/render/stage/world-views.ts | B6 挂 91/93 | 91,93 | ✓ |
| 96 | src/app/game/game-app.ts | B6 装配城区 | 87,89,90,95 | ✓ |
| 97 | src/app/game/frame-loop.ts | B6 GameFeature 钩子 | 96 | ✓ |
| 98 | src/ui/hud/residence-hud.ts | B6 只留建造面板 | 89 | ✓ |
| 99 | test/residence.test.ts | B6 sim 公开接口用例 | 85 | ✓ |
| 100 | src/sim/transit.ts | B7 transitElevatorY、按 tick | — | ✓ |
| 101 | src/sim/city.ts | B7 交通特殊构件、街面板 B 格 | 85,100 | ✓ |
| 102 | src/sim/sim-world.ts | B7 交通冻结分支与命令 | 100 | ✓ |
| 103 | src/app/transit/transit-station.ts | B7 改 GameFeature | 97,102 | ✓ |
| 104 | src/app/transit/transit-pilot.ts | B7 删除 | 103 | ✓ |
| 105 | src/app/transit/transit-handoff.ts | B7 穿梭层+跳转；return-corridor-overlay 渲染器改走 createRenderer 工厂（handoff 删除，交接并入 transit-station） | 103 | ✓ |
| 106 | src/app/game/game-app.ts | B7 landing 穿梭层、删 presentation、flight 开关 | 105 | ✓ |
| 107 | src/app/transit/transit-app.ts | B7 删除 | 106 | ✓ |
| 108 | src/app/residence/residence-app.ts | B7 删除（B6 已删） | 106 | ✓ |
| 109 | src/app/workspace/scene-game-overlays.ts | B7 删除（B9 随 scene-demo-stage 改写一起删除） | 108 | ✓ |
| 110 | src/config/app-mode.ts | B7 harbor/residence/transit 并入 game | 108 | ✓ |
| 111 | src/app/shell/routes.ts | B7 删路由 | 110 | ✓ |
| 112 | src/render/residence/residence-three-*.ts | B7 按 E-6 删除（B1 已完成） | E-6 | ✓ |
| 113 | test/transit.test.ts | B7 sim 级用例 | 102 | ✓ |
| 114 | src/render/sky/daylight.ts | B8 统一昼夜 | — | ✓ |
| 115 | src/config/ai-city-look.ts | B8 原野 look 预设 | 114 | ✓ |
| 116 | src/app/game/precip-wiring.ts | B8 唯一写灯光方 | 114 | ✓ |
| 117 | src/render/sky/free-world-daylight.ts | B8 删除 | 116 | ✓ |
| 118 | src/render/city/ai-city-lighting.ts | B8 删除 | 116 | ✓ |
| 119 | src/render/residence/residence-weather.ts | B8 删除 | 116 | ✓ |
| 120 | src/config/depth-layers.ts | B8 层表 G 默认可覆盖 | — | ✓ |
| 121 | src/render/backdrop/backdrop.ts | B8 新建背景层模块 | 120 | ✓ |
| 122 | src/render/stage/stage.ts | B8 addBackdrop 用 121 | 121 | ✓ |
| 123 | src/render/sky/free-world-background.ts | B8 接 121 | 121 | ✓ |
| 124 | src/render/facility/facility-sky.ts | B8 接 121 | 121 | ✓ |
| 125 | src/app/perspective/definition-depth-layout.ts | B8 雾/近景模糊用 121（模糊含 WebGPU 实现） | 121 | ✓ |
| 126 | src/render/tile/tile-geometry.ts | B8 BLOCK_* 由 DEFINITION_DEPTH 推出 | — | ✓ |
| 127 | src/render/stage/light-texture.ts | B8 写死 0.42（B5 已删则跳过） | 126 | ✓（B5 已删，改用 WATER_FRONT_Z） |
| 128 | src/render/building/hut-layout.ts | B8 背墙 [−1.2,−1] | 126 | ✓ |
| 129 | src/render/building/hut-exterior.ts | B8 跟随 128 | 128 | ✓ |
| 130 | src/render/decor/cave-wall-view.ts | B8 洞壁到后沿 | 126 | ✓ |
| 131 | src/render/flora/flora-cover.ts | B8 写死值引用常量 | 126 | ✓ |
| 132 | src/render/flora/flora-shrubs.ts | B8 写死值引用常量 | 126 | ✓ |
| 133 | src/render/tile/tile-relief.ts | B8 前沿滚圆随 +1 | 126 | ✓ |
| 134 | src/render/residence/homestead-view.ts | B8 家具 [−1,0]、太阳能居中 | — | ✓ |
| 135 | src/render/building/walk-depth.ts | B8 统一让位 walkZ | 49 | ✓ |
| 136 | src/render/character/entity-views.ts | B8 Z 走 135 | 135 | ✓ |
| 137 | src/sim/sim-world.ts | B9 unlimitedFlight 开发选项 | — | ✓ |
| 138 | src/app/perspective/definition-scene-layout.ts | B9 输出格子世界数据 | 83 | ✓ |
| 139 | src/app/perspective/perspective-controls.ts | B9 驱动 SimWorld | 137,138 | ✓ |
| 140 | src/app/perspective/perspective-player.ts | B9 删除 | 139 | ✓ |
| 141 | src/physics/definition-ride-probe.ts | B9 删除 | 139 | ✓ |
| 142 | src/physics/tile-definition-collision.ts | B9 删除 | 139 | ✓ |
| 143 | src/app/perspective/scene-demo-app.ts | B9 用关卡 SimWorld | 139 | ✓ |
| 144 | src/app/perspective/room-scene-preview.ts | B9 适配 | 139 | ✓ |
| 145 | src/app/perspective/building-sandbox.ts | B9 适配 | 139 | ✓ |
| 146 | src/app/workspace/scene-demo-stage.ts | B9 天气走 precip 环境视图 | 139 | ✓ |
| 147 | src/app/workspace/building-field-stage.ts | B9 同 146 | 139 | ✓ |
| 148 | test/perspective-player.test.ts | B9 删除 | 140 | ✓ |
| 149 | src/app/shell/view-loop.ts | B10 统一视图循环 | — | ✓ |
| 150 | 各非游戏页帧循环 | B10 改用 149 | 149 | ✓ |
| 151 | public/concepts 标准文档 | B10 同步“未同步”表述，§5 清空 | 全部 | ✓ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck（每批） | yes | ✓ |
| npm test（每批） | yes | ✓ |
| npm run build（每批） | yes | ✓ |
| 同种子世界逐格不变用例（B3） | yes | ✓ |
| physics-slopes 契约用例（B4） | yes | ✓ |
| 浏览器人工验收清单（每批，用户） | no | |
