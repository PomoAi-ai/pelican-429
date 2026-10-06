# PLAN -- 自由世界区域天气

## Status: done
## Task: 293
## Related: N/A
## Baseline Commit: 072a48e

## Goal
自由世界不同地貌具有不同天气，随实际位置变化，复用现有降水与风场。

## Non-goals
不新增天气资源、依赖或改动主线天气，不提交或推送。

## Acceptance Criteria
- 营地、林地、湖泊、沙漠、空岛与设施有符合环境的降水区别。
- 步行、飞行、快速旅行都依据实际位置更新，手动天气仍能覆盖。
- 模拟中的降雨补水与当地降水一致；同种子可复现。

## Constraints
保留工作区已有未提交改动；遵守分层和既有渲染平滑过渡。

## Decisions
- 将“不同”理解为自由世界不同区域；背景区域采样器移动到 world，天气与背景共享权重及高度规则。
- 营地晴/小雨、林地晴/小中雨、湖泊晴/中大雨、沙漠晴、空岛雪、堡垒雨夹雪；教堂、深渊及有顶洞穴无自动降水。
- 复用 precipAutoAt；level.seed 混合区域盐值错开周期，profiles 在创建时缓存。
- createSimWorld 显式接收 freeWorldWeather 的原始 level 与 ground，检查起点覆盖 spawn 时仍使用原始营地位置；复用 app 已计算地表，避免逻辑层依赖 render 或复制地表算法。
- 自动模式按玩家实际位置生成视觉天气，补水按各实体当地天气与遮挡判断；环境命令和 tick 使用同一解析。
- 自由世界缺省 auto；保存设置和 URL 保留优先级，手动覆盖不变，风场机制不变。

## Implementation Map
- world/free-world-background-regions.ts、world/free-world-weather.ts：共享地貌与当地天气。
- sim/environment.ts、sim/sim-world.ts：创建缓存采样器，统一天气解析与各实体补水。
- app/game-app.ts、app/settings-wiring.ts：显式开启自由世界天气与默认 auto。
- config/game-settings.ts、ui/settings-panel.ts：中英文说明。
- test/precip-sim.test.ts：位置/高度/周期/确定性/手动覆盖/各实体补水行为；背景测试同步 import。

## Focused Verification
- node --test test/free-world-backgrounds.test.ts：3 项通过。
- node --test test/precip-sim.test.ts：19 项通过（初次导入路径错误已修复）。
- 新行为用例会捕获按全局天气补水、忽略高度/洞穴、失去手动覆盖或周期不再变化的回归。

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes，最终修复后通过 |
| npm test | yes | yes，1801/1801；最终检查起点修复后重跑相关降水19/19 |
| npm run build | yes | yes，498模块；保留大chunk告警 |

## Review and browser verification
- core-review / diff-guard 发现检查起点覆盖 spawn 导致营地边界偏移，已改为显式传原始 level，相关行为用例通过，审查复核通过。
- 浏览器确认湖畔、空岛与沙漠加载及快速旅行可用，沙漠无雨雪，控制台无 error；未逐一人工验收所有区域和完整天气周期。
- 全量测试的存储失败报错来自预期异常用例；Node localstorage 路径与构建大 chunk 为非阻断告警。
- git diff --check 通过；已有其他任务改动保留，未提交或推送。
