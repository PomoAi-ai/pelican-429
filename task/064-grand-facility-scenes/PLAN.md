# PLAN -- 巨型机房三场景

## Status: done
## Task: 064
## Related: 061
## Baseline Commit: 无 HEAD；本次受影响文件原件保存于 $TMPDIR/pelican-grand-before

## Goal
将山体算力堡垒、算力大教堂、光纤深渊三张已确认概念设计制作为实时 three.js 场景，直接加入独立机房页面。

## Non-goals
不实现 Boss AI、战斗关卡流程或发布，不修改 vendor，不以整张概念图代替实时场景。

## Acceptance Criteria
- 三场景均可独立 URL 进入，机房页面可直接切换；保留原基础场景。
- 堡垒包含自然外围、峡谷桥、多层机房与屋顶设备。
- 大教堂包含巨大挑空、五组算力塔、两侧楼台、中央终局设施和宽阔战斗面。
- 深渊包含悬空主桥、局部缺口、深井管道、两侧计算与网络区。
- GB300、NVLink 与 InfiniBand 分别体现计算、互连及跨柜网络；自然、角色和工业资产共享。
- 全景与局部镜头、缩放平移、动画控制有效，页面真实截图。

## Constraints
遵循 AGENTS.md、dev/core-dev/Ponytail；不新增依赖，不新增渲染/UI实现细节测试，不提交或推送。

## Decisions
- 探索复用上一轮完整入口与共享资源调用链；新增架构子代理复核坐标、光照、镜头与资源生命周期。
- 三套概念已由用户明确要求制作，无需设计再批准；以独立 scene 查询参数进行整页切换，避免多 WebGL 与环境残留。
- 游戏单位/角色尺寸不变，扩大建筑体量与阵列数量；高大厅镜头包含宽高约束，远裁剪面随取景距离加 256 后景余量，支持竖屏缩小。
- 平台逻辑使用已有 TILE_BRANCH 隐藏瓦片，工业工厂负责外观。
- 玩家平面的踏板由 FACILITY_PLATFORMS 统一供世界与模型读取，深渊下层检修踏板同步碰撞；z=-17 检修桥作为纯后景。
- 堡垒山体直接复用游戏岩壁几何和材质，工业地基加混凝土外观；所有场景复用 FacilityKit 的机柜、管线、踏板、风机及资源释放。
- 独立审查确认并修复竖屏裁剪、深渊检修踏板穿透两项问题，复核 Approved。下落回归先复现落至井底，再修复为落在 y=13。
- 类型检查及全量测试在本机手工运行；补齐真实截图资产后重跑构建，未修改 CI，未提交或推送。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/facility-scenes.ts | 四场景目录、尺寸与镜头、URL解析 | — | yes |
| 2 | src/render/facility-kit.ts、facility-view.ts | 共享工业构件 | — | yes |
| 3 | src/render/facility-fortress.ts | 山体堡垒 | 2 | yes |
| 4 | src/render/facility-cathedral.ts、facility-abyss.ts | 两座终局大厅 | 2 | yes |
| 5 | src/world/facility-level.ts、src/app/facility-environment.ts | 三场景地图与共享自然/角色 | 1 | yes |
| 6 | src/app/facility-app.ts、src/ui/facility.css | 页面场景入口与相机/光照适配 | 1,3,4,5 | yes |
| 7 | index.html、README.md、public/resources | 入口描述与真实缩略图 | 6 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes；通过 |
| node --test test/facility-level.test.ts | yes | yes；5/5 通过 |
| npm test | yes | yes；1505/1505 通过，0 failed，254 秒 |
| npm run build | yes | yes；通过，保留 Vite 大 chunk 提示 |
| 三场景浏览器视觉及交互验收 | yes | yes；四场景切换、局部镜头、缩放、动画暂停、复位、390×844 竖屏 75% 缩放与首页图片加载 |

## Deliverables
- 独立页面入口：`/?mode=facility`，按 `scene=fortress/cathedral/abyss/original` 直接访问。
- 三场景真实截图：`output/facility/fortress.jpg`、`cathedral.jpg`、`abyss.jpg`。
- 竖屏裁剪复核：`output/facility/cathedral-mobile.jpg`。
- 首页真实缩略图：`public/resources/facility-fortress.jpg`，来源登记于同目录 SOURCE.md。
- 全量测试日志：`$TMPDIR/pelican-grand-tests.log`。前轮的 render-tiles 失败在本轮完整运行中没有出现，未为其修改断言。
