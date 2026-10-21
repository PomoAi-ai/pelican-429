# PLAN -- 星舰飞往主世界：着陆舱落在交通中心旁的着陆场地

## Status: done
## Task: 527
## Related: 524, 525
## Baseline Commit: a13fdd68（工作区含 518–526 未提交改动，以当前工作区为基线）

## Goal
往返路线：主世界去其他世界用星舰（现有流程）；从机房关卡回主世界用着陆舱飞。关卡里停着的着陆舱可登舱，关门、反推点火、起飞离场，过渡后进入主世界城区（AI 城市 2），着陆舱在星舰交通中心旁的着陆场缓慢降落、开门，角色从左侧舱门走出后交还控制。

## Non-goals
- 不改穿越走廊、尾焰、声音与机房关卡抵达着陆的表现。
- 不改城区/原野拓扑、存档格式。
- 不做原野落点；星舰目的地不加“主世界”。

## Acceptance Criteria
- 三个机房关卡出生点旁都停着着陆舱（星舰抵达后与直接进入关卡都在），走到舱门按 E（或点按钮）确认“返回主世界”后：角色走进舱、关门、起飞上升离开画面，期间输入锁定、世界冻结或不伤害玩家。
- 过渡后进入主世界城区，着陆舱从空中缓慢降落在交通中心旁的着陆台，开门后角色走出到出生点，键盘控制恢复；降落期间输入锁定，E 登舰/传送/建造/暂停无效。
- 着陆台在直接进入主世界时也存在，不与城区构件或交通中心模型重叠。
- 星舰目的地列表只有三个机房关卡。
- 着陆测试场能直接重放主世界着陆，并能测试关卡起飞返回。
- 舱体、材质、喷焰、粒子复用 524 共享模块，不复制一套；逻辑层保持纯净。

## Constraints
- 遵守 AGENTS.md 分层、编码、测试与验证规则；渲染效果浏览器人工验收。
- 525/526 改过的装配文件（residence-app、game-app、transit-station）只改本任务相关段落。

## Decisions
- 落点（用户选择）：星舰交通中心旁边的着陆场地（城区透视场景内），不落原野。
- 探索结论：交接 `transit-handoff.start` 固定启动 game-app，主世界需按目的地分支改为启动 residence-app；residence-app 缺 presentation 入口（progress/error/ready 闸门）。城区发射再抵达城区 = 新建第二个城区实例，旧实例 ready 后释放（与机房目的地相同）。着陆舱几何/喷焰/粒子/姿态计算可复用，状态推进（SimWorld.podLanding、stepSim）与角色摆位（player-forms 外层组）绑定 sim，城区需另接：steer 钩子逐 tick 推进、gameplay.update 之后改写 rig.root、perspective-controls 透传 closeup 与 droneEscort。着陆期间需屏蔽 E 登舰、传送、建造、去原野出口。
- 落点坐标（主代理决定，用户已定“交通中心旁”）：站局部 x −3（世界 −82），位于 −9 与 3 两个花槽之间、候车亭左侧，不扩大保留用地、不动存档；深度保持关卡里的相对关系 z = groundLaneZ + LANDING_POD.z ≈ −0.1，舱整体落在铺装上；出舱终点 exitX = −9.3，走出后深度回到车道 3.3。着陆台做成常驻场景物体（直接进入主世界也可见）。

- 方案（architect）：着陆状态机抽成纯模块 `src/sim/pod-landing.ts`（PodLanding、placeInPod、podAltitude、podLandingPhase、carryInPod、POD_WALK_INPUT），机房 stepSim 与城区 perspective-controls 固定步长共用；`createLandingPod(stage, host)` 改为宿主无关（landing/body/step/planeZ/cameraDistance/carry），游戏写外层组偏移、城区写 rig.root。交接对 main-world 分支启动 residence-app 新入口 `startResidenceArrival(presentation)`，先画一帧、等 ready、揭幕后才启动 rAF 与下降。主世界目的地沿用当前网址的 seed/size/gm（城区这三项只存在网址里，丢掉会让原野换世界）；机房目的地保持现状。备选“跳过 gameplay.update 由城区自摆角色镜头”否决：要重写跟随镜头、HUD、无人机与步行物理，行为会和关卡分叉。
- 测试：纯函数为行为不变的搬迁，由 facility-chapter 现有三关着陆用例覆盖；城区接入为 DOM/镜头/渲染，浏览器验收，不新增用例。
- 无停止条件（无存档迁移、无外部影响、用户已定落点），直接实现。

