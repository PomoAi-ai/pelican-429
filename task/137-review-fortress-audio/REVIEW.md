# REVIEW -- 机房堡垒音频深度检查

## Status: done
## Task: 137
## Related: 135
## Baseline Commit: 原任务无 HEAD，以 $TMPDIR/pelican-audio-baseline 和任务 135 文件清单界定；审查结束当前 HEAD 为 6a514d6，不以当前未提交 diff 缩窄审查范围。

## Scope
- Focus: 音频事件正确性、节拍调度、暂停/隐藏/恢复生命周期、节点释放、界面输入与原设计覆盖。
- Files: src/config/game-audio.ts；src/app/fortress-score.ts、game-audio-cues.ts、game-audio.ts、game-app.ts、frame-loop.ts；src/ui/game-audio-panel.ts、game-audio.css；index.html；test/game-audio-cues.test.ts。
- 本轮只读审查，不修改实现或测试。源码上下游与临时运行复现交叉验证。

## Findings
| Severity | Conf | Verified | File:Line | Issue | Suggestion |
|----------|------|----------|-----------|-------|------------|
| Critical / P2 | 100 | 独立公开 stepSim 复现 | src/app/game-audio-cues.ts:68、86 | 同一释放 tick 双方互击后动作被清理，已生效的超载和敌人下砸漏释放音 | 在实际释放/接地阶段记录表现事件，不依赖结算后的动作残留 |
| Critical / P2 | 100 | 浏览器实测 + 独立源码链核实 | src/ui/game-audio-panel.ts:71 | 面板按钮 Space 无法激活；keyup 冒泡到游戏输入后 preventDefault 取消原生 click，Enter 正常 | 同时保留游戏按键释放和原生控件激活；按事件起点区分，不能无条件截断所有 keyup |

### Evidence
- 独立复现同时安排人形超载与搬山下砸：释放前 human ticks=139，enemy elapsed=71，双方 HP=100；下一 tick 实际 hit 为玩家造成48、敌人造成20，HP分别80/52；human.action=null、attack已清理，声音只有 metalHit/hurt，缺 overloadBurst/enemyStrike。公开 stepSim 按真实时间轴推进，排除死亡和直接篡改计时器。
- 浏览器聚焦「开启声音」后按 Space，仍显示「点击游戏或开启声音，即可收听。」；同一按钮按 Enter 即显示「播放中」。独立复核确认 root keydown.stopPropagation 阻断父级 consumedKeys 登记，放行的 keyup 最终在 window 被 preventDefault。
- 两项均不涉及数据安全或崩溃，但属于本次功能应修复的确定问题，优先级 P2。

### Filtered by Verification
- 未证实新的节点泄漏、暂停/隐藏后旧动作补播或 Context race，未作为问题汇报。
- 禁用敌人的旋翼声未证实违反当前实体表现语义，未作为问题汇报。

## Validation Results
| Command | Result | Details |
|---------|--------|---------|
| npm run typecheck（Node25.9） | 通过 | 当前工作区类型检查 |
| node --test test/game-audio-cues.test.ts（Node25.9） | 4/4 通过 | 现有用例未覆盖已释放后同帧互击清理 |
| node --test test/architecture.test.ts（Node25.9） | 21/21 通过 | 分层与依赖 |
| node --input-type=module（stdin 临时复现） | 确认问题 | 两名独立审查者实证同帧释放漏音 |
| 浏览器按钮 Space/Enter | 确认问题 | 原生键盘激活不一致 |
| npm test / npm run build | 本轮未重跑 | 只读检查，复用任务135已有记录；没有修改实现或测试 |

## Conclusion
- Assessment: Needs changes
- Summary: 两个经独立复核的 P2 问题需修复；本轮只写审查记录及相关 Validation，没有修改实现。建议后续 fix 137。
