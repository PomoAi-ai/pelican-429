# PLAN -- 游戏化后半段与贯穿交响

## Status: done
## Task: 072
## Related: 071
## Baseline Commit: 无 HEAD

## Goal
重设计降智后的过场图像与终场界面，交响乐贯穿完整55秒开场。

## Acceptance Criteria
- 重绘失控、梦境、落地场景为一致的横版动作游戏构图，清除烘焙文字。
- 后半段有动态角色状态、关卡目标、阶段推进等游戏化演出。
- 终场替换遮挡大黑卡为游戏任务启动HUD，保留双语宣言与进入游戏。
- 音乐从序曲连续桥接至后半段，各场景有统一动机，暂停/定位仍正常。

## Decisions
- 使用dev、Ponytail、imagegen技能；内置图像工具重绘并保存新版本，不覆盖原素材。
- 原画参考保留角色身份，拉远镜头、明确可通行平台，文字由实时UI绘制以支持双语。
- 音频、终场UI分别由原子代理独立探索/实现，主代理负责素材与Canvas过场；沿用已探索的语言/音频契约。
- 不更改游戏逻辑与既有剧情拍点，不提交。

## Implementation
- [x] 图像生成、检查、落盘及资源接入。
- [x] 后半段动态游戏HUD与镜头适配。
- [x] 连续交响与终场任务界面。

## Validation
- [x] 类型检查、全量测试、构建。
- [x] 浏览器中文/英文、窄屏、过场和最终画面。
- [x] 音频调度检查与独立审查。

## Results
- 三张新PNG由内置imagegen生成并检查；骑行图经过定向编辑去掉烘焙车轮，保留现有动态车轮剧情。提示词完整记录在IMAGE-PROMPTS.md。
- transformation复用新入侵底图，在四拍羽片揭示中转换为新裂隙骑行图；原始素材全部保留。
- 新图共用原故事渲染，轮位/落地点随素材更新；finale独有动态HUD与终场UI，其他版本音频不变。
- npm run typecheck通过；npm test 1514/1514通过；npm run build通过，最终图修正后再构建通过。仍有既有大chunk提示。
- node $TMPDIR/check-finale-continuity.mjs通过：413音符到55秒、22.5~55秒每50ms持续弦乐、九个恢复入口排程到终点、pause停止所有音源并断开节点。未主观试听或最终混音峰值测量。
- 浏览器验证新入侵/骑行/最终场景，中途继续播放；390×844英文终场文字与CTA完整，恢复默认视口；控制台无错误。
- 独立审查发现烘焙车轮与动画重复，修图后已复核解决；无剩余发现。
- 截图 $TMPDIR/game-cinematic-final-zh.jpg、$TMPDIR/game-cinematic-breach.jpg、$TMPDIR/game-cinematic-rift.jpg。
