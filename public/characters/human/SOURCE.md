# Grassy · 正式装备角色

[查看正式角色](/?mode=showcase) · [移动与跳跃](/?mode=showcase&demo=grassy-rodin-animation) · [骑自行车](/?mode=showcase&demo=grassy-ride) · [普通攻击：砸键盘](/?mode=showcase&demo=grassy-smash) · [键盘战斗](/?mode=showcase&demo=grassy-combat) · [空中战斗](/?mode=showcase&demo=grassy-airborne) · [推进飞行](/?mode=showcase&demo=grassy-flight) · [历史资料库](/?mode=showcase&library=history)

## 当前造型与来源

身体沿用用户确认方向的 Rodin 精修模型：深棕黑色分层短发、棕色眼睛、红色针织毛衣、蓝色牛仔裤与米白运动鞋。静息时从鞋底到最高发梢的可见全高为 **3.10 格**，沿用已确认母版；装备不改变身体比例。跳跃与飞行的离地位移属于动作，不能当作人物身高。

新增装备以三张用户确认的概念图为依据，在 Blender 内制作可编辑硬表面几何：中等体量的白色曲面护腕、深灰内衬、青蓝光槽、紧凑背架与腰部推进器，以及斜背键盘。身体、UV 和既有 PBR 贴图复用 Rodin 精修资产；本轮没有重新调用云端模型生成，没有花费新增云生成额度。

| 已确认概念图 | 内容 |
|---|---|
| [推进飞行](equipment-concepts/flight.png) | 护腕、背部与腰部装备的体量和颜色 |
| [Codex 攻击](equipment-concepts/codex-attack.png) | 身前键盘武器与蓝白代码飞矢 |
| [键盘背负](equipment-concepts/keyboard-stowed.png) | 非攻击状态的斜背键盘与背架关系 |

以上三图是用户提供并授权收入资料库的概念图，不作为实际模型渲染。原有 [人形角色卡](grassy-human-card.png) 与最终四方向母版继续保留：[正面](turnaround-master-v2/front.png)、[背面](turnaround-master-v2/back.png)、[左侧](turnaround-master-v2/left.png)、[右侧母版](turnaround-master-v2/right.png)。右侧图直接保留用户确认的原图，其余方向依照它绘制；完整原画过程记录在 [历史制作说明](history/SOURCE.md)。

## 战斗效果概念

以下四图先于技能改造绘制，用于确定动作方向、实体轮廓、粒子层次和作用范围，单独收入“战斗效果概念”分组。**这是概念图，非游戏实际渲染**；原有三张装备概念图继续保留。

| 战斗概念图 | 设计方向 |
|---|---|
| [键盘单手连击](equipment-concepts/combat-v2/keyboard-one-hand-combo.png) | 右手握住键盘短端，带动远端向左抡击、反手右挥，左手张开保持平衡 |
| [Codex 实体光弹](equipment-concepts/combat-v2/codex-barrage.png) | 白热弹芯、青蓝实体外壳、长尾流与代码碎片粒子，完整远程弹道 |
| [Bug 虫群](equipment-concepts/combat-v2/bug-swarm.png) | 清晰的紫绿实体虫、发光腹核与故障碎片尾迹 |
| [服务器超载](equipment-concepts/combat-v2/server-overload.png) | 服务器阵列过热、能量柱爆发、多层冲击波与实体碎片 |

旧版双手连击概念图 `equipment-concepts/combat-v2/keyboard-combo.png` 保留作过程资料，当前战斗概念使用已确认的单手版本。

## 空中技能概念

以下四图单独收入“空中技能概念”分组，展示飞行姿态、推进尾流与攻击效果的组合方向。**这是概念图，非游戏实际渲染**；运行时效果请查看[空中战斗展示](/?mode=showcase&demo=grassy-airborne)。

| 空中概念图 | 设计方向 |
|---|---|
| [空中键盘单手连击](equipment-concepts/combat-v3/airborne-keyboard.png) | 保持推进飞行，用实体键盘远端完成单手横挥 |
| [空中 Codex 光弹](equipment-concepts/combat-v3/airborne-codex.png) | 飞行中从键盘发射蓝白实体光弹，推进尾流与弹道同时可见 |
| [空中 Bug 虫群](equipment-concepts/combat-v3/airborne-bug.png) | 飞行中释放紫绿实体机械虫群与故障粒子 |
| [空中服务器超载](equipment-concepts/combat-v3/airborne-overload.png) | 悬空施放服务器阵列、能量柱、多层冲击波与碎片 |

## 模型与可编辑工程

