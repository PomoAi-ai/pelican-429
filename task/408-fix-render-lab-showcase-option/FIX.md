# FIX -- 展示场基础版加入独立渲染对比

## Status: verifying
## Task: 408
## Related: 404
## Baseline Commit: d2d72f4

## Problem
用户指定的展示场 D1 游戏标准版尚未加入实验页选择，不能与保留的发型及渲染效果比较。

## Root Cause
src/app/d1-render-lab.ts 的资源装配统一加载 outfit，现有 classic/rodin 均为冻结蓝裙资源；用户链接的 game 实际为白色基础服，头发有两个图元。实验头发适配仅操作一个网格，不能套到该正式版本。

## Fix Plan
- [x] 新增展示场基础版选项，复用正式 game 的 web-1k 模型与原动作；将当前完整资源逐字节保留，避免后续正式资源更新覆盖此阶段。
- [x] 保留双图元头发，不添加实验发际线或发梢变形；九套实验渲染使用各自原始网格。
- [x] 增加该选项专属的原材质基准卡，保存原材质着色回调；使用统一棚光、同步闭合度，说明环境光照差异。
- [x] 全身与头部取景、原画、页面链接和版本计数对应所选模型，旧选项保留。
- [x] 原动作装配接收可选的实验步态数据，赤脚基础版不生成依赖鞋底的候选；对应控制明确禁用。

## Verification
- [x] npm run typecheck：通过
- [ ] npm test：已运行，1879/1880 通过；唯一失败为范围外 src/config/art-library.ts 文案中的 platform/window 被架构正则误判。未修改相关文案或测试，保留 verifying。
- [x] npm run build：通过
- [x] full 模式实验页入口构建（不复制 public）：通过
- [x] 浏览器选择/往返切换：正式候选十卡，classic/Blender 九卡，独有基准焦点切回旧候选正常；Blender 顺滑步态仍可用。
- [x] 正面、侧面、全身与原动作/全闭眼实际检查，原材质闭合度与实验卡一致；控制台无错误。截图保存在 showcase-option。
- [x] diff-guard 本轮五文件轻审：子代理 Approved，未发现本轮引入的实际问题。

## Preservation
冻结副本 d1-base-showcase.web-1k.glb 为 3,644,784 字节，SHA256 为 366649ee2bb04f2420afb82ddcfce6da78832d1a036dd36e4d09e6d58d972c1b；GLB 完整性、嵌入数据、两个头发图元、四个动作及逐字节复制检查通过。正式源在保存后由范围外工作更新，冻结副本未覆盖；页面顶部明确链接到当前展示场。
