# 白色混凝土运行时与单房间试用

- Status: done
- Baseline: d2d72f4dc50da560b61b71ebeadda6bdbedcec64

## Goal
完成已绘制白色混凝土材质的游戏资源接入，在现有可游玩单房间中验收。

## Non-goals
不新增背包、自由建造工具或存档系统；不重写旧 TileMap；不修改角色与相机透视规范；不提交、推送或部署。

## Acceptance Criteria
- 共享 DefinitionKit 的 33 种实体、薄墙、混凝土开窗外环与拼窗角统一使用白色混凝土。
- 实体深 2、薄墙厚 0.2 与既有占格和碰撞保持一致；半块和跨格窗口的纹理尺度统一。
- 单房间默认可直接看到实体材质，仍可切换格线、半透明检查。
- 浏览器检查单房间、形态和拼窗，实际执行玩家移动与跳跃。
- 完成 typecheck、全量测试和构建；保留已有工作区修改。

## Constraints
- 使用 assets/concepts/white-concrete-v1 的已制作贴图。
- 几何、材料、碰撞复用游戏共享模块，不制作独立预览替身。
- 贴图加载失败向上报错；同步几何工厂保持可在 Node 中调用。
- 玻璃、金属窗棂、木门及平台保留各自材料。

## Decisions
- 探索确认现有 DefinitionKit 已覆盖 33 形态及真实多边形碰撞，直接接入共享套件。
- 此次完成材质与单房间试玩，现有项目尚无通用建筑方块物品栏与保存系统。

## Implementation Map
- `src/render/white-concrete-material.ts`：共享纹理、显式浏览器加载与释放、统一世界尺度映射；使用镜像重复确保重复边缘连续。
- `src/render/definition-kit.ts`：实体、墙、开窗外环与拼窗角使用混凝土共享工厂。
- `src/app/room-scene-preview.ts`：加载成功后装配场景，默认实体显示，页面退出释放资源。
- `src/app/definition-scene-layout.ts`：单房间说明标注材质。
- 方案由只读探索和架构子代理核对后直接实施：已有形态与碰撞覆盖，无需扩展逻辑或修改布局函数签名。

## Validation
- `npm run typecheck`：通过。
- `npm test`：1880 项全部通过，0 失败、0 跳过，约 80 秒。
- `npm run build`：通过；混凝土源图已自动输出到 dist/assets，存在原有大 chunk 提醒。
- Node 临时检查：同步构造 33 实体与主要墙窗后释放成功；检查模式实景、半透明、线框材质克隆注入成功。
- 浏览器：单房间实体显示；玩家从左门步行进入、移动到右墙前、向左回走和跳起；33 实体、墙窗图录、跨格拼窗、半砖单间及格线/半透明切换均正常。
- 当前验收浏览器控制台没有 error/warn。实机截图保存到 `assets/concepts/white-concrete-v1/runtime/`，单房间停留为可游玩状态。
- 子代理定向审查通过：加载/释放、检查材质克隆、静态资源打包、窗框覆盖均无高置信度问题。
- 本次没有新增测试文件；材质和 UI 以浏览器验收，逻辑与碰撞沿用既有行为测试。
