# Grassy 历史制作记录

> 本文完整保留早期各轮制作说明；“当前”“本轮”等描述属于记录当时的阶段，不能作为正式版本状态。路径与链接已按归档位置修正。正式角色说明见 [当前角色资料](../SOURCE.md)，历史目录见 [历史资料索引](README.md)。

## 已确认的造型与尺寸

2026-10-04，用户在门口与屋外的真实场景对照中确认当前效果，后续静态建模以此为准：

- 头身比例沿用用户确认的侧面母版，设计口径约 3.1；以实际轮廓为准，不为满足文字数字而缩小头部或收细身体。母版发梢至下巴目测约占全高三分之一。
- 游戏内可见高度为 3.10 格，从鞋底到最高发梢；头发计入显示外轮廓。
- 黑色分层短发、棕色眼睛、红色针织毛衣、蓝色牛仔裤、米白运动鞋。
- 当前四方向交付为 `turnaround-master-v2/front.png`、`back.png`、`left.png`、`right.png`。`right.png` 直接保留用户上传的已确认侧面原图，作为唯一比例母版，其余方向按它重绘；侧面入场资源仍为 `turnaround-3p1/right-cutout.png`。
- 场景验收依据为 `assets/characters/grassy/history/side-reference-scene.html`，截图为 `assets/characters/grassy/history/doorway-reference-3p1-tiles.png`。门口与屋外人物同高，既有鹈鹕保持原尺寸。

早期参考图中“目标身高 2.85 格”的文字属于选型记录，最终场景尺寸以上述 3.10 格为准。当前四方向使用无文字透明底，比例通过人物轮廓核对；上一版卡片上的“3.1头身”文字不能代替实际轮廓。静态模型按此基准制作；2026-10-05 按用户新请求，为 Rodin 精修版新增以下呼吸与行走动画。

## Rodin 呼吸与行走动画

以 `model-rodin-refined/` 的三档 Blender 工程为源，在独立副本上绑定 22 根骨骼。静息网格位置与 UV 哈希均保持不变，保留原有 PBR 材质、红毛衣、牛仔裤、米白鞋和 3.10 格可见高度。旧静态文件继续保留。

| 动作 | GLB clip | 时长 | 表现 |
|---|---|---:|---|
| 呼吸 | `idle` | 3.2 秒 | 胸腔轻微扩张、肩颈随呼吸起伏；双脚固定，头部不随胸腔缩放 |
| 走路 | `walk` | 1.2 秒 | 原地循环，双腿交替迈步、屈膝、抬脚与落脚；对侧手臂摆动 |

两段动作均以 30 fps 烘焙，首尾姿势相同，每顶点最多 4 个骨骼权重。走路每条腿约 60% 周期处于支撑段、40% 为摆动段；循环不包含水平根运动，之后与游戏移动配合时，1 倍速对应约 `0.8333333333` 格/秒。

| 版本 | 三角面 | 单张贴图 | 含两个动作的 GLB |
|---|---:|---:|---|
| 精细版 | 500,000 | 2048² PNG | [grassy-rodin-animated-detailed.glb](models-rodin-animated/grassy-rodin-animated-detailed.glb) |
| 游戏标准版 | 45,000 | 1024² PNG | [grassy-rodin-animated-game.glb](models-rodin-animated/grassy-rodin-animated-game.glb) |
| 游戏轻量版 | 20,000 | 512² PNG | [grassy-rodin-animated-light.glb](models-rodin-animated/grassy-rodin-animated-light.glb) |

- [角色展示场：Rodin 呼吸与走路](/?mode=showcase&library=history)：并列播放呼吸、走路，可切换三档模型、暂停、慢放、重播及旋转查看。原有 Rodin 对比入口也加入两张动画卡。
- `assets/characters/grassy/history/model-rodin-animated/grassy-rodin-animated-{detailed,game,light}.blend`：可编辑骨骼、蒙皮、动作及打包贴图。
- [manifest.json](models-rodin-animated/manifest.json)：实际面数、文件字节数、源表面哈希、骨骼数量和动作信息。
- `assets/characters/grassy/history/model-rodin-animated/evidence/`：正侧关键帧、脚部轨迹、真实蒙皮变形测量及网页预览截图。
- `src/render/grassy/grassy-rig.ts`、`grassy-animator.ts`：共享骨骼加载与播放函数，展示场直接调用。当前游戏逻辑尚无人形角色状态，本次未增加人形玩法。

