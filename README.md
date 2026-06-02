# RealAuto

七鱼 + Jira 全自动数据采集 & 仪表盘

## 功能
- 自动采集七鱼客服数据
- 自动拉取 Jira 工单统计
- 每日数据本地存储 (data.json)
- Web 仪表盘可视化展示
- Markdown 报告生成
- GitHub 自动上传备份

## 快速开始
```bash
# 安装依赖
npm install

# 安装 Playwright 浏览器
npx playwright install --with-deps chromium

# 配置 config.json（参考 config.example.json）

# 运行数据采集
node collect.js

# 启动仪表盘
node server.js

# 生成报告
node report.js
```
