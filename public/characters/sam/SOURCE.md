# Sam · The Model Router

- `reference-{front,back,left,right}.png`：四向绘制参考，来自 `output/imagegen/animal-npc-turnaround-v5/sam/`；独立生成的图存在轻微轮廓差异。
- `render-{front,back,left,right}.png`：从同一实际模型、同一比例和脚底基线渲染的四向图。
- `sam.glb`：2.70 格高的骨骼蒙皮模型，含 `idle`、`walk`、`run`、`jump`、`greet`、`skill1`、`skill2`、`ultimate` 八个动作；待机包含呼吸、眨眼和自然摆动。
- 原始来源为获授权的付费 Rodin 私有任务 `[private generation ID removed]`，采用四向参考、Gen-2.5 High/Faithful 和 2K PBR 材质。原始下载保存在 `assets/characters/sam/rodin-original/`，形体校准、绑定与动作在本地制作。
- 可编辑源为 `assets/characters/sam/sam-rigged.blend`；四向实测与人工审查记录在 `assets/characters/sam/fit-rigged/`。
- 模型、尺寸与动作统一由 `src/config/npc.ts` 和 `src/render/npc/` 管理，展示场直接调用共享资源。

设计保留棕色发型、蓝灰色眼睛和温和表情，采用白鼬的口鼻、短爪、黑色尾尖与紧凑身体比例。

四形态共用 `npc-pose.ts` 的动作衔接、连续转身及随机眨眼：走跑和战斗中均驱动 `Blink` / `BlinkTravel`，停顿时保持头胸微动，跑步增加轻微胸椎前倾。保留原技能片段、释放时刻与战斗速度。白鼬 GLB 未重导出；表现修正在游戏和展示场的共享层生效。动作录像在 `assets/characters/sam/human/evidence/refinement/browser/four-forms-motion.mp4`。

## 人形态

- `human/reference-{front,back,left,right}.png`：根据用户提供的人形与照片参考绘制的四张独立方向图，完整提示词保存在 `assets/characters/sam/human/reference/prompts.md`。
- Rodin CLI 任务 `[private generation ID removed]`：Gen-2.5-High、Quad、目标 18,000 面。实际源模型为 20,606 顶点、36,167 三角形，含 PBR 贴图，保存在 `assets/characters/sam/human/rodin-original/source.glb`。
- 人形和白鼬沿用同一身份、身高与技能配置，分别保存资源；脸部、短棕发、蓝灰眼睛、灰毛衣与左胸路由徽章保持一致。
- `human/sam-human.glb`：2.70 格高、约 3.09 头身的独立人形，16 骨无尾；包含原有八动作、呼吸与真实眼睑眨眼。手部按网格连通区域绑定，避免拇指误跟随裤腿。
- `human/render-{front,back,left,right}.png`：最终绑定模型的真实四向图；可编辑源为 `assets/characters/sam/human/sam-human-rigged.blend`。
- 人形的关节标定、四向对照和动作验收保存在 `assets/characters/sam/human/landmarks.json` 与 `assets/characters/sam/human/evidence/`。
