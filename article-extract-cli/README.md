# article-extract-cli

> 批量文章正文提取CLI工具 - 从多个URL提取正文内容，保存为独立文本文件。
> 基于 Mozilla Readability，去除广告、导航、侧边栏等杂质。

## 安装使用

### 直接通过 npx 使用（推荐）

```bash
# 单个URL提取
npx article-extract-cli --url https://example.com/article

# 从文件批量提取（每行一个URL）
npx article-extract-cli --input urls.txt --output ./extracted

# 查看帮助
npx article-extract-cli --help
```

### 本地安装开发

```bash
git clone <repo>
cd article-extract-cli
npm install
```

## 命令选项

```
Options:
  -i, --input <file>     input file with one URL per line
  -o, --output <dir>     output directory for extracted text files (default: "./extracted")
  -u, --url <url>        single URL to extract
  -V, --version          output the version number
  -h, --help             display help for command
```

## 使用示例

### 提取单个文章

```bash
npx article-extract-cli --url https://daixidreadology.com/blogs/locs-insights/pre-washing-hair-bulk-for-loc-extensions
```

### 批量提取多个文章

创建 `urls.txt` 文件：
```
# 这是注释，空行也会被忽略
https://example.com/article-1
https://example.com/article-2
https://example.com/article-3
```

然后运行：
```bash
npx article-extract-cli --input urls.txt --output ./my-articles
```

## 输出格式

每个文章保存为独立 `.txt` 文件：

```
Title: Why Pre-Washing Hair Bulk Is Crucial Before Installation
URL: https://daixidreadology.com/blogs/locs-insights/pre-washing-hair-bulk-for-loc-extensions
Author: Author Name
Extracted: 2026-04-13T16:00:00.000Z

---

[ 提取的正文内容... ]
```

## 特点

- ✅ **无跨域问题**：Node.js 本地提取，没有浏览器 CORS 限制
- ✅ **批量处理**：支持从文件读取多个URL
- ✅ **自动清理**：去除广告、导航、侧边栏、评论等杂质
- ✅ **干净文件名**：自动处理特殊字符
- ✅ **基于 Readability**：使用 Mozilla Readability 算法，提取质量高

## 对比纯客户端HTML方案

| 特性 | 本CLI工具 | 纯HTML工具 |
|------|-----------|------------|
| 跨域限制 | ❌ 无 | ✅ 有（浏览器安全限制） |
| 提取成功率 | 🟢 很高 | 🔴 依赖第三方代理，经常失败 |
| 批量处理 | ✅ 原生支持 | ✅ 支持 |
| 保存到本地文件 | ✅ 自动保存 | ❌ 只能复制 |
| 安装要求 | Node.js | 只要浏览器 |

## License

MIT
