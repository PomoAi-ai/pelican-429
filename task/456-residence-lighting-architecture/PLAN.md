# PLAN -- 住宅光照架构改造（彩色灯场、增量光场、高光灯槽）

## Status: done
## Task: 456
## Related: 455
## Baseline Commit: c292d188

## Goal
- 让 AI 住宅与自由搭建场支持大量地下灯具：玩家放下的灯是否照亮环境，不再取决于镜头是否选中它。
- 去掉材质里的长距离逐像素光线步进，挖掘、放置、开关门不再触发全场光场重算和整栋视图重建。
- 白天、黄昏、夜晚、地下在物理材质（岩板、深蓝合金、清漆）上呈现正确的色调与光泽，地上室内亮度来自窗、灯等真实来源。
- 高、低画质使用相同的照明规则，低档只降低精细度。

## Non-goals
- 不做全局光追、多次反弹、SSR、真实城市倒影。
- 不修改存档格式。
- 不迁移主游戏光照，不抽共享传播内核。
- kit 按列分段局部重建（后续任务）。
- 不做按玩家天光值的自动曝光。

## Acceptance Criteria
- 基础照明的每像素采样次数不随灯数增长；10／50／200 盏灯场景中，移动镜头不改变基础照明。
- 拆灯、封井、关门后受影响区域不留旧光；屏外灯的光能照进画面。
- 开门、挖一格、放一盏灯只局部重算光场，不重建整栋住宅视图。
- 高光灯不重复贡献漫反射；被墙挡住的灯不在墙另一侧产生高光。
- 地下封闭无灯区域保持暗；地上密闭盒子不凭高度获得天光。
- 昼夜和天气的颜色、强度变化不触发 CPU 光场重建。
- 环境反射随昼、昏、夜和天气变化，低频更新。
- 低画质：高光灯槽 2、像素比 1、关闭 GTAO/Bloom，灯具有效性与遮挡结果与高档相同。

## Constraints
- 逻辑层分层 `world → physics → combat → entities → sim`，不使用 three/DOM/Date/Math.random。
- 展示场与游戏复用同一套资源、灯具配置和光照模块。
- three 0.180.0；纹理宽度需兼容 4096 上限（现有左右分幅图集）。
- 测试按 AGENTS.md 收敛：只为纯逻辑行为（传播、增量一致性、去光）写用例，渲染效果由浏览器验收。

## Decisions
- 输入来源：任务 455 交付报告、本会话光照分析、两份评审意见。455 的光场与遮挡实现为本任务起点。

