# 友方工程无人机

程序化 three.js 模型，不再使用 GLB。

- 源码：`src/render/character/utility-drone.ts`（造型、动画、共享材质）；腹部能量尾焰在 `src/render/character/drone-energy.ts`，写法同星舰尾焰（三片交叉平面 + 流动噪声）。
- 设计依据：`assets/concepts/follow-drone-final-v29/views.png`、`scene.png`；眼睛以 `assets/concepts/follow-drone-eyes-v26/c-soft-cups.png` 为准；实时原型 `assets/concepts/follow-drone-prototype-v16/index.html`。
- 材质：奶油白亮面漆与深蓝亮面件（照 V29 原画），复用 `src/render/transit/transit-surface.ts` 的本地反射环境，每个机队共享一份。

约定：机头 +X；落地时轮底在 root 下方 0.34（世界单位，1 = 1 格），与 drone-locomotion 一致。比例按 V29 场景图：车长约 1.7、总高约 1.4（人物身高的 0.58 / 0.47）。造型：圆顶上壳、深蓝腰带与灯带、奶油白下侧板、每轮独立挡泥板、宽越野胎与发光轮心、深蓝球形颈关节、斜切软杯眼罩的双筒头；离地间隙 0.12，飞行时四轮不收，只随悬挂略垂。车身保持正侧，头部转向镜头。
