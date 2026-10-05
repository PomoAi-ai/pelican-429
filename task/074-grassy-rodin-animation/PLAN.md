# PLAN -- Rodin 呼吸与行走动画

## Status: done
## Task: 074
## Related: 056
## Baseline Commit: 无 HEAD；保留所有既有未跟踪内容

## Goal
为当前 Rodin 精修造型绑定骨骼，制作自然呼吸与循环行走动画，并在角色展示场切换播放、暂停和旋转查看。

## Non-goals
不改角色造型，不重做原画，不制作跑跳/编程等额外动作，不替换或覆盖现有静态模型，不提交推送或使用付费云服务。

## Acceptance Criteria
- 呼吸通过胸腔与肩颈轻微变化表现，脚底稳定，不整人上下漂浮。
- 行走左右腿交替迈步、膝盖弯曲、足部落地与抬起清晰，对侧手臂摆动，首尾循环连续。
- 新动画保留红毛衣、牛仔裤、米白鞋与已确认的3.1格静态基准高度。
- Blender源工程与嵌入两个动画的GLB可交付，游戏与展示场使用共享资产与动画函数。
- 展示场保留原版对比，新增明确的呼吸/行走入口，可调速、暂停和旋转。
- 实际查看动画与关键帧；不写锁定外观的自动测试。

## Constraints
- 用户最新请求已授权制作动作，之前“先不做动作”不再限制当前任务。
- 只在本地精修副本上绑定；当前另一轮更新的旧Rodin资源保持原状。
- Blender采用本机已安装版本、CPU与3线程，沙箱启动崩溃时按已知原因使用本机授权执行。
- 使用dev/core-dev/Ponytail流程；复用现有GLTFLoader、SkeletonUtils和AnimationMixer。

## Decisions
- 两个当前会话子代理完成只读探索和设计：单个Rodin精修网格没有骨骼，现有静态加载器明确拒绝动画，human-session尚未推进动作，UI隐藏播放控件。
- 绑定22根人形骨骼，分区连续权重，头发整体跟随头骨；走路采用两骨IK解算后逐帧烘焙，脚有支撑段，root原地。
- 两条30fps循环：idle（界面名呼吸）3.2秒；walk（走路）1.2秒。先game档看极值姿势和足部接地再应用其余两档。
- 新资源为models-rodin-animated/grassy-rodin-animated-{detailed,game,light}.glb，源文件在model-rodin-animated/。保留18个静态候选和旧文件。
- 复用没有当前调用者的grassy-rig/grassy-animator，用SkeletonUtils克隆和AnimationMixer播放两动作，human-session接入真实clip时长。真实游戏暂无人形状态，不擅自改游戏逻辑，仅提供共享资产与函数。
- 新增3档×2动作入口与明确的动画演示目录，静态条目仍隐藏播放控件，动画条目使用既有调速/暂停/重播/循环和镜头交互。
- 探索子代理已给出明确方案，输入与范围无待裁决项，本地改动可回退，直接实施。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | scripts/blender_grassy_rodin/animate.py与新动画资源 | 骨骼、蒙皮、两个循环动作及三档导出 | - | yes |
| 2 | Grassy共享动作模块、配置与展示场接入 | 按角色版本载入骨骼动作、控制播放 | 1接口 | yes |
| 3 | 动画关键帧、来源说明与证据 | 复核脚底、关节、循环和网页实际效果 | 1,2 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| Blender关键帧与真实动画视觉复核 | yes | yes，正侧关键帧与MCP真实工程视口 |
| 浏览器呼吸/行走、调速/暂停/旋转 | yes | yes，三档实际加载，控制台无错误 |
| npm run typecheck | yes | yes，通过 |
| npm test | yes | yes，1520项中1519通过、1项既有世界生成耗时超标；空闲后单文件重跑通过，见下 |
| npm run build | yes | yes，通过，保留现有大chunk提示 |

## Results

- 新增三档带骨骼GLB、三档可编辑Blender工程、资源清单及13张最终关键帧。静态源网格位置/UV哈希未变；两个动作首尾全网格位置一致。
- 展示场新增 `?mode=showcase&demo=grassy-rodin-animation`；原 Rodin 对比入口也增加两张动画卡。三档模型均实际加载成功，暂停后两条进度值保持不变，重播重新推进，0.5倍速和键盘方向旋转正常，静态模型切换后隐藏动作控制。
- 网页截图：`assets/characters/grassy/model-rodin-animated/evidence/showcase-animation.jpg`。实际Blender已打开游戏标准版动画工程，保存材质预览镜头并选中walk动作。
- 独立复核子代理检查8个源文件及三档真实GLB，结论Approved。真实GLTFLoader和AnimationMixer验证22骨、两条动作、蒙皮权重、静息3.1格和首尾衔接；正侧面未发现明显关节崩形。半帧线性插值最多约0.000125格微下穿，未宣称连续绝对零误差。
- 全量测试执行时仍有Blender渲染任务，唯一失败为既有 `worldgen` 性能断言：中位数270.7ms，高于250ms。渲染结束后执行 `node --test test/worldgen.test.ts`，29/29通过；没有改断言或跳过测试。日志在 `$TMPDIR/grassy-rodin-animation-tests.log` 与 `$TMPDIR/grassy-rodin-animation-worldgen.log`。
- 没有新增外观自动测试，也没有把动画接入尚不存在的人形游戏状态；共享资源与播放模块已可供后续游戏接入。
