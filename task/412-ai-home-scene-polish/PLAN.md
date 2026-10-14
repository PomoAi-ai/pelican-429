# PLAN -- 住宅闪烁与标准尺寸、科幻显示及分层远景修正

## Status: done
## Task: 412
## Related: 411
## Baseline Commit: d2d72f4

## Goal
仅当前AI住宅场景：修复走动时格子闪烁，恢复可见太阳和明亮光照，按用户指定降低房高、四格窗与门口两格台阶、右侧能量门及开关激光、按附图制作动态立体全息投影、三种座椅朝向；逐层制作可见远景并反复实机核对。

## Decisions
- 应用dev/core-dev及Ponytail；上轮的共享资源调用探索可复用，独立子代理负责建筑、家具、背景，主代理负责布局与照明/太阳集成。未重复无关探索。
- 用户补充使局部闪烁修复扩大到多个模块，统一使用dev跟踪，不额外建FIX。
- 桌尺寸按指南2×2×1、桌面.99，床3×1×1、家具深1、实体深2、墙厚.2。
- 用户已确认采用C组合上半砖，净高一层5.5/二层5；窗总占4格按2×2，门口用两格长半砖踏步便于上下。
- 用户追加场景十倍：实际世界宽从128扩到1280格，高36格不变；建筑/家具尺寸不变，环境按128格分段与镜头可见范围加载，沿途放置真实可交互构件。
- 保留原存档；新默认布局与目录同步，已有摆放不被静默覆盖。
- 起始源码与测试快照：/private/tmp/ai-home-polish-start-snapshot。

## Implementation Map
| Area | Owner | Done |
| --- | --- | --- |
| 格子闪烁定位修复、能量门激光动画 | architecture | Yes |
| 立体全息显示、桌椅尺寸/三朝向 | furniture | Yes |
| 独立分层远景重做 | environment | Yes |
| 房高、窗、台阶、右门、太阳和明亮光照 | root | Yes |
| 行为与实际浏览器反复核对 | root/agents | Yes |

## Validation
- 类型检查、完整测试、构建各一次，变更后仅重跑相关项。
- 渲染与动画实机验收，不新增几何/材质常量测试。
- 已知基线：architecture.test.ts误判art-library.ts描述里的platform/window sizes，相关文件不在本轮范围。

## Final Decisions
- 实际范围1280×36；默认741个摆放构件，34种实际使用资源。保留角色/家具大小，不改变用户已有存档坐标。
- 主屋地面Y=2、C楼板顶Y=8、屋顶底Y=13，对应净高5.5与5；窗全部2×2。主屋上下层左右能量门各一，服务区左右门各一。地面入口外延两格半砖台阶，楼上门外补平台。
- 闪烁根因已在真实截图复现：128格蓝色基座与白铺装顶面同为Y=1.5。基座降到1.4接铺装底；额外消除能源柱、栏杆、门梁、床及柜类的外露共面。共享阴影数值稳定，未无依据更改stage、shadow-fit或post-fx。
- 全息球使用饱和蓝色普通透明主体与叠加外晕，避免浅墙前多层发白；动画60秒采样包络2×1.918×1，桌面.99。三椅朝向均在1×2×1、座面1内。
- 天空天体放在远景可见方向，日景保留正面补光；太阳、环境、游戏与目录共享工厂。
- 背景五层真Group，近园/温室窗廊/峡谷瀑布高架/玻璃主城/远山卫星城；按128格分段、镜头可见范围创建和释放，宽幅总览降低植物细节。
- 审查发现并修复两类传送问题：新建方块封住分段目的地和能源区台阶内出生，统一走带preferredX的安全落点；建造自由镜头传送不跟随，已同步分区取景和返回入口。
- 分层元数据放config供UI与render共同引用，消除UI对render的运行时依赖。

## Validation Results
- 最终 npm run typecheck：通过。
- 最终 npm run build：通过；仍有既有chunk大于500kB提示，无构建错误。日志 /private/tmp/ai-home-polish-final-build.log。
- npm test：1897项，1894通过、3失败，日志 /private/tmp/ai-home-polish-full-test.log。
  - 本次HUD导入render的分层违规已修复。
  - worldgen耗时中位数266.1ms超过250ms，在定向复跑中通过；没有改测试阈值或实现。
  - 剩余基线失败：src/config/art-library.ts第606行资料描述platform/window sizes被正则识别为window；cmp与本轮起始快照一致，未改无关资料。
- node --test test/residence.test.ts test/architecture.test.ts test/worldgen.test.ts 复查：66项65通过、1既有资料文案失败；住宅16项全部通过，架构新增违规消除，worldgen全部通过。日志 /private/tmp/ai-home-polish-focused-test.log。
- 相关diff空白检查通过。没有新增源码字符串/材质细节/常量测试，临时几何与动画检查脚本未加入仓库。
- 浏览器：同一路段修前黑白三角面、修后复走稳定；左右台阶通行；右门关闭阻挡、开门通行；全息形态动画；五层逐层显隐；第10段及1280全览；原建造存档保留；建造第10段自由镜头与返回门口。新建游戏验证页没有运行错误；目录日志只有编辑过程中旧模块热更新的已失效报错，最终页面运行正常。

## Proofs
- assets/concepts/ai-city-residence/polished-residence-preview.png
- assets/concepts/ai-city-residence/polished-entry-walk.png
- assets/concepts/ai-city-residence/polished-door-closed.png
- assets/concepts/ai-city-residence/polished-door-opening.png
- assets/concepts/ai-city-residence/polished-workstation-preview.png
- assets/concepts/ai-city-residence/polished-layer-distance.png
- assets/concepts/ai-city-residence/polished-layer-city.png
- assets/concepts/ai-city-residence/polished-layer-canyon.png
- assets/concepts/ai-city-residence/polished-layer-architecture.png
- assets/concepts/ai-city-residence/polished-world-east.png
- assets/concepts/ai-city-residence/polished-world-overview.png

## Limits
- 没有提交、推送或部署；没有清空/迁移用户已有住宅存档。
- 本轮只做当前住宅院区，背景建筑是表现层，玩法在标准2D可行走层；没有增加其他场景主题。
- 尚未做低配设备长时间性能测试；沿途采用重复的同风格构件并分段加载。
