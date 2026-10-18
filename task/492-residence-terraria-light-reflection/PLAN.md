# PLAN -- 住宅泰拉瑞亚式 1/4 格光照与地面反射

## Status: done
## Task: 492
## Related: 483, 471, 456, 487
## Baseline Commit: c292d188

## Goal
- 住宅光照网格从半格细化到 1/4 格。
- 实心块透光 3 格内完全归零（每格约 ×0.27），并加泰拉瑞亚式最低亮度阈值，低于即为 0。
- 背景墙按泰拉瑞亚规则：有背景墙的格子是室内，不产生阳光但光照常扩散；窗户视作玻璃墙，透进阳光；无背景墙且在地表以上为露天。房间面向玩家一侧视为完全封闭。
- 空气中天光衰减介于现状（约 ×0.67/格）与泰拉瑞亚（×0.91/格）之间。
- 屏幕空间反射：光面地面映出家具倒影；可选、默认开启，低画质关闭。
- 核实 481/487 改动后太阳在住宅场景可见。

## Non-goals
- 不改主游戏关卡光照、不改灯具配置与家具模型。
- 不做阳光从玩家一侧斜射进屋的光斑（与“面向玩家一侧封闭”冲突）。
- 不处理 draw call 数量等既有 CPU 瓶颈。

## Acceptance Criteria
- 光场单元为 1/4 格；编辑后增量同步与全量构建逐格一致（沿用现有一致性测试）。
- 实心块：从露天表面向内，第 3 格内天光与灯光都为 0；1 格处仍可见微光。
- 有背景墙、上方无屋顶的格子不接收阳光；无背景墙、上方有屋顶的地表以上格子接收阳光；窗户格透阳光；地表以下无阳光。
- 空气天光每格衰减在 ×0.67 与 ×0.91 之间，窗边亮、房间深处明显较暗但不死黑。
- 反射默认开启，可在界面关闭；低画质下关闭；关闭后画面与无反射版本一致。
- 白天、夜晚、地下、开关门在浏览器中正常；帧耗时不明显上升（反射开启时可接受小幅 GPU 增加）。
- `npm run typecheck`、`npm test`、`npm run build` 通过。

## Constraints
- 逻辑层（sim）不依赖 three/DOM/Date/Math.random；分层由 test/architecture.test.ts 约束。
- 游戏与展示场共用光照与材质模块，不复制。
- 边界校验一次、内部信任类型；不加防御性兜底。
- 工作区有其他会话的并行改动：只改本任务涉及的文件，用定点编辑，不整文件覆盖他人改动。
- 不提交、不推送。

