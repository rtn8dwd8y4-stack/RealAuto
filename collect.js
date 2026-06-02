const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const jira = require('./jira');

// ==================== 配置加载 ====================

let config;
try {
  config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));
} catch (e) {
  console.error('❌ config.json 不存在或格式错误：', e.message);
  process.exit(1);
}

// ==================== 日志工具 ====================

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatTime(date) {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}-${mm}-${ss}`;
}

function createLogger() {
  const now = new Date();
  const logDir = path.join(__dirname, 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  const dateStr = `${formatDate(now)}-${formatTime(now)}`;
  const logPath = path.join(logDir, `collect-${dateStr}.log`);
  const stream = fs.createWriteStream(logPath, { flags: 'a' });

  function log(level, msg) {
    const ts = new Date().toISOString();
    const line = `[${ts}] [${level}] ${msg}`;
    console.log(line);
    stream.write(line + '\n');
  }

  function close() {
    try { stream.end(); } catch (_) {}
    return logPath;
  }

  return {
    info:  (msg) => log('INFO',  msg),
    ok:    (msg) => log('OK',    msg),
    warn:  (msg) => log('WARN',  msg),
    error: (msg) => log('ERROR', msg),
    close
  };
}

// ==================== GitHub 上传 ====================

async function pushToGitHub(filePath, logger) {
  const { repo, token, path: repoPath } = config.github;
  if (!repo || !token) {
    logger.warn('GitHub 配置不完整，跳过上传');
    return;
  }

  try {
    const content = Buffer.from(fs.readFileSync(filePath)).toString('base64');

    // 先获取文件 sha（如果存在）
    let sha = null;
    try {
      const getRes = await axios.get(
        `https://api.github.com/repos/${repo}/contents/${repoPath}`,
        { headers: { Authorization: `token ${token}` } }
      );
      sha = getRes.data.sha;
    } catch (_) {}

    const body = {
      message: `Update data @ ${new Date().toISOString()}`,
      content,
      ...(sha ? { sha } : {})
    };

    await axios.put(
      `https://api.github.com/repos/${repo}/contents/${repoPath}`,
      body,
      { headers: { Authorization: `token ${token}` } }
    );

    logger.ok(`已上传到 GitHub: ${repo}/${repoPath}`);
  } catch (e) {
    logger.error(`GitHub 上传失败: ${e.message}`);
  }
}

// ==================== 数据收集 ====================

async function collectQiYu(logger) {
  logger.info('开始采集七鱼数据...');

  const startTime = Date.now();
  let browser;

  try {
    const headless = config.chromium?.headless ?? true;
    const channel = config.chromium?.channel || 'chromium';

    browser = await chromium.launch({
      headless,
      channel,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage'
      ]
    });

    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });

    const page = await context.newPage();

    // 1. 打开登录页
    logger.info(`打开登录页: ${config.qiyu.url}`);
    await page.goto(config.qiyu.url, { waitUntil: 'networkidle', timeout: 60000 });

    // 2. 填写账号密码
    await page.fill('input[name="account"]', config.qiyu.account);
    await page.fill('input[name="password"]', config.qiyu.password);

    // 3. 点击登录按钮
    await page.click('button[type="submit"]');

    // 4. 等待登录完成（等待页面跳转或特定元素出现）
    await page.waitForTimeout(5000);

    // 5. 提取数据
    // 从页面中提取客服工作台的关键数据
    const data = await page.evaluate(() => {
      const result = {
        timestamp: new Date().toISOString(),
        stats: {}
      };

      // 尝试提取常见的统计数据元素
      // 这里的提取逻辑需要根据七鱼实际的页面结构调整
      const statElements = document.querySelectorAll('.stat-item, .data-item, [class*="count"], [class*="stat"]');
      statElements.forEach(el => {
        const text = el.textContent?.trim();
        if (text) {
          const key = text.replace(/[\d.,]+/g, '').trim() || 'unknown';
          const valueMatch = text.match(/[\d.,]+/);
          if (valueMatch && key) {
            result.stats[key] = valueMatch[0];
          }
        }
      });

      // 尝试提取整体数据
      const bodyText = document.body?.innerText || '';

      // 在线客服数
      const onlineMatch = bodyText.match(/在线[^：:]*[：:]\s*(\d+)/);
      if (onlineMatch) result.stats['在线客服'] = onlineMatch[1];

      // 等待排队数
      const queueMatch = bodyText.match(/(?:排队|等待)[^：:]*[：:]\s*(\d+)/);
      if (queueMatch) result.stats['等待排队'] = queueMatch[1];

      // 今日会话数
      const sessionMatch = bodyText.match(/(?:今日会话|会话总数)[^：:]*[：:]\s*(\d+)/);
      if (sessionMatch) result.stats['今日会话'] = sessionMatch[1];

      return result;
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.ok(`七鱼数据采集完成 (耗时 ${elapsed}s)`);

    await browser.close();
    return data;

  } catch (e) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.error(`七鱼数据采集失败 (耗时 ${elapsed}s): ${e.message}`);
    if (browser) {
      try { await browser.close(); } catch (_) {}
    }
    return null;
  }
}

async function collectJira(logger) {
  logger.info('开始采集 Jira 数据...');

  try {
    const jiraConfig = config.jira;
    if (!jiraConfig || !jiraConfig.baseUrl) {
      logger.warn('Jira 配置不完整，跳过采集');
      return null;
    }

    const data = await jira.collect(jiraConfig, logger);
    logger.ok('Jira 数据采集完成');
    return data;
  } catch (e) {
    logger.error(`Jira 数据采集失败: ${e.message}`);
    return null;
  }
}

// ==================== 主流程 ====================

(async () => {
  const logger = createLogger();
  logger.info('========== RealAuto 开始采集 ==========');
  logger.info(`采集时间: ${new Date().toISOString()}`);

  const today = formatDate(new Date());

  // 1. 读取已有数据
  const dataFile = path.join(__dirname, 'data.json');
  let data = {};
  if (fs.existsSync(dataFile)) {
    try {
      data = JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
    } catch (e) {
      logger.warn('data.json 格式错误，将重新创建');
      data = {};
    }
  }

  // 初始化每日数据结构
  if (!data[today]) {
    data[today] = {
      date: today,
      qiyu: null,
      jira: null
    };
  }

  // 2. 采集七鱼数据
  const qiyuData = await collectQiYu(logger);
  if (qiyuData) {
    data[today].qiyu = qiyuData;
  }

  // 3. 采集 Jira 数据
  const jiraData = await collectJira(logger);
  if (jiraData) {
    data[today].jira = jiraData;
  }

  // 4. 保存到本地
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf-8');
  logger.ok('数据已保存到 data.json');

  // 5. 上传到 GitHub
  await pushToGitHub(dataFile, logger);

  // 6. 关闭日志
  const logPath = logger.close();

  console.log(`\n========== 采集完成 ==========`);
  console.log(`日志文件: ${logPath}`);
  console.log(`数据文件: ${dataFile}`);
})();
