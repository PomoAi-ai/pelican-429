# REVIEW -- 全站加载检查

## Status: done
## Task: 243
## Related: 239, 240, 241
## Baseline Commit: 8a8fe8c

## Scope
- 首页、资源目录、主线/序章/游戏/手机入口、机房、角色/资源/功能展示、画质对比、声音目录。
- 检查静态依赖、压缩资源覆盖、渐进加载、请求顺序、并发与生命周期。
- 只读源码审查；浏览器使用现有生产构建的本地 preview（4176），不代表线上网络测速。

## Findings
严重程度为加载性能优先级；本次没有确认数据安全或功能不可用级 Critical。

| Priority | Conf | Verified | File:Line | Issue | Suggestion |
|----------|------|----------|-----------|-------|------------|
| P1 | 100 | 浏览器+文件大小 | src/config/showcase.ts:42–50 / src/ui/character-stage-panel.ts:37 | 角色目录使用8张原PNG，共9,836,633 B；现有对应home WebP合计133,564 B | 目录复用现有WebP，保留原图用于明确原画检查 |
| P1 | 100 | 浏览器+构建依赖 | src/app/story-app.ts:9,42–49 | 序章入口静态依赖整个game-app，且在导入intro前并发7 GLB+4背景，共10,585,174 B | 先显示序章，再按阶段预取游戏，进入时动态导入game-app |
| P2 | 100 | 浏览器+调用链 | src/app/showcase-app.ts:121 / src/app/showcase/stage-actor.ts:56 | resources/lab及部分非人形角色预览无条件等待2,176,804 B Grassy模型 | 按真实角色加载；纯鹈鹕复用现有无Grassy分支 |
| P2 | 100 | 浏览器+调用链 | src/app/texture-compare-app.ts:211–213 / src/render/npc/npc-rig.ts:119 | 默认Sam五档连带五档Grassy装备，实际10 GLB共38,423,068 B，所有档位完成后才建立视图 | 保留原版对比用途，各栏独立就绪、优先可见压缩栏；再评估装备资产粒度 |
| P2 | 100 | 源码+浏览器完成加载 | src/app/intro-app.ts:444–452 | 全部617,586 B剧情图片先加载，随后构造后段才使用的完整堡垒，最后才出现播放页 | 优先首幕，后段资源按时间预取；堡垒在世界段41.5秒后才用到 |
| P2 | 100 | 浏览器请求时序 | src/app/facility-app.ts:74–80 / src/app/facility-environment.ts:38 | Grassy→堡垒背景→四敌人完全串行，整个初始化结束才隐藏loading | 背景先呈现，独立必要请求并行，角色分阶段补齐 |
| P2 | 100 | dev页面浏览器请求 | index.html:249,251,261 | 非首页也下载隐藏首页poster/avatar/QR，去重156,823 B | 首页分支才激活图片 |
| P3 | 100 | 构建文件 | index.html:8–28,237–240 | 所有页面下载全站16份合并CSS，111.5 kB raw/23.3 kB gzip | 保留基础CSS，页面专用样式随入口加载 |

### 量级说明
当前首页95–96 kB入口不代表完整首页成本。按现有dist遍历静态依赖、每文件独立gzip后累加如下（十进制kB）。不含HTML、CSS、图片、GLB、KTX2、WASM，也不代表线上服务器已启用gzip。

| 页面/阶段 | JS raw kB | JS gzip kB |
|---|---:|---:|
| 公共入口/首页静态内容/资源目录 | 96.2 | 41.2 |
| 首页实时背景阶段 | 1297.9 | 420.7 |
| 首页环境完成 | 2156.7 | 734.8 |
| story静态依赖 | 2301.9 | 788.1 |
| 新主线含序章 | 2470.5 | 853.4 |
| 游戏/Boss/章节/操控 | 2300.1 | 787.1 |
| 独立序章 | 1761.2 | 594.3 |
| 角色/资源/功能展示 | 2209.3 | 742.4 |
| 机房 | 2111.4 | 715.6 |
| 画质对比 | 1181.0 | 369.6 |
| 声音目录 | 127.4 | 54.6 |

### Filtered by Verification
- 首页下方图片等待顶部完整初始化是用户明确要求，不作为顺序缺陷；代价是慢网下立即下滚仍需等待顶部。
- 对比页有意加载原版、历史模型检查有意加载历史规格，不误报为漏用compact。
- 正式9种生产模型均有512/256 compact产物，默认映射正确；主线GLB字节缓存及堡垒缓存复用，无证据显示同一流程必然重复下载。
- 目录卡片已有视口懒创建/离屏暂停/过期结果校验；声音目录按点击合成，不提前下载整套音频。

## Validation Results
| 检查 | 结果 | 说明 |
|---|---|---|
| 三个子代理只读审计 | 完成 | 游戏/序章、展示场、构建依赖分别交叉核对 |
| 现有dist本地preview :4176 | 完成 | 本地生产产物，目录时间21:57；没有重新构建或部署 |
| dev/resources/sounds/story/compare/showcase/facility/lab/intro/game/Boss/controls/fortress | 通过加载 | 观测时loading关闭、错误面板隐藏；查看Resource Timing请求路径/先后，缓存可能命中，不把本地耗时当冷启动性能 |
| 目录PNG与压缩图大小 | 已核实 | 9.84 MB → 0.134 MB，复用即可减少约98.6% |
| Sam画质对比依赖 | 已核实 | 21.76 MB Sam + 16.66 MB Grassy，共38.42 MB |
| 首页 | 本轮preview完成加载，无错误面板 | 无GLB请求；前序实测下方13图按可见性，本轮核对顶部优先逻辑保持 |
| npm test/typecheck/build | 未运行 | 本次只读加载审查，不重复功能测试；不对其他会话正在修改的逻辑给通过结论 |
| 手机真机/线上/CDN/限速/LCP | 未测 | controls仅桌面入口；未测触屏iframe、线上压缩和缓存响应头 |

## Conclusion
- Assessment: Approved with notes（加载优化仍有8项问题，无确认的功能阻断）。
- 首先处理大PNG缩略图、序章提前加载游戏、resources/lab无关Grassy；随后做对比页分栏就绪和机房/序章渐进加载，最后拆全局图片与CSS。
- 本次只新增此审查记录，没有修改源码、配置、测试，也未提交推送。
