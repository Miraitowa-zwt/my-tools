# 本地万能格式转换工具需求文档

日期：2026-05-19

## 1. 核心结论

这个工具要做成一个**本地可直接使用的万能格式转换工具**。

它是一个统一工具，不是一堆分散的小工具。Markdown 转 HTML、HTML 转 Markdown、CSV 转表格、JSON 转 YAML、XML 转 JSON、SQL 格式化等能力，都属于这个“万能格式转换工具”内部的功能。

用户打开后应该马上能用，不需要选择 agent，不需要添加 Claude、Codex、Gemini，不需要 API key，也不应该被 AI 功能挡住。

一句话定位：

> 在本地浏览器中，用一个统一工具完成常见内容格式互转，并支持复制、预览、下载。

## 2. 必须遵守的原则

### 本地优先

第一版所有核心转换都在浏览器本地完成。

用户内容不上传服务器，不发送给 AI，不依赖后台任务。

### 不需要 agent

agent 不能是主流程的一部分。

打开工具后，用户应该直接看到：

- 输入区
- 格式选择
- 转换按钮
- 结果区

不应该先弹出“选择 agent”。

### agent 只能是可选高级功能

未来如果保留 AI/agent 能力，只能放在“高级功能”或“AI 辅助”入口里。

它可以帮助用户美化内容、生成页面、改写文案、修复复杂格式，但不能影响普通格式转换。

### 一个工具，一个文件夹

所有格式转换能力属于同一个工具：**万能格式转换工具**。

必须在 `D:\my-tools` 下给这个工具建立一个独立文件夹，所有相关内容都放在这个文件夹里。

不要把每一种转换都拆成顶层工具文件夹。

正确理解：

- 不是 `markdown-to-html` 一个工具文件夹
- 不是 `html-to-markdown` 一个工具文件夹
- 不是 `json-to-yaml` 一个工具文件夹
- 而是只有一个清晰命名的工具文件夹
- 各种转换能力都放在这个文件夹内部

推荐文件夹名：

```text
D:\my-tools\format-converter
```

这个名字短、直观、能看出功能。

可选名字：

```text
D:\my-tools\universal-format-converter
D:\my-tools\local-format-converter
D:\my-tools\format-conversion-tool
```

不建议继续使用 `html-anything` 作为新工具名，因为它更像“HTML 生成器”，不能准确表达“万能格式转换”的功能。

## 3. 产品目标

第一版目标：

- 用户打开页面 10 秒内知道怎么用
- 不需要 agent 也能完整使用
- 粘贴内容后自动识别格式
- 用户可以手动选择输入格式和输出格式
- 点击转换后马上得到结果
- 可以复制结果
- 可以下载结果
- 可以预览 HTML 类结果
- 不需要登录
- 不需要联网完成核心转换

## 4. 目标用户

1. 内容编辑  
   处理 Markdown、HTML、纯文本、富文本内容。

2. SEO 编辑  
   把文章、表格、FAQ、页面内容转成网站后台可用格式。

3. 电商运营  
   把商品描述、规格表、参数、说明文案转成 Shopify、WordPress 可粘贴内容。

4. 数据和运营人员  
   把 CSV、Excel、JSON、YAML、XML 转成可读内容或表格。

5. 开发人员  
   快速格式化、互转、查看结构化内容。

## 5. 第一版功能范围

### 输入格式

第一版建议支持：

- Markdown
- HTML
- 纯文本
- 富文本粘贴
- CSV
- TSV
- Excel
- JSON
- YAML
- XML
- SQL

### 输出格式

第一版建议支持：

- HTML
- Markdown
- 纯文本
- JSON
- YAML
- XML
- CSV
- HTML 表格
- Markdown 表格
- SQL 格式化结果
- Shopify 可粘贴 HTML
- WordPress 可粘贴 HTML
- 微信公众号可粘贴 HTML
- 知乎可粘贴 HTML

### 操作能力

必须支持：

