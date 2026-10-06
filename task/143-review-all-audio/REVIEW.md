# REVIEW -- 所有声音检查

## Status: done
## Task: 143
## Related: 135, 137, 138
## Baseline Commit: e5fb3bf

## Scope
- 当前声音目录全部63项：背景音乐4、环境6、动作37、Boss16。
- 游戏事件与混音、黑洞衰减、角色卡播放、切换、暂停与销毁。
- 目录外全部11版序章的真实配乐与故事声轨。
- 只读审查；没有修改源码、配置或测试。

## Findings
| Severity | Conf | Verified | File:Line | Issue | Suggestion |
|----------|------|----------|-----------|-------|------------|
| Critical / P2 | 100（独立90） | yes | src/app/sound-gallery.ts:157 | pagehide关闭context后保留非null引用，命中BFCache返回时play对closed context调用resume，所有声音无法再播；独立Chrome操作出现Cannot resume a closed AudioContext | 离开时同步清空已关闭的context及输出节点引用，使返回后的用户手势重新创建；覆盖多次往返 |
| Critical / P2 | 95（独立99） | yes | src/app/intro-app.ts:441 | 序章自然结束仅夹紧进度显示，不调用现有pause；保留音频图及终版空排程interval | 达到总时长时进入结束/暂停状态并释放现有音频资源，保留重播 |

### Evidence and bounds
- 目录问题只在浏览器BFCache恢复时发生；一般重新加载不会发生。第一审查者在独立Chrome标签页复现，独立复核者IAB后退实际重新加载，静态确认closed context路径，没有把每次后退都算成失败。
- 序章内存替身复现使用真实IntroAudio与乐谱：finale总时长63s，在72.75s仍有4387个非源节点、0声源、1个interval；melody保留600节点、0声源、0interval。手动pause后均归零。没有实测内存字节/CPU，也没有声称声音不断或跨重播无限累积。
- 声音目录是机房堡垒音源目录，尚未收录序章动画11版配乐及故事声轨；这是覆盖说明，本轮实际额外检查了这些音轨。
- intro-overture-audio.ts没有调用方，属于未接入旧模块，不算当前可播放声音。

### Filtered by Verification
- 角色卡和目录不同默认音量属于各自混音设置，不作为错误。
- BFCache问题不能泛化成所有浏览器每次后退必现。
- 已结束序章不会跨重播累积节点，start会先pause；没有无尽可听残音。

## Validation Results
| Command / method | Result | Details |
|------------------|--------|---------|
| /usr/bin/env PATH=/opt/homebrew/opt/node/bin:$PATH npm run typecheck | pass | 现行类型检查通过 |
| /opt/homebrew/opt/node/bin/node --test test/*audio*.test.ts test/architecture.test.ts | pass | 29/29 |
| 浏览器逐个点击目录按钮 | pass | 63/63进入播放态；最终停止后活动项0；无控制台播放异常 |
| OfflineAudioContext：37个动作+16个Boss | pass | 48kHz双声道，每个动作完整渲染并留尾音；全部有效、无NaN/Infinity、无削波；裸声源最大峰值0.299787 |
| OfflineAudioContext：6环境+4配乐 | pass | 24kHz双声道；环境与探索/警戒/战斗各8s，开场完整16s；全部有有效输出、无削波 |
| 黑洞近→远→返回 | pass | RMS约0.04572→0.00000495→0.05241；不同时间段的旋涡相位导致近处数值不同；方向正确 |
| 配乐+超载+黑洞销毁后 | pass | dispose后1.1s至3s输出峰值0，反馈与循环无残留 |
| 真实stepSim四种敌人共8个技能 | pass | 起手/释放各一次；哨蜂载荷脱扣一次、接地爆发一次；铝热8次真实hurt只触发一次燃烧 |
| 11版序章真实IntroAudio混音完整渲染 | pass | 24kHz双声道；复用真实master/压缩器/回声/故事轨；每版完整时长+2s；全部有效、0削波，末0.5s峰值0；最大峰值0.781032 |
| npm test / npm run build | 本轮未重跑 | 无源代码改动，本轮集中于音频与架构。138记录上次全量1598/1599及原有worldgen耗时预算失败；上次构建通过 |

### Rendering limitations
- 这是浏览器交互、真实波形输出和生命周期检查，没有声称完成主观真人听感评价。
- 曾尝试一次提前安排256拍进行48kHz完整双循环渲染，因耗时过长终止临时页；该探针不计为通过。最后完成各配乐层8秒片段及完整开场验证，不声称全曲双循环通过。
- 检测页的临时AudioContext/stream替换已还原，临时页关闭，没有写入产品源码。

## Conclusion
- Assessment: Needs changes
- Summary: 当前全部63个目录声音及11版序章有有效输出，专项测试通过。两项确定生命周期缺陷由独立复核确认；本轮仅报告，未自动修复。
