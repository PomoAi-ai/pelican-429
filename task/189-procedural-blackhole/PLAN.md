# PLAN -- 程序化 WebGL 黑洞

## Status: done
## Task: 189
## Related: N/A
## Baseline Commit: 3a35077

## Goal
将堡垒黑洞从图片采样替换为无贴图的实时 WebGL 黑洞，保留黑色核心、倾斜吸积盘、蓝白金色流动光环。
周围场景与靠近的玩家产生可见的引力扭曲。

## Non-goals
不修改天空图片、音频、玩法或 vendor；不实现完整相对论光线追踪。

## Acceptance Criteria
- 黑洞不再加载 PNG/WebP，轮廓与动画直接由共享着色器生成。
- 首页、机房预览、游戏和连通世界沿用同一实现。
- 保持既有位置、尺寸和资源释放方式；通过项目交付检查。
- 复用场景后处理扭曲背景、地形和玩家；中心随镜头及自由世界位置偏移，HUD 保持清晰，离开场景后关闭。

## Constraints
仅使用现有 three.js。已有大量未提交修改，只修改本次涉及部分；四个目标文件修改前副本保存在 /tmp/pelican-blackhole-baseline。
渲染效果在浏览器中人工检查，不新增锁定网格或着色器源码的测试。

## Decisions
- 后续194中心强化调整完成后，全量测试1723/1723通过（包含此前失败的世界生成性能用例），类型检查、构建及浏览器验收通过，解除交付阻塞；最终效果以194记录为准。
- 实现与浏览器验收完成，交付检查尚未全绿：npm test 共 1723 项，1722 通过，唯一失败为已有世界生成耗时阈值（407.1ms > 250ms）；单独复验仍因高负载测得 822.5ms。两次均观察到其他全量测试并行运行，未修改世界生成代码或放宽断言。待机器空闲后复验性能用例；不继续争用 CPU 重跑。
- 子代理只读审查通过，无可执行发现；投影临时检查覆盖默认关闭、镜头移动、世界半径、镜后关闭、移除。
- 浏览器已确认高画质预览和低画质实际游戏：吸积盘持续变化，石墙、地形与角色被透镜弯曲，HUD 清晰。修复了 Grade 原始 GLSL1 不支持 textureSize 的编译错误，改用尺寸更新时计算的 half-texel uniform。
- 工作区并行修改的角色轻量模型仍在生成，验收使用现有 textures=original 参数；未修改模型加载代码。截图 /tmp/pelican-blackhole-game.jpg。
- 用户追加周围场景和玩家扭曲：在已有 Grade 通道统一改变场景/Bloom/AO 的采样坐标，无新增渲染目标或全屏通道；这是视觉透镜，不改变物理碰撞。
- 当前实现已经使用 WebGL，但依赖固定图片确定外形；改用程序化片元着色器。
- 共享黑洞仍使用 24×24 透明平面与既有中心位置，片元着色器按背盘、旋流、黑芯、前盘合成。整数角频率与周期坐标确保旋转无接缝，fwidth 平滑细丝边缘。

## Implementation Map
- `src/render/post-fx.ts`：世界坐标透镜投影及场景合成采样扭曲。
- `public/resources/SOURCE.md`：同步黑洞图片不再加载的资源说明。
- `src/render/facility-blackhole.ts`：程序化蓝白暖金吸积盘、黑芯、光子环与背盘光弧，删除图片 uniform 与纹理所有权。
- `src/render/facility-approach.ts`：删除纹理参数，继续共用黑洞生命周期。
- `src/render/facility-fortress.ts`：删除黑洞纹理透传。
- `src/app/facility-presentation.ts`：首页、游戏和预览只加载天空城市贴图，自由世界直接创建黑洞。

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| npm test | yes | yes，后续194全量1723/1723通过 |
| 世界生成性能用例复验 | yes | yes，包含在194全量通过结果中 |
| npm run build | yes | yes，视觉亮度调整后再次通过 |
| 浏览器检查编译、显示和持续动画 | yes | yes，高画质预览与低画质游戏 |
