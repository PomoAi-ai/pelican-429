# PLAN -- 独立贴图画质对比页

## Status: done
## Task: 206
## Related: 203
## Baseline Commit: 3a35077

## Goal
在角色场景/历史资料旁添加画质对比入口，独立页面同屏展示原始、1K WebP、512 WebP、512 KTX2及256 KTX2，允许同步放大、拉近、平移旋转与动画对比。
角色展示场本身也支持真实摄像头拉近，范围0.65–12倍，滚轮/双指/滑块同步，右键平移。

## Non-goals
不修改玩法、vendor或已存在资源，不提交推送部署，不减面或改动画精度。

## Acceptance Criteria
- 原始模型及既有档位保留，1K和256从原件单独生成并准确标注。
- 同一WebGL renderer，同样灯光、镜头和动画时间；游戏rig与材质创建函数共享，缓存按模型+档位隔离。
- 支持角色/形态选择、拖动旋转、滚轮拉近、平移、全身/面部对焦、暂停和时间定位；每栏列实际尺寸、文件大小、纹理预算及相对原件变化。
- 展示场侧栏新增独立入口，当前页面可回到角色场景/历史资料。
- 浏览器实际检查及typecheck/test/build各运行一次。

## Decisions
- 复用前轮完整探索；本轮设计子代理确认createStageView和真实rig可共享单renderer。显式TextureTier作为可选参数，游戏默认保持URL档位。
- 原件Grassy1K，其余有纹理角色通常2K，守门人无贴图，不能统一误标2K。
- 新增256选择KTX2，与512 KTX2使用同编码方式便于隔离尺寸影响。
- 不重建整套独立模型或shader；新页面只负责布局、镜头、动作采样及统计。
- 用户明确授权可回退仓库内工作，无审批停止条件。skills沿用dev/core-dev/core-test与Ponytail Full。

## Implementation Map
| # | File | Intent | Depends | Done |
|---|------|--------|---------|------|
| 1 | character-model、web-models、三类rig | 显式档位及缓存隔离 | — | yes |
| 2 | build-web-models、新增GLB/report | 真实1K和256资源 | 1 | yes |
| 3 | texture-compare-app及CSS | 独立同屏交互对比 | 1 | yes |
| 4 | main、showcase配置、index、侧栏 | 页面路由与入口 | 3 | yes |
| 5 | character-stage-app、panel、location | 摄像头拉近至12倍，平移与网址倍率往返 | 4 | yes |

## Validation
| Command | Required | Done |
|---------|----------|------|
| 新资源生成及原件/解码校验 | yes | 原27份资源SHA不变；新18份几何逐字节校验，WebP透明度校验及KTX验证通过 |
| npm run typecheck | yes | 最终通过；镜头追加改动后重跑通过 |
| npm test | yes | 1745/1746通过，worldgen耗时中位数284ms超过250ms；未改代码或断言，定向worldgen.test.ts复跑29/29通过 |
| npm run build | yes | 最终通过；镜头追加改动后重跑通过，仍有500kB chunk提示 |
| node --test test/showcase.test.ts | yes | 追加镜头功能后32/32通过，URL往返覆盖8倍 |
| 浏览器 | yes | 5档同屏、面部放大、滚轮、正背面及拖动旋转、同步跑步/暂停、Sam怪物→Tibo人形切换、侧栏入口通过；角色场景4→4.55倍滚轮拉近通过 |

## Results
- 256 KTX2九份合计12,408,408B，比512 KTX2减少17.36%；1K WebP合计22,025,384B。未改游戏默认512 KTX2。
- 子代理完成资源生成和缓存隔离，实现审查发现并修复自由旋转阴影拟合及NPC绝对时间姿势问题。追加摄像头改动独立审查通过。
- 对比页复用现有postFx，按角色空间范围固定检视阴影；NPC绝对采样固定微姿态时间和睁眼，避免随机状态影响比较。
- 浏览器截图：face-comparison.png。256拉近可见眉眼、毛发细节损失，保留原始/1K供人工取舍；没有受控FPS、冷启动或256真实显存测量，UI内存值明确为理论预算。
- 未提交、推送、发布或修改vendor；保留工作区已有改动。
