# PLAN -- Grassy 独立角色卡与展示场

## Status: implementing
## Task: 012
## Related: N/A
## Baseline Commit: N/A（仓库尚无提交，现有文件全部未跟踪）

## Goal
将已确认的合并角色卡制作为人形、鹈鹕形态两张独立图片，并录入 ?mode=showcase，新增可复用的人形模型与六个动作。

## Non-goals
不修改既有鹈鹕模型或游戏逻辑。

## Acceptance Criteria
- 人形保留红毛衣、蓝色牛仔裤；鹈鹕羽毛纯白、嘴尖无黑块。
- 展示场主区显示两张完整角色卡，可查看原图。
- 人形模型提供待机、行走、奔跑、跳跃、编程、眩晕，支持现有播放控制。
- 原有实时动作展示与其他展示模式正常。
- 四方向人形参考图录入，模型支持正面、背面、左右侧及三分之四检查视角。

## Constraints
- 图片直接引用正式源资源，不复制模型、动画或材质。
- 设计获批后开始代码实现；不提交或推送。

## Decisions
- 用户对比最终卡与已入场侧面原图后要求重做，最新基准改为 public/characters/human/turnaround-master-v2/：right.png 原样保存用户上传原图，正面、左侧、背面以此为唯一比例母版重绘为独立透明 PNG。正面初稿头略大、下摆略低，已进行一次定向修正；过程图 front-draft.png 不作为交付基准。按人物全高核对头部占比、后脑厚度、毛衣下摆与裤脚，保留饱满体积；游戏高度仍为 3.1 格。上一版 turnaround-final-3p1 卡片只作历史参考。仅图片和记录更新，未修改模型、动作或场景代码，未运行代码测试。
- 用户要求制作最终多方向图片，已使用内置 image_gen 以已确认四方向原图为参考，分别完成正面、背面、面朝左侧、面朝右侧四张独立 1254 × 1254 PNG，保存到 public/characters/human/turnaround-final-3p1/。沿用约 3.1 头身与既有服装造型，统一标注“3.1头身 · 场景高度 3.1 格”，完整提示词保存为同目录 prompts.txt。仅做视觉复核与文件格式检查，未修改三维模型或动作，未运行代码测试。
- 2026-10-04，用户确认门口与屋外的当前场景效果，最终采用约 3.1 头身、游戏内可见高度 3.10 格（鞋底至最高发梢）。四方向参考固定为 public/characters/human/turnaround-3p1/ 下的 front/back/left/right.png，场景验收截图为 assets/characters/grassy/doorway-reference-3p1-tiles.png。参考图内旧有 2.85 格文字仅作历史记录，以最终 3.10 格为准。保持红毛衣、蓝色牛仔裤、米白鞋与原尺寸鹈鹕；后续先做静态模型，动作继续暂停。现有 GLB 尚未按定稿重建，以下选型过程中的旧尺寸不再作为当前目标。
- 用户要求直接把最新侧面图片放进真实场景。已提供 assets/characters/grassy/side-reference-scene.html，使用右侧原画透明裁切、2.85 格可见高度，与原尺寸鹈鹕并排展示。局部实现和验证记录见 task/025-fix-side-reference-scene/FIX.md。
- 用户选型收敛至 3 与 3.5 之间，进一步要求试画 3.1，并据此开始四方向绘制。最新正面基准为 proportions/grassy-3p1-heads-v2.png；正面、背面、面朝画面左侧、面朝画面右侧分别保存到 public/characters/human/turnaround-3p1/，每个方向一张独立图片。保留红毛衣、蓝色牛仔裤、米白鞋，目标身高 2.85 格。当前仅完成静态绘制参考，未开始动作或恢复三维建模，未运行代码测试。
- 头身比例尚未确定。用户要求约 2、2.5、3、3.5、4 头身各绘制一张独立图片供选择，明确不要合并在同一图片。交付保存到 public/characters/human/proportions/，C/E 采用视觉修订后的 v3，其余采用首稿。五图均为正面静态站姿，目标游戏高度 2.85 格；仅做绘制与视觉复核，没有运行代码或模型测试。待用户选型后再推进四方向定稿与静态建模。
- 按用户最新要求，以场景对照中的 80% 候选尺寸（人形目标高 2.85 格、鹈鹕参考高 2.58 格）重绘静态四方向角色卡。正面、左侧、背面、右侧在同一张卡中统一造型与基线，保存为 public/characters/human/grassy-four-directions-285.png，原参考保留。当前只交付绘制参考，静态模型精修与动作仍暂停；图片以视觉检查验收，不运行代码或模型测试。
- 体型对照页已按用户要求放入默认种子的真实出生渔屋场景；复用 generateWorld、createWorldViews、createStage 和角色资产，三角色按实际地表贴地。可切换游戏视距/门前近景和侧面，候选缩放仅作用于对照实例。只进行浏览器视觉检查，不新增模型断言测试。
- 当前优先级：用户要求停止动作制作，先精修静态模型；随后要求先比较鹈鹕与人形的游戏比例，因此静态精修暂不推进，先交付同地面/同镜头对照。实测鹈鹕可见高2.58、人形3.56，80%人形候选高2.85。对照只改变候选预览，不改变正式角色资产。
- 用户在收到方案后明确要求开始完善录入，并扩大范围为创建人的模型和动作；以最新要求为准开始实现。
- explorer 子代理完成新增范围探索与设计：共享人形 rig + 共享动作播放器 + 轻量展示 session，不新增模拟实体。
- 两张角色卡分别录入 human/pelican 角色图片目录，默认同时选择两角色，复用原有图片大图与动作控制 UI。
- 人形采用黑发棕眼、红毛衣、蓝色牛仔裤、米白运动鞋；鹈鹕复用既有模型。
- 用户要求先绘四方向再细化模型；以正面图统一比例，完善头发、连贯裤管、背面口袋与坐姿。继续使用共享 Three.js 模型，无需安装外部建模软件。
- 用户否定程序化人形的还原度，已授权安装 Blender 并开始重建。最终改用 Blender 连续网格、骨骼蒙皮与动作导出 GLB，保存可编辑 .blend；之前程序化人形不再作为交付。
- Blender 重建分工：头脸/发型、身体服装/骨骼、GLB共享加载独立实现；主代理负责参考对照、材质、Blender渲染及展示场视觉验收。
- 没有 HEAD，基线按开始时文件快照与分工列表检查，不使用全仓未跟踪文件作为本任务 diff。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | assets/characters/grassy/grassy-human-card.png | 独立人形卡 | — | yes |
| 2 | assets/characters/grassy/grassy-pelican-card.png | 独立鹈鹕卡 | — | yes |
| 3 | src/config/grassy.ts | 共享六动作目录 | — | yes |
| 4 | src/render/grassy/grassy-rig.ts | 共享人形与编程道具 | — | yes |
| 5 | src/render/grassy/grassy-animator.ts | 共享动作采样 | 3,4 | yes |
| 6 | src/app/showcase/human-session.ts | 人形播放与镜头 | 3,4,5 | yes |
| 7 | src/app/showcase/session.ts | 会话分派 | 6 | yes |
| 8 | src/app/showcase/catalog.ts | 模拟角色类型缩窄 | 7 | yes |
| 9 | src/config/showcase.ts | 人形目录与动作录入 | 3 | yes |
| 10 | src/config/character-assets.ts | 两张角色卡归档 | 1,2 | yes |
| 11 | src/ui/character-assets.ts | 新角色卡分类与图片地址 | 10 | yes |
| 12 | src/ui/showcase.css | 竖版卡完整预览 | 11 | yes |
| 13 | src/app/showcase-app.ts | 初始同时展示两主角形态 | 9 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | no |
| npm test | yes | no |
| npm run build | yes | no |
| 浏览器检查两卡、原图与窄屏 | yes | no |
