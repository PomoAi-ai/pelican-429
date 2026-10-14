# PLAN -- D1 头发头部细节、鞋子、眨眼与动作

## Status: implementing
## Task: 395
## Related: 393, 394
## Baseline Commit: d2d72f4

## Goal

在 394 着色器基础上，让 D1 模型与动作接近原画 `public/art-library/d1-seven/character-seven-views-slim-legs-v1.png`：
1. 头部与头发几何细节（发型轮廓、刘海、两侧编发、脸型/眼部）向原画靠拢；
2. 穿衣/装备版走路、跑步时鞋子正确跟随脚部（不穿模、不变形）；
3. 眼睛会眨眼（眼睛画在头部贴图上，需要闭眼/半闭眼图）；
4. 调整 idle/walk/run/jump 动作。

## Non-goals

不改身体体型与服装外形；不换渲染引擎、不新增运行时依赖；不改其他角色；不提交推送。

## Acceptance Criteria

- 头部与头发：正/侧/背与原画对比栏并排时发型轮廓、刘海分缕、两侧编发明显接近原画；几何与材质先给用户看并确认再整链重导出。
- 鞋子：outfit/equipped 版 walk/run 逐帧鞋子随脚刚性移动，无脚部穿出、无鞋体拉伸。
- 眨眼：游戏与展示场共用实现，按随机间隔眨眼，闭眼形态来自绘制的图片，不出现眼白/虹膜残留。
- 动作：四个动作在浏览器验收自然，支撑脚不滑、头发不穿身体。
- Blender 链 validate 脚本、typecheck、npm test、build 通过。

## Constraints

- 唯一运行时依赖 three；逻辑层不碰渲染；展示场与游戏复用共享模块。
- 渲染、动画由人在浏览器验收，不写着色器/动画细节测试。
- Fail-fast，不加防御性兜底。
- Rodin 额度无限、效果优先；用户的 CPA API key 不写入任何文件。
- 资源修改在 body-v2 Blender 资产链脚本中完成，重导出 6 个 D1 GLB 与派生。

## Decisions
- 探查：三个 explorer 子代理因会话额度限制（429）中断，改由主会话直接探查；architect 同理跳过，设计由主会话依据下列证据完成。
- 鞋子根因（浏览器侧面走路截图 + Blender 逐相位渲染）：`body-v2/outfit-v3/animate_outfit.py:61` 把整只靴子刚性绑到 foot 骨（`{'foot.L':1}`）。走/跑时脚踝屈伸，小腿前后摆出靴筒外，靴筒仍竖直——小腿看起来在靴子外面。鞋底贴地校验（minZ、支撑脚误差）本身通过。修法：鞋底与鞋面保持 foot 刚性，靴筒按静止姿态高度在脚踝关节上方渐变到 shin 骨；validate 增加靴筒包住小腿的检查（小腿表面点不出靴筒）。Workbench 渲染里鞋底露出的紫色是 `D1.Covered.shoe` 遮挡面（运行时 alpha 0 隐藏），不是问题。
- 眼睛（用户：侧面眼白太多，眼球要能动，可单独模型）：改为独立眼部网格。从头部网格复制眼区面片（沿现有虹膜椭圆拟合范围，含睫毛线），沿法线外移少许作为 `Eye.L/R`，UV 重映射到椭圆坐标系；头部贴图眼区重画为肤色。眼部材质新角色 `eye`：眼眶帧图集（睁/半闭/将闭/闭，RGBA：眼白、睫毛与眼睑线，alpha 为眼裂形状）+ 独立虹膜图（可按注视偏移平移、被眼白遮罩裁切）。眨眼与注视由 d1-rig 每帧更新实例 uniform，游戏与展示场共用。图集用 Python 按现有虹膜画法绘制以保证与眼位精确对齐，先给用户看图再接入。
- 头部与头发：上一版发型（Rodin b42a6dcd）README 已记录“发束比原画粗、细发丝少、刘海分缝可见发帽边缘”。按用户要求重新生成候选（Rodin，额度无限、效果优先），参考用原画七视图的 FACE FRONT / FACE RIGHT / BACK / HEAD TOP 裁切；几何先给用户看并确认后再进入装配链。此项为停止点（用户要求先审几何）。
- 眼睛实现（与上条原方案的差异）：贴片不从头部面片复制，而是在 head-look 里按网格投射到头部表面再沿法线抬起 0.004，作为 Head 的第二个材质 `D1 eye`（下游脚本按对象名处理，Head 哈希断言在各步内部自洽）。眼部坐标用绕头部竖轴的弧长而非 x：外眼角绕到侧脸，正面投影在那里采样稀疏，侧看睫毛拉出横向条纹。图集 2×2 四帧（睁/半闭/将闭/闭），从贴图像素更多的一只眼采样，另一只镜像共用；半闭/闭眼由上下眼睑曲线逐列平移睫毛带生成。虹膜不进图集，在着色器里按原画色画（深蓝→青渐变、外圈、瞳孔、两点高光），注视偏移 + 视差（虹膜在眼白后 0.35 虹膜半径）让侧看时虹膜移向外眼角、眼白变少。头部贴图眼区在眼部坐标里 push-pull 填肤色。眼部材质半透明 + polygonOffset，不画描边。眨眼/注视计时在 d1-rig `update(dt)`，展示场改调它。
- 头发：用户否决 Rodin 旧版（正面看不到编发、侧面编发扁、遮耳、分缝露发帽边缘）与混元头发拟合候选，要求自己重做。改为 Blender 程序化建模（hair-v2）：发束沿头顶中分线起根、按球面大圆梳向两侧，过头骨最宽处后竖直下垂并外扩成短发；编发为三股参数化编织；头皮底层抬到发束下方并在发际线收回，分缝处不露边缘。
- 头发（最终）：用户要求改用 Hyper3D Rodin 重新建模。参考图为 gpt-image 按原画重绘的白底正/右/背/右前四视图（`references/hair-v3-*`），在同一资产（0eb6a0de，对称）上重做 7 版；用户逐版对比后选第 5 版（正面刘海偏分、两侧编发、背面中间自然下垂，轮廓最圆润；右侧编发偏宽、左侧有一小尖角为已知差异）。拟合在 `body-v2/hair-rodin/fit.py`：发套内腔比头骨扁，单靠缩放清不掉穿插，按旧发型外轮廓缩放后把穿进头骨的顶点沿径向软外推；第一次进展示场用户反馈“头发不贴合”（两侧发梢外张、后脑鼓出），第一次全方向压缩把后脑那把头发压没了（用户：“后面很大一把头发去哪儿了”），改为只压脸前与两侧、后脑与头顶不动；头顶高度保持（装配按含头发总高 3.1 归一）；接回 Rodin 法线贴图补发丝细节；贴图亮度压到运行时色带。尖角下面的发束是开口的，删除或压平都会露洞，保留原样。程序化 hair-v2 不再接入链路。
- 头发与原画差距（用户：“区别太大了”）：颜色按原画侧面发色中位数与暗部亮度重新校准头发着色参数；Rodin 的鱼骨编发块与原画两条细辫差别最大，用户选混合改造：`hair-rodin/braids.py` 压平鱼骨块、补细发束、加两条三股辫，删耳朵扇区发束露耳。
- 白色内衣被染成肤色：身体材质整张按皮肤着色，暖色暗部与透光作用到全部像素。改为暗部色、透光只跟肤色遮罩走，非肤色白色像素用衣服的白布校色（`d1-anime-material.ts`）。
- 展示场角色操作栏从 5 行压到 2 行：动作与播放控制一行，模型选项与图片资料一行，状态文字隐藏（与标题、动作按钮重复）。
- 静态检查用的 `d1-base-static.glb` 走普通材质，没有虹膜着色器：本次不复制到 public，展示场静态版保留上一版（眼睛仍画在贴图上）。
- 顺序：鞋子（独立、可先验证）→ 眼部网格与眨眼图集（给用户看图）→ 头发/头部候选（给用户看）→ 确认后整链重导出 → 动作调整。

