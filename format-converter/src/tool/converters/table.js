import { escapeHtml } from "../utils/preview.js";

export function parseDelimited(content, delimiter) {
  const rows = String(content || "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => splitLine(line, delimiter));
  const headers = rows[0] || [];
  return { headers, rows: rows.slice(1) };
}

export function tableToHtml(table) {
  const head = table.headers.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("");
  const body = table.rows
    .map((row) => `<tr>${table.headers.map((_, index) => `<td>${escapeHtml(row[index] ?? "")}</td>`).join("")}</tr>`)
    .join("");
  return `<table>\n<thead><tr>${head}</tr></thead>\n<tbody>${body}</tbody>\n</table>`;
}

export function tableToMarkdown(table) {
  if (!table.headers.length) return "";
  const header = `| ${table.headers.map(escapeMarkdownCell).join(" | ")} |`;
  const divider = `| ${table.headers.map(() => "---").join(" | ")} |`;
  const rows = table.rows.map((row) => `| ${table.headers.map((_, index) => escapeMarkdownCell(row[index] ?? "")).join(" | ")} |`);
  return [header, divider, ...rows].join("\n");
}

export function tableToJson(table) {
  return table.rows.map((row) =>
    Object.fromEntries(table.headers.map((header, index) => [header, parseScalar(row[index] ?? "")])),
  );
}

export function arrayToCsv(data) {
  const rows = Array.isArray(data) ? data : [data];
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row || {}))));
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvCell(row?.[header] ?? "")).join(",")),
  ].join("\n");
}

export function parseScalar(value) {
  const text = String(value).trim();
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null") return null;
  if (text !== "" && !Number.isNaN(Number(text))) return Number(text);
  return text.replace(/^["']|["']$/g, "");
}

function splitLine(line, delimiter) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function escapeMarkdownCell(value) {
  return String(value).replace(/\|/g, "\\|");
}

function csvCell(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
