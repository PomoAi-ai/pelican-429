# PLAN -- 黑洞空间音与声音目录

## Status: blocked
## Task: 138
## Related: 135, 137
## Baseline Commit: 6a514d6

## Goal
黑洞离开区域渐弱；背景音乐、全部动作与技能、Sam/Tibo 角色和技能音可以逐项试听；Boss 角色卡可开启同步声音。

## Non-goals
不添加真人配音、外部服务或依赖，不修改其他模型制作工作，不提交推送。

## Acceptance Criteria
独立声音目录单声源播放与停止，黑洞距离可试听，角色卡动画与音频同步，暂停/隐藏/离开销毁音源。修复复查发现的同帧互击漏音及空格不能操作声音面板。

## Decisions
- 沿用 Web Audio 合成，游戏、角色卡、目录共用真实音源。
- 探索与设计由当前任务子代理按黑洞、Boss、模拟事件拆分；已有135/137结论复用，不重复整仓探索。
- 无需要用户裁决的设计分歧，直接实施。目录使用独立 sounds 路由与原生按钮/滑杆。
- 保留工作区其他未提交改动。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/app/blackhole-audio.ts | 空间环境音 | yes |
| src/app/boss-audio.ts | 共享 Boss 音源与角色卡接线 | yes |
| src/app/sound-gallery.ts | 单声源试听目录 | yes |
| src/main.ts | 目录路由与入口 | yes |
| src/app/game-audio.ts | 黑洞接线 | yes |
| src/ui/game-audio-panel.ts | 入口与键盘修复 | yes |
| src/app/game-audio-cues.ts | 同帧互击声音事件 | yes |

## Validation

后续全声音审查：见 `../143-review-all-audio/REVIEW.md`，63项目录与11版序章输出有效，发现BFCache返回目录不能播放和序章自然结束资源未清理两项P2；审查未修改实现。

| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | 1598/1599；原有 worldgen 性能预算未通过 |
| npm run build | yes | yes |
| 浏览器目录、角色卡、黑洞衰减检查 | yes | yes |

## Validation results
- 类型检查通过；构建通过，存在原有大 chunk 提示。
- 全量测试1598/1599通过，唯一失败是世界生成耗时中位数：430.9ms > 250ms；隔离复核724.0ms仍未通过。135已记录同项问题，本任务不改world生成或预算断言。因必需全量门禁未绿，Status保持blocked；声音需求实施与专项验收完成。
- Boss续播修复后的定向回归1/1通过，音频事件6/6与黑洞衰减1/1通过。
- 浏览器验证：63项目录加载；Sam搜索仅8项；Boss切换保持单个活动声音；Sam/Tibo卡片播放停止与慢放；声音面板Space开启/关闭均成功；游戏内目录入口有效。
- 对真实共享WebAudio音源离线渲染：37个动作音、16个Boss动作、4档配乐、5个机房环境均产生有限有效波形，无削波。黑洞10/30/65格RMS约0.04598/0.02480/0，远离衰减符合预期。
- 子代理审查发现并修复Boss暂停续播丢失持续蓄力声；复审未发现其他高置信问题。
- 截图：output/audio/sound-library.png。最终目录停止试听，避免留下背景循环。
- 工作区并行修改了首页、资源路径与游戏控件布局；本任务保留这些变化，声音路由与入口已在最新页面验收。
