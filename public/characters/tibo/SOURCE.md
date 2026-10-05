# Tibo · The Reset Master

- `reference-{front,back,left,right}.png`：四向绘制参考，来自 `output/imagegen/animal-npc-turnaround-v5/tibo/`；独立生成的图存在轻微轮廓差异，胸章以正面为准。
- `render-{front,back,left,right}.png`：从同一实际模型、同一比例和脚底基线渲染的四向图。
- `tibo.glb`：2.65 格高的骨骼蒙皮模型，含 `idle`、`walk`、`run`、`jump`、`greet`、`skill1`、`skill2`、`ultimate` 八个动作；待机包含呼吸、眨眼和自然摆动。
- 原始来源为获授权的付费 Rodin 私有任务 `[private generation ID removed]`，采用四向参考、Gen-2.5 High/Faithful 和 2K PBR 材质。原始下载保存在 `assets/characters/tibo/rodin-original/`，形体校准、绑定与动作在本地制作。
- 可编辑源为 `assets/characters/tibo/tibo-rigged.blend`；四向实测与人工审查记录在 `assets/characters/tibo/fit-rigged/`。
- 模型、尺寸与动作统一由 `src/config/npc.ts` 和 `src/render/npc/` 管理，展示场直接调用共享资源。

设计保留棕色侧分发型、浓眉、胡须轮廓与笑容，采用鼹鼠的口鼻、挖掘爪和紧凑体形，搭配黑色连帽衫与重置徽章。
