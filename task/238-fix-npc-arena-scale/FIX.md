# FIX -- 统一 Boss 与 NPC 的角色比例

## Status: done
## Task: 238
## Related: N/A
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem

Boss 场地里的 Sam / Tibo 明显小于普通 NPC 和主角。两种形态应保持同一游戏比例，身体碰撞高度小于 3 格，头发可以略高。

## Root Cause

`src/render/npc/wanderer-view.ts` 仅将普通 NPC 外层缩放到主角的 3.1 格视觉高度；Boss 和战后 NPC 没有这一步，直接使用源模型的 2.7 / 2.65 格。源资产尺寸被误当成游戏表现尺寸。

## Fix Plan

- [x] 在共享 `createNpcRig` 仅归一内部 model 到主角视觉高度，保留原始 GLB 尺寸校验与技能世界坐标。
- [x] 删除 wanderer 的重复外层缩放，让普通 NPC、Boss、战后 NPC 及展示场共用同一尺寸。
- [x] Boss 身体使用主角的 2.8 格碰撞高度；画质比较镜头采用实际视觉高度。
- [x] 核对武器世界握点、变身和发射源坐标未被重复缩放。武器握点读取缩放后的手掌世界位置，外观保持 UNIT 世界尺寸；路由源仍为 3.55 格，effects 不随身体缩放。

## Verification

- [x] 浏览器同场主角、Boss、普通 NPC 和战后 NPC 对比；实际 Boss 场召唤 Sam/Tibo 均验收，无控制台错误。
- [x] `npm run typecheck` 通过。
- [x] `npm test` 1766/1766 通过（86.77 秒）。
- [x] `npm run build` 通过（3.72 秒；已有大 chunk 提示）。
- [x] scoped diff-guard：无新增兜底、防御检查或实现细节测试；四个生产文件仅修改共同表现比例及对应身体/镜头高度。

额外静态检查：直接读取四个源 GLB 动画 channel，均无模型场景根节点的 scale 动画，不会覆盖共享入口设置的比例。源模型文件与配置尺寸未改动。

浏览器网格实测（同一站立采样、包含头发、不含武器/飞行器）：主角 3.101 格、Sam 怪物 3.106 格、Tibo 怪物 3.102 格；人形采样分别 3.099、3.101、3.096 格。呼吸引起约百分之一格内变化；三者碰撞身体均为 2.8 格。战后人形与普通 NPC 等高。

证据：boss-size.png、npc-size.png、postfight-size.png；真实 Boss 场 arena-sam-before.png、arena-sam-after.png、arena-tibo-after.png。临时验收页面已移除。

## 全入口统一复核

- Boss 场与主线 Boss（含存档恢复）均由 createBossEntity 创建 2.8 格身体，通过 createBossView 使用共享 rig。
- 自由世界 NPC 与战后 NPC 共用 createWandererView，已无入口额外缩放。
- 角色展示舞台、历史场景卡片、双形态切换通过 createNpcTransformation 使用同一共享 rig。
- 画质对比的所有纹理档位通过 createNpcRig 使用同一 3.1 格视觉比例，取景高度也已同步。
- 对话气泡与姓名标签按统一视觉高度定位；头像和四方向参考图是图片，不参与世界尺寸。
- 源 GLB 的 2.7 / 2.65 格只用于加载校验及归一化分母，不再作为场景中的角色尺寸。
- 本轮只复核入口并补充记录，未新增生产改动，不重复运行上一轮已通过的验证。
