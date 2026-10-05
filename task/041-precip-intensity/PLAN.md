# PLAN -- 雨雪独立强度

## Status: done
## Task: 041
## Related: 040-sleet-weather
## Baseline Commit: 无 HEAD；源代码与测试快照 $TMPDIR/pelican-precip-intensity-before

## Goal
将雨量、雪量分开控制，分别选择关闭、小、中、大，自由组合雨夹雪强度。

## Acceptance Criteria
- 天气面板提供独立雨量与雪量选择，选择即时生效并保存。
- 保留自动天气；自动时雨雪手动按钮禁用，切回手动恢复组合。
- 逻辑补水只取雨量；粒子、湿润与积雪分别采用所选强度，共用原游戏系统。
- 同一状态反复更新不重启过渡，自动/手动切换正确。

## Decisions
- 已询问用户独立雨雪或独立雨夹雪三档；等待合理时间后按“雨雪分别调节”的明确假设推进。
- 探索子代理推荐 rain/snow 状态对象，替换互斥模式字符串；不增加组合字符串或旧接口兼容分支。
- 保留现有自动雨雪时间表，模拟和渲染共用独立强度状态。

## Validation
- [x] 类型检查通过
- [x] npm test：1492/1492 通过
- [x] npm run build：通过，仅有产物体积提示
- [x] 独立 core-review / diff-guard 审查通过，无问题
- 浏览器实际视觉验收受前序工具 URL 安全策略限制；不绕过。

## Implementation
- config/sim：两通道状态、自动时间表、补水命令与展示场调用已同步。
- render：独立雨雪目标，字段相等比较，避免自动模式逐帧重启过渡。
- settings/app：降水模式、雨量、雪量三行，保存恢复、网址参数与游戏启动已接线；自动时禁用手动强度按钮。
- 单模块测试：precip-sim 12/12、precip-render 23/23、settings 21/21 通过。

## Delivery
- 设置 → 天气 → 手动 → 独立雨量/雪量。URL 示例：?precip=manual&rain=heavy&snow=light。
- 原互斥降水值已统一替换，无旧别名；旧保存值由现有设置校验提示清理，旧降水网址需要改用新参数。
- 浏览器实际页面未验收，类型/行为测试和构建通过不代表已完成视觉检查。
- 本地服务仍在 5174；未提交或推送。
