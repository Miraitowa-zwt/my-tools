import { decodeEntities, escapeHtml } from "../utils/preview.js";

const allowedTags = new Set([
  "a",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

const unwrapTags = new Set(["font", "o:p", "span"]);

export function cleanHtml(content) {
  return String(content || "")
    .replace(/<!doctype[\s\S]*?>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(script|style|meta|link)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|meta|link)[^>]*\/?>/gi, "")
    .replace(/<\/?\s*(html|head|body)[^>]*>/gi, "")
    .replace(/<\s*\/?\s*([a-zA-Z][\w:-]*)([^>]*)>/g, cleanTag)
    .replace(/>\s+</g, "><")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanTag(fullTag, rawName, rawAttributes = "") {
  const closing = /^<\s*\//.test(fullTag);
  const tag = normalizeTagName(rawName);

  if (unwrapTags.has(tag)) return "";
  if (!allowedTags.has(tag)) return "";
  if (closing) return tag === "br" || tag === "img" ? "" : `</${tag}>`;
  if (tag === "br") return "<br>";

  const attributes = cleanAttributes(tag, rawAttributes);
  return `<${tag}${attributes}>`;
}

function normalizeTagName(name) {
  const tag = String(name || "").toLowerCase();
  if (tag === "b") return "strong";
  if (tag === "i") return "em";
  return tag;
}

function cleanAttributes(tag, rawAttributes) {
  const attributes = [];
  const pattern = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match;
  while ((match = pattern.exec(rawAttributes))) {
    const name = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? "";
    if (!isAllowedAttribute(tag, name, value)) continue;
    attributes.push(` ${name}="${escapeHtml(value)}"`);
  }
  return attributes.join("");
}

function isAllowedAttribute(tag, name, value) {
  if (name.startsWith("on") || name === "style" || name === "class" || name === "id" || name.startsWith("data-")) return false;
  if ((tag === "a" && name === "href") || (tag === "img" && name === "src")) return isSafeUrl(value);
  if (tag === "img" && (name === "alt" || name === "title")) return true;
  if (tag === "a" && name === "title") return true;
  if ((tag === "td" || tag === "th") && (name === "colspan" || name === "rowspan")) return /^\d{1,2}$/.test(value);
  return false;
}

function isSafeUrl(value) {
  const text = String(value || "").trim().toLowerCase();
  return Boolean(text) && !text.startsWith("javascript:") && !text.startsWith("data:");
}

export function htmlToMarkdown(content) {
  return String(content || "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*h([1-6])[^>]*>([\s\S]*?)<\s*\/h\1\s*>/gi, (_, level, text) => `${"#".repeat(Number(level))} ${stripHtml(text).trim()}\n\n`)
    .replace(/<\s*strong[^>]*>([\s\S]*?)<\s*\/strong\s*>/gi, "**$1**")
    .replace(/<\s*b[^>]*>([\s\S]*?)<\s*\/b\s*>/gi, "**$1**")
    .replace(/<\s*em[^>]*>([\s\S]*?)<\s*\/em\s*>/gi, "*$1*")
    .replace(/<\s*i[^>]*>([\s\S]*?)<\s*\/i\s*>/gi, "*$1*")
    .replace(/<\s*a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\s*\/a\s*>/gi, (_, href, text) => `[${stripHtml(text).trim()}](${href})`)
    .replace(/<\s*li[^>]*>([\s\S]*?)<\s*\/li\s*>/gi, (_, text) => `- ${stripHtml(text).trim()}\n`)
    .replace(/<\s*p[^>]*>([\s\S]*?)<\s*\/p\s*>/gi, (_, text) => `${stripHtml(text).trim()}\n\n`)
    .replace(/<\s*pre[^>]*>\s*<\s*code[^>]*>([\s\S]*?)<\s*\/code\s*>\s*<\s*\/pre\s*>/gi, (_, text) => `\`\`\`\n${decodeEntities(text).trim()}\n\`\`\`\n\n`)
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function htmlToText(content) {
  return stripHtml(content);
}

export function stripHtml(content) {
  return decodeEntities(
    String(content || "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function htmlDocumentForText(content) {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let list = [];
  let table = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${paragraph.map(escapeHtml).join("<br>")}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!list.length) return;
    html.push(`<ul>${list.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`);
    list = [];
  };

  const flushTable = () => {
    if (!table.length) return;
    html.push(tabbedRowsToHtml(table));
    table = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      flushParagraph();
      flushList();
      flushTable();
      continue;
    }

    const bullet = line.match(/^\s*(?:[-*+]|\u2022|\u25e6|\u25aa)\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      flushTable();
      list.push(bullet[1].trim());
      continue;
    }

    if (isTabbedTableLine(line)) {
      flushParagraph();
      flushList();
      table.push(line);
      continue;
    }

    flushList();
    flushTable();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  flushTable();
  return html.join("\n");
}

function isTabbedTableLine(line) {
  return line.includes("\t") && line.split("\t").filter((cell) => cell.trim()).length >= 2;
}

function tabbedRowsToHtml(lines) {
  const rows = lines.map((line) => line.split("\t").map((cell) => cell.trim()));
  const headers = rows[0] || [];
  const bodyRows = rows.slice(1);
  const head = headers.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("");
  const body = bodyRows
    .map((row) => `<tr>${headers.map((_, index) => `<td>${escapeHtml(row[index] ?? "")}</td>`).join("")}</tr>`)
    .join("");
  return `<table>\n<thead><tr>${head}</tr></thead>\n<tbody>${body}</tbody>\n</table>`;
}
