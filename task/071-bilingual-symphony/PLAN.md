# PLAN -- 双语模型交响乐章

## Status: done
## Task: 071
## Related: 068, 070
## Baseline Commit: 无 HEAD

## Goal
开放权重模型融入神经乐谱；终场显示“使用前沿模型是人的基础权利！”；即时中英文切换；增强交响配器与动态。

## Acceptance Criteria
- 九种已有型号随乐谱节点出现，GPT/Claude继续占据主要段落。
- 完整开场结尾的口号中英文切换并持续显示。
- 切换语言不重启播放，控制与叙事文案同步。
- 音乐保持24秒音画时间线，以弦乐、铜管、打击乐渐强。

## Constraints
无新依赖，不提交，不改其他正在进行的游戏功能。

## Decisions
- 沿用已有型号配置及其已核实版本，不另增未经核实型号。
- 原模型底栏改为附着真实谱线的节点标注，不另建标签墙。
- 音频与双语由两个子代理分别探索、设计并实现；主代理沿用已完整探索的渲染路径，故不重复独立架构派工。
- 使用 dev、core-dev 与 Ponytail；无不可回退或对外操作，无需暂停审批。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/render/intro-finale.ts | 谱线模型与双语叙事 | yes |
| src/app/intro-app.ts 与语言配置/渲染帧/CSS | 双语切换与终场口号 | yes |
| src/app/intro-finale-score.ts 与音频模块 | 交响编排 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器中英切换、终场与乐谱检查 | yes | yes |

## Results
- 浏览器验证播放中切换中文→English，时钟由0.1秒连续前进至3.3秒且仍为播放状态；暂停、拖动、终场双语切换正常。
- 桌面1280×720和窄屏390×844核验英文终场、谱线标签；修复窄屏模型名与Astra副标题重叠，恢复默认视口并停在中文终场。
- typecheck通过。全量测试1514项中1513通过、1项架构检查误将英文字幕中的window单词识别为DOM引用；字幕改为room后，受影响architecture.test.ts 21/21通过。最终typecheck与build通过，大chunk警告仍在。
- 音频子代理通过公开接口验证7种音色有限值、单音峰值小于1，266个音符调度均在22.5秒休止前结束；浏览器启动与暂停正常，无控制台错误。未进行主观试听或最终混音峰值测量。
- 独立审查无阻断项；图像素材内烘焙的中文未改，英文覆盖动态文字、字幕、控制与终场。
- 截图：$TMPDIR/symphony-models-en.jpg、$TMPDIR/symphony-rights-zh.jpg、$TMPDIR/symphony-rights-en.jpg。
- 新增逻辑无静默兜底、异常吞噬、防御性检查或实现镜像测试，无新增依赖。
