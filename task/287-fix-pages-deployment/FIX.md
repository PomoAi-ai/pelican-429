# FIX -- 恢复 Pages 部署并缩减检出范围

## Status: verifying
## Task: 287
## Related: 286
## Baseline Commit: 5733e8d0179e488b96703f982629cf7368371562

## Problem

首次发布的构建成功后，部署停在环境审批等待状态，且普通仓库检出耗时约 13 分钟。

## Root Cause

- GitHub 环境状态不一致：部署报告等待批准，但审批接口返回没有可批准请求；环境没有审批人、计时器或自定义审批规则，main 分支已被允许。平台内部原因无法从公开接口确定。
- .github/workflows/pages.yml 的全量 checkout 下载了不参与网站构建的制作源文件；普通 Git 文件约 1.23 GiB，其中 assets 约 921 MiB。

## Fix Plan

- [x] 保留环境保护范围，重新保存现有 main 分支规则，由新版发布重新评估。
- [x] checkout 使用稀疏检出，保留根配置、src、public 和源码实际引用的 10 个 assets 文件；保留 Git LFS。
- [x] 发布精简资源版本，CI 仅安装依赖、构建与部署，不运行测试。

## Verification

- [x] 最终候选通过本机类型检查、1795 项测试与构建；92 个文件，23,448,185 字节。
- [ ] GitHub Pages 构建与部署成功，部署提交与最终候选一致。
- [ ] 正式域名 HTTPS、入口和运行资源验收通过。
