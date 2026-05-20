import { escapeHtml } from "../utils/preview.js";

export function markdownToHtml(content) {
  const lines = String(content || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let list = [];
  let code = [];
  let inCode = false;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const flushList = () => {
    if (!list.length) return;
    html.push(`<ul>${list.map((item) => `<li>${inlineMarkdown(item)}</li>`).join("")}</ul>`);
    list = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^```/.test(line.trim())) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code = [];
        inCode = false;
      } else {
        flushParagraph();
        flushList();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      code.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
      continue;
    }

    if (isMarkdownTableStart(lines, index)) {
      flushParagraph();
      flushList();
      const tableRows = collectMarkdownTable(lines, index);
      html.push(markdownTableToHtml(tableRows.rows));
      index += tableRows.count - 1;
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  return html.join("\n");
}

function isMarkdownTableStart(lines, index) {
  return isPipeRow(lines[index]) && isDividerRow(lines[index + 1] || "");
}

function collectMarkdownTable(lines, start) {
  const rows = [];
  let index = start;
  while (index < lines.length && isPipeRow(lines[index])) {
    if (!isDividerRow(lines[index])) rows.push(parsePipeRow(lines[index]));
    index += 1;
  }
  return { rows, count: index - start };
}

function markdownTableToHtml(rows) {
  const headers = rows[0] || [];
  const bodyRows = rows.slice(1);
  const head = headers.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join("");
  const body = bodyRows
    .map((row) => `<tr>${headers.map((_, index) => `<td>${inlineMarkdown(row[index] ?? "")}</td>`).join("")}</tr>`)
    .join("");
  return `<table>\n<thead><tr>${head}</tr></thead>\n<tbody>${body}</tbody>\n</table>`;
}

function isPipeRow(line) {
  return /^\s*\|.+\|\s*$/.test(line || "");
}

function isDividerRow(line) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line || "");
}

function parsePipeRow(line) {
  return String(line || "")
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function markdownToText(content) {
  return String(content || "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}
