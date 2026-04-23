#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateHtmlReport(reportData) {
  const {
    startUrl,
    crawledPages,
    brokenLinksCount,
    brokenLinks,
    generatedAt
  } = reportData;

  const hard404Count = brokenLinks.filter(link => link.issue_type === 'hard_404').length;
  const soft404Count = brokenLinks.filter(link => link.issue_type === 'soft_404').length;
  const criticalCount = brokenLinks.filter(link => link.priority === 'critical').length;
  const highCount = brokenLinks.filter(link => link.priority === 'high').length;
  const mediumCount = brokenLinks.filter(link => link.priority === 'medium').length;
  const lowCount = brokenLinks.filter(link => link.priority === 'low').length;

  const errorRate = crawledPages > 0 ? (brokenLinksCount / crawledPages * 100) : 0;
  const isOverWarning = errorRate > 5;

  const priorityColors = {
    critical: '#dc2626',
    high: '#f97316',
    medium: '#eab308',
    low: '#a3a3a3'
  };

  const priorityLabels = {
    critical: '🔴 Critical',
    high: '🟠 High',
    medium: '🟡 Medium',
    low: '⚪ Low'
  };

  const issueTypeLabels = {
    hard_404: '🔴 Hard 404',
    soft_404: '🟠 Soft 404'
  };

  const issueTypeColors = {
    hard_404: '#dc2626',
    soft_404: '#f97316'
  };

  function getSources(brokenUrl) {
    const sources = [];
    brokenLinks.forEach(link => {
      if (link.fromUrl && link.brokenUrl === brokenUrl) {
        const exists = sources.some(s => s.fromUrl === link.fromUrl);
        if (!exists) {
          sources.push({
            fromUrl: link.fromUrl,
            anchorText: link.anchorText || ''
          });
        }
      }
    });
    return sources;
  }

  function countIncomingLinks(brokenUrl) {
    let count = 0;
    brokenLinks.forEach(link => {
      if (link.brokenUrl === brokenUrl && link.fromUrl) {
        count++;
      }
    });
    return count || 0;
  }

  const rows = brokenLinks.map((link, index) => {
    const sources = getSources(link.brokenUrl);
    const inCount = countIncomingLinks(link.brokenUrl);
    const sourcesHtml = sources && sources.length > 0
      ? `<div class="sources"><ul>${sources.map(s => `<li><span class="source-url">${escapeHtml(s.fromUrl)}</span> ${s.anchorText ? `<span class="anchor">"${escapeHtml(s.anchorText)}"</span>` : ''}</li>`).join('')}</ul></div>`
      : '<div class="sources"><em>No source information available</em></div>';

    return `
<tr class="main-row" data-priority="${link.priority}" data-type="${link.issue_type}">
  <td>
    <span class="priority-badge" style="background-color: ${priorityColors[link.priority]}">
      ${priorityLabels[link.priority]}
    </span>
  </td>
  <td class="url-cell">
    <div class="broken-url">${escapeHtml(link.brokenUrl)}</div>
  </td>
  <td>
    <span class="type-badge" style="background-color: ${issueTypeColors[link.issue_type]}">
      ${issueTypeLabels[link.issue_type]}
    </span>
  </td>
  <td>${link.statusCode}</td>
  <td>${inCount}</td>
  <td><strong>${link.priority_score}</strong>/100</td>
</tr>
<tr class="details-row">
  <td colspan="6" class="details-cell">
    <div class="details-content">
      <h4>来源页面 (${inCount})</h4>
      ${sourcesHtml}
    </div>
  </td>
</tr>
`;
  }).join('');

  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 死链检测报告 - ${escapeHtml(startUrl)}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: #f5f5f5;
      color: #1f2937;
      line-height: 1.5;
    }
    .container {
      max-width: 1280px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 {
      font-size: 28px;
      margin-bottom: 8px;
      color: #111827;
    }
    .subtitle {
      color: #6b7280;
      margin-bottom: 24px;
    }
    .dashboard {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .card {
      background: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .card-label {
      font-size: 14px;
      color: #6b7280;
      margin-bottom: 8px;
    }
    .card-value {
      font-size: 32px;
      font-weight: bold;
    }
    .card-value.hard { color: #dc2626; }
    .card-value.soft { color: #f97316; }
    .card-value.critical { color: #dc2626; }
    .card-value.warning { color: #dc2626; }
    .card-value.normal { color: #059669; }
    .filters {
      background: white;
      padding: 16px;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      margin-bottom: 16px;
    }
    .filter-btn {
      display: inline-block;
      padding: 8px 16px;
      margin-right: 8px;
      margin-bottom: 8px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      background: white;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    }
    .filter-btn:hover {
      background: #f3f4f6;
    }
    .filter-btn.active {
      background: #2563eb;
      color: white;
      border-color: #2563eb;
    }
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      background: white;
      border-radius: 8px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    thead {
      background: #f9fafb;
    }
    th {
      padding: 14px 12px;
      text-align: left;
      font-weight: 600;
      font-size: 14px;
      color: #4b5563;
      border-bottom: 1px solid #e5e7eb;
      cursor: pointer;
      user-select: none;
    }
    th:hover {
      background: #f3f4f6;
    }
    td {
      padding: 12px;
      border-bottom: 1px solid #e5e7eb;
    }
    tr:hover {
      background: #f9fafb;
    }
    tr.main-row.expanded + .details-row {
      display: table-row;
    }
    .details-row {
      display: none;
    }
    .details-cell {
      background: #fafafa;
      padding: 0;
    }
    .details-content {
      padding: 16px 24px;
    }
    .details-content h4 {
      margin-bottom: 12px;
      color: #374151;
    }
    .sources ul {
      list-style: none;
    }
    .sources li {
      padding: 6px 0;
      border-bottom: 1px solid #eee;
    }
    .sources li:last-child {
      border-bottom: none;
    }
    .source-url {
      font-family: monospace;
      color: #1f2937;
      word-break: break-all;
    }
    .anchor {
      color: #6b7280;
      margin-left: 8px;
      font-size: 13px;
    }
    .priority-badge, .type-badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 4px;
      color: white;
      font-size: 12px;
      font-weight: 600;
    }
    .url-cell {
      max-width: 400px;
    }
    .broken-url {
      word-break: break-all;
      font-size: 14px;
    }
    .footer {
      margin-top: 24px;
      text-align: center;
      color: #6b7280;
      font-size: 14px;
    }
    @media (max-width: 768px) {
      .dashboard {
        grid-template-columns: 1fr 1fr;
      }
      table {
        font-size: 12px;
      }
      .url-cell {
        max-width: 200px;
      }
    }
    .hidden {
      display: none !important;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔍 404 死链检测报告</h1>
    <p class="subtitle">目标站点: <strong>${escapeHtml(startUrl)}</strong> | 生成时间: ${new Date(generatedAt).toLocaleString('zh-CN')}</p>

    <div class="dashboard">
      <div class="card">
        <div class="card-label">总爬取页面</div>
        <div class="card-value">${crawledPages}</div>
      </div>
      <div class="card">
        <div class="card-label">Hard 404</div>
        <div class="card-value hard">${hard404Count}</div>
      </div>
      <div class="card">
        <div class="card-label">Soft 404</div>
        <div class="card-value soft">${soft404Count}</div>
      </div>
      <div class="card">
        <div class="card-label">🔴 Critical</div>
        <div class="card-value critical">${criticalCount}</div>
      </div>
      <div class="card">
        <div class="card-label">死链占比</div>
        <div class="card-value ${isOverWarning ? 'warning' : 'normal'}">${errorRate.toFixed(1)}%</div>
        ${isOverWarning ? '<div class="card-label" style="color:#dc2626;margin-top:4px">⚠ 超过 5% 警告线</div>' : '<div class="card-label" style="color:#059669;margin-top:4px">✓ 正常范围</div>'}
      </div>
    </div>

    <div class="filters">
      <span style="margin-right: 12px; font-weight: 600;">筛选:</span>
      <button class="filter-btn active" data-filter="all">全部 (${brokenLinksCount})</button>
      <button class="filter-btn" data-filter="critical">🔴 Critical (${criticalCount})</button>
      <button class="filter-btn" data-filter="high">🟠 High (${highCount})</button>
      <button class="filter-btn" data-filter="medium">🟡 Medium (${mediumCount})</button>
      <button class="filter-btn" data-filter="low">⚪ Low (${lowCount})</button>
      <button class="filter-btn" data-filter="soft_404">🟠 Soft 404 (${soft404Count})</button>
      <button class="filter-btn" data-filter="hard_404">🔴 Hard 404 (${hard404Count})</button>
    </div>

    <table>
      <thead>
        <tr>
          <th data-sort="priority">优先级 ↕</th>
          <th data-sort="url">死链 URL ↕</th>
          <th data-sort="type">类型 ↕</th>
          <th data-sort="status">状态码 ↕</th>
          <th data-sort="inlinks">来源数 ↕</th>
          <th data-sort="score">评分 ↕</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <div class="footer">
      由 404-checker 自动生成
    </div>

  <script>
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const filter = btn.dataset.filter;
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        document.querySelectorAll('tbody tr.main-row').forEach(row => {
          const priority = row.dataset.priority;
          const type = row.dataset.type;
          let shouldShow = true;

          if (filter === 'all') {
            shouldShow = true;
          } else if (filter === 'soft_404' || filter === 'hard_404') {
            shouldShow = type === filter;
          } else {
            shouldShow = priority === filter;
          }

          const detailsRow = row.nextElementSibling;
          if (shouldShow) {
            row.classList.remove('hidden');
          } else {
            row.classList.add('hidden');
            if (detailsRow) {
              detailsRow.classList.add('hidden');
            }
          }
        });
      });
    });

    document.querySelectorAll('tbody tr.main-row').forEach(row => {
      row.addEventListener('click', () => {
        row.classList.toggle('expanded');
      });
    });

    let currentSort = null;
    let sortDirection = 1;

    function getRowData(row, sortBy) {
      switch (sortBy) {
        case 'priority':
          const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
          return priorityOrder[row.dataset.priority];
        case 'score':
          return parseInt(row.querySelector('td:last-child').textContent);
        case 'inlinks':
          return parseInt(row.querySelector('td:nth-child(5)').textContent);
        case 'status':
          return parseInt(row.querySelector('td:nth-child(4)').textContent);
        case 'url':
          return row.querySelector('.broken-url').textContent.toLowerCase();
        case 'type':
          return row.dataset.type;
        default:
          return 0;
      }
    }

    document.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const sortBy = th.dataset.sort;
        if (currentSort === sortBy) {
          sortDirection *= -1;
        } else {
          currentSort = sortBy;
          sortDirection = 1;
        }

        const tbody = document.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr.main-row'));

        rows.sort((a, b) => {
          const aVal = getRowData(a, sortBy);
          const bVal = getRowData(b, sortBy);
          if (aVal < bVal) {
            return sortDirection;
          } else if (aVal > bVal) {
            return -sortDirection;
          }
          return 0;
        });

        // 重新排序 DOM
        rows.forEach(row => {
          tbody.appendChild(row);
          const detailsRow = row.nextElementSibling;
          tbody.appendChild(detailsRow);
        });
      });
    });
  </script>
</body>
</html>
`;

  return html;
}

function main() {
  try {
    const reportPath = path.resolve(process.cwd(), 'report.json');
    
    if (!fs.existsSync(reportPath)) {
      console.error('❌ 找不到 report.json 文件，请先运行 crawler.js 生成报告');
      process.exit(1);
    }

    const reportData = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    const html = generateHtmlReport(reportData);
    const outputPath = path.resolve(process.cwd(), 'report.html');
    fs.writeFileSync(outputPath, html, 'utf-8');
    
    console.log(`✅ HTML 报告生成成功: ${outputPath}`);
  } catch (error) {
    console.error('❌ 生成报告失败:', error.message);
    process.exit(1);
  }
}

main();