### 探索结论（Node v24 实测，未含 GPU）
- 住宅光场 4864×198 半格，全量重算 12–16ms；门开关、挖掘、放置都按全局 `revision` 触发全量重算与两张 2434×396 R8 纹理整张重传。
- 放置/拆除普通构件整栋重建 `createResidenceView`：仅场景图 356–412ms（fixture 176ms、furniture 123ms），并重置灯槽迟滞、门动画、太阳能板角度；这是比光场更大的编辑卡顿源。地下挖掘已按 32×16 分块局部重建。
- 视图局部更新阻碍：方石实例化批次（128 列分段）、偶数 x 合缝配对、平台挂墙依赖铺设顺序（后补墙会抛错）、kit 内部状态只增不减。门、家具、fixture 是独立对象，可按构件增删。
- `removeResidence` 只返回 id，拆除后拿不到构件范围；`building-brush` 替换同样丢失被合并构件。
- 默认住宅 82 盏暖灯（bollard 77）+ 4 盏壁灯，灯槽 4+2，按镜头焦点选；灯具参数写死在 `residence-view.ts:145-152`，`config/residence.ts` 无光照字段。沙盒从 0 灯开始，灯槽数随灯数变化会改变 `NUM_POINT_LIGHTS` 触发全量重编译。
- 着色器：方向光替换同时作用于主光与边缘光，`sky=0` 与背光面仍完整步进（最多 63 步）；点光最多约 31 步，16 单位外遮挡失效。角色分支对 Grassy glTF 恒等于 1，实际不起作用。`.replace` 未命中时静默失效。
- 材质：住宅主体为 MeshPhysical（合金金属度 .62、清漆 .65；岩板清漆 .55），家具部分 Standard，角色 glTF 为 Standard/Physical；无 Toon 参与。环境图漫反射走 `iblIrradiance → RE_IndirectSpecular_Physical`。
- 环境图为 RoomEnvironment PMREM（256），`ai-city-lighting` 只调 `environmentIntensity`；4×256 天空画布不能直接 `fromEquirectangular`。更换环境图尺寸会改 CUBEUV define 触发重编译。
- 画质：住宅写死 `'high'`，`setQuality` 可运行时调用但住宅无调用方；low 只关 AO/Bloom，不降像素比与阴影。`ai-city-lighting.setEnabled` 直接写 `uAoIntensity=.3`，与 post-fx 争写，low 档下可能乘过期 AO 图。
- three 0.180 局部上传：`addUpdateRange` 按 RGBA 分量且每区间限一行；`copyTextureToTexture` 用一张从不绑定、共享数组的源纹理可一次上传一个矩形（R8/RGBA8 均可）。
- 主游戏 `world/light-map.ts`：单通道、乘法衰减、实心格可被照亮并透光、emitter 构造时固定（无增删/颜色/半径）、介质只读 `collisionAt`；增量为脏列区间 ±2reach 窗口重算。同规模全量 17–29ms，单列增量 0.17–0.40ms。`setShape` 不触发 onChange。锁定行为的测试约 40 个用例。
- 分层：`sim` 可依赖 `world`；传播内核放 `world/` 时主游戏与住宅都可合法依赖，放 `core/` 则不能引用 config 类型。评审中“分层阻止共享”的说法不成立。

