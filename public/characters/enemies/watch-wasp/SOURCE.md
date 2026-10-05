# 哨蜂

- 2026-10-05 使用用户授权且已登录的 Hyper3D CLI / Rodin 订阅生成基础 FPV 网格。
- Generation ID: [private generation ID removed]；Gen-2.5-High，Raw 60,000，PBR GLB。
- 原始输入：`assets/concepts/enemy-model-input/watch-wasp.png`；原始网格保留于 `assets/characters/enemies/watch-wasp/rodin-original/source.glb`，未修改。
- 2026-10-06 按用户选定的低矮白色机身以及 `assets/concepts/watch-wasp-final/compact-drone-views.png` 重新制作外观。Blender 删除旧高电池、绑带、外露线束和旧机头表面，保留源碳纤维底盘与电机；新增连续低矮白色覆盖壳、单侧小散热口、前镜头、银色电机饰面、细灯条及饰色环。
- 白色外壳始终保持白色；`Wasp accent` 和 `Wasp light` 分别用于电机细环/桨尖与灯条。10 套饰色由 `src/config/drone-appearance.ts` 定义，游戏和展示场出生时使用同一配置。
- 双叶/三叶桨片均为本地 Blender 制作，绑定原四旋翼关节，运行时按外观只显示一组。保持 6 个骨骼、idle / move / skill1 / skill2 / hit 五动画、+X 朝前、0.8 高度和脚底 0 的资产契约。
- `scripts/blender_enemies/build_wasp.py` 可从未修改的 Rodin 源重新生成模型；`model.glb` 为游戏和展示场共用资源，`front.png`、`side.png`、`thumbnail.png` 均为最终实际模型渲染。
- 新白壳是在原底盘上的本地几何改造，定稿概念图是美术参考，实际模型预览以上述三张渲染为准。
