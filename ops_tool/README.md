﻿# ops_tool

`ops_tool` 是一个本地运营辅助工具，主要用于把 Word 博客文章和网站 sitemap 数据整理成可直接使用的 SEO 处理提示词，也可以通过 OpenAI 兼容 API 直接生成结果。

## 主要作用

- 读取一个或多个 `.docx` Word 文件。
- 把 Word 内容转换为 HTML。
- 解析网站 sitemap，整理产品、集合页、博客页链接。
- 生成文章处理 Prompt。
- 生成 TD Prompt，用于 SEO 标题、描述、URL、关键词、标签。
- 可选调用 OpenAI 兼容 API，直接生成结果。
- 支持任务队列、日志查看、结果复制和完成任务删除。

## 文件夹结构

- `web/`：本地网页工具。
- `web/public/`：页面文件。
- `web/server/`：本地服务。
- `scripts/`：Python 核心处理逻辑。
- `data/`：任务上传文件和任务数据。
- `output/`：工具生成的结果。
- `docs/`：历史需求和设计文档。

## 启动网页工具

首次使用前建议安装 Python 依赖：

```powershell
cd D:\my-tools\ops_tool
python -m pip install -r requirements.txt
```

然后启动网页服务：

```powershell
cd D:\my-tools\ops_tool\web
npm run dev
```

启动后访问：

```text
http://127.0.0.1:3210
```

## 脚本版入口

一般建议使用网页工具。如果需要直接运行脚本版：

```powershell
cd D:\my-tools\ops_tool
python .\scripts\sitemap_parser.py
```

## 注意事项

- 当前工具是本地单机使用。
- 默认端口是 `3210`。
- 如果提示端口被占用，说明工具可能已经启动，不需要重复运行。
- 新版核心脚本位于 `D:\my-tools\ops_tool\scripts\sitemap_parser.py`。
- `data/` 和 `output/` 是本地任务数据和生成结果，不提交到仓库。