### 设计决策
- 照明分两层：基础照明来自 CPU 缓存光场，每盏灯都照亮自己半径内的区域，与镜头无关；精细高光来自少量真实点光，按镜头就近选择，因为屏外高光不可见。
- 计算范围：住宅世界小（2432×99 格），整张光场常驻缓存，只在编辑时局部重算；镜头移动、缩放、全景不产生计算。原则是画面所需范围 = 屏幕 + 灯的最大半径余量；以后主游戏大世界改为“屏幕 + 余量”窗口时沿用这一原则。
- 穿透限制：灯具按配置半径衰减，进入实心强衰减（见用户拍板“实心渗透”）；天空漫射光进洞后按距离衰减（近地表横向约 16 格，越深越短）；太阳/月亮直射只到天空可达处，逻辑遮挡最多判断 16 格。单灯开销只与半径内面积有关。
- 传播内核留在 `sim/residence-light.ts`，不新建共享文件：主游戏 `light-map` 语义不同（单通道、乘法衰减、实心透光），目前只有一个使用方；将来共享时迁移文件即可（sim 可依赖 world）。
- 脏区不改 sim 接口：每次 revision 变化全量光栅化遮挡掩码（bit0 实心、bit1 窗种子）并与旧掩码比对，得到多段脏列（实测约 2.6ms）；门、挖掘、回填、刷子、清空、撤销、读档自动覆盖。只合并窗口重叠的脏段。“只局部重算”指传播与上传，掩码光栅化仍为全图。
- 天空光增量：脏列 ±2R 窗口重算、写回 ±R（R=ceil(255/每半格衰减)），与全量逐格一致。
- 灯光场：每盏灯独立做有遮挡的测地距离洪泛（8 邻域，两个正交邻格任一实心则禁止对角），每灯缓存 Float32 衰减块；按矩形把相交的灯乘颜色线性累加，每通道 √(x/(1+x)) 编码写 8 位（可逆、保持色相、暗部不出色带），着色器解码后按亮度上限缩放。拆灯、封井自动去光，独立半径正确。实测 200 灯全量洪泛 5.3ms、累加 1.7ms。灯源所在格为实心时不发光。
- 纹理：RGBA8（RGB 灯光场、A 天空光，线性过滤）+ R8 遮挡图（texelFetch）；沿用左右分幅；脏矩形用从不绑定、共享数组的源纹理 + `copyTextureToTexture` 局部上传，分幅接缝最多两个矩形。
- 着色器：主光逻辑遮挡沿射线采样柔化遮挡纹理（3×3 盒式平均、线性过滤）累乘透过率，仅第 0 个方向光（投影主光），仅 `sky>.01 && dotNL>0` 时执行，屏外建筑、低角度太阳、拆屋顶都即时连续，不需要 CPU 太阳通道；边缘光只乘 sky；高光点光槽固定数量（高 4、低 2，空槽强度 0 不改 `NUM_POINT_LIGHTS`），只写高光不写漫反射，每槽自身二值 DDA 遮挡；灯光场加进 irradiance 与 radiance/clearcoatRadiance（金属、清漆获得灯色低频反射）；昼夜折减 `1-.88*(1-night)*smoothstep(0,.35,sky)`：光场按片元在着色器计算，高光槽在 CPU 按灯所在格计算，两者共用常量；CPU 光场始终满功率；删除对 Grassy 恒为 1 的角色分支；`replaceOnce` 未命中即抛错。
- 灯具配置：`config/residence.ts` 新增 `RESIDENCE_LIGHTS`（颜色、强度、半径、偏移），数值搬自 `residence-view.ts`；不加用途字段与运行时校验（代码常量，非配置边界）。能量门、全息、能源柱只自发光不进光场。
- 视图局部更新（本任务简化版）：门、家具、fixture 按构件引用逐件增删；kit 类构件集合变化时只重建 kit 与方石批次（node 实测 22.6ms）；高光槽移出视图常驻，灯槽、门动画、太阳能板状态保留。kit 按列分段拆为后续任务，触发条件是浏览器实测 kit 重建明显卡顿。
- 环境图：1024×512 渐变画布经 `fromEquirectangular` 生成（cube 256，与 RoomEnvironment 相同，不重编译），复用 renderTarget 与常驻 PMREMGenerator，签名变化后满 1s 才重生成；dispose 恢复 `scene.environment`。
- 画质：住宅与沙盒由 `resolveQuality` 解析 `?quality=`，low 档像素比 1（dispose 恢复）、高光槽 2、AO/Bloom 关；`ai-city-lighting` 的 AO 写入改为按画质判断，避免设施场景、场景演示从 .3 变 .85；GTAO 采样回到默认 6/4。
- 文档：自然光规则（只经天空、开口、窗进入；低于基础顶面的窗不产生天空光；地上密闭空间不按高度获得天光；灯具受墙遮挡）写入 `scripts/build-material-library.ts` 生成 `public/concepts/material-library.md`，不手改生成物。
- 测试：屏外灯照入在全图光场中天然成立，不写；随机编辑改为固定确定性序列；`sampleResidenceSky` 改造后无生产调用方，删除。
- 已知限制：灯光场漫反射无方向，人物在灯旁可能偏平，浏览器验收后再决定是否加梯度项；半格薄墙两面同亮（与现有天空光一致）。

### 用户拍板
- 灯光遇拐角：绕拐角传播（泰拉瑞亚式，按路径长度衰减，不穿墙）。
- 不新增地下工作灯资源，沿用现有 4 种灯具。
- 天空环境图住宅、沙盒、设施场景、场景演示四处共用，需一并浏览器验收。
- 实心渗透（泰拉瑞亚式，取代早先“不穿实心”的硬阻挡）：天空漫射光与灯光进入实心后强衰减，约 2～3 格归零；1 格薄墙另一侧透出微光，2 格以上基本全黑。太阳直射的逻辑遮挡仍为硬阻挡，保持阴影清晰。