游戏标准版的真实蒙皮采样确认：呼吸鞋底位置不变；走路支撑脚接地稳定，首尾全网格姿势一致。Three.js 线性插值的半帧采样有约 `0.000125` 格的微小脚底下穿；没有用离散烘焙帧的接地结果宣称连续时间绝对零误差。外观与关节变形以 Blender 关键帧和浏览器实时播放人工复核。

重建命令如下；不带 `--preview` 时只生成模型、工程与数据报告。重建会覆盖本组动画输出，手工编辑请另存副本：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --threads 3 --python scripts/blender_grassy_rodin/animate.py -- --tiers detailed game light --preview
```

## Rodin 局部精修版

在已有 Hyper3D Rodin Gen-2.5-High 原始 PBR 模型上继续精修。原始来源为 `assets/characters/grassy/history/model-rodin/raw-01/base_basic_pbr.glb`；原版 `models-rodin/` 保留。此轮没有重新调用云端生成，也没有制作动作。

改动集中在侧面眼睛、鼻唇下巴曲线、面颊、后脑发束末端、下部手指及鞋头边缘。眼部连同原有眼睑和虹膜一起调整，使侧面能看见较完整的棕色虹膜。没有替换人物整体造型或改变已确认的 3.10 格高度。精细母版保留原始 50 万三角面和 UV；原 UV 与修改后 UV 的 SHA-256 一致。

材质从原始 UV 贴图出发，在 Blender 内按皮肤、毛衣、牛仔裤区域校准并烘焙为 PBR。皮肤饱和度降低，红毛衣和牛仔裤的斑驳色差有所收敛，布料保持粗糙表面。三张颜色、法线、粗糙度贴图均使用无损 PNG，避免旧导出流程对法线与粗糙度图使用 JPEG。原贴图中已有的云斑没有完全消除。

| 版本 | 三角面 | 单张贴图 | GLB |
|---|---:|---:|---|
| 精细版 | 500,000 | 2048² PNG | [grassy-rodin-refined-detailed.glb](models-rodin-refined/grassy-rodin-refined-detailed.glb) |
| 游戏标准版 | 45,000 | 1024² PNG | [grassy-rodin-refined-game.glb](models-rodin-refined/grassy-rodin-refined-game.glb) |
| 游戏轻量版 | 20,000 | 512² PNG | [grassy-rodin-refined-light.glb](models-rodin-refined/grassy-rodin-refined-light.glb) |

两档简化模型由同一个精修母版派生，尺寸、来源和实际文件字节数见 [manifest.json](models-rodin-refined/manifest.json)。它们仍是静态资产，脚底为 0，没有动画轨道。

简化前先在副本上焊接空间重合顶点，保留逐面 UV，再做减面。Rodin 原始导入网格因 UV 拆点带有 228,326 条几何边界；直接减面会把边界两侧独立收缩，形成旧版也存在的三角黑缝。焊接后边界为 0，2 万面诊断模型减面后仍为 0，领口、衣褶、发束、手和鞋的黑缝消失。精细母版不进行这一拓扑处理。

- [角色展示场：Rodin 精修前后对比](/?mode=showcase&library=history&demo=grassy-rodin-history)：原版精细模型与精修后的三档模型，复用共享模型配置和加载器，可切换方向、旋转查看。
- `models-rodin-refined/render-{detailed,game,light}-{front,right,left,back,hero}.png`：三档共 15 张真实 Blender 渲染。
- `assets/characters/grassy/history/model-rodin-refined/grassy-rodin-refined-master.blend`：统一精修母版。
- 同目录 `grassy-rodin-refined-{detailed,game,light}.blend`：各档模型及摄影棚、相机、打包贴图。
- 同目录 `grassy-rodin-before-after.blend`：通过 Blender MCP 实际导入两版 GLB 的同高、同方向对比工程；视窗截图为 `evidence/mcp-before-after.png`。
- `evidence/final-head-{front,right,back}.png`：最终头部近景；`geometry-report.json` 记录局部改动、UV 哈希及法线变换。报告中的锚点是距操作中心最近的源顶点，不是自动识别出的原画语义关键点。
- `material-evidence/`：同镜头材质前后图、颜色测量、实际 GLB 重新导入渲染。
- `fit-evidence/`：原画与模型的四向轮廓、叠图、配准和数值报告。原画与模型都按完整包围盒中心和可见全高统一配准，没有非等比拉伸。

四向轮廓检查用于排除比例漂移，不能证明面部或材质已还原原画。正面和侧面轮廓 IoU 约 0.93，背面约 0.90；局部精修后 IoU 略有降低，没有包装成整体轮廓精度提高。背面原画的手势更外展，包围盒宽度差约 5.1%，仍保留为未通过项，没有为此强行改动已确认的正侧面体型。后脑发束、手指姿态与原画仍有差异。

本轮采用 `multiview-fit-loop`、`landmark-fit-repair`、`orthographic-registration`、`reference-look-calibration` 的逐视图比较与校准流程。可复现脚本为 `scripts/blender_grassy_rodin/refine.py`、`refine_materials.py`；四向配准检查为 `inspect_refinement.py`。完整重建会覆盖精修组输出，手工修改请另存：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --threads 3 --python scripts/blender_grassy_rodin/refine.py
```

