# FIX -- 大世界音乐区域与警戒同步

## Status: done
## Task: 172
## Related: 171, 167
## Baseline Commit: 3a35077970c442dfd4645c115c58ad2e8b1661aa

## Problem
安全区返航仍触发警戒、实际追击超出初始感知距离就提前降级；飞到机房上方高空仍被识别为遗迹。

## Root Cause
src/app/game-audio.ts:109 — 音频自己按初始range推断敌意，绕过模拟层的安全区、返航和扩大追击距离。
src/app/world-music.ts:14 — 机房仅校验高度下界，判定范围无限向上。

## Fix Plan
- [x] src/app/game-audio.ts — 复用敌人的真实engaged状态。
- [x] src/app/world-music.ts — 用场景全局高度限制机房范围。
- [x] test/free-world.test.ts — 真实机房顶部以上回归，取消上界会失败。

## Verification
- [x] 浏览器真实GameAudio：安全区、持续追击、进攻、暂停/恢复、短暂过界与稳定换曲。
- [x] npm run typecheck
- [x] node --test test/free-world.test.ts test/game-audio-cues.test.ts
- [x] npm test（本机限制并发2，保留全部用例）
- [x] npm run build
- [x] diff-guard仅检查本轮改动；确认问题已修复。

## Results
- 机房上空断言先复现失败（ruins而非wilds），增加高度上界后相关测试17/17通过。
- 浏览器真实stepSim + GameAudio：安全区engaged=false时音乐强度0，34格持续追击engaged=true时强度1，攻击时强度2；修复前分别错误为1、0。
- 实际音频时钟验证：进入洞穴0.4秒后回营地保持wilds，稳定进入洞穴在第8拍切为cave且AudioContext未重建；暂停时source归零/context suspended；恢复及取消静音从第0拍重新起句（排入后beat=1）；dispose后sources=0、nodes=0、context closed。
- npm run typecheck：通过。首轮被并行NPC对话模块尚未落盘阻挡，模块恢复后复跑通过，本任务未改NPC文件。
- node --test test/free-world.test.ts test/game-audio-cues.test.ts：17/17通过。
- npm test -- --test-concurrency=2：1698/1698通过，301套，120.95秒；全部本机执行。
- npm run build：通过，9.07秒，只有既有大chunk提示。
- 完整游戏预览恢复后，实际菜单显示原野主题、播放中；点击关闭声音后显示已关闭。证据：output/audio/world-music-recheck.png。临时测试场景已关闭。
- diff-guard：只改两个音频模块和已有区域回归用例；删除重复的敌意距离推断，无新增依赖、内部防御分支、测试专用生产接口或CI测试。工作区其他并行改动保留。
