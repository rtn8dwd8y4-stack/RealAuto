FROM node:18-alpine

# 安装 Chromium 依赖
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# 设置 Puppeteer/Playwright 使用系统 Chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

# 暴露仪表盘端口
EXPOSE 3000

# 启动服务
CMD ["node", "server.js"]
