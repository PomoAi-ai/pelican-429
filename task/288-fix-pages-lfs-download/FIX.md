# FIX -- Pages 按需拉取正式模型

## Status: done
## Task: 288
## Related: 286
## Baseline Commit: b7a8988

## Problem
发布产物已精简，但 Pages 的 checkout 仍下载 LFS 资源，拖慢每次发布。

## Root Cause
`.github/workflows/pages.yml` 开启 `lfs: true`；当前稀疏检出仍包含完整 public 目录，且未限制 LFS 下载清单。

## Fix Plan
- [x] 从现有模型配置导出正式模型路径，构建和 CI 共用。
- [x] checkout 禁用自动 LFS 下载；setup-node 后生成精确 include 路径，再按需 pull。
- [x] 保留现有稀疏检出和构建时 GLB 校验；不向 CI 加入测试，不改本地 Git/LFS 配置。
- [x] 同步 README。

## Verification
- [x] 工作流 YAML 解析、bash -n 通过；执行工作流中的路径生成命令，得到 9 个精确路径，均由 git check-attr 确认为 LFS 文件，合计 11,910,332 字节。
- [x] npm run typecheck 通过；Node 25.9 下 npm test：1795 项、301 组全部通过。
- [x] 在临时目录模拟稀疏检出，仅保留 9 个正式 GLB，npm run build 成功；92 个文件、23,448,206 字节（22.36 MiB）。
- [x] 将临时目录中的一个正式模型替换为 LFS 指针后，构建按预期失败并报明模型路径；本地完整模型未改动。
- [x] git diff --check 通过；仅修改本任务涉及的工作流、共享清单、构建引用与 README。
- [x] Bug is fixed（本地验证；未提交、推送或触发线上 CI）

未执行真实远程 LFS 下载或 Actions 运行，实际流水线耗时待未来获授权发布后核对。本次未添加持久测试：已有检查和隔离构建直接验证部署配置，无需重复断言配置字面量；CI 中没有测试命令。

当前旁支会话独立完成，不调用子代理或联系其他会话。用户明确要求仅修改，不提交。