- 粘贴内容
- 上传文件
- 自动识别格式
- 手动修改输入格式
- 手动选择输出格式
- 一键转换
- 复制结果
- 下载结果
- 预览结果
- 清空输入
- 交换输入和输出

## 6. 第一版不做的内容

第一版不做：

- 登录系统
- 云端保存
- 用户账号
- 强制 AI 转换
- 强制 agent 配置
- 复杂 PDF 排版还原
- 图片 OCR
- 批量任务队列
- 收费系统
- 多人协作

这些可以放到后续阶段。

## 7. 页面结构

第一屏应该是工具本身，不是欢迎页，不是 agent 选择页。

推荐结构：

### 顶部区域

- 工具名称
- 当前工具分类
- 可选设置入口
- 可选高级 AI 入口

### 输入区

- 粘贴文本
- 上传文件
- 自动识别格式提示
- 输入格式下拉选择

### 转换设置区

- 输出格式选择
- 转换按钮
- 交换按钮
- 清空按钮

### 结果区

- 转换结果
- HTML 预览
- 复制
- 下载
- 替换输入

## 8. my-tools 下的工具目录

`D:\my-tools` 会放很多不同工具，所以这个工具的文件夹名称应该直接表达功能。

推荐最终目录：

```text
D:\my-tools\
  format-converter\
    README.md
    package.json
    next.config.ts
    tsconfig.json

    docs\
      requirements.md
      supported-formats.md
      usage.md

    public\
      icon.svg
      manifest.json

    src\
      app\
        page.tsx
        layout.tsx
        globals.css

      tool\
        meta.ts
        index.ts

        components\
          ConverterApp.tsx
          InputPanel.tsx
          FormatSelector.tsx
          ResultPanel.tsx
          PreviewPanel.tsx
          Toolbar.tsx

        converters\
          markdown.ts
          html.ts
          text.ts
          table.ts
          excel.ts
          data.ts
          xml.ts
          sql.ts
          platform.ts

        registry\
          formats.ts
          conversions.ts
          options.ts

        utils\
          detect-format.ts
          download.ts
          clipboard.ts
          preview.ts
          errors.ts

        examples\
          markdown.md
          html.html
          csv.csv
          json.json
          yaml.yaml
          xml.xml
          sql.sql

    tests\
      markdown-html.test.ts
      table.test.ts
      data.test.ts
      xml.test.ts
      sql.test.ts
      platform.test.ts
```

这个结构表达的是：

- `D:\my-tools\format-converter\` 是一个完整独立工具
- `src\tool\` 放这个工具的核心代码
- `components\` 放这个工具自己的界面
- `converters\` 放不同格式的转换能力
- `registry\` 放格式清单和转换关系
- `utils\` 放这个工具内部共用方法
- `tests\` 放这个工具自己的测试
- `examples\` 放示例输入
- `README.md` 说明这个工具怎么用、支持什么格式、有什么限制

## 9. 命名建议

推荐使用：

```text
format-converter
```

理由：

- 简短
- 直观
- 放在 `my-tools` 里一眼能看懂用途
- 不限制未来支持的格式

也可以使用：

```text
universal-format-converter
```

理由：

- 更完整
- 更明确表达“万能”
- 适合开源项目名

不建议使用：

```text
html-anything
```

理由：

- 容易让人以为只和 HTML 有关
- 无法表达 CSV、JSON、YAML、XML、SQL、Excel 等转换能力
- 它可以作为参考项目，但不应该作为最终工具名

## 10. 不采用的结构

不要采用这种结构：

```text
D:\my-tools\
  markdown-to-html\
  html-to-markdown\
  csv-to-html-table\
  json-to-yaml\
  yaml-to-json\
  xml-to-json\
  sql-formatter\
```

原因：

- 用户需要的是一个万能转换器，不是一堆分散入口
- 页面入口会变复杂
- 公共能力会重复
- 后续维护成本高
- 不符合“一个工具，一个文件夹”的要求

正确方向是：

```text
D:\my-tools\
  format-converter\
    src\
      tool\
        components\
        converters\
        registry\
        utils\
    tests\
    docs\
