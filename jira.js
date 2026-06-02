const axios = require('axios');

/**
 * Jira 数据采集模块
 * 通过 Jira REST API 拉取统计数据
 */

async function collect(config, logger) {
  const { baseUrl, user, pass } = config;
  const auth = Buffer.from(`${user}:${pass}`).toString('base64');
  const client = axios.create({
    baseURL: baseUrl,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    timeout: 30000,
    // 禁用 SSL 验证 (内网 Jira 可能存在证书问题)
    httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false })
  });

  const result = {
    timestamp: new Date().toISOString(),
    summary: {}
  };

  try {
    // 1. 获取 CS 项目信息
    logger.info('获取 Jira 项目信息...');
    try {
      const projRes = await client.get('/rest/api/2/project/CS');
      result.summary.project = {
        key: projRes.data.key,
        name: projRes.data.name
      };
    } catch (e) {
      logger.warn(`获取项目信息失败: ${e.message}`);
    }

    // 2. 统计"客户服务请求"类型的 Issue
    logger.info('统计客户服务请求数据...');
    try {
      // 使用 JQL 搜索
      const searchRes = await client.get('/rest/api/2/search', {
        params: {
          jql: 'project = CS AND issuetype = "客户服务请求"',
          maxResults: 0  // 只需要总数
        }
      });
      result.summary.customerServiceRequests = {
        total: searchRes.data.total
      };
    } catch (e) {
      logger.warn(`统计客户服务请求失败: ${e.message}`);
    }

    // 3. 统计当前未解决的 Issue
    try {
      const unresolvedRes = await client.get('/rest/api/2/search', {
        params: {
          jql: 'project = CS AND resolution = Unresolved',
          maxResults: 0
        }
      });
      result.summary.unresolved = {
        total: unresolvedRes.data.total
      };
    } catch (e) {
      logger.warn(`统计未解决失败: ${e.message}`);
    }

    // 4. 统计今日创建的 Issue
    try {
      const todayCreatedRes = await client.get('/rest/api/2/search', {
        params: {
          jql: 'project = CS AND created >= startOfDay()',
          maxResults: 0
        }
      });
      result.summary.todayCreated = {
        total: todayCreatedRes.data.total
      };
    } catch (e) {
      logger.warn(`统计今日创建失败: ${e.message}`);
    }

    // 5. 统计今日更新的 Issue
    try {
      const todayUpdatedRes = await client.get('/rest/api/2/search', {
        params: {
          jql: 'project = CS AND updated >= startOfDay()',
          maxResults: 0
        }
      });
      result.summary.todayUpdated = {
        total: todayUpdatedRes.data.total
      };
    } catch (e) {
      logger.warn(`统计今日更新失败: ${e.message}`);
    }

    return result;

  } catch (e) {
    logger.error(`Jira 采集出错: ${e.message}`);
    return result;
  }
}

module.exports = { collect };
