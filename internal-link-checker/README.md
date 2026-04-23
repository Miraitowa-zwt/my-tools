# 站内已添加链接检测工具

自动扫描站点内所有页面，找出所有已经存在指向目标URL的链接，并提取锚文本和上下文。

## 功能特性

- ✅ 支持从 sitemap.xml 获取页面列表
- ✅ 没有 sitemap 时自动递归爬取站内所有页面
- ✅ 智能 URL 匹配，支持标准化处理
  - 处理末尾斜杠差异
  - 处理 http/https 差异
  - 自动忽略 utm 等跟踪参数
  - 相对路径自动转换为绝对路径
  - 可选检查跳转后的最终 URL
- ✅ 提取完整信息：源页面URL、标题、锚文本、rel属性、target、上下文
- ✅ 支持并发爬取，速度快
- ✅ 提供 CLI 命令行工具 和 FastAPI HTTP 接口

## 安装

```bash
cd internal-link-checker
pip install -r requirements.txt
```

## 使用方式

### CLI 命令行

```bash
# 基本用法
python -m app.cli https://target-url.com/page https://example.com

# 指定输出文件
python -m app.cli https://target-url.com/page example.com -o result.json

# 强制不使用sitemap，递归爬取
python -m app.cli https://target-url.com/page example.com --no-sitemap

# 调整并发数和最大页面
python -m app.cli https://target-url.com/page example.com --concurrency 20 --max-pages 5000

# 显示详细日志
python -m app.cli https://target-url.com/page example.com -v

# 查看帮助
python -m app.cli --help
```

### FastAPI 服务

```bash
# 启动服务
uvicorn app.api:app --host 0.0.0.0 --port 8000 --reload
```

然后访问 http://127.0.0.1:8000/docs 查看API文档，在线测试。

API 端点：
- `POST /scan` - 开始扫描
- `GET /health` - 健康检查

### 请求示例 (JSON)

```json
{
  "target_url": "https://example.com/target-page",
  "site_domain": "example.com",
  "use_sitemap": true,
  "follow_redirects": false,
  "ignore_tracking_params": true,
  "max_depth": 10,
  "max_pages": 1000,
  "concurrency": 10,
  "timeout_seconds": 30,
  "context_window": 50
}
```

## 输出格式

输出为JSON格式，结构如下：

```json
{
  "target_url": "https://example.com/target",
  "site_domain": "example.com",
  "total_pages_scanned": 156,
  "total_matches": 8,
  "scan_duration_seconds": 12.34,
  "errors": [],
  "matches": [
    {
      "source_page_url": "https://example.com/some-page",
      "source_page_title": "页面标题",
      "matched_href": "https://example.com/target",
      "anchor_text": "链接锚文本",
      "rel": "nofollow",
      "target": "_blank",
      "occurrence_count": 1,
      "context_before": "...前面的上下文",
      "context_after": "后面的上下文...",
      "full_context": "...前面的上下文链接锚文本后面的上下文...",
      "match_type": "exact"
    }
  ]
}
```

`match_type` 说明：
- `exact` - 完全精确匹配
- `normalized` - 标准化后匹配（协议/末尾斜杠/参数差异标准化后相等）
- `redirect` - 跳转后最终URL匹配

## 参数说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--no-sitemap` | false | 不使用sitemap，强制递归爬取 |
| `--follow-redirects` | false | 跟随跳转检查最终URL |
| `--keep-tracking_params` | false | 保留utm等跟踪参数 |
| `--max-depth` | 10 | 最大爬取深度 |
| `--max-pages` | 1000 | 最大扫描页面数 |
| `--concurrency` | 10 | 并发请求数 |
| `--timeout` | 30 | 请求超时秒数 |
| `--context-window` | 50 | 上下文字符数窗口 |

## 依赖

- Python ≥ 3.8
- httpx
- beautifulsoup4
- tenacity
- pydantic ≥ 2
- fastapi
- uvicorn

## 许可证

MIT
