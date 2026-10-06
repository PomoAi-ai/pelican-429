# PLAN -- 跨平台全屏与桌面启动

## Status: done
## Task: 298
## Related: 297
## Baseline Commit: 072a48ec0bc171f09012f05effd623d621fd3022

## Goal
尽可能覆盖桌面、安卓、iPhone、iPad 的原生全屏和独立启动；不以设备名称拦截原生全屏请求。

## Non-goals
不包装原生 App，不伪装成功、不强行绕过浏览器权限，不加入离线缓存或部署。

## Acceptance Criteria
- 保留同步点击调用标准/WebKit全屏及实际失败反馈。
- 独立安装入口支持 Chrome 原生安装提示和各移动平台手动说明，独立运行时隐藏。
- 安装清单、图标包含在正式构建，优先 fullscreen 并提供 standalone 退路。
- 画面覆盖屏幕，控制按钮避开刘海和系统手势区域，旋转 iframe 正确映射安全边距。

## Decisions
- 本会话先前已经完成控制层及启动流程探索；沿用该设计，不重复架构派工。
- 使用 dev 工作流；子代理处理安装流程，主代理处理配置、构建资源和安全区域。
- 使用现有 favicon 图形作为桌面图标，无新增依赖；不新增复述 UI 的测试。
- 不把支持条件不足时的手动引导当成安装或全屏成功。

## Implementation Map
| File | Intent | Done |
|---|---|---|
| src/ui/control-surface.ts、安装模块、src/main.ts | 独立安装入口和早期事件捕获 | yes |
| index.html、public/app.webmanifest、图标、vite.config.ts | 安装与屏幕配置、发布资源 | yes |
| src/ui/mobile-game-viewport.ts、相关 CSS | 旋转安全区域 | yes |

## Validation
| Command | Required | Done |
|---|---|---|
| npm run typecheck | yes | 通过，修复旋转监听后复查通过 |
| npm test | yes | 1802 项通过 |
| npm run build 与构建资源检查 | yes | 通过，PNG 实际尺寸及发布 manifest 引用检查通过；保留大 chunk 提示 |
| 本地浏览器界面检查 | yes | Chrome 独立加载真实控制组件：进入/退出全屏状态、安装手动引导、模拟 appinstalled 隐藏入口并关闭弹窗通过 |
| iPhone/Android 真机原生全屏和安装 | no | 无真机连接，待用户验收 |

## Review
- 子代理发现旋转 iframe 横竖屏切换可能不改变内部尺寸；已增加宿主方向媒体查询监听，处理页面返回恢复。
- 真实游戏页资源加载未完成，组件检查在临时浏览器页面直接复用生产模块完成；临时 DOM 和设备模拟已清理。不能以此声称真机全屏通过。
- 截图记录在 /private/tmp/pelican-install-guide.png；未提交、未部署。
