# FIX -- 宣传片动作流畅度与镜头节奏

## Status: done
## Task: 249
## Related: 240-separate-boss-cinematics
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem

原宣传片动作不连贯，等待和重复攻击削弱观感；需保留游戏原本外观、双方战斗、飞行、传送、骑行和技能。

## Root Cause

`scripts/record-pelican-bosses.mjs` 使用实时 captureStream(30)，游戏模拟与录屏按不同时间轴推进，再整体 setpts 压至一分钟。丢失的动作帧不能由 fps=30 补回。旧镜头最小距离 17/24，近身角色过小。

## Fix Plan

- [x] 新增固定 60Hz 离线逐帧宣传片脚本，复用原导演、游戏帧循环与原音频合成，绕开实时录屏掉帧。
- [x] 重新选择短动作段，收紧近景并平滑移动镜头，输出高清与轻量分享版本。
- [x] 保留游戏本身配置，只在录制浏览器临时接入。

## Verification

- [x] 录制实际动作及战斗事件验收、帧数验收、无浏览器错误。
- [x] ffprobe 参数检查、整片解码、帧差检查与视觉抽查。
- [x] node --check 新录制脚本。
- [x] npm run typecheck / npm test / npm run build（记录当前共享工作区结果，不修改无关失败）。


## Result

- 33.85 秒，2031 帧，60fps；两场模拟各 3600 ticks，droppedTicks 和 clampedFrames 均为 0。
- 两场 Boss 均实际击败、主角存活，所有要求的技能/骑行/飞行/传送实际发生；剪辑内技能事件另行验收。
- 吞弹镜头调整为 12.9–15.1s；Sam 终结调整为 52.8–56.8s；补录同时替换音效时间，其他镜头时长不变。
- 高清 1920×1080，42,262,154 字节；分享版 1280×720，17,631,208 字节。两版全程解码成功，音画时长差 0.008 秒。
- 分享版逐帧差统计：2030 对相邻画面，最小灰度差 0.514，低于 0.15 的近似重复帧为 0。保留游戏自身短暂停顿打击反馈。
- 原生游戏配乐与音效离线同步，导出时做响度统一，避免音量太轻。
- `node --check scripts/record-pelican-promo.mjs`、`node --check scripts/pelican-promo-audio.mjs` 通过。
- `npm run typecheck` 通过；`npm test` 1772/1772 通过；`npm run build` 通过（现有大 chunk 提示）。
- 子代理只读诊断确认原 Sam 采集最大帧间隔 1307ms；收尾检查未发现新脚本实际缺陷。未改生产游戏代码，未提交/推送。

输出与校验：`output/videos/2026-10-06/pelican-promo-smooth/`，镜头清单 `edit.json`，媒体验证 `media-check.json`。
