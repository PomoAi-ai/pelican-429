# PLAN -- 跟随作业无人机替换为 V29 定稿造型

## Status: done
## Task: 523
## Related: 512, 515, 516
## Baseline Commit: a13fdd68

## Goal
游戏内跟随作业无人机（家园作业机与 HUD 跟随机共用）替换为 V29 定稿造型：
- 拉丝不锈钢流线车身（原定珍珠白，验收后改为星舰材质）、顶部提手、深海军蓝底盘；四个粗轮圈外露轮子装在摆臂上，飞行时上收贴车身两侧。
- 短颈可升降的大眼头：软杯眼罩、深色大镜片、细青色虹膜、下垂眼睑（以 V26 c-soft-cups 为准，侧视短圆，不是长筒）。
- 两只折叠臂（沿用现有工具臂/软臂能力）；侧面青色灯带；前部暖橙灯；状态色。
- 腹部单圈大能量喷射口：直径约机身宽 75%，细钢圈 + 水晶透镜 + 旋转青色能量核心；飞行时向下柔和青色能量场，侧面只露一线光。
- 尺寸约 1 格长、0.8 格高。
- 材质复用 src/render/transit-surface.ts 的本地反射环境与拉丝纹理，解决“银色发灰没质感”。

设计依据：assets/concepts/follow-drone-final-v29/views.png、scene.png；assets/concepts/follow-drone-eyes-v26/c-soft-cups.png；实时原型 assets/concepts/follow-drone-prototype-v16/index.html。

## Non-goals
- 碰撞体积（不穿方块）与两台无人机防重叠：另立任务。
- 跟随行为、家园作业模拟逻辑不改。
- 不改玩家、交通中心等其他模型。

## Acceptance Criteria
- 游戏、家园、住宅透视、展示场中的无人机全部显示新造型，来自同一共享模块。
- 地面行驶轮子滚动；飞行时轮子上收、腹部能量场出现、侧面仅一线光；落地复原。
- 眼睛会眨，头部朝向目标；工具臂/软臂与工具切换仍可用；状态色（对话黄、作业等）仍生效。
- 游戏视距下（1080p 约 60 px 宽）能读出眼睛与车身轮廓；银白材质有高光反射，不发灰。
- npm run typecheck、npm test、npm run build 通过。

## Constraints
- 逻辑层不变；只改表现层共享模块与其装配。
- 工作区有其他任务的未提交改动（交通、城市等），本任务只动无人机相关文件；transit-center-model.ts 正被其他任务修改，不碰。
- 渲染效果由人在浏览器验收，不写渲染自动测试。

