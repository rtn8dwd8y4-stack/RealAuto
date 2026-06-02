# RealAuto — 七鱼 + Jira 全自动数据采集 & 仪表盘

整合**七鱼客服系统**（呼叫中心 + 企微会话）与 **Jira 工单系统**的全自动数据采集脚本，
支持**同比（YoY）环比对比**，数据自动上传 GitHub，配套 Web 仪表盘实时查看。

## 架构概览

```
┌────────────────────────────────────────────┐
│               Linux 服务器 (cron)            │
│                                            │
│  collect.js (Playwright)                    │
│  ├── 登录七鱼 → 抓取呼入量/接通率/企微会话      │
│  ├── Jira API → 查询工单/安全问题/P4工单       │
│  └── 合并数据 → 上传 GitHub data.json         │
└──────────────────┬─────────────────────────┘
                   │
            GitHub Repository
            (yourRepo/auto-data)
            data.json
                   │
┌──────────────────▼─────────────────────────┐
│            本地/服务器 查看仪表盘              │
│                                            │
│  server.js (HTTP :8080)                     │
│  ├── /             → dashboard.html         │
│  ├── /data.json    → 代理 GitHub API        │
│  └── 静态文件        → 5 分钟内存缓存         │
│                                            │
│  dashboard.html (Chart.js)                  │
│  ├── 4 个图表：双Y轴/折线/柱状/堆叠            │
│  ├── 明细表：周度数据 + 同比增减               │
│  └── 时间段面板：复选框多选 + 分组筛选          │
└────────────────────────────────────────────┘
```

---

## 服务器端 — 数据采集

### 环境要求

- **Linux** (Ubuntu 20.04+ / Debian 11+ / CentOS 7+)
- **Node.js 18+**
- **Chromium** (Playwright 自动安装)

### 一键安装

```bash
cd RealAuto
sudo bash deploy/setup.sh
```

此脚本会自动:
1. 安装 Node.js 18+ (如未安装)
2. 安装 Playwright + Chromium 及其系统依赖
3. 安装 npm 依赖 (`npm ci || npm install`)
4. 检查 `config.json`，若不存在提示从 `config.example.json` 复制
5. 创建 `logs/` 日志目录
6. 安装 systemd 定时器（**每周四 22:00** 自动采集）

### 手动安装

```bash
cd RealAuto
npm install
npx playwright install --with-deps chromium
```

### 配置文件

复制模板并填写真实凭据：

```bash
cp config.example.json config.json
vim config.json
```

`config.json` 完整字段：

```jsonc
{
  "qiyu": {
    "url": "https://coremail.qiyukf.com/login",
    "account": "你的七鱼账号",
    "password": "你的七鱼密码"
  },
  "jira": {
    "baseUrl": "https://your-jira.atlassian.net",
    "user": "your-email@example.com",
    "pass": "Jira API Token"
  },
  "github": {
    "repo": "yourRepo/auto-data",
    "token": "ghp_xxxxxxxxxxxxxxxxxxxx",
    "path": "data.json"
  },
  "chromium": {
    "headless": true,
    "channel": "chromium"
  }
}
```

