export const conversions = [
  { from: "markdown", to: "html", label: "纯净 HTML" },
  { from: "markdown", to: "text", label: "纯文本（无格式）" },
  { from: "markdown", to: "shopify-html", label: "Shopify HTML" },
  { from: "markdown", to: "wordpress-html", label: "WordPress HTML" },
  { from: "markdown", to: "wechat-html", label: "微信公众号 HTML" },
  { from: "markdown", to: "zhihu-html", label: "知乎 HTML" },

  { from: "html", to: "html", label: "纯净 HTML" },
  { from: "html", to: "markdown", label: "Markdown" },
  { from: "html", to: "text", label: "纯文本（无格式）" },
  { from: "html", to: "shopify-html", label: "Shopify HTML" },
  { from: "html", to: "wordpress-html", label: "WordPress HTML" },
  { from: "html", to: "wechat-html", label: "微信公众号 HTML" },
  { from: "html", to: "zhihu-html", label: "知乎 HTML" },

  { from: "text", to: "html", label: "纯净 HTML" },
  { from: "text", to: "markdown", label: "Markdown" },

  { from: "csv", to: "html-table", label: "HTML 表格" },
  { from: "csv", to: "markdown-table", label: "Markdown 表格" },
  { from: "csv", to: "json", label: "JSON" },
  { from: "tsv", to: "html-table", label: "HTML 表格" },
  { from: "tsv", to: "markdown-table", label: "Markdown 表格" },
  { from: "tsv", to: "json", label: "JSON" },
  { from: "tsv", to: "csv", label: "CSV" },

  { from: "json", to: "yaml", label: "YAML" },
  { from: "json", to: "csv", label: "CSV" },
  { from: "json", to: "xml", label: "XML" },
  { from: "json", to: "html", label: "HTML 展示" },

  { from: "yaml", to: "json", label: "JSON" },
  { from: "yaml", to: "html", label: "HTML 展示" },
  { from: "xml", to: "json", label: "JSON" },
  { from: "xml", to: "html", label: "HTML 展示" },
  { from: "sql", to: "formatted-sql", label: "格式化 SQL" },
  { from: "sql", to: "html", label: "HTML 展示" },
];