## 不同制作路线对比（静态候选）

两版均以已确认的侧面母版与四方向参考为依据，总高 3.10 格，具有完整三维体积，未制作骨骼或动作。它们用于比较制作方法，尚未获得用户对外观的最终确认。

| 版本 | 制作方法 | GLB | 可编辑工程（仓库路径） |
|---|---|---|---|
| 原画校准版 | 重新塑造头脸、眼睛和实体发束，校准关键点及四向轮廓；复用 atelier 服装基础 | [grassy-reference-fit.glb](models-reference-fit/grassy-reference-fit.glb) | `assets/characters/grassy/history/model-reference-fit/grassy-reference-fit.blend` |
| 多视图贴图版 | 正侧轮廓约束的封闭体积，将四向原画投射为表面贴图 | [grassy-multiview.glb](models-multiview/grassy-multiview.glb) | `assets/characters/grassy/history/model-multiview/grassy-multiview.blend` |

每个模型目录均含 `render-{front,right,left,back,hero}.png` 五方向真实渲染和 `manifest.json`。原画校准版为 1,010,110 三角面，多视图贴图版为 331,536 三角面，均属于静态对比资产，不能直接视为已完成减面的游戏版本。

原画校准版仍有发束排列偏规则、服装细节较简单的问题。多视图贴图版的眼睛、眉毛、嘴和发丝细纹主要来自贴图，原画高光也保留在表面颜色里，隐藏部位为近似；它不是神经图转三维生成结果。背面原画的手势较正面外展，本版统一沿用正面姿势并在配准报告记录冲突。轮廓和关键点指标不代表艺术相似度。

本轮实际使用 `multiview-fit-loop`、`landmark-fit-repair`、`orthographic-registration`、`reference-look-calibration` 的配准、比较与修正流程。Blender MCP 用于实际打开模型、创建双模型对比工程并保存视口截图：

- [展示场：本轮方法对比](/?mode=showcase&library=history&demo=grassy-methods)，并列两版新模型和原有 astra 精细版。
- `assets/characters/grassy/history/model-method-comparison/grassy-method-comparison.blend`：MCP 导入两版最终 GLB 的同高对比工程。
- `assets/characters/grassy/history/model-method-comparison/mcp-viewport.png`：实际 Blender 视口截图。
- 校准证据分别在 `assets/characters/grassy/history/model-reference-fit/fit-evidence/` 和 `models-multiview/validation/`。

