# PLAN -- 现代堡垒前哨与动态黑洞

## Status: done
## Task: 131
## Related: 129-city-atmospheric-depth
## Baseline Commit: 无HEAD；改前快照 $TMPDIR/pelican-fortress-modern-before

## Goal
将古堡式前景改成建在岩体上的现代算力堡垒；黑洞有清楚可见的吸积盘、内旋光流和中心吞没撕裂动画。

## Non-goals
不改角色、战斗、世界碰撞、既有城市分层和章节入口。

## Acceptance Criteria
- 大块灰色重复断崖换成有大断面、裂隙和厚度的深青灰岩体及结构基座。
- 石柱、古拱桥和踏台替换为工业门墩、承重钢梁与明确可站立的平台边缘；尺寸符合现有碰撞。
- 苔藓集中在黑洞附近和岩缝，现代入口干净清楚；颜色协调已有冷色城市。
- 黑洞运动明显，中心保持极黑，吸积流/光撕裂有方向感，不只整体旋转贴图。
- 游戏和预览共享实现、时间与释放逻辑，动画暂停/恢复正常，无新增依赖。

## Decisions
- 用户已批准前景重做并明确要求动画，直接实施；保留玩法配置。
- 子代理独立探索前景地形链，黑洞代理负责单独效果模块，根代理整合共享前哨。
- 纯表现层变更浏览器验收，不写材质或源码字符串测试。
- 探索/设计：灰断崖来自世界瓦片而非前哨小石块；复用 block / finishSolid 生成两份带裂隙的棱面几何并实例化，使用无地衣斑点的青灰顶点色。四块交错大断面遮住重复瓦片，顶面严格依既有台阶与踏台。
- fortress顶行grass换stone，二者同solid和全砖形状，阻止自动草皮以匹配工业入口；地图几何和碰撞类别不变，仅保留黑洞/裂隙处显式少量植物。
- 黑洞时间通路正常，原shader混合/明暗幅度太弱；采用单平面材质差速吸积与定向撕裂，核心遮蔽不依赖时间。
- 用户已批准设计方向，无停止条件；直接实现，复用几何和材质，不需新图片。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/render/facility-blackhole.ts | 黑洞动态吸积与光流 | — | Yes |
| 2 | src/render/facility-approach.ts | 现代岩体前哨、工业踏台并整合黑洞 | 1 | Yes |
| 3 | README.md | 更新前景与动画说明 | 2 | Yes |
| 4 | src/world/facility-level.ts | 同碰撞材质去掉自动草皮 | — | Yes |
| 5 | src/render/facility-fortress.ts | 更新踏台共用说明注释 | 2 | Yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| 浏览器实机/预览、落脚面、动画与暂停验收 | yes | Yes |
| 子代理 review / diff-guard | yes | Yes |
| npm run typecheck | yes | Yes |
| npm test -- --test-concurrency=2 | yes | Yes |
| npm run build | yes | Yes |

## Validation Evidence
- 浏览器检查游戏与机房预览：青灰岩体、工业门墩、踏台与后置钢梁正确显示，角色起跳和落地正常，渲染日志无 warn/error。
- 固定镜头连续捕获 24 帧可见吸积流运动；暂停后两次截图二进制完全相同，恢复按钮状态正常。预览图片和动态图：output/chapters/fortress-industrial-preview.jpg、fortress-industrial-motion.gif。
- 独立审查对比四场景的 collisionAt、shapeAt、spawn 与 lethalCoolant 均一致；只有堡垒的 22 个顶部瓦片从草材质改为石材质，其他三场景无变化。
- review / diff-guard 未发现阻断项；岩片边界未侵入路面，单平面黑洞与实例化岩块均按现有路径释放，无新增依赖或渲染细节测试。
- 最终三个命令各执行一次并通过：typecheck 退出码 0；全量 1585/1585、300 suites、55.303 秒；build 397 模块、4.31 秒。构建仅有 prepare-out-dir 耗时与主 JS 体积提示。日志 $TMPDIR/pelican-fortress-modern-{typecheck,tests,build}.log。