## Decisions
- 探索结论：无人机全部由 src/render/utility-drone.ts 装配；5 个加载点（game-app、facility-app、residence-app、room-scene-preview、scene-demo-stage）都能拿到 stage.renderer；homestead-view 通过 fleet.create() 使用 rig.update(pose) 并在 rig.root 挂货箱（y=-0.38）与 429 牌（y=0.75）；测试未引用 GLB 或节点名；light-texture 会给 MeshPhysical 打补丁且保留自发光；avoidPlayer 直接改材质，所有部件须在调用前挂上 root。
- 原点约定不变：rig.root 为车身中心，落地时轮底在 y=-0.34，机头 +X。drone-locomotion、perspective-controls、homestead 停机位都依赖此约定，逻辑层零改动。
- 建模方式：程序化 three.js（同交通中心），不再加载 GLB。理由：腿收放、颈升降、眨眼、腹部能量透镜都要逐帧驱动；V16 实时原型已验证此做法在游戏视距下可读；去掉 Blender 导出往返。public/robots/utility-drone/model.glb 删除，RELEASE_MODEL_PATHS 同步移除，SOURCE.md 改写为程序化来源说明。
- 接口：loadUtilityDroneFleet(scene) 改为同步 createUtilityDroneFleet(scene, renderer)，返回值与 UtilityDroneRig/UtilityDronePose 签名不变；5 个调用方各改一行。整个 fleet 调一次 createTransitSurface(renderer)，所有 rig 共享几何与材质，fleet.dispose 统一释放。
- 顶部能量环（createDroneEnergy）随旧造型删除；喷气改为腹部能量场，复用 createDroneExhaust 的体积着色器，缩短变柔，挂在腹部透镜下。
- 状态色作用在侧面灯带与颈部灯；眼睛虹膜保持青色。工具臂沿用现有动态软臂（改为深海军蓝），工具头程序化：夹爪、小圆锯。
- 跳过 architect：改动集中在一个共享渲染模块，接口与约定已由探索确定，几何方案已在 V16 原型验证；未遇到需用户决定的分叉，无停止条件，直接实现。
- 原画资料库新增 V29 条目不在本任务范围。
- 目视调整（用户验收反馈）：眼睛放大（眼半径 0.13）；车身保持正侧不偏转，仅头部朝镜头转 0.6 rad 以露出镜片；整机放大 1.35 倍（模型组缩放并上移 0.34·(SCALE−1)，轮底仍在 -0.34，逻辑层不变）；家园停摆“429”牌随之抬到 y 1.05。
- 材质与尾焰（用户验收反馈“材质丑、喷气不好看，参考星舰”）：车身、眼杯、眼睑改用星舰船体同款拉丝不锈钢（metalness 1、roughness .18、拉丝粗糙度/法线贴图、本地反射 .82），镜片外圈与腰线板缝用深海军蓝描边，取消珍珠白；腹部尾焰由体积雾改为星舰尾焰写法的三片交叉平面（流动噪声外鞘、白热核心、下行能量环），实现留在 drone-energy.ts，不改 transit-exhaust.ts。
- 造型与尺寸重做（用户验收反馈“形状不对、太方、游戏里太小”）：放弃圆角方盒与 SCALE 缩放，按 V29 六视图重建——车壳为侧视轮廓 ExtrudeGeometry（平顶、斜车头、两个紧包轮胎的轮拱）、侧面深蓝腰带嵌状态灯带、块状越野胎（Lathe 截面外圈交错顶出）、整体双筒眼头（Lathe 镜筒 + 深蓝后盖）、短关节颈与粗提手、腹部钢圈与螺旋核心；飞行时轮子上收内缩、钢制侧舱盖合拢。模型建在地面 y=0 的空间、整体 ×1.1 后下移 0.34，车长约为人物身高 0.58、总高约 0.47（按场景图），逻辑层贴地约定不变；头部朝镜头转 1 rad；尾焰加宽为向下张开的锥形光束；家园“429”牌抬到 y 1.45。
- 照 V29 侧视定稿重建（用户反馈“和原画不是一个东西”）：回到原画的奶油白亮面漆（clearcoat）配深蓝亮面件，不锈钢只留工具；车身分层为圆顶上壳（大倒角拉伸，车头圆收）、深蓝腰带嵌灯带、奶油白下侧板、深蓝底盘与车头面板加琥珀灯；每个轮子上方独立奶油白挡泥板（压扁的半环）；宽越野胎、深色轮辋、发光青环与浅青轮心；粗 ∩ 形管状提手；深蓝球形颈关节两侧青环；双筒头放大 1.12，镜筒前段斜切成软杯眼罩、镜片内缩；飞行时轮子内缩、奶油白侧舱盖合拢后隐藏轮子。整体 ×1.05，车长约为人物身高 0.58。V29 定稿图与 V26 眼睛已收入原画资料库（companions/utility-drone-v29）。
- 张望（用户反馈“眼睛应该转来转去地看”）：无作业目标时每 1.2–3.5 s 随机换一次张望方向（偏航 -0.6…+0.4 rad 叠加在朝镜头的 0.9 rad 上，俯仰 -0.22…+0.14），眼球以 0.35 倍偏差先转到位、头再跟上；有作业目标时仍盯目标。
- 飞行不收轮（用户反馈“收起轮子不科学，空间根本不够”）：去掉侧舱盖与收轮动作，飞行时四轮保留，只随悬挂下垂 0.03；车身整体抬高 0.06，离地间隙由 0.06 加倍到 0.12，轮子仍着地。
- 去掉车顶提手（用户要求）。
- 审查（reviewer-general）无 Critical；采纳 3 条 Non-critical：轮速改回 distance·cos(rotation.y) 并计入 SCALE、能量核心材质加 noLightMap、资料库 SOURCE.md 不再指向已删 GLB。

## Implementation Map (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/render/utility-drone.ts | 程序化 V29 模型、共享材质、动画（轮滚动/收轮/颈/眨眼/软臂/工具/状态色/腹部能量） | - | Done |
| 2 | src/render/drone-energy.ts | 删除顶部能量环，喷气改为腹部柔和能量场 | - | Done |
| 3 | src/app/{game,facility,residence}-app.ts、room-scene-preview.ts、scene-demo-stage.ts | 改调 createUtilityDroneFleet(stage.scene, stage.renderer) | 1 | Done |
| 4 | src/config/web-models.ts、public/robots/utility-drone/（删 model.glb、改 SOURCE.md） | 移除旧 GLB 发布项与来源说明更新 | 1 | Done |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | Done |
| npm test | yes | Done（2009/2009） |
| npm run build | yes | Done |
| 浏览器目视：住宅演示白天地面 | yes | Done |
| 浏览器目视：飞行、夜晚、家园作业 | no | 待用户验收 |
