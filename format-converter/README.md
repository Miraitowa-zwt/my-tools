# Format Converter

本地富文本与多格式转换工具。重点场景是把企微文档、网页、Word 等来源的富文本转换成适合 Shopify 后台粘贴的纯净 HTML。

## 使用方式

直接打开 `index.html`。

推荐流程：

1. 从企微文档、网页、Word 等来源复制内容。
2. 粘贴到页面里的“富文本粘贴区”。
3. 输出格式选择“纯净 HTML”。
4. 点击“转换”，复制结果。

## 支持格式

- 富文本 / HTML -> 纯净 HTML、Markdown、纯文本
- Markdown -> 纯净 HTML、纯文本、平台 HTML
- CSV / TSV -> HTML 表格、Markdown 表格、JSON
- JSON / YAML / XML 互转
- SQL 格式化
- Shopify / WordPress / 微信公众号 / 知乎 HTML 粘贴格式

## 目录

```text
format-converter/
├── index.html
├── public/
├── src/
│   ├── app-standalone.js
│   ├── app.js
│   ├── styles/
│   └── tool/
├── tests/
└── docs/
```

## 检查

```bash
npm test
```
