# PLAN -- 主线 Boss 阶段楼层驻军待命

## Status: done
## Task: 186
## Related: N/A
## Baseline Commit: 3a35077（工作区已有大量未提交改动，diff 以本任务涉及文件为准）

## Goal
检查怪物 AI、Tibo/Sam AI 与主线阶段逻辑，修正阻碍主线按“外围清理 → Tibo → 30 秒倒计时 → Sam → 结局选择”推进的问题。

## Non-goals
- 不改 Boss 招式数值、外围守卫配置、存档格式与自由世界敌人行为。

## Acceptance Criteria
- Tibo、倒计时、Sam 三个阶段，楼层驻军不再介入核心战场；已追击的驻军撤回驻点。
- 倒计时期间玩家站在出生点不受驻军伤害。
- 进入 restored 后驻军恢复正常追击（“留在这里”可继续与驻军战斗）。
- 其余阶段行为不变。

## Constraints
- 逻辑层不得依赖渲染/DOM；改动最小；按 AGENTS.md 只加复现用例到 test/mainline.test.ts。

## Decisions
- 跳过 explorer/architect：主线、Boss、敌人 AI 文件共约 1.6k 行，已直接阅读并用无界面模拟验证；改动已逐文件确定。
- 现状核对：六阶段流程、变身锁与提示、Tibo 可打断治疗、Sam 闪现追击、暂停/后台冻结倒计时、阶段重生与存档均已实现，相关 89 个用例通过。
- 缺陷：核心上方 y=42 甲板的两只楼层哨蜂（home 122,42 / 143,42，感知 30、拴绳 80）穿过单向甲板俯冲进 Boss 战场。模拟：倒计时 30 秒原地待命受 230 伤害、倒下 2 次；移除驻军后为 0。
- 方案：EnemyData 增加 `holdPost`，为真时不进入交战、按现有非交战逻辑返回驻点；主线在 tibo/countdown/sam 阶段对非外围敌人置真，其余阶段置假。由阶段推导，不入存档。
  - 未选 `enabled=false`：会把正在追击的哨蜂冻结在战场半空。
  - 未选给敌人加纵向拴绳：会改变自由世界敌人行为。
- 待命驻军被攻击不还手（Boss 对决期间的封锁），已知取舍。
- 无停止条件（不涉及存档迁移/外部影响），直接实现。
- 审查修正：进入待命时同时取消进行中的出招，并在 core→tibo 切换当帧同步，避免追击中的哨蜂在 Tibo 登场后补投一枚炸弹；复现场景并入同一用例。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/entities/enemy.ts | EnemyData.holdPost，交战条件排除 | - | ✅ |
| 2 | src/sim/mainline.ts | Boss 阶段同步驻军 holdPost | 1 | ✅ |
| 3 | test/mainline.test.ts | 复现：倒计时驻军不伤人、restored 恢复交战 | 2 | ✅ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | ✅ |
| npm test | yes | ✅ |
| npm run build | yes | ✅ |
