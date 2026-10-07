# FIX -- 本地 Docker 常驻开发服务

## Status: done
## Task: 332
## Related: N/A
## Baseline Commit: 53b8be3b86c1949c60a2c6d8e6c2735f2aa82c28

## Problem
使用本地 Docker 保持开发预览运行，避免随终端会话结束而退出。

## Root Cause
package.json:8 的开发命令直接启动 Vite；vite.config.ts:11 默认仅监听进程所在主机的回环地址，仓库没有容器服务配置。

## Fix Plan
- [x] compose.yaml — 复用本机 Node 镜像，源码只读挂载，Linux 依赖使用独立卷，容器监听全部接口但宿主端口仅绑定 127.0.0.1，使用 unless-stopped 自动重启。
- [x] 容器启动时按锁文件安装依赖，安装失败直接退出。

## Verification
- [x] docker compose config --quiet
- [x] docker compose up -d，首页与 src/main.ts 均返回 HTTP 200
- [x] docker compose restart web 后首页和入口模块恢复 HTTP 200；确认 restart=unless-stopped
- [x] npm run typecheck、npm test、npm run build 均退出 0
- [x] diff-guard：本任务仅新增本地容器配置与任务记录，无业务代码改动或新增测试

浏览器工具因 URL 策略拒绝刷新现有预览页，未绕过限制；通过宿主 HTTP 和容器内 HTTP 验证服务。电脑及 OrbStack 运行时容器独立于终端会话存活，手动停止后需执行 docker compose up -d 再启动。
