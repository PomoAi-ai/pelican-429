# PLAN -- 光子游戏实时渲染

## Status: done
## Task: 047
## Related: 031-luma-companion, 044-fix-photon-shape
## Baseline Commit: 无 HEAD

## Goal
将概念图 01 的美术质感落实为实际游戏里的实时粒子光子，并接入玩家陪伴/前方引路的视觉行为。

## Non-goals
不增加任务目标寻路、战斗能力、物理碰撞或存档；不提交推送。

## Acceptance Criteria
- 游戏与展示场使用同一实时粒子资产和动画。
- 游戏实际镜头和角色比例下，轮廓、表情和青蓝光边清楚可辨。
- 光子随玩家移动与转向；暂停/重置/销毁无残留。
- 提供实际游戏截图和预览，不以概念图替代交付。

## Constraints
逻辑层保持无 three；不改 vendor；不为渲染细节新增自动测试。

## Decisions
- 默认以 01 号经典微光为落地方向，依据用户的参考图与当前需求。
- 父代理负责共享渲染外观，子代理探索游戏装配生命周期。
- 探索与设计合并：子代理已确认独立 game-app/frame-loop 注入，避免污染全部展示卡；玩家插值、暂停 animDt 和销毁复用既有生命周期。无需用户裁决的方案分歧。
- 使用透明画稿离线采样成彩色粒子数据，赋予前后体积厚度；GPU 顶点动画驱动呼吸和边缘，保留水彩与五官。运行时不将概念图铺成整张背景，也不加载远程服务。
- 主体、逸散、尾迹与光晕使用少量 draw call；低画质的可读性由粒子自身颜色保证，不依赖 Bloom。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | public/characters/luma/particle-source.png | 透明美术源图 | - | yes |
| 2 | scripts/bake-luma-particles.py / luma-particle-data.ts | 可复现采样与静态粒子数据 | 1 | yes |
| 3 | src/render/luma/luma-rig.ts | GPU 实时体积粒子与材质 | 2 | yes |
| 4 | src/render/luma/luma-companion.ts | 显示跟随与前方陪伴 | 3 | yes |
| 5 | src/app/game-app.ts / frame-loop.ts | 游戏初始化、逐帧和销毁接线 | 4 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| npm test | yes | yes |
| npm run build | yes | yes |
| 浏览器真实游戏及展示场验收 | yes | yes |

## Final Result
- 共享粒子资产已接入真实游戏；游戏与展示场复用同一 rig、材质和动画。
- 连续椭圆截面修复侧视接缝；侧向补光、背面渐变去脸，主体与表情均为粒子。
- 总计 30,325 粒子、4 组绘制，GPU uniform 驱动动画；源图与离线采样脚本保留。
- 浏览器检查正面、侧面、背面、斜角、五个动作、明暗环境；游戏内检查实际比例、跟随与转向，以及关闭泛光时的可见性；最后一轮游戏和预览控制台均无错误。
- 子代理复审 Approved；最终 typecheck/build 通过。本轮 npm test 1499/1499 通过，最后仅修改渲染采样与配置后按影响范围复跑 typecheck/build。构建有现存大包提示。
- 实景截图 output/luma-preview/photon-game.jpg；实时近景 output/luma-preview/photon-realtime.jpg；portrait.jpg 更新为真实预览截图。
- 导航寻路、任务目标选择未实现；当前引导为玩家前上方陪伴。未提交、推送。
