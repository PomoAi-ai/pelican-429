# PLAN -- AGI 降智风暴 序章

## Status: done
## Task: 084
## Related: 077
## Baseline Commit: N/A（仓库尚无提交）

## Goal
将“第十二乐章 · 终版”定为最终前导并更名为「AGI 降智风暴 序章」；检查其文案、拍点、音画同步中的问题并修正；加强序奏音乐的力度与旋律性。

## Round 2（用户追加：修改下文字；音乐节奏你都发挥下）
- 播放页/开始页与动画内字幕由我拟稿重写，语气更有冲击力、扣“降智风暴”，中英文一致；音乐节奏在现有主旋律上继续强化（切分、填充鼓、渐强/落差、故障段节奏化），授权自由发挥，拍点与 FINALE_CUES、画面 HITS 不变。

## Non-goals
- 不改其他开局版本的音乐与画面。
- 不改游戏玩法与后续章节剧情。

## Acceptance Criteria
- 入口、播放页、HUD 等用户可见处使用新名称（中英文一致）。
- 检查出的内容问题（文案与画面/拍点不一致、错别字、时长描述等）已修正。
- 序奏有清晰可哼唱的主旋律贯穿，低音与打击乐更强劲，峰值不削波。
- 拍点、暂停、定位、中英文切换行为保持。

## Constraints
- 逻辑层分层规则不变；音频与渲染由人在浏览器中验收，不写自动测试。
- 复用现有合成乐器，不新增依赖。

## Decisions
- 跳过 architect：两份探索报告已把问题定位到文件与行号，以下设计逐文件写明，无方案分歧；无停止条件，直接实现。
- 名称：中文「AGI 降智风暴 · 序章」，英文 “AGI BRAIN-DRAIN STORM · PRELUDE”；保留 `id: 'finale'` 与 URL，避免牵动 CSS 选择器与音频分支。
- “最终前导”：首页卡片与开发导航直接链接 `/?mode=intro&opening=finale`；目录页保留，作为“比较其他版本”的入口。
- 主题扣“降智”：14–16.5 秒“路由迷航 / 智商信号掉线”是叙事核心，音乐在此加入故障化主题（断续、失谐、下坠滑音），16.5 秒升调后主题完整回归。
- 音频问题（探索结论）：无贯穿主旋律；主奏仅用短衰减槌击/钢琴且音量 0.07–0.13；终版独有 −18dB 压缩器无补偿增益；低音 44–65Hz 在小扬声器听不到；kick 每秒一下且 7.5–12 秒重拍错位到 7.5+n；回声 0.23s 不在八分音符网格；定音鼓与弦乐跨 16.5 秒升调点；22.5 秒交接响度断崖，进行曲主题 24 秒才出现。
- 文案问题（探索结论）：12–14 秒“其他模型退入背景”与画面相反；14–16.5 秒“真正的主角还没登场”与同屏 GPT-6 ASTRA 矛盾；22.5 秒后“进入梦境”实为进入房间；中英“窗、桌”与“room, desk”不一致；“谱线构成”与画面（电路走线）不符；目录文案提到画面里没有的“海潮”、不存在的“十二乐章”；字幕分段用硬编码数字而非 FINALE_CUES。
- scoreRate 保持 `32 / duration`：与 FINALE_SCORE_RATE 数值相同，单独分支无收益。
- 页面标题：其他版本由 startIntro 设置 edition.name；终版在 syncLanguage 中随语言用 genre 覆盖。
- 审查修正：14–16.5 秒阶段名改为“信号掉线 / Signal lost”；终版标题后缀随语言；加载层提前显示所选版本名称。
- 补偿增益 1.8：离线近似估算音乐峰值约 0.75，叠加未压缩故事音效在 47.5 秒落地处约 0.85，余量约 1.5dB，需浏览器实测；故事音效相对音乐弱约 5dB。
- Round 2：文案由主代理授权拟稿（播放页、目录页、字幕改为短促有梗的语气，引用画布原话）；节奏加入心跳/滴答、切分低音、ghost 军鼓、段落入口滚奏与渐强、故障段 stutter；离线估算 24 秒前峰值 0.73–0.76，FINALE_MAKEUP_GAIN 保持 1.8。升调与三记齐奏保留，与字幕一致。
- 不改：故事音效轨（24 秒后羽化音固定频率与升调冲突）、未接入的 intro-overture* 模块、模型名称核实——记入汇报。

## Implementation Map (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/app/intro-finale-score.ts | 0–24 秒重写：贯穿主旋律、稳定律动、重拍对齐 8+n、可闻低音、14–16.5 故障主题、16.5 后主题全奏、22.5 起进行曲主题提前进入；不跨 16.5 秒升调点 | - | Done |
| 2 | src/app/intro-audio.ts | 回声 0.25s 对齐八分音符；终版压缩器后加补偿增益；scoreRate 复用 FINALE_SCORE_RATE | - | Done |
| 3 | src/config/intro-finale.ts | 字幕分段改用 FINALE_CUES；修正中英文案与画面不一致处；注释改名 | - | Done |
| 4 | src/config/intro-editions.ts、src/config/intro-language.ts、src/app/intro-gallery.ts、src/app/intro-app.ts、index.html | 更名与目录/播放页文案修正，首页入口直达终版 | - | Done |
| 5 | src/render/intro-finale.ts | 开放模型标签 20 秒后不回到第 0 组压住 ASTRA；与字幕一致的画布文字 | - | Done |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | Done |
| npm test | yes | Done（1532/1532） |
| npm run build | yes | Done（既有大 chunk 提示） |
| 浏览器人工试听/观看 /?mode=intro&opening=finale | no（由用户验收） | |
