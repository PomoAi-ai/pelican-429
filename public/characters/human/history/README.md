# Grassy 历史资料库

正式角色入口：[角色资料](/?mode=showcase)。历史查看入口：[历史资料](/?mode=showcase&library=history)。

完整的各轮制作说明见 [历史制作记录](SOURCE.md)。

这里保存已归档的建模路线、旧比例与四方向原画、局部精修过程和早期呼吸／走路模型。正式角色使用装备版，身高与最终母版维持 3.1 格。

## 网页资源

- 18 个静态模型保留原有材质和几何，在历史页面中直接旋转、缩放和并排对比。
- `models/`、`models-atelier/`、`models-fresh/`、`models-opus55/`：早期程序建模路线。
- `models-reference-fit/`、`models-multiview/`：原画校准与多视图贴图探索。
- `models-rodin/`、`models-rodin-refined/`：Rodin 原始与局部精修版本。
- `models-rodin-animated/`：旧版呼吸与走路，精细／标准／轻量三档 GLB 可下载保存。
- `proportions/`、`turnaround*`、`design-studies/`：旧角色卡、比例与场景对照、四方向设计稿。

## Blender 源工程

源工程与制作过程文件位于仓库 `assets/characters/grassy/history/`，保留原来的各版本子目录名。网页资源位于 `public/characters/human/history/`。旧工程和原始生成文件未删除；工程内已有打包材质随文件保留。

| 路线 | 可编辑源工程（相对仓库根目录） |
|---|---|
| gpt6.1astra 静态 | `assets/characters/grassy/history/model-static/grassy-detailed.blend` |
| Atelier | `assets/characters/grassy/history/model-atelier/grassy-atelier-detailed.blend` |
| Fresh | `assets/characters/grassy/history/model-fresh/grassy-fresh-detailed.blend` |
| Opus 5.5 | `assets/characters/grassy/history/model-opus55/grassy-opus55-detailed.blend` |
| 原画校准 | `assets/characters/grassy/history/model-reference-fit/grassy-reference-fit.blend` |
| 多视图贴图 | `assets/characters/grassy/history/model-multiview/grassy-multiview.blend` |
| Rodin 原始 | `assets/characters/grassy/history/model-rodin/grassy-rodin-detailed.blend` |
| Rodin 精修 | `assets/characters/grassy/history/model-rodin-refined/grassy-rodin-refined-master.blend` |
| Rodin 初版动画 | `assets/characters/grassy/history/model-rodin-animated/grassy-rodin-animated-game.blend` |

完整原路径与归档路径见 [迁移清单](migration.json)。历史脚本的输入／输出路径已同步归档目录，复现旧版本不会覆盖正式装备角色。