Meshy / Tripo 已实际检查入口，当前账户未登录，因此未生成云端模型，也未上传原画或购买服务。

## 原有 astra 静态 3D 模型

2026-10-04 继续按正面、侧面母版重塑 `gpt6.1astra版本`，并保留原画、重塑前和当前模型的同方向对照。当前是可旋转、可编辑的真实三维模型；用户此前确认的是参考图和场景高度，本模型的外观仍需结合真实渲染与场景比较验收。

`models/` 保存从同一个精细模型派生的三个版本：`grassy-detailed.glb`、`grassy-game.glb`、`grassy-light.glb`。精细版用于近景造型检查，游戏标准版用于一般游戏视距，轻量版用于更远的视距与多实例场景。实际数据见 [manifest.json](models/manifest.json)。

| 版本 | 三角面 | GLB 体积 | 材质网格 | 单张贴图 |
|---|---:|---:|---:|---:|
| 精细版 | 2,319,462 | 80.89 MiB | 26 | 1024² |
| 游戏标准版 | 44,626 | 5.01 MiB | 26 | 512² |
| 游戏轻量版 | 18,308 | 1.44 MiB | 26 | 256² |

已直接读取三档 GLB 的二进制顶点、节点变换、UV 与嵌入图片：全高均为 3.10、脚底约 0（浮点误差小于 0.000001），面数与文件字节数匹配清单，三档分别打包 17 张 1024² / 512² / 256² PNG；7 个材质带颜色、法线与粗糙度纹理。检查记录为 `assets/characters/grassy/history/model-static/resource-audit.json`。三档丹宁材质的 COLOR_0 均具有有效的洗水色差，且与纹理叠乘。没有骨骼、蒙皮或动作轨道。

本轮修改：

- 收窄下颌、增加面颊体积并缩短鼻尖突出量；增加眼睛开口和棕色虹膜的高度，缩小黑瞳孔占比，增加眼表弧度与上眼睑厚度，使眼睛在侧面具有可见体积。眉毛减薄，微笑线和鼻翼细褶改为更清晰的暖红色。
- 耳廓放大并向前、向外调整，改变斜角以增加侧面的可见面积；耳屏缩小，保留耳轮和耳垂的曲面结构。头顶和颈部接口沿用既有尺寸，三档导出仍统一到 3.10 格。
- 刘海由偏心发缝向两侧斜扫，长短尖端交错，短分束覆盖长束根部；侧后发层错位叠合，底层贴近头皮并填补发束下的空隙。调整前额发际和刘海覆盖关系，减少帽沿式黑带与整齐排片感。
- 毛衣衣身和袖子使用连续曲面，袖根过渡、袖肘和下摆改为有方向的局部褶皱；裤腿保留直筒体积，褶皱集中在裆部、膝部与裤脚，避免整圈膨胀。手掌略放大，手指放松为轻微弯曲，脚踝与鞋口重叠接合。
- 圆领、袖口和下摆保留罗纹。针织加入细密线圈与浅提花，降低粗纹的凸起；丹宁保留细斜纹，头发采用沿发束方向的细纹与根梢明暗。针织、丹宁、皮革分别打包颜色、法线与粗糙度图，游戏两档独立降采样，不改变精细母版。
- 牛仔裤保留贴体口袋、后袋、卷边与接缝，增加膝部、大腿和臀部的洗水色差。`DenimWear` 顶点色与纹理通过导出器支持的 RGBA Multiply 组合，网页使用同一套颜色。
- 导出前统一各部件活动 UV 层名称，避免相同材质合并时遗失局部映射。简化版分别为脸、眼、头发、衣服、手和鞋保留面数预算；微小肩缝只留在精细版。

仍可见的差距：头发仍以整束曲面为主，细碎发、束间透光和蓬松度不及原画；面颊、鼻翼、耳廓与手部的软组织转折仍较简化，皮肤明暗和眼神尚不能视为原画的完整还原；衣服的松软起伏、丹宁磨损和细缝线层次也有差距。外观还原度以真实渲染和场景比较为准，不以面数或代码测试判定。

