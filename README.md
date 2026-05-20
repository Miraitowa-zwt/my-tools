# my-tools

个人本地工具箱。每个工具尽量独立成目录，保留自己的 README、依赖文件和测试脚本，避免把临时输出、日志、缓存文件提交到仓库。

## 推荐目录规范

```text
my-tools/
├── format-converter/          # 富文本与多格式转换工具
├── collection-copy-tool/      # 集合页文案生成工具
├── 301-404-checker/           # 301/404 链接检测
├── 404-checker/               # 404 链接检测完整版
├── 404-checker-simple/        # 404 链接检测简化版
├── 404-get/                   # 404 页面获取工具
├── article-extract-cli/       # 文章提取 CLI
├── bulk-article-extractor-web/# 批量文章提取 Web 版
├── internal-link-checker/     # 站内链接检查
├── shopify_blog_exporter/     # Shopify 博客导出
├── translator/                # 翻译工具
├── url-analyzer/              # URL 分析工具
└── README.md
```

## 工具列表

### 格式转换

- [format-converter](format-converter/)  
  本地富文本与多格式转换工具。支持富文本 / HTML 清理、Markdown、CSV/TSV、JSON/YAML/XML、SQL 等格式转换。可直接打开 `index.html` 使用。

### 内容与 SEO

- [collection-copy-tool](collection-copy-tool/)  
  产品集合页文案生成工具。

- [article-extract-cli](article-extract-cli/)  
  命令行文章提取工具。

- [bulk-article-extractor-web](bulk-article-extractor-web/)  
  批量文章提取 Web 工具。

### 链接检查

- [301-404-checker](301-404-checker/)  
  301 重定向和 404 死链检测。

- [404-checker](404-checker/)  
  404 链接检测完整版。

- [404-checker-simple](404-checker-simple/)  
  404 链接检测简化版。

- [404-get](404-get/)  
  404 页面获取工具。

- [internal-link-checker](internal-link-checker/)  
  网站内链检查工具。

### Shopify

- [shopify_blog_exporter](shopify_blog_exporter/)  
  Shopify 博客导出工具。

### 其他

- [translator](translator/)  
  翻译工具。

- [url-analyzer](url-analyzer/)  
  URL 分析工具。

## 提交规则

- 工具目录应自带 README，说明用途、运行方式和测试方式。
- 临时输出、日志、缓存、批量导出的 CSV 不应提交。
- 新工具优先使用清晰的英文目录名，例如 `format-converter`。
- 如果工具需要依赖，依赖文件放在工具目录内，不放到仓库根目录。
