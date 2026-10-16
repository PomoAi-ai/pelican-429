# FIX -- Docker 源码挂载开发服务

## Status: done
## Task: 448
## Related: N/A
## Baseline Commit: 64ef4a38

## Problem
关闭本机直接启动的 Vite，使用 Docker 挂载当前源码启动，实时查看修改。

## Root Cause
compose.yaml 的 /app 只读挂载与 predev 生成材料库文件冲突；本机 Vite 占用 5174。

## Fix Plan
- [x] compose.yaml — 源码挂载可写，保留独立 node_modules 卷。
- [x] 停止本机 Vite，启动已有 Node 镜像的 Compose 服务，不构建镜像。

## Verification
- [x] Compose 配置、实际挂载和容器启动日志
- [x] HTTP 访问与源码修改即时可见

## Results
- 原容器日志确认 EROFS：无法写入 material-library.md。
- 本机 Vite 已停止；docker compose up -d --no-build web 成功，5174由OrbStack监听。
- docker compose config --quiet通过；实际/app为当前项目rw绑定挂载，node_modules仍为命名卷。
- 容器npm ci、资料库生成与Vite启动均成功。
- 临时文件两次写入均立即经HTTP读到新内容；首次启动瞬间新增文件曾命中SPA回退，文件监听就绪后的重验两次通过，临时文件已清除。
- 主机CSS触发容器Vite hmr update，热更新已验证。
- diff检查通过。仅Compose挂载配置修改，未运行游戏测试或构建镜像；未提交推送。
