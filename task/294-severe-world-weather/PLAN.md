# PLAN -- 自由世界恶劣天气

## Status: done
## Task: 294
## Related: 293
## Baseline Commit: 072a48e

## Goal
在区域天气基础上增加恶劣天气：更频繁的暴雨、暴雪及按地貌变化的强风时段。

## Non-goals
不新增依赖、独立天气渲染系统或自动伤害机制，不提交推送。

## Acceptance Criteria
- 林地/湖区暴雨、空岛暴雪、堡垒强雨夹雪更常见，并复用现有闪电。
- 自动风随区域和天气强度变化，沙漠可有干燥暴风，洞穴及室内缓和。
- 保留晴天间隔、营地相对温和、手动雨雪/风力覆盖与风力倍率。
- 确定性模拟及原有平滑过渡继续有效。

## Constraints
保留已有未提交改动与前一任务的区域天气实现。

## Decisions
- 地貌采样返回当地降水与自动风目标；林地取消中雨上限，湖泊保留中/大雨、空岛降雪、堡垒雨夹雪。
- 非营地周期的晴天与小雨时长减半、大雨时长翻倍；默认强降水占 100/205 秒，仍有 45 秒晴天。营地继续原温和周期，风不超过中风。
- 风目标随周期强度从微风、中风、大风到暴风；沙漠只驱动干燥风暴，洞穴/教堂/深渊为晴与无风。
- WindController.update 接收自动目标，只在 auto 模式目标改变时开始 modeBlend，持续相同目标不重置；手动模式保留当前覆盖并缓存最新区域目标。
- 玩家每 tick 采样一次当地天气，风/降水自动开关各自独立；其他实体补水继续按自身当地降水。
- 复用已有闪电与暴风空气物理，不新增伤害、龙卷风或渲染系统。
- 本轮开始文件快照位于 /tmp/pelican-weather-before，供审查区分已有改动。

## Implementation Map
- world/free-world-weather.ts：区域强降水周期与风目标。
- world/wind.ts：自动目标平滑切换，保留倍率和风向。
- sim/environment.ts、sim/sim-world.ts：当地天气结构与每 tick 接线。
- config/game-settings.ts、ui/settings-panel.ts：自动风中英文说明。
- test/precip-sim.test.ts、test/weather-wind.test.ts：暴雨/雪/雨夹雪与晴间歇、干燥暴风、室内缓和、过渡完成、手动覆盖与倍率。

## Focused Verification
- node --test test/precip-sim.test.ts test/weather-wind.test.ts：48 项通过。
- 新行为验证会捕获重置风过渡导致永不抵达目标、手动天气错误禁用自动风、倍率/风向丢失及区域强天气永不出现等回归。

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| npm test | yes | yes，1802/1802，301 suites |
| npm run build | yes | yes，498模块；既有大chunk告警 |

## Review and browser verification
- core-review / diff-guard 本轮审查通过，无高置信问题。
- 浏览器抽查 seed=429、lake-3、自动降水与自动风：可见倾斜密集雨丝及强风效果，控制台无 error；未逐一人工验收全部地貌完整周期。
- git diff --check 通过；测试保留既有 Node localstorage 路径告警及预期存储失败输出，构建保留大 chunk 告警。
- 未提交、推送或部署。
