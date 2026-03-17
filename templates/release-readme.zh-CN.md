# Vertical Agent Forge 发布说明

`vertical-agent-forge` 是一个面向 OpenClaw 垂直应用 agent 的生产级自我迭代控制平面。

- 版本：`__VERSION__`
- 标签：`__TAG__`

## 它是什么

Vertical Agent Forge 会把一个垂直 OpenClaw 部署提升为一个可控的改进系统，包含：

- 一个对外服务的用户侧 agent
- 一个持续运行的 forge 闭环
- 有边界的 proposal / evaluation / promotion 阶段
- durable artifact 与 release gate

## 为什么团队会用它

- 不再把所有质量逻辑藏在一个巨型 prompt 里
- 让回归问题可见
- 让晋升决策基于证据
- 把有效经验保留下来

## 下载

- 归档：[`__ARCHIVE_FILE__`](__ARCHIVE_URL__)
- SHA256：`__ARCHIVE_SHA256__`
- Companion plugin：`vertical-agent-forge-control-plane.tgz`

## 快速安装

```bash
git clone https://github.com/mbdtf202-cyber/vertical-agent-forge.git
cd vertical-agent-forge
npm install
node ./bin/vertical-agent-forge.mjs install
node ./bin/vertical-agent-forge.mjs bootstrap --domain saas-support
```

## 热插拔 / 热加载

这个产品面向已经在使用 OpenClaw 的用户。

安装器会：

- 把 toolkit workspace 复制进你的 OpenClaw state 目录
- 把需要的多 agent 配置合并进当前 OpenClaw 配置
- 继承你已有的默认模型，确保 forge subagents 不漂移到不兼容 provider

## 核心角色

- `app-main`
- `app-forge`
- `app-domain-compiler`
- `app-worker`
- `app-evaluator`
- `app-critic`
- `app-adversary`
- `app-promoter`
- `app-deployer`
- `app-observer`
- `app-archivist`

## 包含文档

- `README.md`
- `README.zh-CN.md`
- `docs/ARCHITECTURE.md`
- `docs/OPERATIONS.md`
- `docs/FAQ.md`
- `docs/RELEASING.md`
- `CHANGELOG.md`

## 生命周期命令

```bash
node ./bin/vertical-agent-forge.mjs install
node ./bin/vertical-agent-forge.mjs bootstrap --domain saas-support
node ./bin/vertical-agent-forge.mjs doctor
node ./bin/vertical-agent-forge.mjs uninstall
```

## 本地打包

```bash
__RELEASE_COMMAND__
```
