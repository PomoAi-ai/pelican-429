# PLAN -- 透视紧凑导航与正常游戏技能界面

## Status: done
## Task: 366
## Related: 365
## Baseline Commit: 975f136

## Goal
- 顶部网站菜单始终显示，采用最窄样式。
- 右侧面板简化、收窄，减少间距与重复说明。
- 技能和玩家状态直接复用正常游戏HUD，取消额外底部文字按钮栏。

## Decisions
- 前序布局探索及本次调用链阅读已明确涉及文件，复用探索/设计结果，不重复派探索与设计子代理。
- 主代理负责导航与布局；子代理负责共享HUD接入和技能CSS复用。
- 保持男玩家玩法与镜头/光照独立，当前未提供的变身和光子技能不展示；不扩展模拟玩法。
- 视觉效果浏览器验收，不增加渲染细节自动测试。

## Implementation Map
| File | Intent |
| --- | --- |
| src/main.ts | 透视导航常驻，不装配收起抽屉 |
| src/app/room-scene-preview.ts, src/ui/room-scene-preview.css | 紧凑控件、viewport内游戏HUD、取消独立底栏 |
| src/app/perspective-controls.ts, src/ui/control-surface.css | 直接复用正式weapon HUD及其样式 |

## Validation
| Command | Required | Done |
| --- | --- | --- |
| npm run typecheck | yes | passed |
| npm test | yes | passed — 1861 tests |
| npm run build | yes | passed — existing large-chunk warning |
| 浏览器常驻导航/紧凑布局/HUD技能与暂停验证 | yes | passed |

## Outcome
- 顶部导航常驻32px，右面板204px；折叠说明，取消独立底部技能栏。
- 直接复用正式游戏头像、血条与圆形技能HUD，真实施放状态和冷却随模拟更新。
- 浏览器验证正常走跳、技能释放、暂停恢复、自由镜头仍可施放、正常视角恢复与面板收起；390px窄屏页面无横向溢出。
- 子代理完成HUD接入及只读审查，未发现本轮回归；未新增渲染细节测试。
- git diff --check通过。未提交或推送，未进行手机真机验证。