三个精细度档位使用同一造型、尺寸、骨骼和动作命名。正式角色页面通过“模型精细度”切换，动作目录只显示一次。

| 精细度 | 带装备与动作的 GLB | Blender 工程（仓库根目录起） |
|---|---|---|
| 精细版 | [grassy-equipped-detailed.glb](models-equipped/grassy-equipped-detailed.glb) | `assets/characters/grassy/model-equipped/grassy-equipped-detailed.blend` |
| 游戏标准版 | [grassy-equipped-game.glb](models-equipped/grassy-equipped-game.glb) | `assets/characters/grassy/model-equipped/grassy-equipped-game.blend` |
| 游戏轻量版 | [grassy-equipped-light.glb](models-equipped/grassy-equipped-light.glb) | `assets/characters/grassy/model-equipped/grassy-equipped-light.blend` |

真实导出数据见 [manifest.json](models-equipped/manifest.json)；该文件记录身体与装备面数、骨骼、动作、GLB 字节数、源表面保持情况和输出路径。`assets/characters/grassy/model-equipped/evidence/` 保存每档导出报告、动作关键帧与检查证据。

实际导出面数与文件体积如下；三档均为 22 根骨骼、14 段动作及独立眼睑 Blink 形变，表面与 UV 保持检查均通过。自行车由共享模型函数加载，不计入人体 GLB 面数。

| 精细度 | 身体三角面 | 装备三角面 | 眼睑三角面 | 总三角面 | GLB 体积 |
|---|---:|---:|---:|---:|---:|
| 精细版 | 500,000 | 87,712 | 4,800 | 592,512 | 38.35 MiB（40,215,720 字节） |
| 游戏标准版 | 45,000 | 40,578 | 2,176 | 87,754 | 6.15 MiB（6,448,332 字节） |
| 游戏轻量版 | 20,000 | 26,097 | 1,248 | 47,345 | 2.70 MiB（2,826,124 字节） |

游戏标准版的正式 Blender 实际渲染已收入角色资料：[三分之四](models-equipped/render-game-hero.png)、[正面](models-equipped/render-game-front.png)、[右侧](models-equipped/render-game-right.png)、[左侧](models-equipped/render-game-left.png)、[背面](models-equipped/render-game-back.png)。这些图片来自最终带装备模型，与上方概念图分组展示。

骑行实际渲染单独收在“骑行模型”分组：[三分之四](models-equipped/render-game-ride-hero.png)、[右侧](models-equipped/render-game-ride-right.png)。完整人车工程为 `assets/characters/grassy/model-equipped/grassy-riding-game.blend`，打开即为骑行姿态，人体、脚踏、曲柄和车轮均可在时间轴播放。

## 动作与键盘收放

骨骼与装备变换在 Blender 中按 30 fps 烘焙，键盘拥有独立对象动画，与人体动作合并为同名 GLB clips。非攻击状态保持键盘斜背在背架上；攻击先取到身前，完成挥砸或敲击施法后送回背部。装备跟随实际骨骼或键盘节点运动。

腿部蒙皮已修正：连续裤裆使用左右大腿的平滑权重过渡，表面连接关系用于清除裤腿上的错误手部权重，避免跨步和摆臂把牛仔裤扯成薄片。修复保留身体表面、UV、贴图、22 根骨骼和 12 个动作轨道；修复前后同角度近景与实际 GLB 对照记录保存在 `assets/characters/grassy/model-equipped/evidence/leg-repair/`。

| 动作 | Clip | 时长 | 播放方式 |
|---|---|---:|---|
| 呼吸 | `idle` | 3.2 秒 | 循环；胸肩吸气和缓慢呼气，双脚稳定，叠加自然眨眼 |
| 走路 | `walk` | 1.2 秒 | 循环；交替迈步与对侧摆臂 |
| 跑步 | `run` | 0.8 秒 | 循环；前倾、蹬地、腾空与快速摆臂 |
| 快跑 | `sprint` | 0.6 秒 | 循环；约 23° 躯干前倾、短支撑蹬地、更高后跟回收与大幅对侧摆臂 |
| 骑自行车 | `ride` | 3.6 秒 | 循环；三次踩踏对应车轮一整圈，键盘背负、推进器关闭 |
| 跳跃 | `jump` | 1.6 秒 | 单次；蓄力、起跳、空中与落地缓冲 |
| 普通攻击 · 砸键盘 | `keyboard_smash` | 2.0 秒 | 单次；右手握短端，以远端左右横挥，左手保持平衡，收回背架 |
| Codex 攻击 | `codex_attack` | 1.6 秒 | 单次；取出键盘，连发蓝白实体光弹与粒子尾流，收回 |
| Bug 攻击 | `bug_attack` | 2.0 秒 | 单次；紫绿实体虫群沿弹道前冲，伴随故障粒子 |
| 服务器超载 | `server_overload` | 3.2 秒 | 单次；服务器过热蓄能，能量柱与多层冲击波爆发 |
| 起飞 | `takeoff` | 1.2 秒 | 单次；推进器启动，双脚离地 |
| 悬停 | `hover` | 2.4 秒 | 循环；屈膝悬浮与重心微调 |
| 向前飞行 | `fly_forward` | 1.2 秒 | 循环；身体前倾、双腿后收 |
| 降落 | `land` | 1.2 秒 | 单次；减速下降、接地缓冲 |

