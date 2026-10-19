# PLAN -- 星舰交通中心：横版长街场景与尾焰时空穿越重做

## Status: done
## Task: 522
## Related: 521
## Baseline Commit: a13fdd68（工作区含 518–521 未提交的交通中心改动，以当前工作区为基线）

## Goal
1. 交通中心改成正规横版游戏场景：地面左右延长为可奔跑长街，镜头在地面阶段跟随角色横移，画面底部完整露出地面与路沿。
2. 重做纯尾部追航时的尾焰与时空穿越，使其有冲击力：喷口可辨不过曝成白片，喷流有马赫环/湍流纵深，航道有隧道壁流动、掠过的光门与弯曲纵深。

## Non-goals
- 不改发射流程状态机、阶段时长、目的地与真实加载交接。
- 不改舰体外形、舱门、模型剖面、塔架与登船桥（碰撞体仅按净空裁剪底部，见 Decisions）。
- 不新增战斗、敌人、存档等关卡玩法。

## Acceptance Criteria
- 地面阶段 A/D 可从街道左端跑到右端（约 140 格），碰撞、电梯、上层桥面、舱门交互照旧。
- 镜头跟随角色水平移动并在两端停住；地面在画面下部完整可见，无截断的平台底边。
- 长街两端有明确收口，沿街铺装、绿植与灯带连续，展示场与游戏共用同一模型函数。
- 追航阶段：仍严格共轴纯尾部视角；七个喷口有暗金属边与热核层次，不是七个白灯泡；喷流向镜头延伸，有马赫环和非同步湍流；有向镜头飞散的炽热粒子。
- 航道：隧道壁能量流动、周期光门向镜头掠过、远端中心缓慢摆动形成弯曲纵深；加载期持续不停；reduced-motion 降低运动。

## Constraints
- 遵守 AGENTS.md：不加防御性检查、不写读源码/常量/网格细节测试，渲染效果浏览器人工验收。
- 游戏与展示场复用同一生成函数；只改相关文件。

## Decisions
- 跳过 explorer：主会话已通读 transit-app / pilot / sim / config / model / exhaust / corridor / fx，范围清楚。
- 跳过 architect：方案已按文件确定（见 Implementation Map），无实质分叉。
- 用户原话“下面最后要下传”理解为“下面最好要加长/下沉”：地面加长成长街并在画面下方完整入画。
- 街道范围 x ∈ [-40, 100]，负坐标与住宅场景一致可用；背景河岸 bounds 同步外扩。
- 前庭铺装改用 InstancedMesh，避免几百个独立 RoundedBoxGeometry。
- 无停止条件，直接实施。
- 步行穿过发射台：碰撞体只取 y ≥ TRANSIT.hullClearance(3) 的舰体剖面（人形身高 2.8），地面行走层前移到 TRANSIT.groundLaneZ(3.3)，在喷口与支腿前方通过；铺装加第四排承托该行走层。飞行时舰体照常阻挡。
- 地面层与上层之间按高度平滑混合角色深度，避免飞上桥面时 z 突跳。
- 镜头夹紧取街道两端各外扩 6 格，使端头收口完整入画；街面下加护岸墙，避免街道像悬空薄板。
- 审查修复：马赫环 shader 去掉负底数 pow（部分驱动 NaN）；喷口核心 atan 圆心保护；definition-collision 用例补人形角色从舰底走过的断言。
- 追航跟进：曾尝试抬高镜头，并把尾焰改成锥形喷流管，用户认为不如共轴版震撼，已撤回。最终保持纯底部共轴视角和原尾焰截面；舰体从正后方看就是圆盘，这属正常。
- 时空航道（最终）：舰体透镜效应（r' → r − k/r，以舰轴为中心），远端亮核绕舰形成爱因斯坦光晕，星流随之弯曲；隧道壁旋涡扭转；时空网格；蓝移/红移着色；光环改为接近正圆、断成弧段的细环，并带向内的运动拖尾（原来是低频波浪加填充光晕，有切片感）；每 TRANSIT_PULSE_SECONDS（1.6 s）一次时间冲击，shader 提速增亮并抛出冲击环，镜头 FOV 小幅冲击，音效同步一记低频重击加呼啸。
- 声音：transit-audio 补全流程合成音效：街道环境声、按步速触发的脚步声、电梯电机与启停声、舱门气压嘶声、入舱提示音、点火低频与爆裂声、跃迁呼啸加冲击、航道低频轰鸣与泛音、光门掠过声、抵达和弦。
- 舰体质感：舰尾加推力封板（烧蚀钢、18 根径向加强筋、两道承力环），从正后方不再透空；航道中舰体金属改用航道反射环境（彩色光环、前方白核、后方尾焰辉光），并绕舰轴随旋涡转动；两盏彩色补光环绕舰尾，随时间冲击增亮；尾焰外鞘改为从喷口稍远处才显形，露出金属喷口。
- 遗留：追航火星粒子与马赫环漂移无 reduced-motion 降速；移动真机性能未测。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/transit.ts | 街道范围 walkwayMinX/MaxX、出生点 | | ✓ |
| 2 | src/render/transit-center-model.ts（createForecourt） | 长街铺装（实例化）、连续路沿灯带、两端收口、沿街绿植槽与设施 | 1 | ✓ |
| 3 | src/app/transit-pilot.ts | 地面碰撞随街道延长 | 1 | ✓ |
| 4 | src/app/transit-app.ts（地面镜头、背景、花坛） | 地面阶段跟随镜头＋两端夹紧，地面完整入画；背景与花坛随街道外扩 | 1 | ✓ |
| 5 | src/render/transit-exhaust.ts | 追航尾焰重做：热核、马赫环、湍流外鞘、降低叠加过曝 | | ✓ |
| 6 | src/render/transit-center-model.ts（createEngines） | 追航时喷口发光分层：暗边、橙粉内壁、白热中心不过曝 | | ✓ |
| 7 | src/render/transit-center-fx.ts | 追航期炽热粒子从喷口飞向镜头 | 5 | ✓ |
| 8 | src/render/transit-time-corridor.ts | 隧道壁能量流、掠过光门、远端弯曲、色散 | | ✓ |
| 9 | src/app/transit-app.ts（追航镜头） | 进入航道时 FOV 冲击后回落，保持共轴 | | ✓ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | ✓ |
| node --test test/transit.test.ts test/definition-collision.test.ts test/perspective-player.test.ts | yes | ✓ |
| npm test | yes | ✓ |
| npm run build | yes | ✓ |
| 浏览器人工验收：长街跑动、镜头跟随、登舱发射、追航尾焰与航道 | yes | ✓ |
