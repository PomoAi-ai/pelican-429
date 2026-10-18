# PLAN -- 对照真实星舰发射重做升空表现

## Status: done
## Task: 511
## Related: 509
## Baseline Commit: c292d188

## Goal
仔细观察 SpaceX 星舰发射照片，将紧束白热喷流、膨胀湍流、厚重滚动烟云、火光照明与缓慢离架的尺度关系应用到现有交通中心试玩。

## Non-goals
不改登舱与副本流程，不换城市与角色，不复制照片进游戏资源，不添加依赖，不提交推送。

## Acceptance Criteria
- 地面烟云有厚度、明暗和滚动轮廓，遮住塔架底部，并被中心火光照亮。
- 发动机近场紧束，尾部逐渐膨胀破碎，没有平行布条形状与穿透地面的火焰。
- 点火先建立推力与烟云，舰体缓慢离架后加速，镜头保留塔架作为速度参照，最后保留短促化光。
- 真实浏览器完整发射和抵达验证，保存同阶段画面及动态记录。

## Decisions
- 沿用 509 已完成的场景与状态机探索；本轮只修改共享发射表现，复用既有运行路径。
- 参考 Space.com 汇集的 SpaceX 第四次飞行照片，直接查看离架俯拍、紧束喷流近景与远景；官方 Flickr 当前公开图库也已查阅。核心参照链接：https://www.space.com/spacex-starship-4th-flight-test-photos 。
- 主代理负责时间曲线、镜头、装配和视觉验收；子代理分别负责喷流与地面烟云，修改前完成对应设计与调用方核对。
- 将点火延长至 4.4 秒建立烟云，升空 8.5 秒由约 0.22 m/s 加速至约 14.85 m/s；镜头先留在塔架，随后跟随，并逐渐扩展以容纳长尾焰。发射局部曝光下调 18%，保留白热核心的亮度对比。
- 烟云使用独立于页面时间的累计燃烧时间，固定在发射台，升空后继续扩散；所有新增表现数据只在当前装配和共享渲染模块传播。
- 近场保留短喷口束，下方合成一股白热主喷流；密实喷流核心写入深度，避免城市背景的 AO 与反射在火焰上形成灰斑。
- 地面蒸汽使用 96 个有深度的程序化云瓣，核心遮挡、外缘混合。面片为噪声轮廓保留余量，避免方形截断；平滑球面法线混合少量褶皱，兼顾柔软轮廓与明暗。深度预通道跳过云光照计算。
- 视觉效果按仓库规则使用浏览器验收，不写网格/材质或源码文本测试。继续运行已有逻辑和架构检查。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|---|---|---|---|
| 1 | src/render/transit-exhaust.ts | 近场紧束、长白热核心与紊流混合尾焰 | — | yes |
| 2 | src/render/transit-pad-cloud.ts / transit-center-fx.ts | 密实翻卷烟云与火光 | — | yes |
| 3 | src/render/transit-center-model.ts / src/app/transit-app.ts / src/config/transit.ts | 发射时间契约、镜头、起步与加速 | 1,2 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | pass；最终渲染修正后通过 |
| npm test | yes | pass；1997/1997，约 40.34 秒；后续仅着色器视觉调整未重复全量测试 |
| npm run build | yes | pass；最终修正后通过，保留现有大于 500 kB 的 chunk 提示 |
| 浏览器完整发射、化光与抵达，记录截图和动画 | yes | pass；1280×720，真实键鼠登船与目的地选择，完整发射后进入算力大教堂；控制台无 error/warn |

## Review and Evidence
- 子代理分别完成烟云、喷流调整；独立复核未发现深度/颜色通道显隐、uniforms 共享及材质释放的新问题。浏览器发现的轮廓裁切和尾焰灰斑已修复并重录。
- 最终完整录屏：[launch-flight.webp](evidence/launch-flight.webp)，由实际浏览器截图按采集时间组装，末尾附抵达截图；不是离线宣传渲染。
- 关键帧：[点火](evidence/ignition.png)、[慢速离架](evidence/liftoff.png)、[加速](evidence/ascent.png)、[化光](evidence/warp.png)、[抵达](evidence/arrival.png)。`evidence/frames.json` 保存临时原始截图序列的阶段与采集时间。
- 检查输出保存在 `evidence/typecheck.log`、`evidence/test.log`、`evidence/build.log`。
- 未做手机或低端显卡性能实测、真实音响试听；烟云为适配横版游戏的程序化表现，不是流体物理仿真。本轮未改登船逻辑、主城放置或公共后期管线，未提交推送。