单次动作结束保留末帧，默认关闭循环；需要反复检查时可手动开启循环。页面支持暂停、重播、0.5×／0.25× 慢放、旋转与缩放。走路、跑步、快跑、骑行和前飞为原地动作循环，水平行进由共享游戏移动逻辑驱动；跳跃与起降保留演示所需的竖直位移。

[前倾快跑展示](/?mode=showcase&demo=grassy-sprint)保留独立的跑步／快跑预览。实际游戏和手动模式按住 Shift 加速，达到走跑速度中点后使用快跑；没有新增物理档位。人形转身复用鹈鹕的平滑 yaw，模型查看的视角切换同样平滑，暂停动作后仍可旋转。

普通攻击采用右手握住键盘同一短端的骨骼动作，以右肩和转腰配合带动键盘远端完成两次方向相反的大幅横挥，左手向后张开保持平衡。60 帧片段中的第 22 帧（0.733 秒）与第 42 帧（1.400 秒）对应两次打击，随后沿头部外侧轨迹收回背架。键盘保持实体武器，挥击弧光与短促火花只用于强化速度和命中；手臂保持原长度，沿用已有手部骨骼。

单手连击的正面与 45 度实际渲染、61 帧接触检查和三档资产保持报告保存在 `assets/characters/grassy/model-equipped/evidence/keyboard-one-hand/`。三档仅替换普通攻击，原有其他 12 个动作采样、全部身体与装备网格属性和拓扑、UV、材质、蒙皮和贴图均保持。挥击段右手握点最大误差为 0.00000114 格，左手与键盘包围盒最小间距为 0.646 格；全片段未检测到头部顶点进入键盘包围盒。旧版向下砸击与双手连击证据保留在 `keyboard-smash/`、`keyboard-combo/`，不作为当前版本的验收图。

四种攻击均可通过“施法姿态”切换地面、起飞、悬停或前飞。空中施法由共享运行时组合已有的攻击与飞行动作：保留攻击上身与握持关系，叠加飞行的重心、倾斜和腿部姿态，同时变换键盘与特效，推进器持续输出。三档 GLB 仍各含 **13 段 clip**，没有另烘焙一套空中技能或复制展示场专用模型；这些组合在[空中战斗展示](/?mode=showcase&demo=grassy-airborne)中复用。

Codex 使用七枚约 0.98 格长的实体蓝甲光弹、白核、2.1 格尾流、代码块与粒子，飞行 9 格后出现末端爆发。Bug 使用五大十二小的实体机械虫，具有甲壳、六足、发光核和薄翅，飞行 7.2 格后聚爆。服务器超载有六座 3.15 格高的实体机柜、蓝转红状态灯、电弧、5.2 格能量柱、三层半径约 6 格的冲击环与飞散金属碎片。射程为角色资源的视觉演示距离，未接入伤害碰撞。

骑行复用游戏已有的 `createRideBicycle` 几何、材质和传动函数，按主角尺寸缩放并调整车把。Blender 直接读取该函数导出的真实车体和接触点，骨盆固定在车座上，双手扶把，双脚通过双段 IK 跟随踏板。每次踩踏为 1.2 秒，整个片段包含三次踩踏，使车轮反光片在循环边界连续。脚踏、车轮、链条和角色由同一绝对时间驱动。手部沿用现有单手骨，未新增独立手指关节。

## 共享播放与特效

