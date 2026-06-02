const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// 读取配置
let config = {};
try {
  config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));
} catch (e) {
  console.warn('config.json 未找到或格式错误，使用默认端口 3000');
}

// 静态文件服务 — 把整个项目目录暴露出去，方便直接访问 dashboard.html
app.use(express.static(__dirname));

// 健康检查
app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.listen(PORT, () => {
  console.log(`RealAuto server running on http://localhost:${PORT}`);
  console.log(`仪表盘: http://localhost:${PORT}/dashboard.html`);
});