- 需求澄清（用户）：“主世界飞其他世界用星舰飞，其他世界回主世界用登陆舱飞”。星舰目的地不放“主世界”；机房关卡里停着的着陆舱可再次登舱，起飞返回主世界，抵达后在交通中心旁着陆场按已实现的城区着陆流程降落。已实现的城区着陆、宿主无关着陆舱、startResidenceArrival 保留复用；星舰目的地中的 main-world 项撤掉（着陆测试场改为独立选项保留主世界着陆测试）。
- 机房关卡里着陆舱常驻停在出生点旁（直接进入关卡也在，开门状态），保证随时能回主世界（主代理默认）。

- 审查修正：城区读完 landing 后立即从网址删除（防止进原野时 game-app 抛错、回城重放）。城区→城区两实例共存时雨雪湿润着色器对模块级共享材质注入两次导致编译失败（useProgram: program not valid），precip-surface 去重集合改为模块级，并补复现用例（test/precip-render.test.ts）。

- 返回方案（architect，主代理选定）：关卡升空离场后整页跳转到 `./?mode=game&landing=1`（带上当前 seed/size/gm），与原野回城区的整页跳转先例一致；否决页内交接（game-app 无 dispose 路径、模块级状态与全局监听、交接需旧场景持续渲染、双 WebGL 上下文）。起飞 = 着陆时间线倒放（ticks 递减），纯逻辑加 parkedPod/POD_BOARD_INPUT/canBoardPod/podTakeoffPhase/liftInPod，sim-world 加 podTakeoff 分支；startResidenceArrival 无调用方后删除，揭幕闸门改由 startResidence 在 landing=1 时接加载层淡出（scene-loading.hide 返回 Promise），顺带修好测试场着陆前段被加载画面遮住。舱前确认用新 ui/pod-return-prompt（照 npc-dialogue 写法，E 键捕获拦截）。星舰交接对所有目的地带上 seed/size/gm，便于返回时带回。
- 实现偏差（engineer）：canBoardPod 只在出口附近（exitX−2 到 exitX+0.3）成立，而非整段 exitX..舱轴——起飞倒放走出路径，从路径中段登舱会让舷梯深度与特写镜头在确认瞬间跳变。起飞时随行无人机走到座位后随舱体升起（droneEscort 不再返回 hidden），否则已存在的无人机会悬停在原舱地板高度。

- 返程过渡（用户要求）：“飞回去切换也是穿梭画面，只是差一些，没那么夸张”。着陆舱升空后接一段温和版时空穿梭画面，跨整页跳转延续到城区加载完成后揭幕、再开始着陆。实现：复用 transit-time-corridor 的着色器做独立全屏穿梭层（自带画布与渲染器，强度降低），机房页舱飞出画面后淡入约 1–1.5 s 再跳转；城区 landing=1 启动时以同一穿梭层作加载背景，ready 时淡出；两页之间底色与穿梭层一致以减少闪白。

- 审查修正（起飞死锁）：变身中或受击硬直时确认登舱，起飞分支跳过 stepPlayerTransform/tickHealth，updatePelican 把登舱输入换成中性输入，永远停在 walk。beginPodTakeoff 照传送 preparePlayer 取消变身、连招并清硬直（比隐藏提示更稳：任何进入路径都不会死锁），补复现用例。
- 返程穿梭实现：走廊着色器抽成 createTimeCorridorMaterial 共用，uReducedMotion 更名 uCalm（星舰仍取 0/1，行为不变），返程层取 0.5 并跳过入口加速段；城区 landing=1 时不显示星盘加载页，进度文字写在穿梭层上，失败时撤掉穿梭层改显示加载页的失败与重新加载。

- 起飞表现（用户要求）：“飞回去也有尾焰，也有加速够了突然飞走那个，只是效果差一些”。起飞时反推/主喷焰明显（强于着陆），升到顶后加一段渲染层“突然加速飞走”（短时急加速冲出画面、喷焰拉长变亮、轻微视角冲击，强度约为星舰的三分之一），之后再淡入穿梭层；纯表现，逻辑层 gone 后仍冻结。