- `src/config/grassy.ts`：三档资源、动作时长、循环语义与共享三维取景范围；远程弹道与超载范围随模型旋转一起参与取景。
- `src/render/grassy/grassy-rig.ts`：真实 GLB 蒙皮、装备和独立骨骼实例。
- `src/render/grassy/grassy-animator.ts`：按绝对时间采样动作，单次动作停在末帧。
- `src/render/grassy/grassy-flight-pose.ts`：组合已有飞行与攻击采样，保持单手握持，并共享键盘和特效的空中变换。
- `src/render/grassy/grassy-effects.ts`：键盘横挥弧光和命中火花、蓝白 Codex 实体光弹、紫绿 Bug 虫群、服务器超载阵列与冲击波，以及推进尾流。
- `src/render/grassy/grassy-projectiles.ts`：光弹与机械虫的实体、尾迹和远端命中，直接使用模型坐标，发射后不再跟随键盘。
- `src/render/grassy/grassy-overload.ts`：四块悬浮刀片服务器、头顶过载核心、汇聚电弧、蓝白等离子冲击波及外缘数据粒子。核心和状态灯在地下保持自发光。
- `src/config/grassy-cycle.ts` 与 `src/render/grassy/grassy-cycle.ts`：共享自行车尺寸、Blender 接触合同、车轮／曲柄／链条同步播放。
- `src/app/showcase/human-session.ts`：展示场调用这些共享资源，负责播放控制、取景和观察旋转。

特效使用 `fx_keyboard`、`fx_wrist_L`、`fx_wrist_R`、`fx_pack_L`、`fx_pack_R` 五个实际装备挂点。动作与特效共用时间，因此暂停、慢放和重播保持同步。尾流、弹幕和服务器阵列由共享 three.js 模块生成，不烘焙进 GLB；单独在 Blender 打开工程时可编辑角色、装备和动作，游戏特效在网页中查看。

人形已接入共享游戏战斗与角色展示场，包含实际伤害、冷却、移动和空中施法。人形键位为 `1` Code、`2` Bug、`3` 服务器超载、`4 / E` 光子爆裂；光子跟随人形，变身前后共用冷却。

正式三档模型的跑步包含落脚缓冲、蹬地腾空、屈膝回收和交替摆臂；呼吸使用较快吸气、较慢呼气及胸肩起伏。`scripts/blender_grassy_rodin/face.py` 从原面部贴合生成四个眼睑，保留身体拓扑、UV 和头脸造型，导出可编辑的 `Blink` 形变。网页按绝对时间播放快速闭眼、短暂停留和缓慢张眼，含偶尔连续两次眨眼，暂停和重播可还原同一帧。

Code 弹头为有厚度的 `</>` 几何，尾迹包含 `{}`、`=>`、`if()` 字形及少量蓝白粒子。字形随镜头保持可读，自发光材质在地下不被压暗。游戏实体弹与模型预览使用同一共享模块。

## 重建

从仓库根目录执行：

```sh
node scripts/blender_grassy_rodin/export_cycle.mjs
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --threads 3 --python scripts/blender_grassy_rodin/extend_actions.py -- --tiers detailed game light --preview
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --threads 3 --python scripts/blender_grassy_rodin/preview_riding.py
```

`extend_actions.py` 从 `assets/characters/grassy/history/model-rodin-refined/` 读取既有三档身体，使用 `animate.py` 的骨架与绑定工具，调用 `equipment.py`、`equipment_keyboard.py` 构建装备和键盘，再烘焙动作、导出 GLB、保存 `.blend` 及报告。`--preview` 额外生成关键帧和正式多方向渲染；省略它可仅导出模型、工程与数据报告。重建覆盖正式输出，手工编辑请另存工程。

`export_cycle.mjs` 导出共享自行车的真实 GLB 和 `ride-contract.json`，骑行烘焙读取此合同。`preview_riding.py` 将真实车体加入标准版工程，生成四个踩踏相位侧面图、三分之四图、109 帧接触对照报告和可编辑的人车合体工程。网页的自行车使用共享运行时模块，不把车体重复打包进三档人体 GLB。

当前超载视觉参考：[`equipment-concepts/combat-v4/server-overload.png`](equipment-concepts/combat-v4/server-overload.png)。使用内置 imagegen，以正式装备角色为参考，绘制薄型悬浮服务器、上方能量核心与向外展开的蓝白冲击波；已加入角色图片目录「超载效果新版」。网页实际效果由共享 three.js 模块生成。

## 历史资料

以前的原画方案、比例稿、静态模型与初版呼吸／走路动画已经归档，正式角色目录不再混入它们。

- [页面历史资料库](/?mode=showcase&library=history)：128 张旧图片、18 个可旋转旧静态模型与旧动画 GLB 下载。
- [历史索引](history/README.md) 和 [完整制作记录](history/SOURCE.md)。
- [迁移清单](history/migration.json)：原路径与归档路径。
- 网页归档位置：`public/characters/human/history/`。
- Blender 与原始制作资料：`assets/characters/grassy/history/`。
