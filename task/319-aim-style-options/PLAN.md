# PLAN -- 三种瞄准样式

## Status: done
## Task: 319
## Related: 315, 318-fix-aim-ui-style
## Baseline Commit: 2a5455a

## Goal
提供范围箭头、落点圆环、金色扇形三种可切换的实际瞄准样式，让用户在现有 UI 中比较。

## Non-goals
不改变技能判定、射程或伤害；提示长度仍表达拖动幅度。

## Acceptance Criteria
- 设置内可切换三种样式，沿用现有保存和校验机制。
- 三种效果使用实际游戏画面核对并截图。
- 保留仅方向技能拖动、长短反馈和多指操作。

## Decisions
- 沿用 weapon-hud 的两个提示元素，仅通过 CSS 切换造型；不新增渲染模块。
- 探索与实现合并：子代理负责既有设置机制，主代理负责已完整探索的瞄准 CSS。接口约定 body.dataset.aimStyle = arrow/ring/fan。
- 架构沿用现有设置与提示投影，跳过单独架构代理；无高风险决策或额外审批条件。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/ui/control-surface.css | 三种造型与统一按钮拖动反馈 | yes |
| 既有设置配置与应用入口 | 样式设置、保存与翻译 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器样式切换及三种截图 | yes | yes |
| scoped review + diff-guard | yes | yes |

## Results
- typecheck 通过；全量 1808 项测试通过，0 失败；构建通过（最后一次 CSS 透明度调整后已重建），保留既有 chunk 体积提示。
- 设置子代理完成既有机制接入；独立审查与 diff-guard 未发现问题。最终箭头仅替换为淡填充矢量轮廓，主代理复核通过。
- 手机横屏 844 × 390 实际触摸拖动截图：arrow.png、ring.png、fan.png。三项设置通过 UI 切换，body 数据属性与实际外观同步。
- localStorage 已保存选择；有 URL 参数时刷新按参数优先恢复。
- 无 URL 参数覆盖时，重新进入页面恢复保存的 arrow 样式，已核对。

## Final Selection
- 用户选定第三种金色扇形；默认值改为 fan，保留既有手动选择与 URL 优先级。
- 默认值调整后：npm run typecheck、npm test（1808 项全部通过）、npm run build 及限定 diff 检查通过。