- 起飞表现实现：起飞喷焰在关门后点火（点火冲高约 1.27 后回到满推力，爬升中再加一点），长度大于着陆最大值，点火时一次地面扬尘；特写镜头在起飞时随舱上升并在顶点平滑停住。sim 冻结后渲染层自走一段飞走：先以爬升末速度续升并加推力（0.25 s，减少动态 0.1 s），再按 a·t³ 急加速冲出画面，喷焰随速度拉长，视角按星舰 24·punch³ 的三分之一（+8°）冲击后 0.8 s 回落（减少动态不冲击；星舰无抖动，不加抖动）。LandingPod 只新增 launched()。未采用星舰合并主喷焰：机房 GTAO 会把它写深度的宽芯压成灰色条纹。
- 穿梭层改为加载期隐藏预建（createReturnCorridorOverlay(parent, shown) + show(seconds)）：浏览器实测新建 WebGL 渲染器同步卡 2 s 左右，放在飞走瞬间会把急加速冻住；城区 shown=true 行为不变。frame-loop 把机房背景视图更新挪到着陆舱更新之后，否则视角冲击首帧背景视图用旧视角，画面两侧露黑边。

- 返程穿梭画面要能看见舱的发动机喷口（用户：“衔接时候看不见发动机喷口”）：照星舰穿越的同轴底部视角，穿梭层里渲染着陆舱（共享舱体与反推喷口/喷焰构建，不另做模型），镜头在舱下方仰视，喷口与尾焰朝镜头；机房页与城区加载页一致。

- 增补 32–34（用户：“着陆仓,玩家站在他2个格子附近都可以按 e”“穿梭舱底太丑，和星舰完全不是一个东西”“星舰内部太简陋，应和着陆舱公用，更真实”）：延续本任务授权；三行文件互不重叠，并行派发；渲染效果由用户验收。
- 登舱范围实现（32）：canBoardPod 范围改为 [exitX−2, 舱轴 + 舱裙最大半径（由 LANDING_POD.skirt 推导，2.8）+ 2]，仍要求在地且与舱同高；SimWorld 新增 podBoarding，出口右侧确认时世界冻结、自动向左走到出口后转为 podTakeoff，渲染端 takeoff() 不变；game-app 与 tile-scene 的提示在 podBoarding 期间隐藏。堡垒舱右侧 x=54 起为深渊，可登舱范围由“在地”条件自然截止在深渊边缘（约舱轴 +3.7），其余两关全程可走。

- 座舱内饰（34）：内饰抽成 `transit-cockpit.ts` 的 createCockpitInterior，由共享 createCrewSection 调用，星舰与着陆舱同源；着陆舱原先没有舱内灯，暖色顶灯与屏幕冷光两盏点光源移入共享函数（星舰 createCabin 的旧灯删除）。内容从舱外可读的面出发：后舱壁与环绕舱壁软包（CanvasTexture 绗缝）、环肋与灯带、后壁环境状态屏与开关板、顶部开关板、白壳座椅带头枕/五点安全带/右扶手手控器；仪表台两侧屏朝向驾驶员、中屏近乎平放，避免挡住舷窗里的角色；左侧不放扶手以让出舱门到座位的走线。屏幕共用一张 CanvasTexture 图集，静态件按材质 mergeStaticParts 合并且不投影，贴图随材质 dispose 事件释放（两条 dispose 路径无需改）。

