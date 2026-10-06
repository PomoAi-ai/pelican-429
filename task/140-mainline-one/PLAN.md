# PLAN -- 游戏主线 1

## Status: done
## Task: 140
## Related: N/A
## Baseline Commit: 6a514d6

## Goal
序章同步预载资源，骑车进入山体堡垒；清理外围小怪后到核心击退 Tibo，恢复人形和自由变身，倒计时后迎战 Sam。胜利恢复算力，选择留在堡垒或进入现有自由世界。浏览器本地保存进度，自动识别中英文并可手动切换，手机引导全屏与横屏。

## Non-goals
不改正在其他地方制作的游戏界面布局，不联系其他会话，不提交/推送，不新增服务端或依赖，不修改 vendor。

## Acceptance Criteria
- 主线顺序由模拟层推进，阶段不能跳过；Tibo/Sam 使用共享模型、动画，能攻击和被击败。
- 开局骑车，Tibo 前锁定变身，击退后人形和自由变身解锁；暂停与后台不消耗倒计时。
- 浏览器保存检查点及剩余倒计时，刷新可继续；存储异常明确报错。
- 序章播放期间开始加载真实游戏资源，进入游戏复用加载结果。
- 中英文自动识别、手选持久化；手机从用户点击请求全屏，设备不支持时给出可操作指引。
- 保留独立场景预览和现有自由世界；界面仅增加主线必要提示与入口契约。

## Constraints
遵循 AGENTS.md 分层和验证，保留所有原有未提交改动；纯逻辑行为测试，不写渲染/UI自动测试；CI不运行测试。

## Decisions
- 使用现有序章终版、堡垒关卡、小怪、NPC资源和演示世界，不复制资源。
- 倒计时初版 30 秒，以模拟 tick 推进；阶段检查点保存，不保存所有物理瞬时状态。
- 浏览器 localStorage 存放小体积版本化存档；未引入后端或数据库依赖。
- 新入口 `?mode=story`，预览入口保持原义；序章与战斗同文档切换以复用预载和全屏。
- 探索与架构由子代理完成，接口与现有分层一致，无须用户裁决的方案分歧，直接批准实现。
- 只读审查发现手机全屏引导阻断操作但未暂停模拟，已在帧调度处冻结模拟/音频并清空输入。
- 已有多人未提交工作，按文件职责分工只追加本任务接线，界面完成后可使用同一入口。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/sim/mainline.ts + entities/boss.ts + config/mainline.ts | 主线阶段、Boss实战与重生/变身 | — | yes |
| 2 | src/render/npc/boss-view.ts | 复用NPC模型动画渲染战斗 | 1 | yes |
| 3 | src/app/story-app.ts + story-save.ts + game-app.ts + intro-app.ts | 入口/同页预载/浏览器存档/恢复 | 1 | yes |
| 4 | src/ui/story-hud.ts | 必要目标提示、Boss血条、胜利选择 | 1 | yes |
| 5 | src/ui/language.ts + mobile-play-guide.ts | 语言识别选择与手机引导 | — | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes：首次及测试语言夹具修改后复查均通过 |
| npm test | yes | yes：全量 1613 个用例，首次 1608 通过、5 个中文夹具缺少显式语言失败；修正语言设置后受影响 5 文件重跑 82/82 通过 |
| npm run build | yes | yes：420 模块，19.52s，主 JS chunk 过大警告（2,397.69kB / gzip 819.00kB），无构建错误 |
| 浏览器人工检查主线入口/序章切换/提示 | yes | yes：序章资源就绪→同页进入骑行堡垒；中英文切换；手机触摸/横屏模拟下全屏引导冻结30秒倒计时，点击全屏恢复；Sam到场模型/血条/伤害；通关后的留守与自由世界跳转均确认 |

- 全量测试耗时 88.94s，定向复查耗时 17.19s；无跳过测试。只补语言敏感测试的 `setLanguage('zh')`，不修改原断言或增加生产兜底。
- 验证日志：`$TMPDIR/pelican-mainline-typecheck.log`、`$TMPDIR/pelican-mainline-tests.log`、`$TMPDIR/pelican-mainline-build.log`、`$TMPDIR/pelican-mainline-language-recheck.log`、`$TMPDIR/pelican-mainline-typecheck-recheck.log`。
- 浏览器后半程使用本地阶段存档检查恢复和界面衔接，并非人工打通全部战斗；两场战斗的命中和阶段推进由真实模拟用例验证。临时主线存档已清理，页面回到新游戏序章；手机真机和 iOS 主屏幕模式未实测。
- 本任务源码、测试、入口与跟踪目录的 `git diff --check` 通过。仓库其他美术改动触发的 Git LFS 清理权限问题不影响本次范围检查；未改动相关资源或提交/推送。
