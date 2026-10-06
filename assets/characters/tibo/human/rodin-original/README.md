# Tibo 人形 Rodin 源模型

- 生成方式：已授权的 Hyper3D Rodin CLI（`hyper3d`）。
- 输入：`../reference/{front,left,back,right}.png` 四张独立参考。
- 参数：`Gen-2.5-High`、`Quad`、`quality 18000`、`glb`。
- `generation.json` 保留首次生成状态；下载结果使用服务返回的 `base_basic_pbr.glb`，保存为 `source.glb`。
- 下载文件：11,223,420 bytes；SHA-256：`163e79c467c1ef57277cc4ced0dc44fdf6a9c30fb234044cf4d9c7ca17776206`。
- 生成接口未暴露隐私参数，此记录不据此声明模型为私有发布。

## Prompt

One single stylized adult male game character, Tibo the Reset Master, matching all four reference views exactly. Same person front left back right, NOT four people. Compact 3.1-head-tall proportions, oversized head, short body and legs. Side-swept layered brown human hair, large brown eyes, thick eyebrows, friendly smile and short brown beard. Black pullover hoodie with small green reset badge on left chest, blue jeans, white sneakers. Neutral standing A-pose, arms gently separated from torso, hands and every finger clearly separated from trouser legs. Both feet flat at same ground plane. Keep clean continuous trouser crotch and anatomically separate legs for animation. No animal ears or tail, no base, no props, no background. Detailed painted PBR game model with clean topology suitable for skeletal rigging.
