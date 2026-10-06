# REVIEW -- 声音设计异常复查

## Status: done
## Task: 163
## Related: 147, 143
## Baseline Commit: 3a35077970c442dfd4645c115c58ad2e8b1661aa

## Scope
- Focus: 声音设计与运行行为；音量层级、循环/包络接缝、距离衰减、技能时间轴、停止/恢复和实际游戏与目录共用音源。
- Files: src/app/{fortress-score,blackhole-audio,boss-audio,game-audio,game-audio-cues,sound-gallery,intro-app,intro-audio}.ts、声音相关配置与角色展示调用方。
- 本轮只读检查；不改源码、配置或测试。审查当前可运行版本，区分上一轮新引入问题与既有异常。

## Findings
| Severity | Conf | Verified | File:Line | Issue | Suggestion |
|----------|------|----------|-----------|-------|------------|
| Critical / P2 | 99 | 独立确认99 | src/app/game-audio-cues.ts:62 | 实战Boss实体被observe跳过；GameAudio未实例化BossScore，全部技能起手缺专属音，大招/返场在未命中玩家时没有技能声，射弹仅为通用enemyStrike | 将真实Boss动作开始/释放/取消接入共享音源，避免专属声与通用射击重复 |
| Critical / P2 | 99 | 独立确认93 | src/app/fortress-score.ts:149 | 光子实际蓄力0.45秒，升频声部到1.13秒；超载实际蓄力2.333秒，声音1.1秒已经结束 | 按真实技能蓄力时长排程；释放或取消时结束蓄力包络 |
| Critical / P2 | 95 | 独立确认99 | src/app/boss-audio.ts:84 | Sam路由命中音固定1.18秒，真实首发命中1.683秒，靶子闪避时2.175秒；声部在命中前已停止 | 根据真实弹道命中时间触发冲击，不硬编码飞行时长 |
| Critical / P2 | 100 | 主代理浏览器独立复现 | src/app/intro-app.ts:292 | 播放中拖进度至63秒并松手，endScrub经play将结束时间改为0，意外从头重播 | 只在显式重播/片尾播放入口归零，拖至结尾应停在片尾 |
| Non-critical / P3 | 90 | - | src/app/game-audio.ts:144 | 暂停恢复重建音源但沿用beat，持续和弦会缺席到下一16拍起点；从beat25恢复最长约8.333秒 | 恢复时重新起乐句，或补排当前和弦剩余部分 |
| Non-critical / P3 | 100 | - | src/app/sound-gallery.ts:96 | 每次试听重建FortressScore，连续动作的变体计数总从0开始，目录不能检查第二次及后续变化 | 用最小的连续试听能力覆盖同音效变体 |

### Evidence and attribution
- 使用真实createFacilityLevel、initializeMainline、stepSim与GameAudioCues分别跑两Boss的6个技能；起手事件/声音均空，Sam两普通技能各5个通用射击声，Tibo薯条攻击9个通用射击声。大招/返场真实生成地波，但避开命中时无技能声音。仍可能有通用受击/命中声，不能称所有Boss行为完全静音。
- Boss接线缺口属于当前工作区主线Boss和音频之间的集成遗漏，无法把它归因于147音色修改。上一轮“游戏、角色卡和目录共用全部音源”的表述对Boss不成立。
- 光子/超载使用真实模拟技能触发和WebAudio边界排程对照；两项时序失配在147前已经存在。光子噪声攻击峰值0.55秒晚于实际释放0.45秒，超载最后1.233秒没有该技能蓄力音；不是仅比较名义文件时长。
- Sam路由使用真实createModelRoutingVolley和sampleModelRoutingVolley、展示场相同靶位/尺寸，左右朝向结果一致；1.18秒时均未相交。固定提前impact为147新增，0.5倍速会把错位放大。
- 序章在实际IAB点击开始播放后，将播放进度填到63，返回状态为“暂停”、时间00:00、进度约0.7，确认意外重播；已停止临时播放。该路径为147重播修改引入。
- 黑洞与配乐检查为真实OfflineAudioContext波形与生命周期验证，不冒充人工主观听感评价。
- 前三项经未接触原始审查推理的复核代理确认；第四项由主代理以浏览器实际操作独立复现。追加第四项新上下文复核代理及唤醒其他代理的工具请求均被任务数上限拒绝，未将未完成的额外复核写成通过。

### Filtered by Verification
- Boss缺音由独立复核从P1降为P2：专属提示缺失，但未见游戏无法继续或数据风险。
- 当前角色舞台pagehide销毁后缺少BFCache恢复路径，与新角色舞台实现有关；本轮未复现原生BFCache，作为范围外后续线索，不列入本轮确定声音缺陷。
- 角色卡与目录默认音量不同不是错误；Sam/Tibo模型实际动作时长没有导致音轨被提前截断。
- 没有将暂停恢复配器变薄夸大为整段静音，也没有将光子全部尾声都判断为同等可闻。

## Validation Results
| Command | Result | Details |
|---------|--------|---------|
| /usr/bin/env PATH=/opt/homebrew/opt/node/bin:$PATH npm run typecheck | pass | 现行类型检查通过 |
| /opt/homebrew/opt/node/bin/node --test test/boss-audio.test.ts test/blackhole-audio.test.ts test/game-audio-cues.test.ts test/architecture.test.ts | pass | 29/29，0失败 |
| 真实模拟+WebAudio排程边界临时复现 | 发现上述缺陷 | 主检查与独立复核从stdin执行，没有保存脚本或改测试 |
| 三档配乐各完整双循环 | pass | 每档145.222秒、24kHz双声道；256拍+尾声；所有值有限无削波；裸源峰值探索0.130634、警戒0.171309、战斗0.245572 |
| 黑洞近→60格外→返回→dispose | pass | 18秒真实离线渲染；近RMS0.027688、远处0、返回0.022107，dispose后5秒峰值0；相位变化使两次近处RMS不同 |
| 浏览器序章播放中拖至片尾 | fail | 63秒意外归零重播；已停止并关闭临时诊断页 |
| npm test / npm run build | 本轮未重跑 | 本轮没有源码修改；147已运行1636项全量测试及构建，本轮执行专项验证 |

- 首次后台长循环探针被其他工作区变更触发的Vite热重载打断，不计通过；随后分段排程并在一次调用中完成三档完整双循环，以上为成功结果。

## Conclusion
- Assessment: Needs changes
- Summary: 确认4项P2声音/播放体验缺陷及2项P3设计检查限制。Sam路由冲击提前和序章拖片尾重播为147引入；Boss实战接线为当前主线集成遗漏，玩家蓄力错位与暂停恢复配器缺失是既有问题。本轮只完成检查与记录，没有修改源码、配置或测试。
