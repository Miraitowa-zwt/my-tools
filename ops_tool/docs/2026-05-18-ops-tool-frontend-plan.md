# Ops Tool 前端版实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于现有 `ops_tool/scripts/sitemap_parser.py`，做出一个本地可运行、支持顺序队列、可直接复制 prompt 的轻量网页工具。

**Architecture:** 采用“本地网页界面 + 本地 Node 服务 + Python 处理脚本”的结构。Node 负责接收页面请求、维护任务队列、转发日志和结果，Python 继续负责 sitemap、Word、关键词和 prompt 的核心处理逻辑。

**Tech Stack:** Python 3.13、Node.js、Express、原生 HTML/CSS/JavaScript、`pytest`

---

## 文件结构

### 计划新增文件

- `D:\my-tools\ops_tool\scripts\pipeline.py`
  将现有脚本中的可复用处理逻辑封装成可调用入口，供命令行和前端共用。

- `D:\my-tools\ops_tool\scripts\cli.py`
  提供非交互式命令行入口，接收结构化参数并输出结构化结果。

- `D:\my-tools\ops_tool\scripts\test_pipeline.py`
  覆盖前端集成所需的核心回归测试。

- `D:\my-tools\ops_tool\web\package.json`
  本地网页服务依赖与脚本命令。

- `D:\my-tools\ops_tool\web\server\index.js`
  Node 服务启动入口。

- `D:\my-tools\ops_tool\web\server\taskQueue.js`
  顺序任务队列和任务状态管理。

- `D:\my-tools\ops_tool\web\server\pythonRunner.js`
  负责调用 Python、收集日志、解析结果。

- `D:\my-tools\ops_tool\web\server\routes.js`
  提供任务创建、任务查询、任务详情接口。

- `D:\my-tools\ops_tool\web\public\index.html`
  单页面结构。

- `D:\my-tools\ops_tool\web\public\styles.css`
  轻量样式文件。

- `D:\my-tools\ops_tool\web\public\app.js`
  页面逻辑：新建任务、轮询队列、显示详情、复制 prompt。

- `D:\my-tools\ops_tool\web\README.md`
  本地启动说明。

### 计划修改文件

- `D:\my-tools\ops_tool\scripts\sitemap_parser.py`
  保留现有脚本入口，同时把核心处理逻辑拆给 `pipeline.py` 复用。

## Task 1: 拆出可复用 Python 处理入口

**Files:**
- Create: `D:\my-tools\ops_tool\scripts\pipeline.py`
- Modify: `D:\my-tools\ops_tool\scripts\sitemap_parser.py`
- Test: `D:\my-tools\ops_tool\scripts\test_pipeline.py`

- [ ] **Step 1: 先写失败测试，定义结构化任务输入和返回格式**

```python
from pathlib import Path

from pipeline import run_task


def test_run_task_returns_prompt_and_summary(tmp_path: Path):
    docx_path = tmp_path / "article.docx"
    docx_path.write_bytes(b"fake")

    result = run_task(
        domain="https://example.com",
        cms_mode="shopify",
        docx_files=[str(docx_path)],
        keyword_file=None,
        output_dir=str(tmp_path / "output"),
        sitemap_loader=lambda domain, cms_mode: (
            domain,
            ["https://example.com/products/a"],
            ["https://example.com/blogs/news/a"],
        ),
        docx_converter=lambda path, domain, index: "<p>demo html</p>",
    )

    assert result["status"] == "success"
    assert result["prompt"]
    assert result["summary"]["total_articles"] == 1
    assert Path(result["output_dir"]).exists()
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `pytest D:\my-tools\ops_tool\scripts\test_pipeline.py::test_run_task_returns_prompt_and_summary -v`

Expected: FAIL，提示 `ModuleNotFoundError` 或 `cannot import name 'run_task'`

- [ ] **Step 3: 创建最小可用的 `pipeline.py`，定义统一入口**

```python
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

