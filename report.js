const fs = require('fs');
const path = require('path');

/**
 * 简单的报告生成脚本
 * 生成 Markdown 格式的日报摘要
 */

function loadData() {
  const dataFile = path.join(__dirname, 'data.json');
  if (!fs.existsSync(dataFile)) {
    console.error('data.json 不存在，请先运行 collect.js');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(dataFile, 'utf-8'));
}

function generateReport() {
  const data = loadData();
  const dates = Object.keys(data).sort().reverse();

  let md = '# RealAuto 数据报告\n\n';
  md += `> 生成时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
  md += `---\n\n`;

  // 最新一天
  if (dates.length > 0) {
    const latest = dates[0];
    const entry = data[latest];
    md += `## 📅 最新数据 (${latest})\n\n`;

    if (entry.qiyu) {
      md += `### 七鱼客服\n`;
      md += `- 采集时间: ${entry.qiyu.timestamp}\n`;
      if (entry.qiyu.stats) {
        for (const [k, v] of Object.entries(entry.qiyu.stats)) {
          md += `- ${k}: ${v}\n`;
        }
      }
      md += '\n';
    }

    if (entry.jira) {
      md += `### Jira (项目 CS)\n`;
      if (entry.jira.summary) {
        const s = entry.jira.summary;
        if (s.customerServiceRequests) md += `- 客户服务请求总数: ${s.customerServiceRequests.total}\n`;
        if (s.unresolved) md += `- 未解决: ${s.unresolved.total}\n`;
        if (s.todayCreated) md += `- 今日创建: ${s.todayCreated.total}\n`;
        if (s.todayUpdated) md += `- 今日更新: ${s.todayUpdated.total}\n`;
      }
      md += '\n';
    }
  }

  // 历史汇总
  if (dates.length > 1) {
    md += `## 📊 历史数据\n\n`;
    md += `| 日期 | 七鱼 | Jira |\n`;
    md += `|------|------|------|\n`;
    for (const date of dates.slice(0, 30)) {
      const entry = data[date];
      const qiyuOk = entry.qiyu ? '✅' : '❌';
      const jiraOk = entry.jira ? '✅' : '❌';
      md += `| ${date} | ${qiyuOk} | ${jiraOk} |\n`;
    }
    md += '\n';
  }

  return md;
}

if (require.main === module) {
  const report = generateReport();
  console.log(report);

  // 同时写入文件
  const reportPath = path.join(__dirname, 'report.md');
  fs.writeFileSync(reportPath, report, 'utf-8');
  console.log(`报告已写入: ${reportPath}`);
}

module.exports = { generateReport, loadData };
