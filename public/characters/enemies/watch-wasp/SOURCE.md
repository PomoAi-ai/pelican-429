# 哨蜂正式模型

## 生成与来源
- 2026-10-06 使用用户授权的 Hyper3D CLI / Rodin 现有订阅额度生成 1 个正式白壳无人机；未购买额度。
- Generation ID: `[private generation ID removed]`。
- 参数：Gen-2.5-High、Raw、60,000、texture-delight、PBR GLB。
- 输入：`assets/concepts/watch-wasp-final/production-input.png`；美术定稿参考 `compact-drone-views.png`。
- 原始下载：`assets/characters/enemies/watch-wasp/rodin-compact/source.glb`，生成参数及 SHA-256 记录于同目录 `request.json`。
- 旧黑电池 Rodin 源仍在 `rodin-original/source.glb`；上一版本地平壳模型、脚本、Blend 与实际预览保存在 `compact-local-backup/`。

## 本地制作
- 保留正式源模型的白色装甲、板缝、通风口、碳架与四电机，未使用上一版平整替换壳。
- Blender 按电机铜线圈测量四个旋翼轴，替换不可控原桨叶并清理切割后 3 处游离桨尖；新增干净轴帽，提供双叶/三叶网格切换。
- 源模型青色灯面独立为 `Wasp light` 材质，电机细环和桨尖使用 `Wasp accent`；白壳 PBR 纹理保持固定，10 套随机饰色继续由 `src/config/drone-appearance.ts` 控制。
- 机械绑定 6 个骨骼：root、camera、rotor0—rotor3。导出 idle / move / skill1 / skill2 / hit 五动作；skill1 共 100 帧、57 帧释放，skill2 共 253 帧、72 帧释放，按 60 fps 与战斗配置同步。
- 规范：+X 朝前、脚底 0、静态总高 0.8。`model.glb` 同时用于游戏与展示场。
- 构建脚本：`scripts/blender_enemies/build_wasp.py`；可从保留的正式源重新生成最终模型。
- `front.png`、`side.png`、`thumbnail.png` 均为最终实际模型的正面、侧面与三分之四视角渲染。
