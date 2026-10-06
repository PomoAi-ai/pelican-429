# Tibo 人形态

- 角色：The Reset Master，与 Tibo 怪物形态共用身份、身高和技能效果。
- 静态来源：已认证的 Hyper3D Rodin CLI；原始 PBR 文件保留在 `assets/characters/tibo/human/rodin-original/source.glb`，生成记录位于同目录。
- 四方向输入：`assets/characters/tibo/human/reference/{front,left,back,right}.png`。参考图是绘制概念；此目录的 `render-*.png` 是最终绑定模型的真实渲染。
- 可编辑源：`assets/characters/tibo/human/tibo-human-rigged.blend`。
- 运行文件：`tibo-human.glb`，Z-up 的 Blender 源导出为 glTF Y-up，正面 +Z，脚底 0，身高 2.65，约 3.107 头身。保留黑帽衫、侧分棕发、胡须笑脸和解剖左胸的重置徽章。
- 骨架：16 根骨，无动物尾骨。关节来自实际 Rodin 网格的正侧面和截面测量；权重最多 4 个影响，手部按网格连通区域绑定，裤裆连续区域跟随骨盆。
- 动作：`idle`、`walk`、`run`、`jump`、`greet`、`skill1`、`skill2`、`ultimate`；共用 Tibo 的动作设计，重置动作把手移动到胸前。走跑使用实测脚底和骨架 rest joints 的离线腿部 IK。
- 待机：胸口呼吸、头和手臂轻动，以及 `Blink` / `BlinkTravel` 眼睑形变。眼睑投射到实际眼球表面，皮肤颜色来自原贴图；原脸部顶点不被眨眼拉动。
- 四向校准：头部纵深收紧 1%，颈部平滑过渡，正面宽高和原 UV 保留。独立生成的左右参考存在约 4.2% 的轮廓宽度差异，按共同身高和躯干位置对齐比较。
- 眼睑精修：固定眼角和外缘，只调整 1476 个眼睑顶点的 `Blink` / `BlinkTravel`，减少闭眼外圈凸起并保留内部曲面间隙。身体基础属性、UV、权重、PBR贴图与全部八个动作采样逐字节保留；近景前后对照和保全报告在 `assets/characters/tibo/human/evidence/refinement/`。精修脚本为 `scripts/blender_npcs/refine_human_eyes.py`，重建配方 `human_eyes.py` 已同步。
- 运行表现：游戏和展示场共用随机眨眼、轻微头胸呼吸、跑步前倾、动作缓动与连续转身，不再只依赖待机片段眨眼。

重建：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender_npcs/human.py -- --kind tibo
```

测量与验收：`assets/characters/tibo/human/landmarks.json`、`build-report.json`、`evidence/animation/`、`evidence/fit/` 和 `evidence/export-verification.json`。现有 Sam 资产和 Tibo 怪物模型及动画文件未被覆盖。
