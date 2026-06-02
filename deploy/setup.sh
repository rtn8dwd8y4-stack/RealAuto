#!/bin/bash
# RealAuto 一键部署脚本
# 用法: bash deploy/setup.sh

set -e

echo "=========================================="
echo " RealAuto 一键部署"
echo "=========================================="

# 检查 Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js 未安装，请先安装 Node.js 18+"
  exit 1
fi
echo "✅ Node.js $(node -v)"

# 检查 npm
if ! command -v npm &> /dev/null; then
  echo "❌ npm 未安装"
  exit 1
fi
echo "✅ npm $(npm -v)"

# 安装依赖
echo ""
echo "📦 安装依赖..."
npm install

# 安装 Playwright 浏览器
echo ""
echo "🌐 安装 Chromium..."
npx playwright install chromium

# 配置文件检查
echo ""
if [ ! -f "config.json" ]; then
  echo "⚠️  未找到 config.json，从 config.example.json 复制模板..."
  cp config.example.json config.json
  echo "📝 请编辑 config.json 填写你的七鱼和 Jira 信息"
else
  echo "✅ config.json 已存在"
fi

# 创建必要目录
mkdir -p logs data

echo ""
echo "=========================================="
echo " ✅ 部署完成!"
echo "=========================================="
echo ""
echo "下一步:"
echo "  1. 编辑 config.json 填写配置信息"
echo "  2. 运行采集: node collect.js"
echo "  3. 启动服务: node server.js"
echo "  4. 打开仪表盘: http://localhost:3000/dashboard.html"
