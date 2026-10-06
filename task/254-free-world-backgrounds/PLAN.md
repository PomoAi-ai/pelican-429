# PLAN -- 自由世界分区域背景图片与过渡

## Status: done
## Task: 254
## Related: N/A
## Baseline Commit: 8a8fe8c

## Goal
为自由世界各类区域制作独立背景图片，复用既有算力堡垒图片，保证横向移动、洞口进出、升降空岛和传送时的连续视觉。已完成8张新主题制作、压缩、整合及代表性实机验收；保留已有堡垒四层资源。

## Non-goals
不改变地形生成、碰撞、战斗、地图规模和存档；不重做堡垒美术；不提交、推送或部署。

## Acceptance Criteria
- 营地原野、森林、湖泊湿地、沙漠、荧光洞穴、空岛、算力大教堂、光纤深渊各有新主题图片；同类多个区域复用主题。
- 自由世界堡垒接入已有四层城市背景，主线现有构图不退化。
- 步行、飞行、洞口和传送均不出现硬切、黑帧、露边或明显亮度跳变。
- 洞穴图片受现有洞壁掩码约束，教堂/深渊图片在实际可见背墙接入；保留可玩建筑和前景。
- 游戏与相关展示入口复用同一资源、配置和生成函数。

## Constraints
- 初始先分析计划阶段已经结束；按后续实施授权制作图片、修改运行代码并验证，不提交、推送或部署。
- 以现有堡垒图片的空间感、光照和细节密度为基准；不在背景画入角色、UI、文字或可误认为可走道路的近景。
- 不用导航目的地或固定世界坐标决定背景；位置必须适应种子与地图大小。
- 沿用 three、现有 KTX2 加载器及天气链，无新运行依赖。