from sitemap_parser import (
    build_batch_prompt,
    convert_docx_to_html,
    parse_sitemap,
    process_keywords_for_articles,
    save_results,
)


def run_task(
    domain: str,
    cms_mode: str,
    docx_files: list[str],
    keyword_file: Optional[str],
    output_dir: str,
    sitemap_loader: Optional[Callable] = None,
    docx_converter: Optional[Callable] = None,
):
    sitemap_loader = sitemap_loader or parse_sitemap
    docx_converter = docx_converter or convert_docx_to_html

    resolved_domain, data_b, data_c = sitemap_loader(domain, cms_mode)

    raw_articles = []
    for index, docx_path in enumerate(docx_files, 1):
        html = docx_converter(docx_path, resolved_domain, index)
        if html.strip():
            raw_articles.append((Path(docx_path).name, html))

    processed_articles = process_keywords_for_articles(raw_articles, keyword_file)
    full_prompt = build_batch_prompt(processed_articles, data_b, data_c)

    total_links = sum(len(links) for _, _, links in processed_articles)
    results = {
        "prompt": full_prompt,
        "articles": [
            {"name": name, "links": links} for name, _, links in processed_articles
        ],
        "statistics": {
            "timestamp": datetime.now().isoformat(),
            "domain": resolved_domain,
            "total_articles": len(processed_articles),
            "total_links": total_links,
        },
    }

    session_dir = save_results(results, output_dir=output_dir)
    return {
        "status": "success",
        "prompt": full_prompt,
        "summary": {
            "domain": resolved_domain,
            "total_articles": len(processed_articles),
            "total_links": total_links,
            "product_collection_count": len(data_b),
            "blog_count": len(data_c),
        },
        "output_dir": str(session_dir),
    }
```

- [ ] **Step 4: 修改 `sitemap_parser.py`，让交互入口继续存在，但复用新逻辑**

```python
from pipeline import run_task


def main():
    # 省略原有交互输入逻辑
    result = run_task(
        domain=domain_input,
        cms_mode=cms_mode,
        docx_files=docx_files,
        keyword_file=keyword_file or None,
        output_dir="output",
    )
    session_dir = result["output_dir"]
    full_prompt = result["prompt"]
```

- [ ] **Step 5: 重新运行测试，确认通过**

Run: `pytest D:\my-tools\ops_tool\scripts\test_pipeline.py::test_run_task_returns_prompt_and_summary -v`

Expected: PASS

- [ ] **Step 6: 补一个“没有成功转换任何文档”失败测试**

```python
import pytest

from pipeline import run_task


def test_run_task_fails_when_no_docx_converted(tmp_path):
    docx_path = tmp_path / "empty.docx"
    docx_path.write_bytes(b"fake")

    with pytest.raises(ValueError, match="没有成功转换任何文档"):
        run_task(
            domain="https://example.com",
            cms_mode="shopify",
            docx_files=[str(docx_path)],
            keyword_file=None,
            output_dir=str(tmp_path / "output"),
            sitemap_loader=lambda domain, cms_mode: (domain, [], []),
            docx_converter=lambda path, domain, index: "",
        )
```

- [ ] **Step 7: 实现失败分支**

```python
if not raw_articles:
    raise ValueError("没有成功转换任何文档")
```

- [ ] **Step 8: 运行完整 Python 测试**

Run: `pytest D:\my-tools\ops_tool\scripts\test_pipeline.py -v`

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add D:\my-tools\ops_tool\scripts\sitemap_parser.py D:\my-tools\ops_tool\scripts\pipeline.py D:\my-tools\ops_tool\scripts\test_pipeline.py
git commit -m "feat: extract reusable ops tool pipeline"
```

## Task 2: 增加非交互式命令行入口，供前端服务调用

**Files:**
- Create: `D:\my-tools\ops_tool\scripts\cli.py`
- Test: `D:\my-tools\ops_tool\scripts\test_pipeline.py`

