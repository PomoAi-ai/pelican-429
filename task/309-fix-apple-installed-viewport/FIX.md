# FIX -- Apple 安装模式画面边缘与安全区域

## Status: done
## Task: 309
## Related: 298, 301, 303
## Baseline Commit: 2a5455a964e5b71781c766c36abb5245c5f3e903

## Problem
用户反馈苹果设备安装游戏后右侧有空白，要求继续检查安全区域适配。

## Root Cause
在 iPhone 16e / iOS 26.2 模拟器真实添加到主屏幕后复现。物理 CSS 屏幕 390×844；独立启动后 innerHeight/clientHeight/visualViewport.height/dvh 均为797，iframe因此只有390×797，但页面原点已经在屏幕顶端，底部留下47px空带。47px等于系统顶部安全区域，旋转后就是逻辑画面右侧空带。

同页探针实测100vh/100lvh为843.984375px，100svh/100%/fixed inset:0均797px。已有viewport-fit=cover和安全区域映射并未缺失；不能用visualViewport、100%或随意加固定47px修复。另摇杆在父控制层已缩进安全区域后仍直接读取env，造成重复内缩。

只扩大iframe仍会被height:100%/overflow:hidden的根页面裁切，必须同时扩大父html/body；扩大后模拟器截图中47px空带消失。

横竖屏切换另有安全区不同步：iframe始终844×390，不会触发子窗口resize；方向媒体事件读取时父安全区尚未完成布局。探针实测横屏父padding已是0/47/20/47，游戏仍保留旧值47/0/34/0。观察父body布局后，游戏能同步为0/47/20/47；竖屏映射为0/34/0/47。

参考 WebKit 已知问题：https://bugs.webkit.org/show_bug.cgi?id=254868 。此次以iOS26.2的实际测量为修复依据。

## Fix Plan
- [x] 复现并测量独立运行的画面边界。
- [x] 独立/全屏显示的根页面与iframe使用lvw/lvh，浏览器显示继续dvw/dvh；iframe尺寸和旋转位移复用同一组变量。安全区只约束控件，不缩小画布。
- [x] 摇杆由父控制层统一处理安全区域。临时尺寸探针已移除，未改变手势逻辑。
- [x] 使用ResizeObserver观察宿主body替换子窗口resize，沿用方向媒体监听，并在pagehide/pageshow断开、恢复；不增加轮询或固定延迟。

## Verification
- [x] iPhone16e/iOS26.2模拟器实际添加到主屏幕；安装后铺满、横竖屏切换、安全区数值、前后台切换通过。控件测试场景正常运行，已移除临时探针。
- [x] Safari普通浏览器模式仍使用动态视口，控制测试场景正常运行、尺寸适配浏览器工具栏。
- [x] 最终代码npm run typecheck通过；npm test 1806/1806通过；npm run build通过（现有大于500kB分包提示）；git diff --check通过。
- [x] 独立subagent复核CSS范围、安全区映射和Observer生命周期，Approved，无待修问题。

## Limits
未在实体iPhone、iPad、macOS Dock应用上验收。模拟器叙事场景曾报WebGL shaderSource错误，控制测试场景正常渲染；该错误不属于本次视口修改，未声称完整游戏流程验收通过。UI改动按仓库规则人工验收，未新增样式/源码字符串测试。未提交、推送或部署。

## Fullscreen Follow-up
按用户追加请求，实际点击iPhone16e/iOS26.2模拟器的全屏按钮：Safari标签页与已安装PWA均显示requestFullscreen/webkitRequestFullscreen接口不存在，未进入DOM Fullscreen。PWA从主屏幕打开时无浏览器地址栏、画面铺满且安装入口隐藏，但这不等于全屏API成功。只读复核确认API调用在click内同步发生，没有调用前await、定时器或按iOS禁用的分支。已安装PWA仍保留全屏按钮并显示技术错误是现有界面表现，本轮仅记录实测结果，未修改生产代码或重跑已通过的单元测试。
