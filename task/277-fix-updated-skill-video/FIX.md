# FIX -- 更新技能介绍视频

## Status: done
## Task: 277
## Related: 256
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
用户更新了技能，需要根据当前游戏重新录制全片。

## Root Cause
src/entities/boss.ts 的两位 Boss 大招已加入环形弹幕，旧视频与说明不再反映当前技能。

## Fix Plan
- [x] 更新字幕、延长两段大招至 7.5 秒，以原速完整播放并拉远取景。
- [x] 重新录制全部 19 镜头，保留连续飞行、真实受击与生命条。

## Verification
- [x] 10 个主角空中镜头全程连续 fly，8 个 Boss 技能真实命中扣血；Tibo 大招两轮 [16,16]、Sam 三轮 [16,16,8]，两轮环射均覆盖四象限，Sam 末轮 4 左/4 右。大招后主角生命分别 75/61。
- [x] 关键帧与新环形弹幕已查看；1080p60/720p60 均 4680 帧、约 78 秒，AAC 48kHz 双声道，完整解码无错误。模拟 droppedTicks=0、clampedFrames=0。
- [x] node --check、typecheck、build 通过；npm test 1790/1790 通过。子代理只读核对当前技能及时序，无须改正式游戏。
- [x] diff-guard：改动限于录制字幕、镜头时长/取景、录制断言与输出目录；无吞错、无防御性兜底、无生产测试接口。

## Output
output/videos/2026-10-07/aerial-intro-updated/：高清版、分享版、技能介绍.srt、镜头总览.jpg、evidence.json、motion-and-hit-check.json、media-check.json。

仅修改录制脚本和任务记录，未修改正式技能，未提交或推送。
