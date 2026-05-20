(function () {
  "use strict";

  const formats = [
    { value: "auto", label: "自动识别" },
    { value: "markdown", label: "Markdown" },
    { value: "html", label: "富文本 / HTML" },
    { value: "text", label: "纯文本（无格式）" },
    { value: "csv", label: "CSV" },
    { value: "tsv", label: "TSV" },
    { value: "json", label: "JSON" },
    { value: "yaml", label: "YAML" },
    { value: "xml", label: "XML" },
    { value: "sql", label: "SQL" },
  ];

  const conversions = [
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

  const els = {
    input: document.querySelector("#input"),
    richInput: document.querySelector("#rich-input"),
    output: document.querySelector("#output"),
    source: document.querySelector("#source-format"),
    target: document.querySelector("#target-format"),
    detected: document.querySelector("#detected-format"),
    convert: document.querySelector("#convert"),
    copy: document.querySelector("#copy"),
    download: document.querySelector("#download"),
    preview: document.querySelector("#preview"),
    clear: document.querySelector("#clear"),
    swap: document.querySelector("#swap"),
    replace: document.querySelector("#replace"),
    message: document.querySelector("#message"),
    previewFrame: document.querySelector("#preview-frame"),
    sampleButtons: document.querySelectorAll("[data-sample]"),
  };

  let lastResult = null;

  init();

  function init() {
    renderSourceFormats();
    els.input.addEventListener("paste", handleRichPaste);
    els.input.addEventListener("input", () => {
      updateDetected();
      updateTargets();
    });
    els.richInput.addEventListener("paste", () => setTimeout(syncRichInput, 0));
    els.richInput.addEventListener("input", syncRichInput);
    els.source.addEventListener("change", updateTargets);
    els.convert.addEventListener("click", runConvert);
    els.copy.addEventListener("click", copyResult);
    els.download.addEventListener("click", downloadResult);
    els.preview?.addEventListener("click", previewResult);
    els.clear.addEventListener("click", clearAll);
    els.swap.addEventListener("click", swapResult);
    els.replace.addEventListener("click", replaceInput);
    els.sampleButtons.forEach((button) => button.addEventListener("click", () => loadSample(button.dataset.sample)));
    loadSample("markdown");
  }

  function handleRichPaste(event) {
    if (els.source.value !== "auto") return;
    const html = event.clipboardData?.getData("text/html");
    if (!html?.trim()) return;
    event.preventDefault();
    els.input.value = extractBodyHtml(html);
    els.source.value = "html";
    updateDetected();
    updateTargets();
    showMessage("已识别为富文本 HTML，可直接转换或清理。");
  }

  function extractBodyHtml(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return cleanRichHtml(doc.body || doc).trim();
  }

  function syncRichInput() {
    const html = cleanRichHtml(els.richInput);
    if (!html) return;
    els.input.value = html;
    els.source.value = "html";
    updateDetected();
    updateTargets();
    showMessage("已从富文本粘贴区读取 HTML。");
  }

  function cleanRichHtml(root) {
    const clone = root.cloneNode(true);
    clone.querySelectorAll("script, style, meta, link").forEach((node) => node.remove());
    clone.querySelectorAll("*").forEach((node) => {
      [...node.attributes].forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const value = String(attribute.value || "").trim().toLowerCase();
        if (name.startsWith("on") || (name === "href" && value.startsWith("javascript:"))) {
          node.removeAttribute(attribute.name);
        }
      });
    });
    return cleanHtml(clone.innerHTML);
  }

  function renderSourceFormats() {
    els.source.innerHTML = formats.map((format) => `<option value="${format.value}">${format.label}</option>`).join("");
  }

  function updateDetected() {
    els.detected.textContent = detectFormat(els.input.value).toUpperCase();
  }

  function updateTargets() {
    const source = getSource();
    const targets = getAvailableTargets(source);
    els.target.innerHTML = targets.map((target) => `<option value="${target.value}">${target.label}</option>`).join("");
    els.convert.disabled = !targets.length || !els.input.value.trim();
  }

  function getSource() {
    return els.source.value === "auto" ? detectFormat(els.input.value) : els.source.value;
  }

  function getAvailableTargets(from) {
    return conversions
      .filter((item) => item.from === from)
      .map((item) => ({ value: item.to, label: item.label }));
  }

  function runConvert() {
    try {
      const result = convert({
        content: els.input.value,
        from: els.source.value,
        to: els.target.value,
      });
      lastResult = result;
      els.output.value = result.content;
      els.previewFrame.srcdoc = result.previewHtml;
      setActionsEnabled(true);
      showMessage(`已本地转换：${result.from.toUpperCase()} 到 ${result.to}`);
    } catch (error) {
      showMessage(error.userMessage || error.message || "转换失败，请检查输入内容。", true);
    }
  }

  async function copyResult() {
    if (!lastResult) return;
    await copyText(lastResult.content);
    showMessage("结果已复制。");
  }

  function downloadResult() {
    if (!lastResult) return;
    downloadText(lastResult.content, lastResult.filename, lastResult.mimeType);
    showMessage("结果已下载。");
  }

  function previewResult() {
    if (!lastResult) return;
    els.previewFrame.srcdoc = lastResult.previewHtml;
    showMessage("预览已更新。");
  }

  function clearAll() {
    els.input.value = "";
    els.richInput.innerHTML = "";
    els.output.value = "";
    els.previewFrame.srcdoc = "";
    lastResult = null;
    setActionsEnabled(false);
    updateDetected();
    updateTargets();
    showMessage("已清空。");
  }

  function swapResult() {
    if (!lastResult) return;
    els.input.value = lastResult.content;
    els.richInput.innerHTML = lastResult.to.includes("html") ? lastResult.content : "";
    els.source.value = "auto";
    updateDetected();
    updateTargets();
    showMessage("已把结果放回输入区。");
  }

  function replaceInput() {
    swapResult();
  }

  function setActionsEnabled(enabled) {
    els.copy.disabled = !enabled;
    els.download.disabled = !enabled;
    if (els.preview) els.preview.disabled = !enabled;
    els.swap.disabled = !enabled;
    els.replace.disabled = !enabled;
  }

  function showMessage(text, isError = false) {
    els.message.textContent = text;
    els.message.classList.toggle("is-error", isError);
  }

  function loadSample(name) {
    const samples = {
      markdown: "# 产品更新\n\n- 新增本地转换\n- 不需要 agent\n- 支持复制和下载",
      csv: "name,role,city\nAlice,SEO,Shanghai\nBob,Ops,Shenzhen",
      json: "{\"name\":\"Alice\",\"active\":true,\"count\":3}",
      html: "<h1>标题</h1><p>Hello <strong>world</strong></p>",
      sql: "select id,name from users where active=1 order by name",
    };
    els.input.value = samples[name] || samples.markdown;
    els.richInput.innerHTML = name === "html" ? samples.html : "";
    els.source.value = "auto";
    updateDetected();
    updateTargets();
    showMessage("示例已载入。");
  }

  function convert({ content, from = "auto", to }) {
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
      if (to === "shopify-html") return platformResult(content, from, "shopify");
      if (to === "wordpress-html") return platformResult(content, from, "wordpress");
      if (to === "wechat-html") return platformResult(content, from, "wechat");
      if (to === "zhihu-html") return platformResult(content, from, "zhihu");

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

  function platformResult(content, from, platform) {
    const html = platformHtml(toHtml(content, from), platform);
    return { content: html, previewHtml: wrapPreview(html) };
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

  function userError(message) {
    const error = new Error(message);
    error.userMessage = message;
    return error;
  }

  function detectFormat(content) {
    const text = String(content || "").trim();
    if (!text) return "text";
    if (/^<!doctype\s+html/i.test(text) || /^<html[\s>]/i.test(text) || /^<[\w:-]+[\s>]/.test(text)) return "html";
    if ((text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"))) {
      try {
        JSON.parse(text);
        return "json";
      } catch {}
    }
    if (/^\s*(select|insert|update|delete|create|drop|alter|with)\s+/i.test(text)) return "sql";
    if (/^#{1,6}\s+\S/m.test(text) || /```[\s\S]*?```/.test(text) || /\[[^\]]+\]\([^)]+\)/.test(text)) return "markdown";
    const lines = text.split(/\r?\n/).filter(Boolean).slice(0, 5);
    if (lines.length >= 2) {
      const tabCount = (lines[0].match(/\t/g) || []).length;
      if (tabCount > 0 && tabCount === (lines[1].match(/\t/g) || []).length) return "tsv";
      const commaCount = (lines[0].match(/,/g) || []).length;
      if (commaCount > 0 && Math.abs((lines[1].match(/,/g) || []).length - commaCount) <= 1) return "csv";
    }
    if (/^[\w.-]+\s*:\s*\S/m.test(text) && !/<[\w:-]+[\s>]/.test(text)) return "yaml";
    return "text";
  }

  function markdownToHtml(content) {
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

  function markdownToText(content) {
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

  function htmlToMarkdown(content) {
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

  function htmlToText(content) {
    return stripHtml(content);
  }

  function stripHtml(content) {
    return decodeEntities(
      String(content || "")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " "),
    )
      .replace(/\s+/g, " ")
      .trim();
  }

  function textToHtml(content) {
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

  function textToMarkdown(content) {
    return String(content || "").trim();
  }

  function parseDelimited(content, delimiter) {
    const rows = String(content || "")
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => splitLine(line, delimiter));
    const headers = rows[0] || [];
    return { headers, rows: rows.slice(1) };
  }

  function tableToHtml(table) {
    const head = table.headers.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("");
    const body = table.rows
      .map((row) => `<tr>${table.headers.map((_, index) => `<td>${escapeHtml(row[index] ?? "")}</td>`).join("")}</tr>`)
      .join("");
    return `<table>\n<thead><tr>${head}</tr></thead>\n<tbody>${body}</tbody>\n</table>`;
  }

  function tableToMarkdown(table) {
    if (!table.headers.length) return "";
    const header = `| ${table.headers.map(escapeMarkdownCell).join(" | ")} |`;
    const divider = `| ${table.headers.map(() => "---").join(" | ")} |`;
    const rows = table.rows.map((row) => `| ${table.headers.map((_, index) => escapeMarkdownCell(row[index] ?? "")).join(" | ")} |`);
    return [header, divider, ...rows].join("\n");
  }

  function tableToJson(table) {
    return table.rows.map((row) =>
      Object.fromEntries(table.headers.map((header, index) => [header, parseScalar(row[index] ?? "")])),
    );
  }

  function arrayToCsv(data) {
    const rows = Array.isArray(data) ? data : [data];
    const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row || {}))));
    return [
      headers.join(","),
      ...rows.map((row) => headers.map((header) => csvCell(row?.[header] ?? "")).join(",")),
    ].join("\n");
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

  function parseJson(content) {
    return JSON.parse(content);
  }

  function parseYaml(content) {
    const result = {};
    for (const line of String(content || "").split(/\r?\n/)) {
      if (!line.trim() || /^\s*#/.test(line)) continue;
      const match = line.match(/^\s*([\w.-]+)\s*:\s*(.*)\s*$/);
      if (match) result[match[1]] = parseScalar(match[2]);
    }
    return result;
  }

  function jsonToYaml(value, indent = 0) {
    if (Array.isArray(value)) {
      return value.map((item) => `${" ".repeat(indent)}- ${formatYamlValue(item, indent + 2)}`).join("\n");
    }
    if (value && typeof value === "object") {
      return Object.entries(value)
        .map(([key, val]) => {
          if (val && typeof val === "object") return `${" ".repeat(indent)}${key}:\n${jsonToYaml(val, indent + 2)}`;
          return `${" ".repeat(indent)}${key}: ${formatYamlValue(val, indent)}`;
        })
        .join("\n");
    }
    return formatYamlValue(value, indent);
  }

  function formatYamlValue(value, indent) {
    if (value && typeof value === "object") return `\n${jsonToYaml(value, indent)}`;
    if (typeof value === "string") return /[:#\n]/.test(value) ? JSON.stringify(value) : value;
    return String(value);
  }

  function jsonToCsv(value) {
    return arrayToCsv(value);
  }

  function parseScalar(value) {
    const text = String(value).trim();
    if (text === "true") return true;
    if (text === "false") return false;
    if (text === "null") return null;
    if (text !== "" && !Number.isNaN(Number(text))) return Number(text);
    return text.replace(/^["']|["']$/g, "");
  }

  function jsonToXml(value, rootName = "root") {
    if (Array.isArray(value)) return `<${rootName}>${value.map((item) => jsonToXml(item, "item")).join("")}</${rootName}>`;
    if (value && typeof value === "object") {
      return `<${rootName}>${Object.entries(value).map(([key, val]) => jsonToXml(val, key)).join("")}</${rootName}>`;
    }
    return `<${rootName}>${escapeHtml(String(value ?? ""))}</${rootName}>`;
  }

  function xmlToJsonObject(content) {
    const text = String(content || "").trim();
    const match = text.match(/^<([\w:-]+)[^>]*>([\s\S]*)<\/\1>$/);
    if (!match) return { value: decodeEntities(text.replace(/<[^>]+>/g, "")) };
    return { [match[1]]: parseXmlChildren(match[2]) };
  }

  function parseXmlChildren(inner) {
    const childPattern = /<([\w:-]+)[^>]*>([\s\S]*?)<\/\1>/g;
    const result = {};
    let found = false;
    let match;
    while ((match = childPattern.exec(inner))) {
      found = true;
      result[match[1]] = /<[\w:-]+[^>]*>/.test(match[2]) ? parseXmlChildren(match[2]) : decodeEntities(match[2].trim());
    }
    return found ? result : decodeEntities(inner.trim());
  }

  function platformHtml(html, platform) {
    const body = String(html || "").trim();
    if (platform === "wechat") return `<section style="font-size:16px;line-height:1.75;color:#222;">${body}</section>`;
    if (platform === "zhihu") return `<article>${body}</article>`;
    return body;
  }

  function formatSql(content) {
    return String(content || "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b(select|insert|update|delete|create|drop|alter|with|from|where|group by|order by|having|limit|join|left join|right join|inner join|values|set)\b/gi, (match) => `\n${match.toUpperCase()}`)
      .replace(/^\n/, "")
      .trim();
  }

  const allowedHtmlTags = new Set([
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

  const unwrapHtmlTags = new Set(["font", "o:p", "span"]);

  function cleanHtml(content) {
    return String(content || "")
      .replace(/<!doctype[\s\S]*?>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<\s*(script|style|meta|link)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
      .replace(/<\s*(script|style|meta|link)[^>]*\/?>/gi, "")
      .replace(/<\/?\s*(html|head|body)[^>]*>/gi, "")
      .replace(/<\s*\/?\s*([a-zA-Z][\w:-]*)([^>]*)>/g, cleanHtmlTag)
      .replace(/>\s+</g, "><")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function cleanHtmlTag(fullTag, rawName, rawAttributes = "") {
    const closing = /^<\s*\//.test(fullTag);
    const tag = normalizeHtmlTagName(rawName);
    if (unwrapHtmlTags.has(tag)) return "";
    if (!allowedHtmlTags.has(tag)) return "";
    if (closing) return tag === "br" || tag === "img" ? "" : `</${tag}>`;
    if (tag === "br") return "<br>";
    return `<${tag}${cleanHtmlAttributes(tag, rawAttributes)}>`;
  }

  function normalizeHtmlTagName(name) {
    const tag = String(name || "").toLowerCase();
    if (tag === "b") return "strong";
    if (tag === "i") return "em";
    return tag;
  }

  function cleanHtmlAttributes(tag, rawAttributes) {
    const attributes = [];
    const pattern = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
    let match;
    while ((match = pattern.exec(rawAttributes))) {
      const name = match[1].toLowerCase();
      const value = match[2] ?? match[3] ?? match[4] ?? "";
      if (!isAllowedHtmlAttribute(tag, name, value)) continue;
      attributes.push(` ${name}="${escapeHtml(value)}"`);
    }
    return attributes.join("");
  }

  function isAllowedHtmlAttribute(tag, name, value) {
    if (name.startsWith("on") || name === "style" || name === "class" || name === "id" || name.startsWith("data-")) return false;
    if ((tag === "a" && name === "href") || (tag === "img" && name === "src")) return isSafeHtmlUrl(value);
    if (tag === "img" && (name === "alt" || name === "title")) return true;
    if (tag === "a" && name === "title") return true;
    if ((tag === "td" || tag === "th") && (name === "colspan" || name === "rowspan")) return /^\d{1,2}$/.test(value);
    return false;
  }

  function isSafeHtmlUrl(value) {
    const text = String(value || "").trim().toLowerCase();
    return Boolean(text) && !text.startsWith("javascript:") && !text.startsWith("data:");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function decodeEntities(value) {
    return String(value ?? "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&");
  }

  function wrapPreview(body) {
    return `<!doctype html><html><head><meta charset="utf-8"><style>
body{font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:28px;line-height:1.65;color:#17140f;background:#fffdf8}
table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #d9cfbc;padding:8px 10px;text-align:left}th{background:#f2eadb}
pre{background:#17140f;color:#f7f0df;padding:16px;border-radius:8px;overflow:auto}code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
a{color:#9a4f00}
</style></head><body>${body}</body></html>`;
  }

  function textPreview(content, title = "转换结果") {
    return wrapPreview(`<h1>${escapeHtml(title)}</h1><pre>${escapeHtml(content)}</pre>`);
  }

  async function copyText(content) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = content;
    textarea.style.position = "fixed";
    textarea.style.left = "-999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  function downloadText(content, filename, mimeType = "text/plain;charset=utf-8") {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
})();
