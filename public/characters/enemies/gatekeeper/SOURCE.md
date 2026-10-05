# 欧米 OMI-01

- 形象：`assets/concepts/omi-01-actions/approved-character.png` 中间机器人，白/藏蓝装甲、青色腹板、琥珀单环眼、大头短四肢、双夹爪。
- 模型：`scripts/blender_enemies/build_omi.py` 本地机械分件重建；所有装甲刚性绑定单个关节，双夹爪分别开合。
- 可编辑文件：`assets/characters/enemies/gatekeeper/omi-rigged.blend`。
- 原始旧 Rodin 资源保留在 `rodin-original/`。本次 Rodin 请求超时且未返回任务 ID，未重试；不把本地模型标为 Rodin 结果。
- 静止高度 2.6，脚底 0，游戏 +X 朝前、Y 向上。
- idle 4 秒：双脚固定，胸甲呼吸式伺服起伏，独立头/眼扫描。
- move 1 秒；skill1/skill2 各 98/60 秒；hit 0.6 秒。
- `head` 骨负责头部；`eye` 骨位于头中心、控制曲面面罩上的独立眼环，可供运行时战斗注视覆盖。
- front、side、thumbnail、move、skill1、skill2 均由同一模型实际渲染。
