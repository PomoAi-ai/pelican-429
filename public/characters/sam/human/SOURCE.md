# Sam 人形态

- 角色：The Model Router，与 Sam 白鼬形态共用身份、身高和技能效果。
- 静态来源：已认证的 Hyper3D Rodin CLI，任务 `[private generation ID removed]`；原始文件保留在 `assets/characters/sam/human/rodin-original/source.glb`。
- 四方向输入：`assets/characters/sam/human/reference/{front,left,back,right}.png`。参考图是绘制概念；此目录的 `render-*.png` 是最终绑定模型的真实渲染。
- 可编辑源：`assets/characters/sam/human/sam-human-rigged.blend`。
- 运行文件：`sam-human.glb`，Z-up 的 Blender 源导出为 glTF Y-up，正面 +Z，脚底 0，身高 2.7，约 3.086 头身。
- 骨架：16 根骨，无动物尾骨；人体关节由实际 Rodin 网格截面和正侧面标定。权重最多 4 个影响，手部按网格连通区域识别以保护拇指，裤裆连续区域跟随骨盆。
- 动作：`idle`、`walk`、`run`、`jump`、`greet`、`skill1`、`skill2`、`ultimate`。走跑采用实测脚底和 rest joints 的离线腿部 IK。
- 待机：较明显的胸口呼吸、头和手臂轻动，以及 `Blink` / `BlinkTravel` 眼睑形变；眼睑投射到原眼球表面，皮肤色来自原贴图，原脸部顶点不被眨眼拉动。
- 轮廓：参考左右侧面并非严格一致，按共同容差收敛头部纵深，保留正面五官宽高与原 UV。
- 眼睑精修：固定眼角和外缘，只调整 1476 个眼睑顶点的 `Blink` / `BlinkTravel`，减少闭眼外圈凸起并保留内部曲面间隙。身体基础属性、UV、权重、PBR贴图与全部八个动作采样逐字节保留；近景前后对照和保全报告在 `assets/characters/sam/human/evidence/refinement/`。精修脚本为 `scripts/blender_npcs/refine_human_eyes.py`，重建配方 `human_eyes.py` 已同步。
- 运行表现：游戏和展示场共用随机眨眼、轻微头胸呼吸、跑步前倾、动作缓动与连续转身，不再只依赖待机片段眨眼。

重建：

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender_npcs/human.py --
```

测量与验收：`assets/characters/sam/human/landmarks.json`、`build-report.json`、`evidence/animation/`、`evidence/fit/`。现有白鼬模型及动画文件未被覆盖。
