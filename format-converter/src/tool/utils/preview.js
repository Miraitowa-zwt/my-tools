export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

export function wrapPreview(body) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:28px;line-height:1.65;color:#17140f;background:#fffdf8}
table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #d9cfbc;padding:8px 10px;text-align:left}th{background:#f2eadb}
pre{background:#17140f;color:#f7f0df;padding:16px;border-radius:8px;overflow:auto}code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
a{color:#9a4f00}
</style></head><body>${body}</body></html>`;
}

export function textPreview(content, title = "转换结果") {
  return wrapPreview(`<h1>${escapeHtml(title)}</h1><pre>${escapeHtml(content)}</pre>`);
}