### 接口约定
- `config/residence.ts`：`RESIDENCE_LIGHTS: Readonly<Partial<Record<string, ResidenceLight>>>`，`ResidenceLight = { color: number; intensity: number; radius: number; offset: { x; y; z } }`。
- `sim/residence-light.ts`：`createResidenceLight(state)` 返回 `ResidenceLightField & { sync(): ResidenceLightRect[] }`；字段 `occupied`、`sky`、`lamp`（RGB 按格，√ 编码）、`lamps`（按构件顺序）；矩形以半格为单位。
- `render/residence-lighting.ts`：`createResidenceLighting(field, { slots })` 返回 `{ root, attach, update(renderer, rects), setFrame(camera, night, time), dispose }`。
- `render/residence-view.ts`：`createResidenceView(state)` 返回 `{ root, solarPanels, walkZ, sync, update, dispose }`。
- 实心渗透实现：光离开实心半格 ×0.4（天空与灯共用；1 格 ×.16、2 格 ×.026，天空 255 在第 6 个实心半格取整为 0），按用户 10～20%／≤5%／2～3 格归零目标取值，比主游戏 0.45/格更强；天空露天列仍止于首个实心，实心及其下方由传播接续（离开空气 −12、离开实心 ×0.4，降序分桶），SKY_REACH 按两种步长最长链算出 23；灯光 Dijkstra 代价 = 路径长 + 每次穿出实心 3 半格（约 3 格照距下平方反比多走 1.5 格≈×0.4），亮度用真实路径长 × 0.4^穿出次数，最多穿出 5 次（3 格厚墙后为 0），斜走仍要求两正交邻格为空气，实心内只走正交；着色器删除实心片元取邻格最大值，直接采样自身格。

### 浏览器验收后的调整
- 灯光场衰减改为与 three 点光（decay 2）在后墙上的辐照度一致：`E = I·h/dEff³·saturate(1-(dEff/r)⁴)²`，dEff=√(路径长²+h²)，h=max(.6, 1-offset.z)；光场与点光同单位，漫反射增益为 1。原因：平缓曲线与逐通道 1-exp 饱和让夜间室内发白、暖色与光斑消失。
- 亮度上限 4（按亮度缩放保持色相），光场进 radiance/clearcoat 系数 .25/π；壁灯强度 14→5；庭院短灯 1.6/3.8→4/4.5，保证地下 2～3 格可读。
- 室内漫射乘随 (1-sky) 增强的暖色反弹系数 mix(1,(1,.9,.78),(1-sky)·.7)，只作用于天空漫射。
- 天空漫射空气衰减每半格 12→8，消除室内中部灰影；SKY_REACH 自动推算为 33。
- 主光逻辑遮挡由二值 DDA 改为柔化遮挡连续采样，消除地基剖面上的阶梯锯齿影；高光槽保留二值 DDA（避免柔化边缘误压暗贴墙灯具的高光）。
- 环境强度按天空渐变实际平均亮度归一化，修正黄昏偏亮约 2 倍；高光槽白天折减移至 CPU，未接入光场的材质也不再收到全功率点光。

### 遗留与后续
- 帧耗时瓶颈在 CPU：住宅场景每帧主线程约 22ms 用于 rAF 回调（约 7k 次绘制），高、低画质与改造前基线同为约 29ms/帧；光照改造本身无退化。后续优化方向是构件合批与 kit 分段（已列为后续任务），不是光照。
- kit 类构件（砖、墙、窗、平台）变化仍整体重建 kit（node 约 23ms），按列分段为后续任务。
- 半格厚构件（关闭的能量门、薄平台）透光约 40%；只以角相接的缝对太阳约透 10%～20%。
- 光场漫反射无方向，地面与角色受灯光照度约为真实点光的 1/3；吊灯光斑中心偏右约 .25 格。
- 未做移动真机性能测试。