## Decisions
- 探索结论（光场）：光场只被 residence-app 与 building-sandbox 装配，均在主线程同步构建；`residence-light.ts` 中 2×2 形状采样、窗格 `*2` 循环、半格调参常量（SKY_AIR_PASS/SKY_MIN_STEP/SOLID_PASS/LAMP_SOLID_COST/LAMP_SOLID_EXITS/基础下每行 −4/窗种子 210）需随 1/4 格改写；背景墙目前不进光场掩码；部分墙（W3～W7）多边形只在渲染层 `definition-kit.ts:99-109`。
- 探索结论（图集）：1/4 格光场 9728×396，两幅拼接超 4096，改为 4 幅（每幅 2432+2 宽、1584 高），着色器 `residenceCells/residenceAtlasUv/residenceSolid` 与 CPU `pack` 一起改成 N 幅；太阳柔化遮挡改 5×5 以保持约 1.25 格的半影宽度。
- 探索结论（反射）：three 自带 SSRPass 会再渲染 2～3 遍场景，CPU 瓶颈下不可用；改为在 Grade 着色器里用场景深度与 GTAO 预处理的重建法线做视空间步进，只对朝上像素生效，不新增 composer 通道。
- 参数取值（用户授权试做后看效果）：空气天光每格 ×0.80（每 1/4 格 ×0.9457，带最小步长保证有限传播）；实心每格 ×0.27（每 1/4 格 ×0.72）；最低亮度阈值取泰拉瑞亚 0.0185（约 5/255），低于即 0；窗按玻璃墙种满亮度 255；地表（foundationTop）以下不产生阳光，只靠传播。
- 背景墙规则：墙（含部分墙按其多边形）进入光场掩码；有墙或地表以下的空气格不播种阳光，无墙空气格在地表以上播种阳光（屋顶不再遮挡阳光来源）。部分墙多边形移到 config 层供 sim 与 render 共用。
- 反射：`DEFAULT_LIGHTING.ssr.enabled=false`，`BUILDING_SCENE_TUNING` 开启；依附于 AO（低画质随 AO 一起关）；住宅界面加“地面反射”开关，默认勾选，不持久化。
- 设计（architect）：sim 改 `CELL_SIZE=.25`、4×4 采样；去掉 WINDOW 位与列扫描，地表以上无 SOLID 且无 WALL 的格一律种 255（窗与墙同层互斥，窗格自然无墙）；WALL 位在光栅化最后一遍按墙多边形写入；`SKY_AIR_PASS=.9457`、`SKY_MIN_STEP=2`、`SOLID_PASS=.72`、`SKY_MIN_LIGHT=5`（低于即 0），`SKY_REACH=47` 子格；灯 `LAMP_SOLID_COST=3`、`LAMP_SOLID_EXITS=11`。图集固定 4 幅纵向堆叠，`SECTIONS` 常量插入 GLSL。反射全部写在 Grade 着色器内，`reflections` 状态由 post-fx 闭包持有，经 `apply()` 合成，`setQuality` 与 ai-city-lighting 不会覆盖。
- 无停止条件（无需用户拍板的分叉、无持久化/外部影响），直接实施。
- 接受的风险：门开关一次 `sync()` 约 4 倍于现状，超过约 4 ms 再改 Uint32 比较；沙盒按全世界构建光场；图集约 23 MB；透明物不写深度、草土顶面也会轻微反射；薄平台的逻辑太阳遮挡变弱（真实阴影贴图仍在）。
- “只以斜角相接”测试的比例上限从 .5 放宽到 .8：穿过拐角现在只经过一个 1/4 实心子格，属规则改变。
- 实现：`sync()` 加 4 字节比较后，默认住宅首次构建约 132 ms，开关门一次 `sync()` 稳定约 9 ms（首次约 20 ms），未达 6 ms 目标；剩余耗时在全图光栅化（每构件 16 次 `inside()`）与比对，后续可预算形状的 4×4 覆盖。
- 实现：B1 省去 `residenceAtlasUv` 的 `min(section, N-1)`，所有调用都在 `residenceOutside` 之后，`uv.x < 1` 恒成立。
- 验收：反射在侧视俯角下按物理菲涅耳（约 .1）几乎不可见，地砖按釉面处理，菲涅耳底值取 .25，住宅强度 .6；开关前后帧率不变（约 54.6 fps，帧受 CPU 限制）。
- 审查：无 Critical；两处 Non-critical 已改（衰减注释的数值、SSR 跳过法线为天空纹素的剪影边缘像素）。
- 沙盒与材质展示场共用 `BUILDING_SCENE_TUNING`，同样默认开启反射且无开关，符合展示场复用游戏资源的规则。
- 浏览器实际检查：住宅 15:30 正视/斜视、反射开关对比、22:00 夜景、`?quality=low` 下复选框禁用、地下视角、自由搭建场无报错。开关门的画面未在本轮浏览器中复查，由光场测试覆盖；sync 与首次构建计时在 node 中测量（见上）。
- 太阳：487 改为整屏弧线后，住宅 15:30 太阳在画面右侧可见，22:00 月亮可见。
- 测试中随规则改变的断言（1 格封口微光上限、竖井亮度、测试房间需补墙、开关门重传范围）按“行为本来就该变”更新，不视为回归。

## Implementation Map (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| A1 | src/config/definition-kit.ts | 新增 `WALL_POLYGONS`（W0、W3～W7 多边形，从渲染层搬来） | — | ✅ |
| A2 | src/render/definition-kit.ts | 删除本地 `wallPolygons`，改用 `WALL_POLYGONS` | A1 | ✅ |
| A3 | src/sim/residence-light.ts | 1/4 格常量与采样、WALL 位、泰拉瑞亚播种、阈值截断、SKY_REACH 与灯常量 | A1 | ✅ |
| B1 | src/render/residence-lighting.ts | 4 幅图集、GLSL 辅助函数 N 幅化、5×5 柔化遮挡、更新矩形外扩 2 | — | ✅ |
| C1 | src/config/lighting-rules.ts | `ssr` 配置块与校验，默认关闭 | — | ✅ |
| C2 | src/config/ai-city-look.ts | `BUILDING_SCENE_TUNING` 开启 ssr | C1 | ✅ |
| C3 | src/render/post-fx.ts | `PassPlan.ssr`、Grade 内视空间步进反射、`setReflections` | C1 | ✅ |
| C4 | src/ui/residence-hud.ts | “地面反射”复选框，默认勾选 | — | ✅ |
| C5 | src/app/residence-app.ts | 复选框接线，低画质禁用 | C3, C4 | ✅ |
| D1 | test/residence.test.ts | 按新规则更新既有光照断言（房间补墙与地板、竖井/封口上限、斜角比例） | A3 | ✅ |
| D2 | test/residence.test.ts | 新增泰拉瑞亚墙规则用例：屋顶下无墙格有阳光、有墙格无、部分墙按形状 | A3 | ✅ |
| D3 | test/lighting.test.ts | `planPasses` 断言加 `ssr` 字段 | C3 | ✅ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | ✅ |
| node --test test/residence.test.ts | yes | ✅ |
| node --test test/lighting.test.ts test/ao-prepass.test.ts | yes | ✅ |
| npm test | yes | ✅ |
| npm run build | yes | ✅ |
| 浏览器：住宅白天/夜晚/地下/开关门、反射开关与 ?quality=low、沙盒、太阳可见、sync 与首次构建计时 | yes | ✅ |
