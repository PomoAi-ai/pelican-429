# PLAN -- 星舰飞往主世界：着陆舱落在交通中心旁的着陆场地

## Status: implementing
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
| 33 | src/render/transit-landing-pod.ts、src/render/return-corridor-overlay.ts、src/render/transit-exhaust.ts | 返程穿梭画面舱底照星舰巡航镜头重做：发热喷管喉部、同轴尾流截面、火花、喷口光、收起支脚 | | |
| 34 | src/render/transit-center-model.ts | 星舰与着陆舱共用的乘员舱内饰做细：座椅、操纵台、屏幕、顶板、内衬与舱内灯光 | | |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | ✓ |
| node --test test/facility-chapter.test.ts test/architecture.test.ts test/transit.test.ts test/perspective-player.test.ts | yes | ✓ |
| npm test | yes | ✓ |
| npm run build | yes | ✓ |
| 浏览器：城区着陆、着陆测试场主世界、机房着陆不回归 | yes | 部分 ✓（城区 landing=1、独立交通中心页飞往主世界、堡垒着陆；城内发射未测） |
| 浏览器：堡垒变身中登舱→起飞→穿梭淡入→城区穿梭加载→揭幕着陆走出；星舰飞往堡垒走廊不变 | yes | ✓ |