## Decisions
- 原自由世界调用 createFortressView(null)，未载入已有堡垒图片；现在建筑视图继续只负责建筑，既有四层城市背景由共享背景模块加载和合成。
- freeWorldRegions 只提供导航点，步行不会更新工具栏 region；视觉区域需由真实二维地形范围计算。
- 已制作 camp、forest、lake、desert、islands、cave、cathedral、abyss 共8张新原图，保存在 assets/environments/free-world，不把PNG原图发布到public。首版新户外主题使用单幅完整横幅并带轻微视差，未虚构透明分层素材；堡垒保留原四层，洞穴和室内走真实背墙。
- 8张运行资源统一为1024×684 ETC1S q192 clevel2、sRGB RGB无Alpha、完整11层mip，仅发布KTX2。合计1,288,289字节；原图合计19,070,035字节，减少93.24%。压缩脚本保留原图哈希并输出报告；camp额外q255与clevel5只在临时目录比较，正式参数未改。
- 图片横幅位于玩法内容后方；相邻主题采用累计Alpha保持总覆盖率，避免淡入时露出暗底。堡垒先用独立RenderTarget合成原四层，再作为整体参与区域淡入，避免逐层加权导致重影；目标长边上限1536，随画布尺寸调整。
- 洞穴已有近地形背景墙，教堂/深渊也有大面积不透明背墙，单纯在全局远处放图会被遮挡。
- 横向过渡用实际湖泊、沙漠、树群、设施范围的smoothstep权重，空岛额外结合高度；营地保留独立核心。连续树群合并为林带，设施连接道路延续前一设施背景，下一设施渐入，避免短暂露出营地底图。下载迟到与传送再加短时平滑；最终渲染以最高区域分数选单一主题，超过当前分数0.12才切换，使用0.28秒时间常数平滑收敛；避免边界抖动及停留时永久重叠地平线。
- 洞穴按room中心和半径布置3:2正向图片，每室只展示一幅，边缘与隧道淡回原岩壁，保留洞壁掩码、洞口参差边缘及光照图；不镜像平铺、不把图片拉伸到整张地下地图。教堂与深渊使用共享facility-wall-material，在实体背墙内按屏幕投影保持cover构图，避免低分辨率图片贴满整座建筑后近景放大模糊；标准光照、建筑和桥梁遮挡均保留。
- 背景和环境色使用同一权重，区域基色与天气效果合成，避免 precip-sky 每帧恢复创建时基线造成互相覆盖。
- 自由世界停用旧程序远山与远景浮岛，避免和新图片叠加；其他入口沿用各自共享资源链。
- 洞穴、教堂、深渊三张共享室内图在装配时加载；户外只加载首屏及周围将出现的主题，探索时按位置预取，当前权重逐帧补查，防止离散预取漏掉窄区域。传送先prepare目标，再推进传送；加载失败明确报错，已有纹理等待期间继续跟随镜头与窗口。
- 实机检查中已针对林带反复淡出、设施间道路露出原野、窄区域预取遗漏、等待下载时背景布局不跟镜头、洞图拉伸/镜像等问题调整实现。修复后已检查全部主题、代表性交界、洞室边缘与空岛高度；最后在湖泊/沙漠交界实机确认停留收敛单图，小幅折返保留原主题。
- 参考[tModLoader官方ModSurfaceBackgroundStyle文档](https://docs.tmodloader.net/docs/stable/class_mod_surface_background_style.html)的分层背景与fades思路；仅借鉴组织与渐变方式，不复制其美术素材。
- 子代理已参与探索、实现与压缩验证；主代理完成最终边界及室内材质实机检查。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | assets/environments/free-world/ | 8张新主题原图与压缩报告 | — | yes |
| 2 | public/resources/free-world/ | 8张正式KTX2纹理 | 1 | yes |
| 3 | src/config/free-world-backgrounds.ts | 主题资源路径、环境色与亮度 | 1 | yes |
| 4 | src/render/free-world-background-regions.ts | 真实地形区域和连续权重，已实机验证 | — | yes |
| 5 | src/render/free-world-background.ts | 横幅、视差、混合、堡垒RT与生命周期 | 2,3,4 | yes |
| 6 | src/render/facility-sky.ts | 复用既有四层取景与视差能力 | 5 | yes（复用） |
| 7 | src/app/facility-presentation.ts | 共享堡垒纹理与设施室内主题 | 5,6 | yes |
| 8 | src/render/cave-wall-view.ts | 掩码内按洞室接入图片，已实机验证 | 2,3 | yes |
| 9 | src/render/facility-cathedral.ts | 可见室内背墙接图，保留结构前景 | 2,3 | yes |
| 10 | src/render/facility-abyss.ts | 深井背墙接图，保留桥梁设施 | 2,3 | yes |
| 11 | src/render/precip-sky.ts | 区域环境与天气合成 | 4,5 | yes |
| 12 | src/app/game-app.ts | 加载、传送准备与释放，停用旧远山 | 5,7,8,11 | yes |
| 13 | src/render/world-views.ts | 洞壁资源接线与旧远景浮岛协调 | 5,8 | yes |
| 14 | test/free-world-backgrounds.test.ts | 连续权重、垂直分区、真实生成范围行为 | 4 | yes |
| 15 | src/render/free-world-interior-textures.ts | 室内KTX2共享加载与释放 | 2 | yes |
| 16 | src/app/precip-wiring.ts | 背景每帧更新与天气亮度接线 | 5,11 | yes |
| 17 | scripts/build-free-world-backgrounds.ts | 原图保护、候选比较、压缩和报告 | 1 | yes |
| 18 | src/render/facility-wall-material.ts | 两设施共享屏幕投影壁图与标准光照 | 9,10 | yes |

## Validation
| Command / Check | Required | Done |
|-----------------|----------|------|
| npm run typecheck | yes | 最后渲染调整后已通过 |
| npm test | yes | 最终全量1789项、301套件通过，0失败/跳过（58.47秒）；最后仅渲染渐变方式调整后再通过typecheck/build及实机 |
| npm run build | yes | 最后渲染调整后串行构建通过（7.77秒）；仅有既有大分块提示 |
| 洞室room布局调整后的相关局部测试 | yes | 28项通过 |
| 压缩脚本独立TypeScript检查、8张KTX校验/完整mip/源图哈希验证 | yes | yes |
| 浏览器代表性画面与边界验收 | yes | 8张新主题及堡垒；林湖/湖沙/设施道路、洞室图边/地形掩码、空岛上下、传送、雨雪、1280×720和390×844；small seed429、medium seed2026、large seed1 |
| 多种子地图区域连续性 | yes | seed1/small、429/medium、2026/large共10529个位置，归一/连续、岛上下、设施道路通过；非全种子穷举 |
| 首屏请求与纹理体积核对 | yes | medium seed2026首屏实际请求7/8新主题（3张室内共享图+4张附近地表图），未请求空岛或堡垒；KTX体积/GPU估算已核对。未做改动前后帧耗时基准或真实移动设备性能测试 |

验证状态来自主代理当前执行结果与压缩子任务实际记录。2026-10-07核对public/resources/free-world恰有8张所需KTX2，全部字节与压缩报告哈希一致；PNG原图合计18.187MiB，发布KTX2合计1.229MiB（原大小6.76%，约14.80:1）。8张完整mip的GPU估算为ETC1/BC1约3.57MiB，BC7/ASTC4×4约7.14MiB，不含堡垒原纹理及RT。最终构建8张KTX2与public逐字节相同；完整构建验证public全部548文件无缺失。一次重叠本地build曾导致dist拷贝不完整，串行重建已恢复，未改Vite配置。所有调试角色位置、暂停、无敌与隐藏面板操作只用于临时浏览器验收，交付入口重新加载正常游戏。

## Evidence
- screenshots/ 保存营地、森林、湖泊、沙漠、空岛、洞室、教堂、深渊、堡垒、雨雪与代表性边界实机画面。lake-desert-edge-settled.jpg 为最终停止重影方案；此前 edge 截图记录调优过程。
- 最后渲染规则采用单主题选择+回差+时间淡入，0.28秒为时间常数，约1.9秒后小于0.001的残留图层被清除；不是停在边界永久半透明叠图。
- 子代理完成资源/逻辑/释放与shader补审，未发现需修复的剩余问题。
- 未提交、推送或部署；工作区已有其他并行未提交改动，未将其归入本任务。
