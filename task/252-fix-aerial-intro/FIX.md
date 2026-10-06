# FIX -- 空中技能介绍视频

## Status: done
## Task: 252
## Related: N/A
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
录制两个 Boss 与主角人形、鹈鹕形态的技能介绍，加入中文技能字幕、英文标题和真实角色设定；优先空中飞行施法。

## Root Cause
scripts/record-pelican-promo.mjs 的现有战斗剪辑以击败 Boss 为主，未逐个介绍 Boss 技能，缺少持续的技能和设定字幕。

## Fix Plan
- [x] 新增独立录制编排脚本，复用游戏原生模型、物理、技能、环境与音频，不更改正式游戏逻辑。
- [x] 主角双形态与 Sam 远程技能空中展示，Tibo 与地面大招遵循原生机制。
- [x] 导出 MP4、字幕时间轴、逐镜头真实事件记录与画面检查图。

## Verification
- [x] 录制脚本事件断言、逐帧计数、空中技能状态核对 — 19 镜头、4380 帧；主角技能镜头全程空中，Sam 三项远程技能在空中释放，吞下三发并实际反吐。
- [x] 画面人工检查与 FFprobe 音视频检查 — 总览与关键帧检查完成；1080p/720p 均为 60fps、73 秒、H.264/AAC 48kHz 双声道，完整解码通过。
- [x] npm run typecheck — 已执行；失败来自工作区既有 Health.overloadInvulnTicks 缺失（player-view、human-combat.test、player-breath.test），未修改相关文件。
- [x] npm test — 已执行一次，1773 通过、3 失败；均为既有服务器超载保护行为：game-audio-cues.test:106、human-combat.test:195/241。
- [x] npm run build — 通过；已有大 chunk 警告。
- [x] diff-guard — 只新增独立录制脚本与任务记录；无游戏逻辑变更、无新测试、无静默降级。

## Delivery

- output/videos/2026-10-06/aerial-intro/鹈鹕429-角色与技能-空中介绍.mp4（47,060,311 字节）
- output/videos/2026-10-06/aerial-intro/鹈鹕429-空中技能介绍-分享版.mp4（15,074,347 字节）
- 同目录包含技能介绍.srt、镜头总览.jpg、evidence.json、media-check.json 和逐镜头素材。
- 正式游戏代码、模型和数值未改；片场使用额外生命、飞行能量及技能排程，复用真实动画、弹体、碰撞和声音。Tibo 不伪造飞行；变身、Tibo 地面技能和 Sam 大招保留地面演示。
- 全量检查中的既有类型/超载测试失败保留；本次录制、媒体、语法检查均通过。未提交、未推送。

## Reproduce

先将 `PLAYWRIGHT_MODULE` 设为本机 Playwright 模块路径、`CHROMIUM_EXECUTABLE` 设为 Chromium 可执行文件路径。

```sh
node scripts/record-pelican-intro.mjs \
  --playwright "$PLAYWRIGHT_MODULE" \
  --browser "$CHROMIUM_EXECUTABLE"
```

可用 `--shots 4,5` 仅补录指定镜头，再复用同目录其他镜头及事件重组全片；编号从 0 开始。
