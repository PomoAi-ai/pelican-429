# 搬山 / Loadmaster

- 模型来源：用户授权的 Hyper3D / Rodin 订阅，经已配置的 CLI 生成。
- 生成任务：`[private generation ID removed]`。
- 输入：`assets/concepts/enemy-model-input/loadmaster.png`；正侧设计：`assets/concepts/enemy-front-side/loadmaster.png`。
- 原始生成模型：`assets/characters/enemies/loadmaster/rodin-original/source.glb`，未覆盖。
- 制作脚本：`scripts/blender_enemies/build_loadmaster.py`。
- 可编辑场景：`assets/characters/enemies/loadmaster/loadmaster-rigged.blend`。
- 保留 Rodin 网格、UV 与纹理；本地绑定底盘、四轮、肩、肘、腕和双夹爪，共 11 个骨骼节点。
- 动画：idle、move、skill1（蓄力下砸）、skill2（低位横扫）、hit。技能动作分别按 72/12/90 与 54/16/72 帧划分，60 fps。
- 游戏坐标：Y 向上、+X 向前，静止高度 2.8、脚底 0。
- `front.png`、`side.png`、`thumbnail.png` 均由实际绑定模型渲染。
