# PLAN -- 电脑与手机操作界面

## Status: blocked
## Task: 130
## Related: N/A
## Baseline Commit: 6a514d6（本轮全屏视觉落地）

## Goal
为游戏演示区域设计电脑和手机两套可切换、可操作的界面。

## Non-goals
不修改技能效果、模型资源或物理调参，不提交或推送。

## Acceptance Criteria
- 演示场景提供电脑 / 手机切换，无需重载世界。
- PC 左键普通攻击，右键 Codex/鱼群，1/2/3直接释放剩余技能，默认奔跑、Shift慢走。
- 手机横屏双拇指操作：左摇杆移动/走跑/上推跳飞；右侧攻击瞄准、跳跃、副攻与三技能。
- 游戏始终铺满视口，设备切换收进右上角菜单；PC 技能位于左下按键提示下，右上地图为屏幕的四分之一宽高，与屏幕同比例。
- 复用现有技能名称、冷却和角色变身状态，手机横屏可操作，窄屏竖屏保留场景预览并提示旋转设备。

## Constraints
沿用 ActionTracker 和真实游戏 HUD，不增加依赖；UI 在浏览器验收，不编写渲染细节测试。

## Decisions
- 用户确认最终图片设计后开始落地：炭灰半透明与象牙细边，图形技能按钮；沿用已探索的输入链路，跳过重复探索与架构设计，由子代理分别实现布局和地图尺寸。
- 本轮基线为6a514d6；工作区包含并行任务修改，只核对本轮HUD相关文件。

- 在真实游戏中切换电脑/手机操作层，不重建场景；手机改用摇杆与动作按钮，替换上一版方向/疾跑分离布局。
- 沿用 ActionTracker、技能名称/冷却、变身及地图设置入口；右键对应内部 skill1，数字 1/2/3 对应内部 skill2/3/4。
- UI 使用回调注入输入能力，遵守 UI 不依赖 input 的架构规则。
- 前一版审查发现的键盘焦点和地图返回问题已修复，新版继续保留。
- PC 使用现有跑速加速规则，Shift 对应 walk 输入；不修改底层移动物理。
- 用户已确认操作方向，现有探索覆盖主要模块；本轮补充画幅与摇杆设计后直接实现。
- 独立末尾加载的操作界面 CSS 避免侵入其他展示场；触控取消、失焦、页面隐藏和布局切换释放输入。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/config/keybindings.ts, src/input/action-map.ts | 主副攻与数字键映射，默认跑/Shift慢走 | yes |
| src/ui/control-surface.ts, src/ui/control-surface.css | 场景外设备切换、实际画幅、摇杆、拖动瞄准及轻量HUD布局 | yes |
| src/ui/weapon-hud.ts, src/ui/hud.ts | 真实技能冷却、键位、生命/能量与触控帮助 | yes |
| src/app/game-app.ts, src/app/frame-loop.ts | 触控输入与世界方向接线 | yes |
| src/ui/minimap.ts | 手机大地图独立关闭入口 | yes |
| 展示场/章节操作提示及移动配置注释 | 同步现行键位说明 | yes |
| test/core.test.ts, test/pelican-walk-run.test.ts, test/weapons-render.test.ts, test/render-integration.test.ts | 同步输入行为并覆盖主副攻/数字键/慢走双键释放 | yes |

## Final Decisions
- 右键固定副攻，1/2/3直接释放剩余技能；不增加第四个重复槽位。
- 手机摇杆与动作按钮复用游戏输入，拖动主攻设置世界方向；新一次主攻与取消手势清空旧瞄准，避免反向移动后仍向旧方向发射。
- 游戏铺满视口，继续使用原有Stage ResizeObserver；不创建额外尺寸观察器。PC地图宽高为视口的25%，小世界底图放大并随尺寸调整保持视野比例。
- 子代理审查发现残留瞄准已修复；UI依赖规则、地图关闭和键盘释放保留。
- 浏览器验证PC右键鱼群释放、手机摇杆拖动、角色变身后Codex等技能更新、地图关闭，以及844×390横屏/390×844竖屏再恢复，无尺寸循环报错。多指真机手感未验证。
- 本轮全量测试1590/1590通过；最终UI微调后构建通过。

## 本轮视觉落地验收
- PC按键提示与五个技能图标在左下；手机左摇杆、右主攻/跳跃及技能弧，变身后切换真实技能与图标。
- 工具菜单默认收起，支持无重载切换电脑/手机；地图、帮助、设置与返回首页可达。
- 图标资源 public/ui/hud-icons.png 由内置 image_gen 生成，完整提示保存在同目录 hud-icons.prompt.txt；未添加依赖。
- 浏览器验证1280×720游戏canvas铺满，地图320×180；844×390手机横屏技能、变身、大地图关闭；390×844竖屏旋转提示。最终恢复浏览器实际尺寸。
- 子代理审查未发现明确功能回归，输入释放和分层边界保留；真机多指手感未验证。

## Validation
| Command | Required | Done |
|---------|----------|------|
| npm run typecheck | yes | yes |
| npm test | yes | blocked：1580项中1578通过、2失败；任务外src/main.ts动态import违反architecture测试，worldgen性能用例单独复跑通过 |
| npm run build | yes | yes：图集落地后构建通过，保留既有chunk警告 |
| node --test test/minimap.test.ts | yes | yes：最终32/32通过 |
| 浏览器电脑/手机切换与布局检查 | yes | yes：desktop-fullscreen.png / mobile-fullscreen.png |

- 最终补充：node --test test/worldgen.test.ts 单独复核29/29通过，确认全量时的耗时失败未稳定复现。全量门禁仍因当前工作区入口动态导入未通过，未修改该并行任务文件；本轮HUD实现、类型检查、构建与浏览器验收已完成。