- [ ] **Step 1: 写失败测试，要求 CLI 接收 JSON 参数并输出 JSON 结果**

```python
import json
import subprocess
import sys


def test_cli_prints_json_result(tmp_path):
    payload = {
        "domain": "https://example.com",
        "cms_mode": "shopify",
        "docx_files": [],
        "keyword_file": None,
        "output_dir": str(tmp_path / "output"),
    }

    completed = subprocess.run(
        [sys.executable, "D:/my-tools/ops_tool/scripts/cli.py", json.dumps(payload)],
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 0
    data = json.loads(completed.stdout)
    assert "status" in data
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `pytest D:\my-tools\ops_tool\scripts\test_pipeline.py::test_cli_prints_json_result -v`

Expected: FAIL，提示 `cli.py` 不存在

- [ ] **Step 3: 创建 `cli.py`，定义标准输出格式**

```python
import json
import sys
import traceback

from pipeline import run_task


def main():
    payload = json.loads(sys.argv[1])
    try:
        result = run_task(
            domain=payload["domain"],
            cms_mode=payload["cms_mode"],
            docx_files=payload["docx_files"],
            keyword_file=payload.get("keyword_file"),
            output_dir=payload["output_dir"],
        )
        print(json.dumps(result, ensure_ascii=False))
    except Exception as exc:
        error = {
            "status": "failed",
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }
        print(json.dumps(error, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 运行 CLI 测试，确认输出结构稳定**

Run: `pytest D:\my-tools\ops_tool\scripts\test_pipeline.py::test_cli_prints_json_result -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add D:\my-tools\ops_tool\scripts\cli.py D:\my-tools\ops_tool\scripts\test_pipeline.py
git commit -m "feat: add non-interactive cli for ops tool"
```

## Task 3: 搭建本地 Node 服务和顺序任务队列

**Files:**
- Create: `D:\my-tools\ops_tool\web\package.json`
- Create: `D:\my-tools\ops_tool\web\server\index.js`
- Create: `D:\my-tools\ops_tool\web\server\taskQueue.js`
- Create: `D:\my-tools\ops_tool\web\server\pythonRunner.js`
- Create: `D:\my-tools\ops_tool\web\server\routes.js`

- [ ] **Step 1: 写失败测试，先锁定顺序队列行为**

```javascript
import test from "node:test";
import assert from "node:assert/strict";
import { TaskQueue } from "../web/server/taskQueue.js";

test("TaskQueue runs jobs sequentially", async () => {
  const events = [];
  const queue = new TaskQueue();

  queue.enqueue("a", async () => {
    events.push("start-a");
    await new Promise((resolve) => setTimeout(resolve, 20));
    events.push("end-a");
  });

  queue.enqueue("b", async () => {
    events.push("start-b");
    events.push("end-b");
  });

  await queue.onIdle();
  assert.deepEqual(events, ["start-a", "end-a", "start-b", "end-b"]);
});
```

- [ ] **Step 2: 运行测试，确认当前失败**

Run: `node --test D:\my-tools\ops_tool\web\server\taskQueue.test.js`

Expected: FAIL，提示 `taskQueue.js` 不存在

- [ ] **Step 3: 创建 `package.json`**

```json
{
  "name": "ops-tool-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node ./server/index.js",
    "test": "node --test ./server/*.test.js"
  },
  "dependencies": {
    "express": "^4.21.2",
    "multer": "^1.4.5-lts.1"
  }
}
```

- [ ] **Step 4: 创建最小版顺序队列**

```javascript
export class TaskQueue {
  constructor() {
    this.items = [];
    this.running = false;
    this.idleResolvers = [];
  }

  enqueue(taskId, job) {
    this.items.push({ taskId, job });
    void this.runNext();
  }

  async runNext() {
    if (this.running) return;
    const next = this.items.shift();
    if (!next) {
      this.idleResolvers.splice(0).forEach((resolve) => resolve());
      return;
    }
    this.running = true;
    try {
      await next.job();
    } finally {
      this.running = false;
      await this.runNext();
    }
  }

  onIdle() {
    if (!this.running && this.items.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleResolvers.push(resolve));
  }
}
```

- [ ] **Step 5: 创建 Python 调用器**

```javascript
import { spawn } from "node:child_process";

export function runPythonTask(payload, onLog) {
  return new Promise((resolve, reject) => {
    const child = spawn("python", [
      "D:/my-tools/ops_tool/scripts/cli.py",
      JSON.stringify(payload),
    ]);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      onLog(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      onLog(text);
    });

    child.on("close", (code) => {
      const raw = stdout.trim() || stderr.trim();
      try {
        const data = JSON.parse(raw.split(/\r?\n/).filter(Boolean).at(-1));
        if (code === 0) resolve(data);
        else reject(data);
      } catch (error) {
        reject({ status: "failed", error: raw || "Python 输出无法解析" });
      }
    });
  });
}
```

- [ ] **Step 6: 创建任务路由和内存态任务存储**

```javascript
import express from "express";
import { randomUUID } from "node:crypto";

export function createRoutes(taskStore, taskQueue, runPythonTask) {
  const router = express.Router();

  router.get("/api/tasks", (_req, res) => {
    res.json(taskStore.list());
  });

  router.get("/api/tasks/:taskId", (req, res) => {
    const task = taskStore.get(req.params.taskId);
    if (!task) return res.status(404).json({ error: "任务不存在" });
    res.json(task);
  });

  router.post("/api/tasks", (req, res) => {
    const taskId = randomUUID();
    const task = taskStore.create(taskId, req.body);
    taskQueue.enqueue(taskId, () => runPythonTask(task, (line) => taskStore.appendLog(taskId, line)));
    res.status(201).json(task);
  });

  return router;
}
```

- [ ] **Step 7: 运行 Node 测试**

Run: `cd D:\my-tools\ops_tool\web && npm test`

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add D:\my-tools\ops_tool\web\package.json D:\my-tools\ops_tool\web\server
git commit -m "feat: add local web queue service"
```

## Task 4: 实现单页面前端

**Files:**
- Create: `D:\my-tools\ops_tool\web\public\index.html`
- Create: `D:\my-tools\ops_tool\web\public\styles.css`
- Create: `D:\my-tools\ops_tool\web\public\app.js`
- Modify: `D:\my-tools\ops_tool\web\server\index.js`

- [ ] **Step 1: 先写最小交互测试说明，锁定页面要素**

```text
页面必须存在以下元素：
1. 域名输入框
2. CMS 模式下拉框
3. Word 文件选择器
4. 关键词配置文件选择器
5. 开始任务按钮
6. 任务列表区域
7. 任务详情区域
8. prompt 展示区域
9. 复制按钮
```

- [ ] **Step 2: 创建 `index.html` 基础结构**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ops Tool</title>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main class="layout">
      <section class="panel" id="task-form-panel"></section>
      <section class="panel" id="task-list-panel"></section>
      <section class="panel" id="task-detail-panel"></section>
    </main>
    <script type="module" src="/app.js"></script>
  </body>
</html>
```

- [ ] **Step 3: 创建表单、列表、详情渲染逻辑**

```javascript
const state = {
  tasks: [],
  selectedTaskId: null,
};

function renderForm() {
  return `
    <h1>Ops Tool</h1>
    <form id="task-form">
      <label>网站域名 <input name="domain" required /></label>
      <label>CMS 模式
        <select name="cms_mode">
          <option value="shopify">shopify</option>
          <option value="wordpress">wordpress</option>
          <option value="odoo">odoo</option>
          <option value="custom">custom</option>
        </select>
      </label>
      <label>Word 文件 <input name="docx_files" type="file" multiple accept=".docx" required /></label>
      <label>关键词配置 <input name="keyword_file" type="file" accept=".json,.csv" /></label>
      <button type="submit">开始任务</button>
    </form>
  `;
}
```

- [ ] **Step 4: 实现 prompt 复制功能**

```javascript
async function copyPrompt(promptText) {
  if (!promptText) return;
  await navigator.clipboard.writeText(promptText);
}

function renderTaskDetail(task) {
  return `
    <h2>任务详情</h2>
    <pre class="summary">${JSON.stringify(task.summary || {}, null, 2)}</pre>
    <pre class="logs">${(task.logs || []).join("")}</pre>
    <textarea readonly class="prompt-box">${task.prompt || ""}</textarea>
    <button id="copy-prompt-button">复制 prompt</button>
  `;
}
```

- [ ] **Step 5: 让服务静态托管前端文件**

```javascript
import express from "express";
import path from "node:path";

const app = express();
app.use(express.json());
app.use(express.static(path.resolve("D:/my-tools/ops_tool/web/public")));
```

- [ ] **Step 6: 人工运行本地页面**

Run: `cd D:\my-tools\ops_tool\web && npm install && npm run dev`

Expected: 终端输出本地访问地址，例如 `http://localhost:3000`

- [ ] **Step 7: 手动检查页面**

```text
检查项：
1. 页面能打开
2. 表单能显示
3. 任务列表能显示状态
4. 详情区能显示日志和 prompt
5. 复制按钮可点击
```

- [ ] **Step 8: Commit**

```bash
git add D:\my-tools\ops_tool\web\public D:\my-tools\ops_tool\web\server\index.js
git commit -m "feat: add ops tool single-page web ui"
```

## Task 5: 打通文件上传、任务执行和结果展示

**Files:**
- Modify: `D:\my-tools\ops_tool\web\server\routes.js`
- Modify: `D:\my-tools\ops_tool\web\server\taskQueue.js`
- Modify: `D:\my-tools\ops_tool\web\public\app.js`
- Modify: `D:\my-tools\ops_tool\web\public\styles.css`

- [ ] **Step 1: 增加失败测试，要求运行中还能继续加任务**

```javascript
import test from "node:test";
import assert from "node:assert/strict";

test("queue accepts new waiting task while one is running", async () => {
  const seen = [];
  const queue = new TaskQueue();

  queue.enqueue("first", async () => {
    seen.push("first-running");
    queue.enqueue("second", async () => {
      seen.push("second-running");
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  await queue.onIdle();
  assert.deepEqual(seen, ["first-running", "second-running"]);
});
```

- [ ] **Step 2: 接入 `multer` 保存上传文件到任务临时目录**

```javascript
import multer from "multer";
import fs from "node:fs";
import path from "node:path";

const uploadRoot = "D:/my-tools/ops_tool/data/uploads";
fs.mkdirSync(uploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

export const upload = multer({ storage });
```

- [ ] **Step 3: 在创建任务接口中保存结构化任务**

```javascript
router.post(
  "/api/tasks",
  upload.fields([
    { name: "docx_files", maxCount: 20 },
    { name: "keyword_file", maxCount: 1 },
  ]),
  (req, res) => {
    const docxFiles = (req.files.docx_files || []).map((file) => file.path);
    const keywordFile = req.files.keyword_file?.[0]?.path || null;
    const task = taskStore.create(taskId, {
      domain: req.body.domain,
      cms_mode: req.body.cms_mode,
      docx_files: docxFiles,
      keyword_file: keywordFile,
    });
  }
);
```

- [ ] **Step 4: 前端改为 `FormData` 提交**

```javascript
document.addEventListener("submit", async (event) => {
  if (event.target.id !== "task-form") return;
  event.preventDefault();
  const formData = new FormData(event.target);
  await fetch("/api/tasks", {
    method: "POST",
    body: formData,
  });
  await refreshTasks();
});
```

- [ ] **Step 5: 增加自动轮询，让日志和状态实时刷新**

```javascript
async function refreshTasks() {
  const response = await fetch("/api/tasks");
  state.tasks = await response.json();
  render();
}

setInterval(() => {
  void refreshTasks();
}, 1500);
```

- [ ] **Step 6: 手工验证完整流程**

Run: `cd D:\my-tools\ops_tool\web && npm run dev`

Expected:

```text
1. 能选择本地 Word 文件
2. 能提交任务
3. 第一个任务运行时，第二个任务可进入等待中
4. 第一个任务完成后，第二个任务自动开始
5. 每个任务都有自己的 prompt 和复制按钮
6. 每个任务都有完整日志
```

- [ ] **Step 7: Commit**

```bash
git add D:\my-tools\ops_tool\web\server\routes.js D:\my-tools\ops_tool\web\server\taskQueue.js D:\my-tools\ops_tool\web\public\app.js D:\my-tools\ops_tool\web\public\styles.css
git commit -m "feat: wire uploads queue and task details"
```

## Task 6: 收尾、文档和最终验证

**Files:**
- Create: `D:\my-tools\ops_tool\web\README.md`
- Modify: `D:\my-tools\ops_tool\README.md`

- [ ] **Step 1: 写本地启动说明**

```md
# Ops Tool Web

## 启动

```powershell
cd D:\my-tools\ops_tool\web
npm install
npm run dev
```

## 使用

1. 打开浏览器访问本地地址
2. 填写域名和 CMS
3. 选择 Word 文件
4. 可选选择关键词配置文件
5. 点击开始任务
6. 在详情区复制 prompt
```

- [ ] **Step 2: 更新总 README，补充脚本版和前端版入口**

```md
## 当前结构

- `scripts/`：脚本版
- `web/`：本地网页版

## 脚本版

```powershell
python .\scripts\sitemap_parser.py
```

## 前端版

```powershell
cd .\web
npm install
npm run dev
```
```

- [ ] **Step 3: 运行 Python 测试**

Run: `pytest D:\my-tools\ops_tool\scripts\test_pipeline.py -v`

Expected: PASS

- [ ] **Step 4: 运行 Node 测试**

Run: `cd D:\my-tools\ops_tool\web && npm test`

Expected: PASS

- [ ] **Step 5: 最终人工回归**

```text
检查项：
1. 单页面正常打开
2. 本地 Word 文件可选
3. 本地关键词配置文件可选
4. 队列严格顺序执行
5. 运行中能新增任务
6. 失败任务不阻塞后续任务
7. 每个任务详情包含摘要、完整日志、prompt、复制按钮
8. 原脚本版仍可运行
```

- [ ] **Step 6: Commit**

```bash
git add D:\my-tools\ops_tool\README.md D:\my-tools\ops_tool\web\README.md
git commit -m "docs: add ops tool runbook and verification notes"
```

## 自查

### 需求覆盖检查

- 本地网页界面：Task 3、Task 4、Task 5
- 单页面：Task 4
- 本地选择 Word 与关键词文件：Task 5
- 顺序队列：Task 3、Task 5
- 运行中继续新增任务：Task 5
- 每个任务独立日志：Task 3、Task 5
- 每个任务独立 prompt 和复制按钮：Task 4、Task 5
- 失败不阻塞后续任务：Task 3、Task 5
- 保留现有脚本版：Task 1、Task 6

### 占位与歧义检查

- 没有使用 `TBD`、`TODO`、`后续补充` 这类占位。
- 任务执行顺序已明确：先 Python 入口，再 Node 队列，再前端页面，再联调。
- 首版明确不做并行任务和数据库。

### 一致性检查

- 队列模型始终为“单运行 + 多等待”。
- prompt 始终按“每个任务独立复制”处理。
- 前端形态始终为“单页面本地网页工具”。
