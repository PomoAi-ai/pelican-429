# PLAN -- Sam 与 Tibo 原地双向变身

## Status: completed
## Task: 152
## Related: 130
## Baseline Commit: e5fb3bf（并行修改以 /private/tmp/npc-transform-baseline 文件副本补充核对）

## Goal

Sam 与 Tibo 在人形和怪物形态之间原地直接变身，过程不缩小、不放大，保持脚底、站位和朝向。

## Non-goals

- 不修改主角 Grassy 与鹈鹕的变身。
- 不增加新技能、敌人或正式游戏实体逻辑。

## Acceptance Criteria

- 两人都有真实人形和怪物模型，沿用各自八动作和技能。
- 变身为短暂、清晰的同尺寸外观过渡，没有整个人缩放或消失后重建场景。
- 双向可播放和重播，加载、暂停、快速切换与释放资源正确。
- 新旧展示入口复用同一个游戏渲染模块与资源。
- 浏览器检查两个方向和动作，typecheck、全量测试及 build 通过。

## Constraints

- 现有动物与 Sam 人形定版模型保留。
- Tibo 人形通过已授权的 Rodin CLI 真实生成，按实际网格测量绑定；不得用占位模型冒充。
- 不提交、推送或改动其他任务；渲染效果不用实现细节自动测试。

## Decisions

- 使用 dev 工作流；Ponytail Full 已由会话注入。
- Sam 人形资源齐全，Tibo 目前仅有人形概念四视图。补齐 Tibo 人形是本次双角色变身的必要前置。
- 展示入口已迁移到 startCharacterStage，探索同时覆盖新入口和旧多卡模式。
- 图像、Tibo 绑定、共享变身模块并行推进；主线程负责 CLI 生成、接入验收及最终验证。
- 采用 0.5 秒窄带表面过渡，两套骨骼同时取样当前动作，保持尺寸、脚底和朝向；材质仅按实例克隆，几何与贴图继续复用。
- 切换形态不增长动作 revision，不销毁角色或重新布局镜头；独立重播变身，暂停和慢放沿用现有控制。
- 正式游戏调用方保持当前默认形态，本次提供共享变身能力与 Tibo 人形资源，不额外设置游戏变身触发条件。

## Implementation Map

- `render/npc/npc-transformation.ts`：共享双形态过渡、快速反向和资源释放。
- `app/showcase/stage-actor.ts`、`app/showcase/npc-session.ts`：新旧展示入口接入。
- `app/character-stage-app.ts`、`app/showcase-app.ts`、`ui/showcase-model.ts`、`ui/showcase-panel.ts`：稳定实例身份与独立变身控制。
- `config/npc.ts`、`config/character-assets.ts`：Tibo 真实人形资源与共享目录接入。
- `scripts/blender_npcs/human*.py`、Tibo 人形资源：实际网格标定、八动作与眨眼。

## Validation

| Command | Required | Done |
|---------|----------|------|
| 双角色双向变身与动作视觉检查 | yes | yes |
| npm run typecheck | yes | yes |
| npm test | yes | yes · 1642/1642 |
| npm run build | yes | yes · 最终 Tibo 模型再次导出后重建 |

## Result

- 展示场新增每个 NPC 上方的“变身”快捷按钮，详细控制保留形态选择与重播变身。`?mode=showcase&demo=npc-transform` 只放两个角色，便于观看。
- 两人使用 0.5 秒原地窄带表面过渡；根节点尺寸、脚底和朝向不变，快速反向保持当前过渡位置。动作与镜头不因换形重建。
- Sam 浏览器检查覆盖双向、中途反向、慢放、暂停、朝左跑步中变身；Tibo 检查覆盖双向、行走中的反向过渡和变身后闭眼帧。实际截图在两人人形目录的 `evidence/transformation/`。
- Tibo 人形由 Rodin CLI 生成并本地标定；最终为 2.65 格、3.107 头身、16 骨骼、8 动作，带眨眼。四向比例/中心门槛通过，最终 GLB SHA256：`6d3dfe464accdf279bb9e528e6a12b1a99fb2ca4797e3520b8acbedac384a7f0`。
- 子代理复核状态切换和资源释放未发现确定问题；Sam 共 22,082 个顶点在共享绑定脚本提取参数前后权重差为 0，现有 Sam 与 Tibo 怪物模型未改写。
- typecheck、全量测试与 build 通过；最终构建中的 Tibo GLB 与 public 资源 SHA256 一致。构建仍报告现有主包超过 500 kB 的提醒。
- 未提交或推送。正式游戏默认形态及其它并行任务的场景变更保持原样。
