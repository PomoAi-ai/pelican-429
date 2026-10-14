# FIX — 住宅灯光与全息自动轮播

## Status: done
## Task: 421
## Related: 413, 417
## Baseline Commit: d2d72f4

## Problem
用户反馈庭院矮柱灯光不自然，灯头/灯身过亮，地面泛黄；工作站只需自动轮播现有全息内容。

## Root Cause
- `src/render/residence-view.ts`：低于一格的矮柱灯仍使用9强度点光，光源前移到灯身外侧，近距离照亮灯杆与地板过强。
- `src/render/ai-city-architecture.ts`：暖色灯芯自发光2.4叠加真实点光产生高亮与泛光，蓝顶发光也过强。
- `src/ui/workstation-controls.ts`：已有默认轮播，但手动模式可停止自动切换。

## Fix Plan
- [x] 共享住宅灯具降低近场照明和灯芯过曝，保留真实地面照明与昼夜响应。
- [x] 两页面删除手动全息下拉框与无用途传递链，现有3态自动轮播。
- [x] 浏览器核对日间与夜间、近看与走动；沿用共享资源。

## Verification
- [x] npm run typecheck
- [x] npm test：1904项中1903通过，1项原有资料文案window误报
- [x] npm run build
- [x] 浏览器实景与全息切换检查
- [x] 聚焦diff审查及git diff --check

## Final Decisions
- 仅调整庭院矮柱灯：点光强度9→1.6，照射距离4.8→3.8，光源从灯杆前侧回到灯头中心；暖白灯芯自发光2.4→1.1，蓝顶1.7→0.55，降低黄色饱和度。其他灯型与整体曝光保持原参数。
- 删除手动全息控制UI、模式配置与传递链；复用原三态动画，按空间窗口→地球仪→空间控制台每10秒自动轮换，保留0.64秒收束/展开。
- 同步两份家具定义及定义页面的手动切换旧说明。

## Verification Results
- 浏览器已核对午夜与正午矮灯，人物从灯旁走过；夜间柱身保留材质明暗，灯芯与地面有柔和暖白照明。
- 子代理确认原问题是近距离点光照爆灯杆，没有额外贴地光圈或坐标翻转；复核确认光照与自动轮播共享、资源正常释放、无旧接口残留。复核指出的3处旧说明已同步。
- 类型检查及构建通过；构建仍有原大chunk提示。
- 全量测试的唯一失败为`test/architecture.test.ts:232`扫描`src/config/art-library.ts`英文描述里的window，属于本次修改前已存在的误报，没有修改测试断言。
- 未新增材质或动画细节自动测试；按项目规则以浏览器验收。

## Evidence
- `assets/concepts/ai-city-residence/residence-lamp-natural-night.png`
- `assets/concepts/ai-city-residence/residence-lamp-natural-day.png`
- `assets/concepts/ai-city-residence/workstation-auto-console.png`
- `assets/concepts/ai-city-residence/workstation-auto-globe.png`
- `assets/concepts/ai-city-residence/workstation-auto-window.png`

浏览器不操作手动控件，已实际看到空间控制台、地球仪、空间窗口自动轮换；页面运行日志未见error。最终说明同步后重跑类型检查和构建通过。

未做长时间性能压力测试，未提交或推送。局部灯光继续使用既有固定数量点光，不新增阴影灯或后期通道。
