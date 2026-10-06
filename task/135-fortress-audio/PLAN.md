# PLAN -- 机房堡垒音乐与音效

## Status: done
## Task: 135
## Related: N/A
## Baseline Commit: 无（当前仓库尚无 HEAD，文件均未跟踪；修改前文件备份于 $TMPDIR/pelican-audio-baseline）

## Goal
实现已确认的机房堡垒声音方案：108 BPM D 小调分层背景音乐、机房环境声、鹈鹕与人形技能、机械敌人及移动/受击动作音，提供声音控制与浏览器交互解锁。

## Non-goals
不改过场序章配乐、vendor 模型、战斗规则；不提交或推送，不增加依赖。

## Acceptance Criteria
- 堡垒关卡可听到探索/战斗配乐与空间环境声，技能和动作即时响应。
- 暂停、隐藏页面、关闭声音与页面退出正确停止声音，恢复无事件补播。
- 同一音色实现可复用，展示场不另复制一套合成器。
- 本地 typecheck、全量测试和 build 通过；浏览器验收交互与生命周期。

## Constraints
遵守分层、fail-fast、只在边界校验和项目测试范围；原生 Web Audio 合成，无外部服务。

## Decisions
- 按既定声音方案自主实现，无需进一步产品裁决。
- 仓库无提交基线，使用修改前备份核对已有文件，新增文件单独审查。
- Explore / Design：子代理追踪模拟和展示场；采用每固定 tick 只读观察动作、每渲染帧复用唯一 drain 的事件广播。探索同时完成架构推荐，无方案分歧，直接 approved / implementing。
- 音源采用 Web Audio 原生合成，32 小节配乐分层，24 拍引子；音效共享单一音源实现，面板试听调用同一模块。
- 播放入口仅机房堡垒，保持现有过场序章与其他章节行为。
- 不在技能起手时预排爆发；真实释放、投弹接地才发爆发。命中停顿通过状态边沿去重。
- 音乐、动作、环境独立调音；首次用户手势解锁。暂停/静音/后台释放声部，恢复不补播。
- 观察器 4 项行为用例保护停顿去重、超载取消、跳跃/跌落和投弹落地时机；不为音色和 UI 写复述实现测试。
- 本机默认 Node 22.16 低于 package engines，正式验证使用已安装的 Node 25.9（PATH=/opt/homebrew/opt/node/bin:$PATH）。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/game-audio.ts | 共享音效类型、拍长与默认音量 | — | yes |
| 2 | src/app/fortress-score.ts | 配乐、环境和音效合成及资源释放 | 1 | yes |
| 3 | src/app/game-audio-cues.ts | 真实动作边沿和模拟事件映射 | 1 | yes |
| 4 | src/app/game-audio.ts | 解锁、暂停、后台、距离混音、分层调度 | 2,3 | yes |
| 5 | src/ui/game-audio-panel.ts / game-audio.css | 三路音量与共享音效试听 | 1 | yes |
| 6 | src/app/game-app.ts / frame-loop.ts / index.html | 关卡及帧循环装配 | 4,5 | yes |
| 7 | test/game-audio-cues.test.ts | 行为验证 | 3 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| npm test | yes | yes — 1595/1596；既有 worldgen 性能预算 252.3ms >250ms，隔离复核 1/1 通过 |
| npm run build | yes | yes — 仅既有大 bundle 提示 |
| 浏览器交互及音频生命周期检查 | yes | yes — 解锁、静音、恢复、设置暂停、实际技能与共享试听；后台隐藏通过 visibilitychange 模拟验证 |


补充深度审查（task/137-review-fortress-audio）：类型检查、音频用例4/4、架构用例21/21通过，但独立复现确认两个P2问题：同帧互击会漏释放音；面板按钮Space无法激活。结论 Needs changes，详见关联 REVIEW.md；本轮未修改实现。

## Final Verification
- 审查子代理发现并已修复：面板不能吞掉游戏按键释放事件；浏览器中断后「开启声音」必须恢复 context 而非切换静音。定向复核 Approved。
- 浏览器发现并已修复：小地图遮挡声音面板、初始音量百分比浮点尾数；窄横屏面板可滚动。
- 原生音源离线导出 48 秒双声道 24kHz WAV，包含引子、探索、战斗及代表技能；峰值 0.2493、RMS 0.01129，无无效采样、无削波。音色主观质量以用户实际试听为准。
- 试听：output/audio/cold-boot-preview.wav；界面证据：output/audio/fortress-sound-panel.jpg。
- 本地预览 http://127.0.0.1:5180/?mode=game&level=facility&scene=fortress，保留服务器供试听。
- typecheck 通过；完整 npm test 1595/1596，唯一原有世界生成性能用例隔离通过，未改阈值或跳过测试；build 通过。
- 未提交或推送，未改 CI、vendor、战斗规则；未执行镜像构建/部署。
