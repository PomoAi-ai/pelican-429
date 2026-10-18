# 友方工程无人机

原创 Blender 游戏模型，采用已选定的 A 轨道能量环与 C 流线银色外壳方向。

- 建模源：`assets/concepts/follow-drone-modeling-v11/build_drone.py`
- 可编辑文件：同目录 `utility-drone.blend`
- 实际渲染：同目录 `compact.png`、`extended.png`
- 方向参考：`assets/concepts/follow-drone-variants-v10/a-orbital.png`、`c-biomimetic.png`
- 游戏资产：`model.glb`，glTF Y-up、前向 +X；不包含渲染棚灯光和地面。

银色外壳使用金属度 0.85、粗糙度 0.25。顶部开放能量槽和两段悬浮金属弧，无机械风扇。四个轮胎主体直径 0.56，胎纹略突出；外置轮心 Blender 坐标 `(±0.79, ±1.0, -0.25)`，无轮罩。固定悬挂和滚动部分分离。

运行节点：`utility_drone`、`body`、`wheel_fl/fr/rl/rr`、`tyre_spin_fl/fr/rl/rr`、`tool_mount`、`tool_gripper`、`tool_cutter`、`soft_arm`。`rotor_upper/lower` 保留为空节点。`soft_arm` 是长软臂参考形态，游戏使用共享动态软臂替代。

新增特效锚点（以下为 Blender Z-up 坐标）：

- `energy_core`：`(0, 0, 0.30)`；游戏生成能量场。
- `energy_crown`：`(0, 0, 0.62)`；独立悬浮弧环。
- `exhaust_nozzle`：`(0, 0, -0.30)`；唯一中央喷口，开口半径约 0.21，向 -Z 排气。

轮胎绕 glTF Z 轴滚动。青蓝 `drone_cyan` 与可变状态灯 `drone_status` 导出自发光强度扩展；实时能量、气流由共享 `src/render/utility-drone.ts` 负责。
