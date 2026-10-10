# PLAN -- 岩土地形组合定义与透视场景

## Status: done
## Task: 366
## Related: N/A
## Baseline Commit: 975f136

## Goal
把泥土中的岩层、连接空岛底部的岩体、含矿岩层作为连续地形组合补进基础概念定义，并接入现有可进入的透视场景。

## Non-goals
不新增采矿、掉落、坍塌、存档或经济系统；不将整组岩体作为单个可挖除对象；不修改无关的未提交工作。

## Acceptance Criteria
- 基础概念页可查看三类组合的定义、线框图片并进入对应透视场景。
- 透视场景实际展示土/岩交界、与岛体相连的底岩、嵌入宿主的矿物；支持既有角度、格线、半透明和玩家查看功能。
- 中央实体深1、矿物不重复形成宿主碰撞；场景资源使用共享形态/材质/生成函数。
- 文档明确设计范围与已实现的演示；运行typecheck、全量测试、build并完成浏览器目视检查。

## Constraints
已有工作区包含大量未提交改动，限定本任务文件范围；不读其他任务历史，不提交或推送，不把测试加入CI。

## Decisions
- 用户的“投诉场景”按上下文理解为“透视场景”。
- 复用现有资料与透视展示流程，继续按格定义地形；矿物是岩格属性，散石为独立补充。
- 本轮开始时涉及的已有文件快照存入/private/tmp/pelican-rock-baseline，用于区分本次差异与原有未提交工作。
- 探索与架构由explorer子代理完成：在现有单独场景中新增三个section，复用DefinitionKit的同源轮廓、格线和碰撞，不新增scene路由。
- 地形组合放在纯数据ROCK_TERRAIN_SCENES中；线框图直接导出同一份数据，避免图示与实际演示坐标分叉。
- 岩土材质适配现有generateTileTextures的dirt/stone层；矿物使用共享晶体资源，外观不额外添加碰撞。无需用户独有信息，没有不可逆或对外操作，设计直接通过。
- 仅新增演示与定义，不写锁定three网格、材质细节或常量的测试；行为回归使用现有碰撞与架构测试，视觉由浏览器检查。

## Implementation Map
| # | File | Intent | Depends | Done |
| --- | --- | --- | --- | --- |
| 1 | src/config/rock-terrain.ts | 三种同源格子组合数据 | — | yes |
| 2 | src/render/definition-terrain.ts | 复用游戏岩土纹理与矿物外观 | 1 | yes |
| 3 | src/render/definition-kit.ts | 岩土地形使用同一轮廓、格线与碰撞入口 | 2 | yes |
| 5 | src/app/definition-scene-layout.ts | 单独场景目录增加三类组合 | 1,3 | yes |
| 6 | docs/natural-rock-definitions.md | 补岩层、空岛底岩和含矿体定义及入口 | 1 | yes |
| 7 | assets/concepts/scene-depth-guide/draw_rock_combinations.py | 同源线框与占格图 | 1 | yes |
| 8 | assets/concepts/scene-depth-guide/build_natural_resource_documents.py | 发布岩石定义和公开副本 | 6,7 | yes |
| 9 | src/ui/site-pages.ts | 基础概念目录增加岩土入口 | 8 | yes |

- 直接在现有场景装配循环接入，省略无额外职责的definition-rock-layout包装文件。
- room-scene-preview按当前岩土分区返回natural-rock定义；definition-inspection保留半透明克隆的原着色钩子。
- 审查发现并修复矿物半透明着色丢失、纹理三次重复生成；复核通过，纹理数据在一次布局内生成一次，各视图负责自身GPU纹理释放。

## Validation
| Command | Required | Done |
| --- | --- | --- |
| npm run typecheck | yes | exit 0 |
| npm test | yes | 1860/1861通过，唯一性能阈值失败；隔离复测通过 |
| npm run build | yes | exit 0 |
| 线框生成与坐标检查 | yes | yes |
| 浏览器目视检查基础概念与透视场景 | yes | yes |

### Manual evidence
- 同源图生成：29格土中岩层、30格空岛底岩、27格含矿岩层；占格唯一、矿格宿主、实际包络断言通过，图片已检查无文字遮挡。
- 浏览器：基础概念岩土章节及三张图加载，点击进入场景、定义返回链接、三种组合、实体/半透明/格线、斜视和俯视均检查。浏览器error日志为空。
- 截图：output/rock-terrain/{soil-solid,island-transparent,ore-transparent}.png。
- 临时行为检查：三出生点站稳、空岛下无隐形地板；shader克隆/切换以及资源释放均通过。

### Final validation
- npm test首次全量：1861项，1860通过、1项失败。worldgen既有性能阈值在并行负载下中位425.4ms超过250ms；本任务不涉及worldgen，未修改断言。
- node --test test/worldgen.test.ts 隔离复测：29/29通过，exit 0。未重复全量，保留首次不全绿事实。
- build有大于500kB分块提示；测试有Node localstorage-file警告。无类型/编译错误。
- 审查子代理复核通过；测试子代理确认无本次行为回归证据。日志位于/tmp/pelican-rock-{typecheck,test,build,worldgen-recheck}.log。
- 已保留基础概念页浏览器标签，未提交或推送。范围截止定义和可进入透视演示，主世界采矿、掉落、坍塌不在本轮范围。
