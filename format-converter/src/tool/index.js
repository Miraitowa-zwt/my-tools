import { toolMeta } from "./meta.js";
import { conversions } from "./registry/conversions.js";
import { formats } from "./registry/formats.js";
import { detectFormat } from "./utils/detect-format.js";
import { textPreview, wrapPreview, escapeHtml } from "./utils/preview.js";
import { userError } from "./utils/errors.js";
import { markdownToHtml, markdownToText } from "./converters/markdown.js";
import { cleanHtml, htmlToMarkdown, htmlToText } from "./converters/html.js";
import { textToHtml, textToMarkdown } from "./converters/text.js";
import { parseDelimited, tableToHtml, tableToMarkdown, tableToJson, arrayToCsv } from "./converters/table.js";
import { parseJson, parseYaml, jsonToYaml, jsonToCsv } from "./converters/data.js";
import { jsonToXml, xmlToJsonObject } from "./converters/xml.js";
import { formatSql } from "./converters/sql.js";
import { platformHtml } from "./converters/platform.js";

export { toolMeta, formats, conversions, detectFormat };

export function getAvailableTargets(from) {
  return conversions
    .filter((item) => item.from === from)
    .map((item) => ({ value: item.to, label: item.label }));
}

export function convert({ content, from = "auto", to }) {
  const source = from === "auto" ? detectFormat(content) : from;
  const target = to || getAvailableTargets(source)[0]?.value;
  if (!target) throw userError("当前输入格式暂时没有可用的输出格式。");

  const result = convertContent(content, source, target);
  return {
    from: source,
    to: target,
    content: result.content,
    previewHtml: result.previewHtml || buildPreview(result.content, target),
    filename: `converted.${extensionFor(target)}`,
    mimeType: mimeTypeFor(target),
    warnings: result.warnings || [],
  };
}

function convertContent(content, from, to) {
  try {
    if (to === "text") return { content: toText(content, from) };
    if (to === "html") return { content: toHtml(content, from), previewHtml: wrapPreview(toHtml(content, from)) };
    if (to === "markdown") return { content: from === "html" ? htmlToMarkdown(content) : textToMarkdown(content) };

    if (to === "shopify-html") return { content: platformHtml(toHtml(content, from), "shopify"), previewHtml: wrapPreview(platformHtml(toHtml(content, from), "shopify")) };
    if (to === "wordpress-html") return { content: platformHtml(toHtml(content, from), "wordpress"), previewHtml: wrapPreview(platformHtml(toHtml(content, from), "wordpress")) };
    if (to === "wechat-html") return { content: platformHtml(toHtml(content, from), "wechat"), previewHtml: wrapPreview(platformHtml(toHtml(content, from), "wechat")) };
    if (to === "zhihu-html") return { content: platformHtml(toHtml(content, from), "zhihu"), previewHtml: wrapPreview(platformHtml(toHtml(content, from), "zhihu")) };

    if (to === "html-table") {
      const html = tableToHtml(parseTableByFormat(content, from));
      return { content: html, previewHtml: wrapPreview(html) };
    }
    if (to === "markdown-table") return { content: tableToMarkdown(parseTableByFormat(content, from)) };
    if (to === "json") return { content: toJson(content, from) };
    if (to === "yaml") return { content: jsonToYaml(parseJson(content)) };
    if (to === "csv") return { content: toCsv(content, from) };
    if (to === "xml") return { content: jsonToXml(parseJson(content)) };
    if (to === "formatted-sql") return { content: formatSql(content) };

    throw userError("暂不支持这个转换方向。");
  } catch (error) {
    if (error.userMessage) throw error;
    throw userError(readableError(error, from, to));
  }
}

function toHtml(content, from) {
  if (from === "html") return cleanHtml(content);
  if (from === "markdown") return markdownToHtml(content);
  if (from === "text") return textToHtml(content);
  if (from === "csv" || from === "tsv") return tableToHtml(parseTableByFormat(content, from));
  if (from === "json") return `<pre><code>${escapeHtml(JSON.stringify(parseJson(content), null, 2))}</code></pre>`;
  if (from === "yaml") return `<pre><code>${escapeHtml(JSON.stringify(parseYaml(content), null, 2))}</code></pre>`;
  if (from === "xml") return `<pre><code>${escapeHtml(JSON.stringify(xmlToJsonObject(content), null, 2))}</code></pre>`;
  if (from === "sql") return `<pre><code>${escapeHtml(formatSql(content))}</code></pre>`;
  return textToHtml(content);
}

function toText(content, from) {
  if (from === "html") return htmlToText(content);
  if (from === "markdown") return markdownToText(content);
  if (from === "json") return JSON.stringify(parseJson(content), null, 2);
  if (from === "yaml") return JSON.stringify(parseYaml(content), null, 2);
  if (from === "xml") return JSON.stringify(xmlToJsonObject(content), null, 2);
  if (from === "sql") return formatSql(content);
  return String(content || "");
}

function parseTableByFormat(content, from) {
  return parseDelimited(content, from === "tsv" ? "\t" : ",");
}

function toJson(content, from) {
  if (from === "json") return JSON.stringify(parseJson(content), null, 2);
  if (from === "yaml") return JSON.stringify(parseYaml(content), null, 2);
  if (from === "xml") return JSON.stringify(xmlToJsonObject(content), null, 2);
  if (from === "csv" || from === "tsv") return JSON.stringify(tableToJson(parseTableByFormat(content, from)), null, 2);
  return JSON.stringify({ text: String(content || "") }, null, 2);
}

function toCsv(content, from) {
  if (from === "json") return jsonToCsv(parseJson(content));
  if (from === "csv") return content;
  if (from === "tsv") return arrayToCsv(tableToJson(parseTableByFormat(content, from)));
  return arrayToCsv([JSON.parse(toJson(content, from))]);
}

function buildPreview(content, target) {
  if (target.includes("html")) return wrapPreview(content);
  return textPreview(content, target);
}

function extensionFor(target) {
  if (target.includes("html")) return "html";
  if (target.includes("markdown")) return "md";
  if (target === "json") return "json";
  if (target === "yaml") return "yaml";
  if (target === "xml") return "xml";
  if (target === "csv") return "csv";
  if (target.includes("sql")) return "sql";
  return "txt";
}

function mimeTypeFor(target) {
  if (target.includes("html")) return "text/html;charset=utf-8";
  if (target === "json") return "application/json;charset=utf-8";
  if (target === "csv") return "text/csv;charset=utf-8";
  return "text/plain;charset=utf-8";
}

function readableError(error, from, to) {
  if (from === "json" || to === "json" || to === "yaml" || to === "xml") {
    return "这段内容不是有效的数据格式，请检查括号、逗号或引号是否完整。";
  }
  return error?.message || "转换失败，请检查输入内容。";
}
