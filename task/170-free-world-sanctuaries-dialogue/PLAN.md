# PLAN -- 自由世界安全区域、可摆脱追击与居民对话

## Status: done
## Task: 170
## Related: 169, 157
## Baseline Commit: 3a35077

## Goal
飞行器能被甩开；怪物避开房屋和NPC生活区且不在其中生成；重新绘制并实现居民对话界面，每次交谈有不同台词，参考身份确认后的X公开言论提炼。

## Non-goals
NPC任务、交易、战斗、变身；全图寻路；修改章节既有难度。

## Acceptance Criteria
- 自由世界飞行器追击有速度/持续时间/视线丢失/返航与重新警戒间隔限制，玩家能脱离。
- 房屋与NPC活动区域在生成和实时追击均为安全区，怪物不越界，不继续投弹。
- 绘制对话概念稿，实装角色肖像、清晰的说话内容和少量交互；支持中英、键盘和移动屏幕。
- 每次开启对话切换内容且相邻不重复；无功能承诺；现实言论只作改编，不冒充逐字原话，保留来源记录。

## Decisions
- 沿用169 terrain上下文增加LevelData.safeZones可选矩形列表，仅自由世界生成，章节不带该字段。
- 世界代理负责生成安全区和排除出生；敌人代理负责飞行追击及实时区域避让；界面代理负责dialogue UI；根代理负责画稿、来源提炼、集成及验收。
- 用户确认是OpenAI的CEO Sam和ChatGPT负责人Tibo，检索对应@sama与@thsottiaux。X原站403，使用带原帖链接的公开嵌入/镜像交叉核对，详细来源与改编界限记录在docs/npc-dialogue-sources.md。
- 用户最新要求Tibo不用动物；自由世界预加载、居民渲染和对话肖像统一复用其human资源。
- 先用imagegen绘制概念稿，再用现有HTML/CSS和共享角色图片实装；最终人形稿为evidence/dialogue-concept-human.png。
- 两人各6组2句中英闲谈，角色独立洗牌，组内与轮次交界不立即重复；NPC仍仅交谈，不操作额度、战斗或发任务。
- 自由世界哨蜂6格/秒、追击最多8秒、丢失视线1.5秒返航；至少冷静3秒且回驻地再警戒。营地与渔屋在生成/移动/伤害/弹体层均受保护，推挤仅回滚至上一帧区外位置。
- 设计为已知局部改动，无不可回退操作，直接实施。

## Validation
- 新行为先失败回归：自由世界AI4项、模拟安全区3项、完整体型跨界与多房屋出生；修复后enemy相关64/64、free-world10/10、facility-level16/16通过。
- npc-dialogue独立洗牌与轮次不重复2/2通过。
- npm run typecheck通过；npm test 1698/1698通过；npm run build通过（449模块，3.54秒）；相关diff-check通过。无提交或推送。
- 同线程toolbar只读审查通过，无遗留确定缺陷。
- 浏览器实际加载中型自由世界，无控制台错误；验证Sam重新打开更换话题、组内换句、Tibo人形肖像、390px手机布局、英文台词、Esc关闭返回游戏。截图为evidence/sam-dialogue.png、tibo-dialogue.png、dialogue-mobile.png、dialogue-english.png。
- 曾因UI先写入而config文件未完成导致Vite缺失导入，已补齐并通过真实浏览器加载和构建验证。
