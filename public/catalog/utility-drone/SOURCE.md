# 跟随作业无人机原画来源

收录日期：2026-10-18。以下为设计迭代保存的 AI 概念原画，逐文件原样复制，未重新生成、裁切或改画。

## 定稿（V29，游戏模型依据）

| 资料库文件 | 制作原件 | 状态 |
|---|---|---|
| v29-views.png | assets/concepts/follow-drone-final-v29/views.png | 定稿多视图 |
| v29-scene.png | assets/concepts/follow-drone-final-v29/scene.png | 定稿游戏场景比例 |
| v26-eyes-soft-cups.png | assets/concepts/follow-drone-eyes-v26/c-soft-cups.png | 眼睛定稿（软杯） |

用户在 V29 后要求“开始制作替换游戏里面那个”。设计依据见原件目录 DIRECTION.md。

## 历史探索（V7–V10）

| 资料库文件 | 制作原件 | 状态 |
|---|---|---|
| v7-energy-concept.png | assets/concepts/follow-drone-modeling-v7/concept.png | 历史探索；小轮、较大黑色区域随后被要求修改 |
| v8-stainless-concept.png | assets/concepts/follow-drone-modeling-v8/concept.png | 历史探索；轮径与不锈钢方向保留，轮拱随后被否定 |
| v9-exposed-wheels-concept.png | assets/concepts/follow-drone-modeling-v9/concept.png | 历史探索；流线体与外置轮，随后增加科幻选型 |
| v10-a-orbital.png | assets/concepts/follow-drone-variants-v10/a-orbital.png | A 磁悬浮能量环候选 |
| v10-b-surveyor.png | assets/concepts/follow-drone-variants-v10/b-surveyor.png | B 精密探测器候选 |
| v10-c-biomimetic.png | assets/concepts/follow-drone-variants-v10/c-biomimetic.png | C 仿生流线体候选 |

设计依据见上述原件目录中的 DIRECTION.md。共同要求：银色拉丝不锈钢、连续流线体、足够侧高、少量黑色、四个外置大轮、不包轮、顶部开放能量核心、底部中央唯一喷口。地面滚动时关闭喷气。

用户要求继续制作并加入游戏；游戏制作采用 A 能量结构与 C 流线外壳的组合。这不等于三张候选原画均已单独确认，也不代表历史稿中被修改的细节继续有效。

assets/concepts/follow-drone-modeling-v11/compact.png、extended.png 是 Blender 模型渲染，game-*.png 是游戏截图，本次不作为概念原画收录。V11 GLB 已停用；游戏模型现为程序化建模，见下节。

## 游戏模型（程序化 three.js）

程序化 three.js 模型，不再使用 GLB。

- 源码：`src/render/character/utility-drone.ts`（造型、动画、共享材质）；腹部能量尾焰在 `src/render/character/drone-energy.ts`，写法同星舰尾焰（三片交叉平面 + 流动噪声）。
- 设计依据：`assets/concepts/follow-drone-final-v29/views.png`、`scene.png`；眼睛以 `assets/concepts/follow-drone-eyes-v26/c-soft-cups.png` 为准；实时原型 `assets/concepts/follow-drone-prototype-v16/index.html`。
- 材质：奶油白亮面漆与深蓝亮面件（照 V29 原画），复用 `src/render/transit/transit-surface.ts` 的本地反射环境，每个机队共享一份。

约定：机头 +X；落地时轮底在 root 下方 0.34（世界单位，1 = 1 格），与 drone-locomotion 一致。比例按 V29 场景图：车长约 1.7、总高约 1.4（人物身高的 0.58 / 0.47）。造型：圆顶上壳、深蓝腰带与灯带、奶油白下侧板、每轮独立挡泥板、宽越野胎与发光轮心、深蓝球形颈关节、斜切软杯眼罩的双筒头；离地间隙 0.12，飞行时四轮不收，只随悬挂略垂。车身保持正侧，头部转向镜头。
