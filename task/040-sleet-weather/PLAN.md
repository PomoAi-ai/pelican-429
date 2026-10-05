# PLAN -- 雨夹雪天气

## Status: done
## Task: 040
## Related: N/A
## Baseline Commit: 无 HEAD；相关文件快照 $TMPDIR/pelican-sleet-before

## Goal
天气设置增加雨夹雪，真实游戏场景同时呈现雨丝和雪花。

## Acceptance Criteria
- 天气设置可选雨夹雪，复用网址参数、设置保存与调试循环。
- 同时呈现雨丝、雪花，沿已有风、遮挡、粒子和材质系统生效。
- 湿润、薄积雪和雨水回复沿共享天气规则处理，切换平滑。
- 不复制粒子或模型资源，不引入依赖。

## Decisions
- 单独提供一种混合天气；现有雨雪强度档位继续可用。
- 探索/架构子代理确认 PrecipView 已同时驱动雨雪系统。sleet 对应中档雨雪各半，逻辑补水使用相同雨比例，自动时间表保持原样；无待用户裁决分歧，直接实现。
- 测试验证露天补水与遮挡，以及连续切换中雨雪共存/湿润薄雪并存；移除其中任一分量或把补水误设为纯雨速率时测试应失败。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/config/precip-rules.ts | 混合天气类型、强度与补水规则 | yes |
| src/render/precip.ts | 复用雨雪视觉向量 | yes |
| src/config/game-settings.ts | 雨夹雪选项 | yes |
| src/ui/precip-debug.ts | 循环说明更新 | yes |
| test/precip-sim.test.ts | 补水/遮挡行为 | yes |
| test/precip-render.test.ts | 纯控制器过渡与积累行为 | yes |
| test/settings.test.ts | 混合天气加载及保存 | yes |

## Validation
- [x] npm run typecheck
- [x] npm test：1492/1492 通过
- [x] npm run build：通过，仅有现有产物体积提示
- [x] 独立 core-review / diff-guard 审查通过
- 浏览器视觉验收受之前的浏览器 URL 安全策略限制，不能以静态检查代替已看过效果。

## Targeted Checks
- node --test test/precip-sim.test.ts：13/13 通过。
- 渲染控制器测试通过；settings 旧选项文案断言需同步雨夹雪选项，修复后 node --test test/settings.test.ts：21/21 通过。

## Delivery
- 游戏设置 → 天气 → 降水 → 雨夹雪；也支持 ?precip=sleet。
- 独立子代理审查确认游戏直接共用雨雪粒子、遮挡、风及材质系统，无新增资源。
- 浏览器视觉效果未验收；前序浏览器工具已拒绝本地页面，未尝试绕过安全策略。
- 开发服务继续运行于 127.0.0.1:5174；未提交或推送。
