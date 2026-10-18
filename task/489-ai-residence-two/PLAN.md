# PLAN -- AI住宅2直接复用完整住宅地图

## Status: done
## Task: 489
## Related: 488
## Baseline Commit: c292d188

## Goal
按用户要求，独立河岸入口直接运行原AI住宅地图和完整建造、碰撞、门、家具、地下、天气、昼夜机制，仅替换背景；场景目录增加AI住宅2。

## Decisions
- 同一个residence-app运行两个变体，不复制玩法代码，不再使用测试平地关卡。
- 原AI住宅及存档不改；住宅2使用独立key，首次进入从已有住宅存档复制，没有则用同一默认地图。
- 复用既有气候、世界时间、场景工具栏、模型与碰撞；新背景接受昼夜和天气驱动。
- 复用前轮探索与现成原画，不再绘图。子代理完成路由、目录、存档API及隔离测试；主代理接入环境和应用。
- 不提交推送、不改生产或其他会话。

## Validation
- [x] npm run typecheck 通过
- [x] npm test：1968项通过、301套件、0失败；包括新增两个住宅存档互不覆盖用例
- [x] npm --ignore-scripts run build 通过，保留现有大分块提示
- [x] 浏览器确认AI住宅2完整地图、327种建造资源、下雨/晴天切换、昼夜灯光、原入口与目录内切换
- [x] 子代理相关改动审查通过

## Evidence
- evidence/residence2-full-map.png：真实住宅2、门/家具/操作工具栏、夜间城市背景。
- evidence/rain-map.png：复用雨天、月亮与住宅灯光。
- evidence/build-tools.png：建造工具检查期间截图。
- 本地日志 /private/tmp/residence2-{typecheck,tests,build}.log。

## Scope
只有住宅背景随变体变化，原住宅代码路径和原存档保留；无新绘图，无提交推送。Vite因资源清单变化自动重载，中途浏览器断开后已重新连接；未重启Docker容器。
