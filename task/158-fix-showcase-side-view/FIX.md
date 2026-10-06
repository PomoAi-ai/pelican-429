# FIX — 展示场保持横版侧视

## Status: done
## Task: 158
## Related: 149
## Baseline Commit: 3a35077970c442dfd4645c115c58ad2e8b1661aa

## Problem
角色展示场应与横版游戏一致，原实现的俯视透视地台与自由环绕镜头不符合展示需求。

## Root Cause
共享场景装配引入 OrbitControls、倾斜镜头与纵深网格，改变了游戏原有 XY 平面侧视方式。

## Fix Plan
- [x] 固定镜头沿 Z 轴观察 XY 平面，移除环绕和纵深网格，地面上沿保持水平。
- [x] 保留单角色默认、目录 Add、共享场景、独立浮层和顶部缩放。
- [x] 删除仅供环绕使用的阴影拟合分支，同步操作提示。
- [x] 检查实际页面与本次增量 diff；diff-guard 无新增问题。

## Verification
- [x] npm run typecheck：通过。
- [x] npm test：1644/1644 通过。
- [x] npm run build：通过，保留原有包体积提示。
- [x] 浏览器检查单角色、Add、浮层及缩放：固定侧视和水平地面正常，缩放不改变角度，验证后恢复单角色。
- [x] Bug is fixed

## Decisions
- 使用 fix 和已加载的 Ponytail Full；渲染/UI 修改通过浏览器检查，不新增自动测试。
- 只修改展示场相机与相关提示，保留工作区其他修改，不提交、不推送。
- 浏览器首次加载遇到工作区正在更新的眼睑资产不匹配；其代码更新后重新加载正常，本任务未修改眼睑代码或资产。
- 效果截图：`evidence/side-view.jpg`。