可编辑源文件与图片：

- `assets/characters/grassy/history/model-static/grassy-detailed.blend`：精细源，保留可编辑部件、修改器、材质、摄影棚和打包的四方向参考；参考集合默认隐藏。
- `assets/characters/grassy/history/model-static/grassy-variants.blend`：精细源、精细导出、游戏标准、游戏轻量集合；默认只显示游戏标准版。
- `models/render-{detailed,game,light}-{hero,front,right,back,left}.png`：三档共 15 张真实 Blender 渲染，1100 × 1265、32 采样。
- `models/render-detailed-{face,face-front}.png`：头脸近景，1100 × 1265、32 采样。
- `models/render-detailed-{cloth,shoes}.png`：衣服、裤脚与鞋子近景，1100 × 1265、32 采样。
- `assets/characters/grassy/history/model-static/before-portrait-remodel/`：本轮脸眼、发型和衣褶重塑前的精细源文件、清单与真实渲染，用于比较与回退。
- `assets/characters/grassy/history/model-static/before-remodel/`：更早一轮重塑前的源文件、三档 GLB 和真实渲染，用于历史比较与回退。
- `assets/characters/grassy/history/model-static/before-refinement/`：精修前源文件、脚本和真实渲染，用于比较与回退。

共享接入仍为 `src/render/grassy/grassy-static.ts` 与 `src/config/grassy.ts`。角色展示场和真实场景复用上述 GLB、材质与 3.10 格尺寸，没有另建一套展示模型；保持静态姿势。

- 原画／旧版／当前版四方向对照：`http://127.0.0.1:5174/assets/characters/grassy/history/model-static/refinement-compare.html`
- 三档可旋转展示：`http://127.0.0.1:5174/?mode=showcase&library=history&demo=grassy-models`
- 真实场景：`http://127.0.0.1:5174/assets/characters/grassy/history/static-model-scene.html`