```

## 11. 工具元信息

`meta.ts` 描述这个工具本身：

```ts
{
  id: "format-converter",
  name: "万能格式转换器",
  description: "在本地浏览器中转换 Markdown、HTML、CSV、JSON、YAML、XML、SQL 等常见格式。",
  localOnly: true,
  requiresAgent: false
}
```

核心要求：

- `localOnly` 必须为 `true`
- `requiresAgent` 必须为 `false`
- 工具不能默认访问网络
- 工具不能默认调用 API

## 12. 工具内部转换能力

第一版建议在 `D:\my-tools\format-converter\src\tool\converters\` 内支持这些能力：

1. Markdown 转 HTML
2. HTML 转 Markdown
3. Markdown 转纯文本
4. HTML 转纯文本
5. 纯文本转 HTML
6. CSV 转 HTML 表格
7. CSV 转 Markdown 表格
8. TSV 转 HTML 表格
9. Excel 转 HTML 表格
10. JSON 转 YAML
11. YAML 转 JSON
12. JSON 转 CSV
13. CSV 转 JSON
14. JSON 转 XML
15. XML 转 JSON
16. SQL 格式化
17. HTML 转 Shopify 可粘贴格式
18. HTML 转 WordPress 可粘贴格式
19. HTML 转微信公众号可粘贴格式
20. HTML 转知乎可粘贴格式

这些不是 20 个独立工具文件夹，而是一个工具内部的 20 个转换能力。

## 13. 注册表设计

`registry/formats.ts` 维护支持的格式：

```ts
[
  "markdown",
  "html",
  "text",
  "csv",
  "tsv",
  "excel",
  "json",
  "yaml",
  "xml",
  "sql"
]
```

`registry/conversions.ts` 维护哪些格式可以转成哪些格式：

```ts
[
  {
    from: "markdown",
    to: "html",
    converter: "markdownToHtml"
  },
  {
    from: "html",
    to: "markdown",
    converter: "htmlToMarkdown"
  }
]
```

前端只通过这个工具内部的注册表调用转换能力。

## 14. 输入输出规则

所有内部转换函数接收统一输入：

```ts
{
  content: string,
  file?: File,
  from: string,
  to: string,
  options?: Record<string, unknown>
}
```

所有内部转换函数输出统一结果：

```ts
{
  content: string,
  previewHtml?: string,
  filename?: string,
  mimeType?: string,
  warnings?: string[]
}
```

错误必须用用户能看懂的话说明。

例如：

- “这段内容不是有效 JSON，请检查是否缺少逗号或括号。”
- “当前文件无法识别，请换成 CSV、XLSX 或 TXT。”
- “表格为空，无法转换。”

不要只显示代码报错。

## 15. 本地运行方式

### 第一选择：静态本地网页

工具应尽量能构建成静态网页。

用户可以：

- 在线打开使用
- 下载到本地打开
- 部署到任意静态网站

这种方式最符合“不需要端口、不需要 agent”的目标。

### 第二选择：PWA

可以做成 PWA，让用户安装到桌面。

优点：

- 像本地软件一样打开
- 核心转换仍在浏览器本地完成
- 可离线使用

### 第三选择：桌面应用

如果后续要处理 PDF、OCR、大文件、批量转换，可以考虑桌面应用。

但第一版不建议优先做桌面应用。

### 开发阶段

开发阶段可以继续用本地端口。

但产品交付目标不应该依赖用户手动运行端口服务。

## 16. 和现有项目的关系

当前 `html-anything` 只作为参考项目，不建议继续沿用这个文件夹名做最终工具。

参考价值：

- 可以参考它已有的编辑区和预览区
- 可以参考它已有的导出能力
- 可以参考它已有的格式识别思路
- 可以迁移可复用代码

但新工具应该放在：

```text
D:\my-tools\format-converter
```

不建议直接在：

```text
D:\my-tools\html-anything
```

继续做最终版本。

原因：

- 当前主流程偏“AI 生成 HTML”
- 当前会弹出 agent 选择
- 当前顶部重点是 agent 和模板
- 本地格式转换不是第一入口
- 转换相关内容还没有集中到一个独立工具文件夹
- 名称不能准确表达“万能格式转换器”

需要调整为：

- 新建独立工具目录 `D:\my-tools\format-converter`
- 以本地格式转换为默认首页
- 不再弹出 agent 选择
- agent 入口如果保留，只能作为可选高级功能
- 把所有万能格式转换器相关内容放进这个新目录
- 主界面围绕“输入、选择格式、转换、结果”展开

## 17. 技术建议

第一版建议使用：

- Markdown 转 HTML：Marked
- HTML 转 Markdown：Turndown
- HTML 清理：DOMPurify
- CSV / TSV：PapaParse
- Excel：SheetJS
- JSON：浏览器原生 JSON
- YAML：轻量 YAML 解析库
- XML：浏览器 DOMParser
- HTML 预览：iframe
- 下载：浏览器 Blob
- 复制：Clipboard API

所有这些能力都可以本地运行。

## 18. 开源项目参考

### Pandoc

链接：https://github.com/jgm/pandoc

强大的通用文档转换工具。适合后续高级版本参考，不适合作为第一版本地浏览器核心。

### Marked

链接：https://github.com/markedjs/marked

适合 Markdown 转 HTML。

### Turndown

链接：https://github.com/mixmark-io/turndown

适合 HTML 转 Markdown。

### Unified / Remark / Rehype

链接：https://github.com/unifiedjs/unified  
链接：https://github.com/remarkjs/remark  
链接：https://github.com/rehypejs/rehype

适合长期维护复杂 Markdown 和 HTML 转换。

### SheetJS

链接：https://github.com/SheetJS/sheetjs

适合 Excel、CSV、表格类转换。

### Mammoth.js

链接：https://github.com/mwilliamson/mammoth.js

适合后续支持 Word 转 HTML。

### DocStrange

链接：https://github.com/NanoNets/docstrange

适合后续支持 PDF、图片 OCR、复杂文档识别。

### TryDevTools

链接：https://www.trydevtools.com/

适合参考“本地小工具集合”的产品形态。

## 19. 成功标准

第一版完成后，应满足：

- 打开页面不会要求添加 agent
- 不选择 agent 也能完整使用
- 粘贴 Markdown 能转 HTML
- 粘贴 HTML 能转 Markdown
- 粘贴 CSV 能转 HTML 表格
- 粘贴 JSON 能转 YAML 或 CSV
- 粘贴 XML 能转 JSON
- 粘贴 SQL 能格式化
- `D:\my-tools` 下有一个功能命名清楚的独立工具文件夹
- 推荐文件夹名为 `format-converter`
- 所有相关代码、组件、配置、测试、示例都在 `D:\my-tools\format-converter` 中
- 转换结果可以复制
- 转换结果可以下载
- HTML 类结果可以预览
- 核心转换不访问网络
- 核心转换不上传用户内容

## 20. 推荐实施路线

第一步：调整产品入口  
移除首次 agent 弹窗，把本地转换工具作为默认首页。

第二步：建立独立工具文件夹  
新建 `D:\my-tools\format-converter`，把相关内容集中放入。

第三步：建立工具内部注册表  
用 `src\tool\registry\` 管理支持格式和转换关系。

第四步：迁移已有转换能力  
把现有本地转换逻辑迁移到 `src\tool\converters\`。

第五步：补齐第一批格式  
优先补 Markdown、HTML、文本、CSV、JSON、YAML、XML、SQL。

第六步：优化导出  
补复制、下载、预览、替换输入、交换输入输出。

第七步：静态化验证  
验证是否可以构建成静态网页或 PWA，减少对端口服务的依赖。

## 21. 最终产品方向

最终产品应该是：

> 一个不需要 agent、不需要登录、不上传内容、能本地运行的万能格式转换工具。

它不是很多零散转换器的集合，而是一个统一的本地转换工作台。

它可以有 AI 能力，但 AI 不是入口，也不是必要条件。

它的核心价值是：快速、本地、统一、清晰、可靠、容易扩展。
