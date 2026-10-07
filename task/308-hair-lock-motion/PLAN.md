# PLAN -- 多发束自然运动

## Status: done
## Task: 308
## Related: 302-character-hair-motion, 304-fix-visible-hair-motion, 306-fix-tuft-amplitude
## Baseline Commit: 9f830d6

## Goal
用户要求可见头发都能轻微运动，参考成熟发束动画实现；不局限于顶部呆毛。主角及两个 Boss 共用运动规律，维持角色差异。

## Non-goals
不改变头骨、脸、耳、原始发型，不引入逐根真实毛发求解器，不修改 vendor，不提交推送。

## Acceptance Criteria
- 多个可辨认发束有不同响应，发根固定，站立轻动、走跑滞后、下落上翘、落地回弹。
- 局部遮罩不影响头型、脸或耳，不出现全头同步伸缩。
- 游戏和展示场共享实现；暂停稳定。

## Decisions
- 参考 SideFX Guide Groom 与 Epic Hair Physics 官方资料：以引导发束控制附近头发，根端约束、长度保持、局部阻尼；不以每顶点独立噪声代替发束运动。
- 现资产是融合网格，须依据实际几何核查局部选区，不能声称已有独立毛发语义。
- 使用 dev 流程，子代理完成探索与架构建议后实现；主代理负责浏览器和最终验证。
- 真实 GLB 拓扑检查：主角 game 27,344 顶点、UV 缝焊接后主体只有 1 个连通分量；Sam/Tibo 怪物为主体与两眼睑共 3 个分量，人形主体各 1 个分量。材质、顶点属性与 head 骨权重均无发束语义，不能自动按连通块拆发。
- 人工标定有限 root-tip 引导段，主角 9 撮前/侧/后发束并保留已验收呆毛，Boss 的两种形态分别 7 撮；不使用全冠层高度遮罩或每顶点随机噪声。
- 继续复用 3 组 Sway/Lift 与 HairTurn 共 7 个 morph。每撮围绕自己的根部旋转，根部/末端/径向三向平滑衰减；重叠处连续归一混合，根部衰减同时进入混合权重，避免切换边界。
- 新增发束弯角控制在 .16–.21 rad、局部半径 .043–.072；主角原呆毛 -.85/.60 保留。主角站立驱动基值 .06，Boss .045，明显小于运动驱动。
- 同步生成局部旋转的 normal delta，避免发束弯动但高光静止。Boss 原有 normal morph 槽位由零值改为实际法线，不增槽位内存；主角新增 7 个 normal 数组，CPU 额外内存 game 2.19 MiB、light 1.03 MiB、detailed 31.45 MiB，GPU 另有对应通道成本。不增加按撮分配的整身 morph。

## Implementation Map
- `src/render/hair-sway.ts`：引导段形变、连续重叠混合、法线同步；保留既有 3 组弹簧响应与暂停语义。
- `src/render/grassy/grassy-rig.ts`：9 撮实测局部引导与原呆毛；呆毛同时更新法线。后脑坐标基于精修源已命名锚点，右刘海与左冠侧按实际非对称表面调整。
- `src/render/npc/npc-rig.ts`：Sam/Tibo × monster/human 四份局部引导，避免形态间共用头发坐标。
- `src/render/grassy/grassy-animator.ts`、`src/render/npc/npc-animator.ts`：站立小幅独立起伏，动作输入保持原有定义。

## Geometry Measurements
以真实未压缩 GLB 和生产形变函数计算，以下只计新引导段，主角保留呆毛另计。位移为三组 Sway 同时权重 1，统计阈值为 0.00001 世界单位。

| Asset | Moved vertices | Maximum displacement | Cross-group overlap |
|---|---:|---:|---:|
| 主角 game | 481 | .02594 | 16 |
| Sam monster | 664 | .01819 | 0 |
| Sam human | 562 | .02343 | 0 |
| Tibo monster | 601 | .02777 | 0 |
| Tibo human | 423 | .02868 | 0 |

- 每撮均命中实际顶点，主角前侧、冠侧、后侧均有独立选区；局部根平面之后以外、半径以外与尖端尾部衰减之外为严格零增量。
- 源资产无语义标签，不能仅凭数值范围证明每个像素属于毛发；最终以四向热图、静态头脸耳对照及运动近景验收。站立微动不是每根真实毛发的独立物理解算。
- 临时诊断使用 `output/hair-lock-review/index.html` 前后对照及 `output/hair-guide-mask.html` 三组热图，均不纳入产品代码。


## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器共享模型对照 | yes | yes |

## Validation Results
- `npm run typecheck` 通过；`npm test` 1806 tests / 301 suites 全通过（0 失败/跳过）；`npm run build` 通过，仅既有 chunk 大于 500 kB 提示。`git diff --check` 通过。
- core-review + diff-guard 子代理最终复审通过，无新增高置信问题；本轮法线同步和交叠连续性问题已修复。
- 主代理在浏览器检查五种角色外观的热图、同姿势新旧模型站立/冲锋/下落对照、侧前与侧后视角；可见皮肤与耳朵无选区，新发束收窄后未见大片翻起。正式展示场主角快跑、跳跃切换正常，控制台无错误。
- 临时对照页与热图已删除；产品共享模型/动画链路保持单一实现。未新增自动渲染测试、未提交或推送。
