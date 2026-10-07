# PLAN -- 主角分层短发与可见动态

## Status: completed
## Task: 314
## Related: 311-character-hair-rebuild, 312-grassy-soft-hair, 313-grassy-hair-variants
## Baseline Commit: 2a5455a

## Goal
按最新十帧绘图与原参考第一排重做主角短发，使站立、冲锋、下落和落地的发梢动态可见。

## Non-goals
不修改 Boss、头骨五官、身体模型、战斗或 CI，不提交推送。

## Acceptance Criteria
- 发束根部分散，短弧交错；消除冠顶直落到后颈的长片与贴头帽感。
- 发根与头骨固定，只弯发束；有可见的站立微摆、冲锋后掠、下落上扬与回弹。
- 使用真实共享模型与动画的近景动态预览，不能用绘图冒充实现。
- 类型、测试、构建通过，原 Boss 文件不变。

## Decisions
- 本轮 dev 工作流复用既有资源接入探索；分别委派生成器与动画链路增量探索/设计/实现，无需再次确认可逆实现。
- 动态根因：.11/.13 rad 最大弯角再乘极低扰动，使站立仅约0.2度；几何埋在发帽里进一步遮挡动态。
- 造型根因：发根过度聚集冠顶，大量长发片直落。改为分散根部与错位短弧，A maxBend 前额.30、冠顶.38、后侧.42。
- 调整主角弹簧、扰动并保留 Boss 旧值；临时真实GLB诊断用于量化，不新增渲染结构自动测试。
- 近景页直接复用 loadGrassyAsset/createGrassyRig/animateGrassy，默认固定头部观察气流，也可同时播放身体动作。新造型仍作为 A 选项供查看，B 和游戏默认选择保留以便比较。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|---|---|---|---|
| 1 | scripts/character_hair/* | 重画主角A短发曲线及弯角 | — | done |
| 2 | public/characters/hair/grassy-tousled.glb | 新实际发型 | 1 | done |
| 3 | src/render/hair-rig.ts、grassy/grassy-animator.ts | 可见微摆与回弹，只调主角 | — | done |
| 4 | output/grassy-hair-motion、assets/characters/hair-design | 实际共享模型近景预览与三视图 | 2,3 | done |

## Validation
| Command | Required | Done |
|---|---|---|
| 真实三视图、近景动态及正式展示场 | yes | done |
| 实际GLB发根/头部固定与运动位移诊断 | yes | done |
| npm run typecheck | yes | passed |
| npm test | yes | passed: 1806/1806 |
| npm run build | yes | done |
| 本轮增量审查及 Boss 哈希 | yes | done |

## Results
- A 试版181束，203664三角形，10012188字节；SHA256 `00b632e1b898911b1547a24b842c0b7bf7a7515df158b9ceca47792f370874fa`。B及四个Boss资源哈希与本轮开始前完全相同。
- 最终真实GLB采样8355点：idle峰值.03034、dash .11750、fall .09765；锚定发根位移0，头部四元数/缩放不变。停止气流后有反向回弹，4秒残差小于.000001。
- 浏览器检查固定头部三视图、冲锋/下落气流及可选身体动作；正式展示场A/B加载正常，无错误日志。近景页自动循环已保留。
- npm run typecheck、npm test（1806/1806）、npm run build通过；dist模型哈希与public一致。仅有既存Vite大chunk提示。脚本Python编译及diff whitespace通过。
- 分工审查未发现高置信度问题，模型元数据、刚性发帽与锚点权重通过只读核对。
- 视觉限制：仍偏分片雕塑质感，后颈仍有细条纹；这是可动A试版，并未宣称达到绘图参考的柔软细毛质感。保留B与当前游戏默认选择，便于下一轮比较。
