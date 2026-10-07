# PLAN -- 主角柔软短发重做

## Status: done
## Task: 312
## Related: 311-character-hair-rebuild
## Baseline Commit: 2a5455a

## Goal
用户拒绝上一版外观，只重新制作主角头发，从绘图到建模消除厚叶片、规则鳞片感。

## Non-goals
不修改 Boss、头脸、身体、战斗和共享动画运行时，不提交推送。

## Acceptance Criteria
- 主角头骨与五官保持原样，头发为独立资产。
- 按新三视图形成自然柔软的短碎发、连续侧后发流与细束质感。
- 真实三视图与浏览器检查通过后替换主角资产。

## Decisions
- 复用已完成的资源接入探索，仅委派主角造型探索和建模。
- 新图使用内置 imagegen；用户可继续选择质感，暂按自然柔软短碎发制作。
- 子代理定位到旧叶片鼓肚截面和规则纬度叠层为造型问题；重写主角几何，复用根部固定与两节骨链契约。

## Validation
| Command | Required | Done |
|---|---|---|
| 主角真实三视图与浏览器动画检查 | yes | passed：三视图、站立/冲锋/下落气流、正式展示场快跑 |
| npm run typecheck | yes | passed |
| npm test | yes | passed：1806 tests / 301 suites |
| npm run build | yes | passed：保留现有 chunk 大小提示 |

## Final outcome
- 仅替换 public/characters/hair/grassy.glb。4 套 Boss 头发与本轮开始 SHA256 一致；头脸/身体/共享动画运行时未修改。
- 新主角生成器 grassy_groom.py：53 条两节骨链、1246 根细子束、237284 三角面、11865284 bytes。纵向18点采样。刚性 HairCap；146970 个蒙皮顶点权重和为1；无内置动画，骨架只含独立头发骨。
- 自然短发图稿保存在 grassy-soft-hair-turnaround.png，真实模型三视图为 grassy-soft-hair-model.png。当前3D效果偏整齐的侧分短发；图稿是方向参考，不表示与模型完全一致或用户已批准。
- 渲染检查修正了悬空高拱、露底帽和刘海穿插。正式展示场与共享hair-rig候选预览均无控制台error。
- 独立子代理只读审查未发现高置信度正确性问题；造型审美由用户继续评价。未新增自动视觉测试，未提交推送。