## Implementation Map (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | body-v2/outfit-v3/animate_outfit.py | 靴子：鞋底/鞋面绑 foot，靴筒 z .15–.26 平滑过渡到 shin | | ✅ |
| 2 | public/characters/human/customization/d1-outfit-game.glb、d1-equipped-game.glb 与派生 | outfit→equipment 链重跑（CHAIN_OK）后复制并重建派生 | 1 | ✅ |
| 3 | body-v2/head-look/build.py | 眼部贴片网格、眨眼四帧图集 eye-atlas.png、头部贴图眼区补肤色 | | ✅ |
| 4 | src/render/grassy/d1-anime-material.ts | `eye` 着色角色：图集帧、着色器虹膜、注视与视差；prepareD1Model；眼部不描边 | 3 | ✅ |
| 5 | src/render/grassy/d1-rig.ts、src/app/showcase/stage-actor.ts | 眨眼与注视计时，rig.update(dt) | 4 | ✅ |
| 6 | public/characters/human/customization/d1-base-*/outfit/equipped 与派生 | 整链重跑后复制 5 个动画 GLB 并重建派生 | 3 | ✅ |
| 7 | body-v2/head-look/eye-frames/、public/art-library/d1-blink/、src/config/art-library.ts | gpt-image 绘制睁/半闭/将闭/闭四帧，按虹膜中心配准进图集；四帧放入原画资料库 | 3 | ✅ |
| 8 | src/render/size-ruler.ts、src/config/showcase.ts、src/app/showcase/stage-actor.ts 等 | 角色展示场“标尺”actor：0–4 格刻度 + 3.3 头身尺 + 3.1 格顶线 | | ✅ |
| 9 | body-v2/hair-rodin/fit.py、braids.py、head-look/build.py | Rodin 头发（0eb6a0de v5）套到已认可头部、径向软外推、贴图亮度压到色带；head-look 改读它，整链重导出 | | |
| 10 | src/render/grassy/d1-rig.ts、d1-anime-material.ts | 眨眼：合 0.08 s / 停 0.03 s / 睁 0.14 s 缓动，相邻帧在切换中段混合；眨眼时注视冻结，注视按指数趋近 | 4,5 | ✅ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| Blender 链各 validate 脚本（chain.sh CHAIN_OK） | yes | ✅ |
| npm run typecheck | yes | ✅ |
| npm test（1879/1879） | yes | ✅ |
| npm run build | yes | ✅ |
| 浏览器：穿衣版侧面走/跑靴筒、正/3/4/侧面眼睛、闭眼帧 | yes | ✅ |
| 头发/头部 Rodin 候选给用户审 | yes | ✅ |
| 动作调整 | yes | |
