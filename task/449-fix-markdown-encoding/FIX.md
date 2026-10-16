# FIX -- Markdown 直接访问中文乱码

## Status: done
## Task: 449
## Related: N/A
## Baseline Commit: 64ef4a38

## Problem
直接打开基础概念 Markdown，中文显示乱码。

## Root Cause
Vite 静态服务返回 text/markdown，但没有 charset；文件本身为 UTF-8，浏览器直接展示时可能使用其他编码。

## Fix Plan
- [x] vite.config.ts — 开发服务与发布预览为概念 Markdown 声明 UTF-8，不改变正文或其他资源类型。

## Verification
- [x] 类型检查
- [x] 实际HTTP响应的UTF-8声明与原文件字节一致；图片/脚本类型不受影响
- 浏览器直接显示验收受内置浏览器 ERR_BLOCKED_BY_CLIENT 限制，未宣称通过。

## Results
- 35份Markdown均返回 text/plain; charset=utf-8，原文与磁盘UTF-8内容逐字一致；JavaScript和PNG类型未受影响。
- 使用text/plain保证原文可直接显示，不要求浏览器支持Markdown MIME；扩展名与正文不变，网页转换与LLM读取不受影响。
- npm run typecheck、1943项测试、npm run build全部通过；保留既有大chunk提示。
- Docker挂载的Vite已自动重启加载配置，无镜像构建，无提交推送。
