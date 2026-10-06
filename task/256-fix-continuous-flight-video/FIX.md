# FIX -- 连续飞行与真实受击介绍视频

## Status: done
## Task: 256
## Related: 252
## Baseline Commit: 8a8fe8c6c374b11063881752a005effae06c86ac

## Problem
介绍片飞行上下抖动，部分 Boss 技能命中主角没有真实伤害反馈。

## Root Cause
scripts/record-pelican-intro.mjs 用高度阈值反复切换 jumpHeld，推进/滑翔每次切换使速度和动画反复变化。录制时每帧设置 invulnTicks=2，并设置生命为10000，导致实际命中免伤；近战和地面波的原站位也超出射程。

## Fix Plan
- [x] 片场持续推进、缓慢匀速上升，初始化 Sam 的跟随高度；取消片场命中停帧，保留真实伤害和受击动作。
- [x] 删除主角无敌/清硬直编排，恢复正常生命，调整 Boss 技能镜头的受击站位，显示真实生命条。
- [x] 输出独立修订版，保留原视频；逐帧记录运动与命中。

## Verification
- [x] 录制断言：主角施法镜头持续 fly、无上下反向；Boss 技能实际命中扣血。
- [x] 关键帧已查看；两个成片均 4380 帧、60fps、约 73 秒，H.264 + AAC 48kHz 双声道，完整解码无错误。详见输出目录 media-check.json。
- [x] node --check scripts/record-pelican-intro.mjs
- [x] npm run typecheck、npm test、npm run build 各一次：typecheck/build 通过；全测 1779 通过、1 失败（test/game-audio-cues.test.ts:126，超载与搬山下砸同帧互击，预期 [28,48]，实际 [48]）。失败与录制脚本无导入关系，未修改正式游戏以迁就结果。
- [x] diff-guard：无新增防御性兜底、假扣血或源码文本测试；子代理只读核对飞行相位、hitstop 时序与伤害路径通过。

## Result
- 输出：output/videos/2026-10-06/aerial-intro-smooth/，73 秒、19 镜头、1080p60 高清与 720p60 分享版，保留中英技能标题、说明、角色设定与原生音效。
- 10 个主角空中展示镜头全程 fly、vy=0.6，飞行模式切换 0 次，高度无反向抖动。真实受击后的击退与短暂下落仍保留。
- Tibo 四镜头生命：100→90 / 80 / 92 / 74；Sam 四镜头：100→94 / 75 / 65 / 78。全部具有真实 Boss→主角 hit 事件。
- Sam 空中镜头改为双方中点构图，避免受击后的鹈鹕落入字幕区域。
- 仅修改片场录制脚本与任务记录，没有修改正式游戏逻辑，没有提交或推送。
