# Tibo · The Reset Master

人形与鼹鼠形态共用 `npc-pose.ts` 的动作衔接、连续转身及随机眨眼：走跑和战斗中均驱动 `Blink` / `BlinkTravel`，停顿时保持头胸微动，跑步增加轻微胸椎前倾。保留原技能片段、释放时刻与战斗速度。鼹鼠 GLB 未重导出；表现修正在游戏和展示场的共享层生效。四形态动作录像在 `assets/characters/sam/human/evidence/refinement/browser/four-forms-motion.mp4`。

- `reference-{front,back,left,right}.png`：四向绘制参考，来自 `output/imagegen/animal-npc-turnaround-v5/tibo/`；独立生成的图存在轻微轮廓差异，胸章以正面为准。
- `render-{front,back,left,right}.png`：从同一实际模型、同一比例和脚底基线渲染的四向图。
- `tibo.glb`：2.65 格高的骨骼蒙皮模型，含 `idle`、`walk`、`run`、`jump`、`greet`、`skill1`、`skill2`、`ultimate` 八个动作；待机包含呼吸、眨眼和自然摆动。
- 原始来源为获授权的付费 Rodin 私有任务 `[private generation ID removed]`，采用四向参考、Gen-2.5 High/Faithful 和 2K PBR 材质。原始下载保存在 `assets/characters/tibo/rodin-original/`，形体校准、绑定与动作在本地制作。
- 可编辑源为 `assets/characters/tibo/tibo-rigged.blend`；四向实测与人工审查记录在 `assets/characters/tibo/fit-rigged/`。
- 模型、尺寸与动作统一由 `src/config/npc.ts` 和 `src/render/npc/` 管理，展示场直接调用共享资源。

设计保留棕色侧分发型、浓眉、胡须轮廓与笑容，采用鼹鼠的口鼻、挖掘爪和紧凑体形，搭配黑色连帽衫与重置徽章。

## 人形与原地变身

- `human/reference-{front,left,back,right}.png`：基于已批准人形四向稿整理的四张独立参考。
- `human/tibo-human.glb`：Rodin CLI 生成的真实 PBR 网格，本地实测绑定，统一为 2.65 格高；包含相同八动作与眨眼。
- `human/render-{front,left,back,right}.png`：由最终绑定模型实际渲染，非概念图。
- 人形源与可编辑工程位于 `assets/characters/tibo/human/`，CLI 来源、标定与验收记录保存在该目录。
- 人形和怪物形态通过共享 `src/render/npc/npc-transformation.ts` 原地切换；不缩放角色，保留当前动作进度。
