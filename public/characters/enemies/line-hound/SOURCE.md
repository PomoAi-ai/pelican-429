# 巡线犬

- 造型依据：项目已确认的正面／侧面设定，`reference.png` 是原画。
- 模型来源：用户授权的 Hyper3D Rodin 订阅服务，任务 `[private generation ID removed]`。
- 原始文件：`assets/characters/enemies/line-hound/rodin-original/source.glb`。
- 制作脚本：`scripts/blender_enemies/build_bipeds.py`，保留源网格、UV、纹理，添加机械骨架与五段动作。
- 编辑工程：`assets/characters/enemies/line-hound/line-hound-rigged.blend`。
- 游戏与展示场共用 `model.glb`；朝向 +X，Y 轴向上，脚底为 0。
- `front.png`、`side.png`、`thumbnail.png` 为此模型的真实渲染，缩略图没有使用原画。
- 动作：待机 `idle`、移动 `move`、技能一 `skill1`、技能二 `skill2`、受击 `hit`；技能释放时间与游戏规则一致。
