# PLAN -- 两条单 Boss 动作展示片

## Status: blocked
## Task: 240
## Related: 234-pelican-double-boss-recording
## Baseline Commit: 8a8fe8c

## Goal
两条独立约一分钟视频：鹈鹕击败 Tibo；第二条实际变身成人后击败 Sam。展示真实传送攻击、飞行、骑车与各形态全部技能，强调镜头、动作衔接与节奏。

## Decisions
- 用户明确允许忽略数值，片场可以安排生命、伤害、霸体和 Boss 出招节奏；正式游戏代码不改，结尾仍以真实攻击命中完成击败。
- 子代理已探索现有骑车、弃车起飞、人形全技能和共享传送 API；调用真实变身、传送和战斗逻辑，不制作替代动画。
- 复用现有录制器与输入编排；方案已明确，主代理负责编排和实现，不再额外委派设计。
- 以每个片段的实际状态和事件验证骑行、飞行、变身、传送、全技能及最终击败，并查看成片关键帧。
- 子代理实现录制器和说明，并完成录制相关增量审查，未发现需要修复的缺陷；主代理实现导演及实际排练、录制和媒体检查。
- 两条视频已交付。全仓代码验收因本次未修改的文件存在类型错误和展示场测试失败而阻塞；按项目范围规则未修改其他正在进行的工作。

## Validation
- [x] 本地模拟排练和真实录制断言通过；Tibo 55.77 秒、Sam 55.88 秒被实际攻击击败，主角存活。
- [x] 两片均 59.989 秒，1920×1080、30fps、H.264/AAC；文件分别 59,171,312 / 58,227,069 字节。FFmpeg 完整解码通过，音轨非静音。
- [x] 查看骑车、空战、突进、服务器技能与最终胜利画面，构图和叠层正常。
- [x] 鹈鹕 3 次传送、2 次突进、3 次吞弹、1 次反吐、2 次光子；人形 4 次传送、12 次键盘近战、24 枚 Bug 弹、1 次服务器超载、1 次光子；两片均有骑行及弃车起飞。
- [x] npm run build 通过；两个脚本 node --check 通过。
- [ ] npm run typecheck：src/sim/weapon-system.ts:83 TS2322，number 无法赋值给字面量类型 18；该文件不在本次修改范围。
- [ ] npm test：1770 项中 1769 通过，test/showcase.test.ts:160 的 ultimate 所有目标命中断言失败（1 / 6）；该展示场逻辑不在本次修改范围。
- [x] 录制相关增量审查通过，正式游戏代码未因本任务修改。

## Deliverables
- output/videos/2026-10-06/separate-boss-cinematics/tibo/01-鹈鹕击败Tibo.mp4
- output/videos/2026-10-06/separate-boss-cinematics/sam/02-人形击败Sam.mp4
- scripts/record-pelican-bosses.mjs、scripts/pelican-boss-director.mjs、scripts/record-pelican-bosses.md
- 原始 WebM、动作证据 JSON 与每十秒截图保存在对应 Boss 目录。原始 MediaRecorder 尾部 Opus 包有解析警告，最终 AAC MP4 完整解码无错误。