## Implementation Map (optional)
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | src/config/residence.ts | 新增 `ResidenceLight` 类型与 `RESIDENCE_LIGHTS`（pendant、eave-light、wall-light、bollard-light） | — | ✅ |
| 2 | src/sim/residence-light.ts | 重写为 `createResidenceLight(state)`：常驻掩码、`sync()` 比对返回脏矩形；天空光窗口增量；每灯测地洪泛缓存；矩形累加 √ 编码；删除 `sampleResidenceSky` | 1 | ✅ |
| 3 | test/residence.test.ts | 迁移现有 3 个光照用例；新增增量=全量（固定编辑序列）、拆灯/封井归零、墙后无灯光与独立半径叠加、开门脏区限门两侧 | 2 | ✅ |
| 4 | src/render/facility-lighting.ts | 槽数由调用方指定、允许空槽（强度 0）、灯移除时增益立即归零 | — | ✅ |
| 5 | src/render/facility-kit.ts | 传入原有槽数 `min(len,4/2)`，保持设施行为 | 4 | ✅ |
| 6 | src/render/residence-lighting.ts | 重写：RGBA8+R8 图集局部上传；DDA 主光与高光遮挡；点光只出高光；光场进 irradiance/radiance/clearcoat；昼夜 uniform；删角色分支；`replaceOnce`；常驻高光槽与 `setFrame` | 2, 4 | ✅ |
| 7 | src/render/residence-view.ts | 删除灯槽与 `setLighting`/`lighting` 选项；新增 `sync()` 逐件增删门/家具/fixture，kit 集合变化只重建 kit | — | ✅ |
| 8 | src/render/resource-thumbnail.ts | 去掉 `{ lighting: false }` | 7 | ✅ |
| 9 | src/app/residence-app.ts | 画质解析与像素比；`view.sync()` 替代整栋重建；`light.sync()` 局部上传；去掉 skyAt/setLighting 改 `setFrame`；高光槽数按画质；ghost 签名 | 6, 7 | ✅ |
| 10 | src/app/building-field-stage.ts | 画质解析、低档像素比 1 并恢复、返回 quality | — | ✅ |
| 11 | src/app/building-sandbox.ts | `view.sync()`+`light.sync()`；去掉 skyAt/setLighting；ghost 签名；高光槽数取 quality | 6, 7, 10 | ✅ |
| 12 | src/render/ai-city-lighting.ts | 渐变画布 `fromEquirectangular` 环境图、节流、恢复 `scene.environment`；AO 写入按画质 | — | ✅ |
| 13 | src/config/ai-city-look.ts | 删除 GTAO `samples`/`denoiseSamples` 覆盖，回到 6/4 | — | ✅ |
| 14 | scripts/build-material-library.ts | 灯具列附半径与颜色；新增自然光规则段 | 1 | ✅ |
| 15 | public/concepts/material-library.md | `npm run docs:resources` 重新生成 | 14 | ✅ |

## Validation
| Command | Required | Done |
|---------|----------|------|
| `npm run typecheck` | yes | Done ✅ |
| `node --test test/residence.test.ts` | yes | Done ✅ |
| `npm test` | yes | Done ✅ |
| `npm run build` | yes | Done ✅ |
| `npm run docs:resources` 后核对 `git diff public/concepts/material-library.md` 只含灯具与光照行 | yes | Done ✅ |
| 临时 node 基准：10/50/200 灯全量构建与单格编辑 sync 耗时（不入库） | no | Done ✅ |
| 浏览器人工验收：昼/昏/夜/地下色调；拆灯、封井、关门无残光；屏外灯照入；墙后无高光；`?quality=low` 2 槽且像素比 1；设施场景、场景演示无退化；放灯、开门不卡顿 | yes | Done ✅ 已核：正午/15:30/日落/星夜、地下带灯洞与竖井、地基渗透、`?quality=low`（画布像素比 1）、算力大教堂无报错；与改造前基线同视角帧耗时一致。未逐项核：场景演示、浏览器内实时拆灯与开门卡顿（逻辑由测试覆盖）、移动端 |
