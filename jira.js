/* ============================================================
 * jira.js — 轻量 Jira API 客户端 (HTTPS + 重试 + 并行)
 *
 * 从 JiraAuto/mcp-server 提取核心 HTTP 请求逻辑，
 * 去掉 MCP 框架壳，变成纯 Node.js 函数。
 * 零新增依赖（只使用 node:http、node:https、node:url 内置模块）。
 * ============================================================ */

import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

// ============== Jira API HTTP 请求（自动检测协议 + 重试） ==============
function jiraRequest(config, path, retries = 2) {
  const fullUrl = `${config.baseUrl}/rest/api/2${path}`;
  const urlObj = new URL(fullUrl);

  const isHttps = urlObj.protocol === 'https:';
  const transport = isHttps ? https : http;
  const defaultPort = isHttps ? 443 : 80;

  const auth = `Basic ${Buffer.from(`${config.user}:${config.pass}`).toString('base64')}`;

  const requestOptions = {
    hostname: urlObj.hostname,
    port: urlObj.port || defaultPort,
    path: urlObj.pathname + urlObj.search,
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Authorization': auth,
      'Content-Type': 'application/json',
    },
    rejectUnauthorized: false,
  };

  return new Promise((resolve, reject) => {
    const req = transport.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const err = new Error(`Jira API ${res.statusCode} (${fullUrl}): ${data.slice(0, 500)}`);
          err.statusCode = res.statusCode;
          reject(err);
        } else {
          try {
            resolve(JSON.parse(data));
          } catch (_e) {
            reject(new Error(`Jira API parse error (${fullUrl}): ${data.slice(0, 200)}`));
          }
        }
      });
    });

    req.on('error', (err) => {
      err.statusCode = 0;
      reject(new Error(`Jira API connection failed (${fullUrl}): ${err.message}`));
    });
    req.setTimeout(30000, () => { req.destroy(); reject(new Error(`Jira API timeout (${fullUrl})`)); });
    req.end();
  }).catch((err) => {
    // 重试逻辑：仅对网络错误/超时/5xx 重试
    const isRetryable =
      err.statusCode === 0 ||                          // 网络错误
      (err.statusCode >= 500 && err.statusCode <= 599) ||  // 服务端错误 (含500)
      err.message.includes('timeout') ||               // 超时
      err.message.includes('connection failed');       // 连接失败

    if (retries > 0 && isRetryable) {
      const delay = Math.pow(2, 3 - retries) * 1000;   // 1s / 2s / 4s 退避
      process.stderr.write(`  ⚠️ Jira API 失败，${delay/1000}s 后重试 (${retries}次剩余): ${err.message.slice(0,100)}\n`);
      return new Promise((resolve) => setTimeout(resolve, delay))
        .then(() => jiraRequest(config, path, retries - 1));
    }
    throw err;
  });
}

// ============== JQL 查询（返回 total 计数） ==============
async function jiraCount(config, jql) {
  const result = await jiraRequest(config, `/search?jql=${encodeURIComponent(jql)}&maxResults=0`);
  return result.total;
}

// ============== 同期对比窗口计算（往前提 364 天） ==============
function getYoYWindow(start, end) {
  const yoyStart = new Date(start.getTime());
  yoyStart.setDate(yoyStart.getDate() - 364);
  const yoyEnd = new Date(end.getTime());
  yoyEnd.setDate(yoyEnd.getDate() - 364);
  return { yoyStart, yoyEnd };
}

function fmtDate(d) {
  const ts = d.getTime();
  if (isNaN(ts)) throw new Error(`fmtDate: Invalid Date (input: ${d})`);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day} 00:00`;
}

// ============== 核心：采集 Jira 窗口指标（并行请求） ==============
async function fetchJiraWindow(config, winStart, winEnd) {
  const [sy, sm, sd] = winStart.split('-').map(Number);
  const startDate = new Date(sy, sm - 1, sd);
  const [ey, em, ed] = winEnd.split('-').map(Number);
  const endDate = new Date(ey, em - 1, ed, 23, 59, 59, 999);
  const endDateNext = new Date(ey, em - 1, ed + 1);

  const { yoyStart, yoyEnd } = getYoYWindow(startDate, endDate);
  const yoyEndNext = new Date(yoyEnd.getTime());
  yoyEndNext.setDate(yoyEndNext.getDate() + 1);

  const SD = fmtDate(startDate);
  const ED = fmtDate(endDateNext);
  const YS = fmtDate(yoyStart);
  const YE = fmtDate(yoyEndNext);

  // 构建所有 JQL 查询
  const securityJql    = `project=CS AND issuetype="客户服务请求" AND "故障等级" = "安全问题" AND created>="${SD}" AND created<"${ED}"`;
  const wechatJql      = `project=CS AND issuetype="客户服务请求" AND cf[16500] = "微信" AND created>="${SD}" AND created<"${ED}"`;
  const wechatP4Jql    = `project=CS AND issuetype="客户服务请求" AND "故障等级" = "P4-咨询" AND cf[16500] = "微信" AND created>="${SD}" AND created<"${ED}"`;
  const yoySecurityJql = `project=CS AND issuetype="客户服务请求" AND "故障等级" = "安全问题" AND created>="${YS}" AND created<"${YE}"`;
  const yoyWechatJql   = `project=CS AND issuetype="客户服务请求" AND cf[16500] = "微信" AND created>="${YS}" AND created<"${YE}"`;
  const yoyWechatP4Jql = `project=CS AND issuetype="客户服务请求" AND "故障等级" = "P4-咨询" AND cf[16500] = "微信" AND created>="${YS}" AND created<"${YE}"`;

  // 并行执行：当前周 3 个 + 去年同期 3 个，共 6 个请求分 2 批
  const [currentResults, yoyResults] = await Promise.all([
    Promise.all([
      jiraCount(config, securityJql),
      jiraCount(config, wechatJql),
      jiraCount(config, wechatP4Jql),
    ]),
    Promise.all([
      jiraCount(config, yoySecurityJql),
      jiraCount(config, yoyWechatJql),
      jiraCount(config, yoyWechatP4Jql),
    ]),
  ]);

  const [securityCount, wechatOrders, wechatP4Orders] = currentResults;
  const [yoySecurityCount, yoyWechatOrders, yoyWechatP4Orders] = yoyResults;

  return {
    data: {
      securityIssues: securityCount,
      wechatOrders: wechatOrders,
      wechatP4Orders: wechatP4Orders,
    },
    yoy: {
      securityIssues: yoySecurityCount,
      wechatOrders: yoyWechatOrders,
      wechatP4Orders: yoyWechatP4Orders,
    },
  };
}

export { fetchJiraWindow };