从仓库根目录完整重建：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --threads 6 --python scripts/blender_grassy/build_static.py -- --views front,right,hero,back,left --samples 32 --size 1100
```

脚本由 `static_head.py`、`static_hair.py`、`static_body.py`、`static_materials.py` 组成，`build_static.py` 负责装配、真实几何高度归一、三档派生、导出和渲染。可加 `--preview` 只保存精细源及指定方向渲染；`--detail-views face,face-front,cloth,shoes` 控制精细版额外近景；手工编辑精细源后用 `--from-blend <另存的源文件>` 派生三档。重建覆盖这些静态输出，手工修改请先另存。

本机受限环境下启动 Blender 曾在 Metal 初始化阶段出现空指针崩溃，发生于脚本执行前；经授权在本机环境运行上述命令已成功导出和渲染。

## 角色卡

`grassy-human-card.png` 使用内置 image_gen，从用户确认的 Grassy 双形态角色卡 V3 独立绘制。黑色短发、棕色眼睛、红毛衣、蓝色牛仔裤与米白运动鞋。

## 早期头身比例选型

按用户要求，每个比例独立成图，均使用正面站姿、红毛衣、蓝色牛仔裤和米白鞋，当时目标游戏高度统一为 2.85 格。图中的头身数字是绘制目标，供视觉选型使用；比较口径采用可见发顶至下巴，不作为模型精确尺寸。历史候选：

- A，约 2 头身：`proportions/a-2-heads.png`
- B，约 2.5 头身：`proportions/b-2p5-heads.png`
- C，约 3 头身：`proportions/c-3-heads-v3.png`
- D，约 3.5 头身：`proportions/d-3p5-heads.png`
- E，约 4 头身：`proportions/e-4-heads-v3.png`

使用内置 image_gen 绘制并视觉复核，C/E 的早期候选保留。初始提示词见 `assets/characters/grassy/history/grassy-proportion-separate-prompts.txt`，最终 C/E 编辑提示词见 `assets/characters/grassy/history/grassy-proportion-refinements.txt`。用户随后选择 3 与 3.5 之间的方向，并要求试画 3.1；最新正面基准为 `proportions/grassy-3p1-heads-v2.png`，3.25 中间候选保存在 `proportions/grassy-3p25-heads.png`。已按最新 3.1 参考继续绘制四方向，比例尚未应用到模型。

## 四方向参考图

### 当前交付：侧面母版统一的四方向透明图

用户比较 `turnaround-final-3p1/right.png` 与实际入场的侧面原图后，要求重新制作，以原图更饱满的头部、后脑和身体厚度为准。新版 `turnaround-master-v2/` 下的正面、背面、左侧、右侧各为一张独立 1254 × 1254 RGBA PNG，不含卡片标题、边框或尺寸文字。

- `right.png`：用户上传原图的直接复制，未重新生成、拉伸或缩头。原上传文件名为 `uploaded-reference.png`，永久基准保存在本目录，后续不依赖临时上传路径。
- `front.png`：以右侧母版为比例依据，早期正面仅辅助脸部身份与服装细节。首次绘制头略大、下摆略低，经定向修正后采用此文件；`front-draft.png` 仅为过程图。
- `left.png`：以同一右侧母版绘制朝画面左侧的视图，保留后脑发量、侧脸、松软毛衣和有厚度的直筒牛仔裤。
- `back.png`：以右侧母版和修正后的正面为依据，早期背面仅辅助双后袋与接缝结构。

其余三个方向使用内置 image_gen 制作，完整提示词见 [turnaround-master-v2/prompts.txt](../turnaround-master-v2/prompts.txt)。核对按发梢至鞋底的可见全高进行：头部约占三分之一、毛衣下摆在全高约 59%～60%、裤脚下缘约 90%～91%。这些是视觉对照口径，不是精确模型投影；画布留白与局部纹理仍可存在差异。场景高度固定为 3.10 格，使用时按人物可见轮廓整体归一，不能直接把整张画布高度当作人物高度。

本次仅制作图片、核对 PNG 格式及进行视觉复核，未修改三维模型、动作或场景代码，未运行代码测试。上一版偏瘦的卡片保留用于追溯，不再作为建模比例基准。

### 上一版卡片：已由侧面母版版取代

`turnaround-final-3p1/front.png`、`back.png`、`left.png`、`right.png` 为上一版四张独立角色卡，均为 1254 × 1254 PNG。使用内置 image_gen，逐张以上一版对应方向为编辑对象，以正面及右侧面为辅助参考，细化表面材质并统一尺寸标注。每张仅有一个方向，左右以人物面朝画面左/右为准。后续对照发现其侧面头部和躯干略窄，因此被当前透明图取代。

保留黑色分层短发、棕眼、红色圆领针织毛衣、蓝色卷边牛仔裤与米白系带鞋；背面展示双后袋与鞋跟，侧面展示头部厚度、鼻尖下巴轮廓、裤缝与衣服厚度。四张已进行视觉复核；仍为绘制参考，局部纹理和轮廓存在生成差异，不能作为精确像素对齐的模型投影。

完整提示词与参考文件路径见 [turnaround-final-3p1/prompts.txt](turnaround-final-3p1/prompts.txt)。本次未修改三维模型、场景缩放或动作，也未运行代码测试。早期图片保留用于追溯。

### 已确认的选型原图：3.1 头身

`turnaround-3p1/front.png`、`back.png`、`left.png`、`right.png` 是按用户最新选型绘制的四张独立参考图。统一使用 `proportions/grassy-3p1-heads-v2.png` 作为人物、服装和比例基准，最终游戏可见高度已通过场景对照确认为 3.10 格。左右按人物面朝画面左/右标注；背面展示分层短发、毛衣背面、牛仔裤双后袋及鞋跟。四图采用静态站姿，头顶与脚底位置目视基本一致，生成参考存在细节差异，不保证像素级正交对齐。它们是后续静态建模参考，不是已完成的三维模型截图。

采用内置 image_gen，完整提示词见 [turnaround-3p1/prompts.txt](turnaround-3p1/prompts.txt)。仅进行视觉检查，未运行代码或模型测试。

### 侧面图入场预览

`turnaround-3p1/right-cutout.png` 使用内置 image_gen 从右侧面卡去除背景、文字与地面阴影，保留真实透明通道。提示词见 [turnaround-3p1/right-cutout-prompt.txt](turnaround-3p1/right-cutout-prompt.txt)。

`assets/characters/grassy/history/side-reference-scene.html` 将该图片按非透明人物轮廓归一到场景显示高度。用户考虑发梢外轮廓后，最终指定显示高度为 3.10 格，头身比例仍为 3.1；门口和屋外各放置一个同尺寸人物，分别按渔屋门槛与实际地面贴地。默认种子地图、渔屋、植被、渲染舞台与 2.58 格的鹈鹕均复用游戏资源，提供门前近景与游戏视距。此处展示的是二维侧面图，不是新建三维模型。最新截图为同目录 `doorway-reference-3p1-tiles.png`，早期3.0格截图 `doorway-reference-taller.png` 和2.85格截图 `side-reference-scene-close.png`、`side-reference-scene-game.png` 保留。

### 早期参考

`grassy-four-directions-285.png` 是按场景对照中 80% 候选尺寸重新绘制的四方向角色卡，目标游戏高度 2.85 格，鹈鹕参考高度 2.58 格。采用内置 image_gen，依次展示正面、面朝画面左侧、背面、面朝画面右侧，并以共同脚底线和头顶参考线对齐。保留黑短发、红毛衣、蓝色牛仔裤及米白鞋。它是静态造型与尺寸目标参考，尚未应用到正式三维模型；生成图不保证像素级正交对齐。提示词保存于 `assets/characters/grassy/history/grassy-turnaround-285-prompt.txt`。

`turnaround/front.png`、`back.png`、`left.png`、`right.png` 为绘制的建模参考，非三维模型截图。方向按画面中人物面朝左/右标注。完整提示词见 [turnaround/prompts.md](turnaround/prompts.md)。四张图的细节与构图存在生成差异，不保证像素级对齐。

## 旧实时模型（仅保留历史）

`grassy.glb` 由 Blender 5.2.2 LTS 生成，包含骨骼蒙皮、连续服装网格、头脸与分层短发，以及桌椅、屏幕、键盘。造型依据早期四方向参考，保持黑发棕眼、红毛衣、蓝色牛仔裤和米白运动鞋。用户已否定此版模型的还原度；它尚未采用当前确认的 3.1 头身与 3.10 格尺寸，不作为最终造型基准。

六条骨骼动作：`idle`（4秒）、`walk`（2秒）、`run`（1.5秒）、`jump`（2.4秒）、`coding`（4秒）、`dizzy`（4秒）。编程道具仅在编程动作显示。

旧加载器 `src/render/grassy/grassy-rig.ts` 与 `grassy-animator.ts` 仍保留。当前人形角色展示场使用上面的静态加载器与三档资源，不再播放这组旧动作。

## 旧可编辑源文件

仓库内 `assets/characters/grassy/history/model/grassy.blend` 保存模型、骨骼、动作、材质、灯光和打包的四方向参考。参考位于默认隐藏的 `Modeling references` 集合；编程道具位于 `CodingProps`。

生成脚本位于 `scripts/blender_grassy/`，由 `build.py` 组合 `head.py` 与 `body.py`。在仓库根目录执行：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python scripts/blender_grassy/build.py
```

该命令重新生成 GLB、Blend 源文件、五方向静态渲染与编程/奔跑/跳跃画面。它会覆盖这组生成文件；直接在 Blender 中手动修改模型时应另存副本，避免重新生成覆盖手工修改。

同目录 `grassy-hero.png`、`grassy-front.png`、`grassy-back.png`、`grassy-left.png`、`grassy-right.png` 均为实际三维渲染，不是绘制参考图。此版本仍保留简化的发束和服装细节，尚未达到参考插画的全部细节。
