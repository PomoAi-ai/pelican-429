# PLAN -- AI住宅2按横版透视重组滨水背景

## Status: done
## Task: 496
## Related: 489
## Baseline Commit: c292d188

## Goal
以用户最新第一张平视滨水图为构图基准，第二张借用建筑造型；保留完整住宅游戏，只重组住宅2的环境纵深。

## Non-goals
不修改原住宅、存档、玩法、全局镜头或共享天气，不建立3D行走，不重画整张城市背景，不提交推送。

## Decisions
- 使用 dev 工作流，Ponytail Full；原工程存在大量其他工作，修改限定住宅2环境。
- 前轮已完成宿主调用探索，本轮子代理补充共享构件与透视审查。
- 规范以 core-coordinates 和 depth-definitions 确认 G 为准；背景实体 -7/-16，远景 -35/-70/-140。
- 复用已有逐栋原画，独立安排间距、尺度和层次；不用同一张城市图重复充当多层。
- 近岸及轨道用共享真实构件并留开口；河道内部不建房，轨道仅沿岸。
- 无需审批的可逆环境修改，直接实现并浏览器检查。

## Implementation Map
| 文件 | 内容 |
| --- | --- |
| src/config/harbor-painted.ts | 逐栋资源清单、轨道位置 |
| src/render/harbor-side-scene.ts | 分层构图、远景和昼夜颜色 |
| src/render/harbor-shore.ts | 真实近岸、后岸与轨道，复用构件 |
| src/render/harbor-painted-traffic.ts | 对齐轨道和分层开关 |
| src/app/residence-app.ts | 住宅2分层名称准确对应 |

## Validation
- [x] npm run typecheck，通过
- [x] npm test，1977项通过，302套件，0失败
- [x] npm --ignore-scripts run build，通过；保留现有大分块提醒
- [x] 浏览器正视、斜视、近岸/后岸分别关闭、晴天/雨天/夜景检查
- [x] 玩家横向47.5→46.2、跳跃1.5→3.3，机制正常；浏览器尺寸已恢复
- [x] 子代理限定改动审查；主线程目视补修铺装共面闪烁、两侧岸水缝与远城脚下缺少陆地

## Test decision
仅视觉构图和装配变化，不新增锁定网格/材质/常量的测试；由浏览器检验，运行现有回归。

## Evidence and limits
- evidence/front-day.png：最终白天正视，真实原住宅地图及新背景；evidence/oblique.png：厚度检查；evidence/rain.png：雨天。
- 不再加载原先整张主城图；复用逐栋已绘制的城市资源，未生成新图片。
- 本轮在residence-app只改住宅2分层标签；期间其他工作另行调整共享光照调用，未覆盖那些改动。
- 预览出现一次空响应，读检查HTTP200后新开同地址恢复；未重启容器。
- 未做长期帧率基准；远楼属于正视横版用的绘制素材，近岸与轨道为实体。
- 类型、测试、构建日志：/private/tmp/harbor-perspective-{typecheck,tests,build}.log。