| 字段 | 说明 |
|------|------|
| `qiyu.account` | 七鱼管理后台登录账号 |
| `qiyu.password` | 七鱼管理后台登录密码 |
| `jira.baseUrl` | Jira 服务器地址 |
| `jira.user` | Jira 登录邮箱 |
| `jira.pass` | [Jira API Token](https://id.atlassian.com/manage/api-tokens) |
| `github.repo` | 数据存放的 GitHub 仓库 (owner/repo) |
| `github.token` | [GitHub Personal Access Token](https://github.com/settings/tokens) (需要 `repo` 权限) |
| `github.path` | 数据文件在仓库中的路径 (默认 `data.json`) |
| `chromium.headless` | 服务器上必须为 `true` |

### 运行采集

```bash
# 自动采集本周一～周日（默认）
node collect.js

# 指定自定义时间窗口
node collect.js --start=2026-05-19 --end=2026-05-25 --group=售后服务

# 使用 npm scripts
npm run collect
```

参数说明：

| 参数 | 必需 | 说明 |
|------|------|------|
| `--start` | 否 | 起始日期 `YYYY-MM-DD`，默认本周一 |
| `--end` | 否 | 结束日期 `YYYY-MM-DD`，默认本周日 |
| `--group` | 否 | 分组标签，默认 `售后服务` |

### 数据报告生成

```bash
# 从 data.json 输出统计报告 JSON（stdout）
node report.js

# 生成 HTML 报告文件 report.html
node report.js --html

# 使用 npm scripts
npm run report
```

报告内容：按周汇总各项指标的原始值与去年同期值，适用于离线分析和存档。

### Docker 运行 (可选)

如果不想在宿主机安装依赖，可以用 Docker：

```bash
# 构建镜像
docker build -t realauto .

# 运行一次采集
docker run --rm -v $(pwd)/config.json:/app/config.json realauto

# 带自定义参数
docker run --rm -v $(pwd)/config.json:/app/config.json realauto node collect.js --start=2026-05-19 --end=2026-05-25
```

### 定时任务管理

```bash
# 查看定时器状态
systemctl status realauto.timer

# 查看下次执行时间
systemctl list-timers realauto.timer

# 手动执行一次
systemctl start realauto.service

# 查看运行日志
journalctl -u realauto.service -f
tail -f logs/service.log
```

---

## 本地端 — 仪表盘查看

### 启动 Web 服务

```bash
cd RealAuto
node server.js
```

```
✅ RealAuto Web 服务已启动: http://localhost:8080
📊 项目目录: /path/to/RealAuto
📄 仪表盘: http://localhost:8080/dashboard.html
```

### 打开浏览器

访问 **`http://localhost:8080`** 即可看到仪表盘。

### 仪表盘功能

| 功能 | 说明 |
|------|------|
| 📞 呼入量 & 接通率 | 双 Y 轴组合图（柱状图 + 折线图 + 同比虚线） |
| 💬 企微会话量 | 当期折线 vs 同比折线 |
| 🔒 安全问题 | 当期柱状 vs 同比柱状 |
| 📱 微信工单 / P4 / 一线提单 | 堆叠柱状图 |
| 📋 周度明细表 | 逐周数据 + 同比增减百分比 |
| 🏷️ 分组筛选 | 按 `group` 字段筛选，联动过滤图表和明细表 |
| 📅 时间段面板 | 复选框多选（4/8/12/16/20/24/28周），全选/取消全选，折叠/展开 |
| 🔄 自动刷新 | 5 分钟内存缓存，刷新按钮即时更新 |

### 数据流程

1. `server.js` 启动时从 `config.json` 读取 `github.token`
2. 浏览器请求 `/` → 返回 `dashboard.html`
3. `dashboard.html` 内 JS 请求 `/data.json` → `server.js` 代理调用 [GitHub Contents API](https://docs.github.com/en/rest/repos/contents)
4. 返回 base64 解码后的 `data.json`（5 分钟缓存）
5. Chart.js 渲染图表

---

## 采集数据说明

每周采集 8 项指标：

| 指标 | 数据源 | 说明 |
|------|--------|------|
| `phoneCalls` | 七鱼 呼叫中心 → 团队报表 | 呼入量（总计行） |
| `phoneConnectRate` | 七鱼 呼叫中心 → 团队报表 | 队列接通率 |
| `wechatSessions` | 七鱼 在线客服 → 总览 | 企业微信会话数 |
| `securityIssues` | Jira | CS 项目"安全问题"工单数 |
| `wechatOrders` | Jira | CS 项目"微信"来源工单数 |
| `wechatP4Orders` | Jira | CS 项目 `"故障等级" = "P4-咨询"` 且 `cf[16500] = "微信"` 工单数（P4 微信子集） |
| `frontlineTickets` | Polaris| CS 项目"客户服务中心一线支持"队列工单数 |
| `frontlineSelfResolveRate` | Polaris | 一线自行处理率 = `一线自行处理工单 / frontlineTickets × 100%` |

其中 `frontlineTickets` 和 `frontlineSelfResolveRate` 为新增指标，数据接口尚未接入。

`wechatOrders` 和 `wechatP4Orders` 的区别：
- `wechatOrders` = Jira 中来源为"微信"的**所有**工单
- `wechatP4Orders` = 上述工单中**仅 P4-咨询级别**的子集

同比 (YoY)：去年同期（往前提 **364 天**固定偏移）的数据，支持 Jira + 七鱼指标。

---

## 项目文件

```
RealAuto/
├── collect.js           # 主采集脚本 (Playwright 七鱼 + HTTP Jira)
├── jira.js              # Jira API 客户端 (HTTPS + 重试 + 并行)
├── report.js            # 数据报告生成 (JSON/HTML)
├── server.js            # HTTP 静态文件服务 + GitHub API 代理
├── dashboard.html       # 数据仪表盘 (Chart.js)
├── config.example.json  # 配置模板
├── config.json          # 实际配置 (git ignored, 含敏感凭据)
├── package.json         # npm 依赖与 scripts
├── Dockerfile           # Docker 镜像构建
├── deploy/
│   └── setup.sh         # Linux 一键安装脚本 + systemd 定时器
└── logs/                # 采集日志 (自动创建)
```

## 常见问题

**Q: 仪表盘显示"数据加载失败"？**

检查：
1. `config.json` 中 `github.token` 是否有效且拥有 `repo` 权限
2. `github.repo` 格式是否正确（`owner/repo`）
3. 仓库中的 `data.json` 是否存在
4. 网络是否能访问 `api.github.com`

**Q: 采集时报"登录失败"？**

- 七鱼账号密码是否正确
- 七鱼管理后台 URL 是否可访问
- 如使用 Docker，确认 `config.json` 已挂载

**Q: Chromium 启动失败？**

```bash
npx playwright install --with-deps chromium
```

**Q: 端口 8080 被占用？**

```bash
PORT=3000 node server.js