- 舱底重做（33）：星舰喷管钟口（外套/内壁/发热唇口/ENGINE_CORE_SHADER 喉部）抽成 transit-center-model 的 createNozzleBells，星舰与着陆舱共用（星舰几何与热度计算不变）；舱底改为中心 + 四周共五个 0.8 倍星舰喷管，穿过开孔的隔热罩，出口在罩下 0.04，侧视仍用平面喷焰（宽度随喷管放大）。穿梭层调用 podBody.cruise：隐藏支脚、分层热喉、导出的 createCruiseExhaust 截面尾流；火花用 transit-center-fx 导出的 createExhaustEmbers/updateCruiseEmbers，喷口光与边光取星舰巡航同值；镜头改为星舰定格的舱下 23、fov 38。辉光来源已查清：uProgress 只调走廊暖色相位，与辉光无关；星舰画面的亮区来自走廊透镜环与叠加尾流经舞台后期的 HDR 色调映射与 bloom，故穿梭层改走 EffectComposer（HalfFloat → UnrealBloom 取 DEFAULT_LIGHTING.bloom → OutputPass），不另写辉光。截图里的橙色矩形是乘员舱舷梯门槛（伸出舱壁 0.24）被旧的橙色喷口光照亮，穿梭层按名隐藏。
- 增补 35（用户：“返程穿梭时候玩家没站立好…点击发射后玩家似乎在操作敲击键盘，而且要正面看上去好像坐下了”）：延续本任务授权。
- 入座实现（35）：新增 `grassy/grassy-seated.ts` 的 seatGrassy(holder, time)，在 animateGrassy 采样 idle 后改写骨骼（大腿前平、小腿下垂、躯干微前倾、头部看屏微动、双臂两骨 IK 伸到键盘并翻掌、交替起落敲击），背上键盘随胸部变换；改写由 motionPose.restore 下一帧撤销，不新增动作片段、不改模型。以 KeyboardWeapon 定位 Grassy 模型，因此机房 player-forms 外层组、城区 rig.root、星舰 rig.root 共用同一入口。座位原点 COCKPIT_SEAT 与操纵台键盘托（keysTile 并入屏幕图集）放在共享 transit-cockpit.ts；键盘托高于舷窗下框，正面能看到双手敲击。星舰 cabinAnchor 改到座位原点、朝向 0（正对操纵台与镜头），非地面/电梯/登舱阶段全部坐姿打字；着陆舱 PodCarry 增 typing（null 为站立），降落到开门完成前、起飞到达舱轴后坐在座位，yaw 为相对行走朝向的四分之一转（降落 +π/2、起飞 −π/2），站起后走出/走进沿用原 SEAT_TURN 逻辑。坐下与站起直接切换，不做过渡。背上键盘坐下时穿过座椅靠背，只在背后视角可见，未处理。
- 增补 36（用户：“安全带弄好点，敲键盘稍微矮了点，应该是点击发射才开始敲击”）：着陆舱降落阶段坐着不敲（不是玩家发起的操作）。
- 入座细化实现（36）：安全带改为深色织带（CanvasTexture 织纹 + 两侧缝线）的五点式收纳形态：肩带从头枕两侧开口穿出、沿靠背外缘垂下，带金属调节扣与插舌，腰带两半沿坐垫两侧，裆带接旋转扣在坐垫前沿；收纳位置在坐姿身体之外，不随坐/站切换显隐。键盘托抬到地板上 1.8、手位肩高靠近（肘约 90°），手肘下沉、两手分开。seatGrassy 增 dt 与 typing：未发射时双手放在大腿上，typing 时伸到键盘敲击，双手位置、肘向、敲击幅度按每个 rig 的权重 0.4 s 平滑插值；星舰 phase !== 'cabin'（点击发射后）才敲，着陆舱 PodCarry.seat 带 typing，起飞为真、降落为假。
- 增补 37（用户：“主火箭发射的时候，拉近一下看看玩家敲键盘，然后再继续”“拉进去然后赶快恢复”“感觉比较生硬”“时间没处理好”）：特写叠加在原发射镜头之上，按点击发射后的时间用 smootherstep 混合（0–0.8 s 推近、停到 1.4 s、1.4–2.6 s 拉回，止于点火 1.0 s，远早于离地）；位置沿直线移动但距离按几何插值，画面放大速率均匀，不在靠近时猛冲；推近期间底层全景冻结（不再一边后退一边推近），特写完全遮住时底层直接跳到发射取景，拉回落在静止画面上；retract 的底层取景与点火相同；特写画面高 5.5、俯视 0.2 rad 越过舷窗下沿露出手和键盘，减弱动效时不俯视。
- 起飞飞出前角色“掉一下再弹回”（用户报）：根因是 entity-views 的 createFootSink 踏阶缓动——liftInPod 让着地身体原地竖直上升，每帧升高超过补偿回收速度（1/0.12 s）时被当成台阶压低视图，堡垒舱顶速 11.25/s 时滞后累积到 −0.86，停升后 0.12 s 内弹回。修法：踏阶补偿只在有水平移动时触发（原地竖直托举不是台阶）；复现用例加在 test/entity-contact-pose.test.ts（随舱竖直升起时视图高度逐 tick 等于身体高度）。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1–12 | （城区着陆一期，见上方 Decisions） | 已完成 | | ✓ |
| 13 | src/config/transit.ts | 撤掉 main-world 星舰目的地 | | ✓ |
| 14 | src/app/transit-handoff.ts | 删 main-world 分支；所有目的地带 seed/size/gm | 13 | ✓ |
| 15 | src/sim/pod-landing.ts | parkedPod、POD_BOARD_INPUT、canBoardPod、podTakeoffPhase、liftInPod | | ✓ |
| 16 | src/sim/sim-world.ts | podTakeoff 字段、beginPodTakeoff、stepSim 起飞分支 | 15 | ✓ |
| 17 | src/render/transit-landing-pod.ts | 显式 pod 参数、takeoff?、倒放插值、burst/released、起飞 yaw | 15 | ✓ |
| 18 | src/app/scene-loading.ts | hide() 返回 Promise | | ✓ |
| 19 | src/app/residence-app.ts | 新签名、删 startResidenceArrival、startResidence 着陆闸门 | 17, 18 | ✓ |
| 20 | src/ui/pod-return-prompt.ts | 舱门提示与确认对话框 | | ✓ |
| 21 | src/ui/facility-chapter.css | 提示样式 | 20 | ✓ |
| 22 | src/app/game-app.ts | 常驻停舱、提示、暂停、起飞完成后跳转城区 | 15, 16, 17, 20 | ✓ |
| 23 | src/app/landing-lab.ts | 主世界选项、起飞返回按钮 | 13 | ✓ |
| 24 | test/facility-chapter.test.ts | 三关起飞用例 | 15, 16 | ✓ |
| 25 | src/render/transit-time-corridor.ts + 新 src/render/return-corridor-overlay.ts | 温和版独立全屏穿梭层（共享着色器） | | ✓ |
| 26 | src/app/game-app.ts | 舱飞出画面后淡入穿梭层再跳转 | 25 | ✓ |
| 27 | src/app/residence-app.ts | landing=1 时穿梭层作加载背景，ready 淡出后着陆 | 25 | ✓ |
| 28 | src/render/transit-landing-pod.ts | 起飞喷焰加强、顶点后急加速飞走、视角冲击 | | ✓ |
| 29 | src/app/game-app.ts | 飞走结束后再淡入穿梭层并跳转 | 28 | ✓ |
| 30 | src/render/transit-landing-pod.ts | 抽出舱体+反推喷口/喷焰共享构建 | | ✓ |
| 31 | src/render/return-corridor-overlay.ts | 穿梭层内渲染舱底同轴视角与喷焰 | 30 | ✓ |
| 32 | src/sim/pod-landing.ts、src/sim/sim-world.ts、src/app/game-app.ts、test/facility-chapter.test.ts | 舱体（含舷梯）两格内均可按 E 登舱并显示提示；不在出口时先自动走到出口再倒放起飞 | | ✓ |
| 33 | src/render/transit-landing-pod.ts、src/render/return-corridor-overlay.ts、src/render/transit-exhaust.ts | 返程穿梭画面舱底照星舰巡航镜头重做：发热喷管喉部、同轴尾流截面、火花、喷口光、收起支脚 | | ✓ |
| 34 | src/render/transit-center-model.ts、新 src/render/transit-cockpit.ts | 星舰与着陆舱共用的乘员舱内饰做细：座椅、操纵台、屏幕、顶板、内衬与舱内灯光 | | ✓ |
| 35 | src/render/grassy/*、src/render/transit-landing-pod.ts、src/app/transit-pilot.ts、src/render/transit-cockpit.ts | 舱内入座：星舰与着陆舱共用坐姿，坐在座椅上、双手在操纵台键盘上敲击（发射/起飞后），正面看是坐着 | | ✓ |
| 36 | src/render/transit-cockpit.ts、src/render/grassy/grassy-seated.ts、src/app/transit-pilot.ts、src/render/transit-landing-pod.ts | 安全带做成真实织带；键盘与敲击手位抬高；只在点击发射/确认起飞后才敲击，之前坐着不敲 | 35 | ✓ |
| 37 | src/app/transit-station.ts | 发射时镜头推近看敲键盘，起飞前拉回 | 36 | ✓ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | ✓ |
| node --test test/facility-chapter.test.ts test/architecture.test.ts test/transit.test.ts test/perspective-player.test.ts | yes | ✓ |
| npm test | yes | ✓ |
| npm run build | yes | ✓ |
| 浏览器：城区着陆、着陆测试场主世界、机房着陆不回归 | yes | 部分 ✓（城区 landing=1、独立交通中心页飞往主世界、堡垒着陆；城内发射未测） |
| 浏览器：堡垒变身中登舱→起飞→穿梭淡入→城区穿梭加载→揭幕着陆走出；星舰飞往堡垒走廊不变 | yes | ✓ |
