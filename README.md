# RealAuto

七鱼客服 + Jira 工单全自动数据采集与可视化仪表盘系统。

## 架构概览

```
RealAuto/
├── collect.js              # 数据采集主入口（七鱼自动化 + Jira API）
├── jira.js                 # Jira 工单统计模块
├── server.js               # Express 静态服务（仪表盘）
├── report.js               # Markdown 日报生成器
├── dashboard.html          # Web 可视化仪表盘
├── config.example.json     # 配置模板
├── config.json             # 实际配置（已 gitignore）
├── Dockerfile              # 容器化部署
├── deploy/setup.sh         # 一键部署脚本
└── logs/                   # 采集日志目录（已 gitignore）
```

## 功能

| 模块 | 说明 |
|------|------|
| 七鱼数据采集 | 通过 Playwright 模拟登录七鱼客服工作台，自动抓取在线客服、排队量、会话数等指标 |
| Jira 工单统计 | 通过 Jira REST API 拉取 CS 项目的客户服务请求总数、未解决数、今日创建/更新数 |
| 本地存储 | 每日采集结果按日期聚合保存至 `data.json` |
| GitHub 备份 | 支持将 `data.json` 自动上传到指定 GitHub 仓库作为远程备份 |
| Web 仪表盘 | 纯前端仪表盘，按日期切换查看七鱼和 Jira 的数据卡片 |
| 报告生成 | `report.js` 生成 Markdown 格式的日报摘要 |
| 采集日志 | 每次运行自动生成带时间戳的日志文件至 `logs/` 目录 |
| Docker 部署 | 提供 Dockerfile，Alpine + Chromium，开箱即用 |

## 快速开始

### 1. 环境要求

- Node.js 18+
- npm
- Chromium（Playwright 自动安装或手动指定）

### 2. 一键部署

```bash
# Linux / macOS
bash deploy/setup.sh

# Windows (PowerShell 管理员)
npm install
npx playwright install --with-deps chromium
cp config.example.json config.json
# 编辑 config.json 填入配置
```

### 3. 配置

参考 `config.example.json` 创建 `config.json`：

```json
{
  "qiyu": {
    "url": "https://你的七鱼域名.qiyukf.com/login",
    "account": "你的七鱼账号",
    "password": "你的七鱼密码"
  },
  "jira": {
    "baseUrl": "http://你的jira域名",
    "user": "Jira用户名",
    "pass": "Jira密码"
  },
  "github": {
    "repo": "owner/repo-name",
    "token": "ghp_xxxxxxxxxxxxxxxxxxxx",
    "path": "data.json"
  },
  "chromium": {
    "headless": true,
    "channel": "chromium"
  }
}
```

> **注意**: GitHub 备份为可选功能。如不需要，可将 `github` 配置留空或移除。

### 4. 运行数据采集

```bash
node collect.js
```

执行后自动完成：
1. 模拟登录七鱼 → 抓取页面统计数据
2. 调用 Jira API → 拉取工单统计
3. 合并数据写入 `data.json`
4. 上传 `data.json` 到 GitHub（如果已配置）
5. 生成带时间戳的采集日志到 `logs/`

### 5. 启动仪表盘

```bash
node server.js
# 访问 http://localhost:3000/dashboard.html
```

仪表盘自动读取 `data.json`，按日期切换查看历史数据。

### 6. 生成日报

```bash
node report.js
# 输出 Markdown 日报到 report.md
```

## Docker 部署

```bash
docker build -t realauto .
docker run -d -p 3000:3000 \
  -v $(pwd)/config.json:/app/config.json \
  -v $(pwd)/data.json:/app/data.json \
  realauto
```

> Docker 镜像使用 Alpine + 系统 Chromium，无需额外下载浏览器。

## 定时采集

建议使用系统 cron 或 Windows 任务计划程序定时运行：

```bash
# Linux crontab 示例：每天 9:00 和 18:00 采集
0 9,18 * * * cd /path/to/RealAuto && node collect.js >> cron.log 2>&1
```

## 许可证

MIT
