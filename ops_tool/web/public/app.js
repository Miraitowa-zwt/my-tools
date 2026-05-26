const state = {
  tasks: [],
  selectedTaskId: null,
  isSubmitting: false,
  selectedDocxFiles: [],
};

const els = {
  form: document.querySelector("#task-form"),
  domain: document.querySelector("#domain"),
  cmsMode: document.querySelector("#cms-mode"),
  generationMode: document.querySelector("#generation-mode"),
  apiConfig: document.querySelector("#api-config"),
  apiBaseUrl: document.querySelector("#api-base-url"),
  apiKey: document.querySelector("#api-key"),
  apiModel: document.querySelector("#api-model"),
  docxFiles: document.querySelector("#docx-files"),
  clearDocxFilesButton: document.querySelector("#clear-docx-files-button"),
  keywordFile: document.querySelector("#keyword-file"),
  docxFileNames: document.querySelector("#docx-file-names"),
  keywordFileName: document.querySelector("#keyword-file-name"),
  taskList: document.querySelector("#task-list"),
  taskDetail: document.querySelector("#task-detail"),
  copyStatus: document.querySelector("#copy-status"),
  refreshButton: document.querySelector("#refresh-button"),
  submitButton: document.querySelector("#submit-button"),
};

function savePreferences() {
  localStorage.setItem("ops-tool-domain", els.domain.value.trim());
  localStorage.setItem("ops-tool-cms-mode", els.cmsMode.value);
  localStorage.setItem("ops-tool-generation-mode", els.generationMode.value);
  localStorage.setItem("ops-tool-api-base-url", els.apiBaseUrl.value.trim());
  localStorage.setItem("ops-tool-api-key", els.apiKey.value.trim());
  localStorage.setItem("ops-tool-api-model", els.apiModel.value.trim());
}

function loadPreferences() {
  els.domain.value = localStorage.getItem("ops-tool-domain") || "";
  els.cmsMode.value = localStorage.getItem("ops-tool-cms-mode") || "shopify";
  els.generationMode.value = localStorage.getItem("ops-tool-generation-mode") || "prompt";
  els.apiBaseUrl.value = localStorage.getItem("ops-tool-api-base-url") || "";
  els.apiKey.value = localStorage.getItem("ops-tool-api-key") || "";
  els.apiModel.value = localStorage.getItem("ops-tool-api-model") || "";
  renderApiConfig();
}

function formatTime(value) {
  return new Date(value).toLocaleString("zh-CN");
}

function isFinishedTask(task) {
  return task.status === "success" || task.status === "failed";
}

function encodeFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve({
        name: file.name,
        contentBase64: result.split(",")[1] || "",
      });
    };
    reader.onerror = () => reject(new Error(`读取文件失败: ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function collectPayload() {
  const docxFiles = await Promise.all(state.selectedDocxFiles.map(encodeFile));
  const keywordFile = els.keywordFile.files[0]
    ? await encodeFile(els.keywordFile.files[0])
    : null;

  return {
    domain: els.domain.value.trim(),
    cmsMode: els.cmsMode.value,
    generationMode: els.generationMode.value,
    apiBaseUrl: els.apiBaseUrl.value.trim(),
    apiKey: els.apiKey.value.trim(),
    apiModel: els.apiModel.value.trim(),
    docxFiles,
    keywordFile,
  };
}

function renderApiConfig() {
  els.apiConfig.hidden = els.generationMode.value !== "api";
}

function fileKey(file) {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function addDocxFiles() {
  const files = [...els.docxFiles.files];
  const existingKeys = new Set(state.selectedDocxFiles.map(fileKey));
  for (const file of files) {
    if (!existingKeys.has(fileKey(file))) {
      state.selectedDocxFiles.push(file);
      existingKeys.add(fileKey(file));
    }
  }
  renderFileNames();
}

function clearDocxFiles() {
  state.selectedDocxFiles = [];
  els.docxFiles.value = "";
  renderFileNames();
}

function pickDefaultTask() {
  if (state.selectedTaskId && state.tasks.some((task) => task.id === state.selectedTaskId)) {
    return;
  }

  const runningTask = state.tasks.find((task) => task.status === "running");
  state.selectedTaskId = runningTask?.id || state.tasks[0]?.id || null;
}

function renderTaskList() {
  if (state.tasks.length === 0) {
    els.taskList.innerHTML = '<div class="empty-state">还没有任务</div>';
    return;
  }

  els.taskList.innerHTML = state.tasks
    .map((task) => {
      const selectedClass = task.id === state.selectedTaskId ? "selected" : "";
      const currentTask = task.id === state.selectedTaskId ? 'aria-current="true"' : "";
      return `
        <article
          class="task-card ${selectedClass}"
          data-task-id="${task.id}"
          role="button"
          tabindex="0"
          ${currentTask}
        >
          <div class="task-card-header">
            <div class="task-label">${task.label}</div>
            <span class="status-badge status-${task.status}">${task.status}</span>
          </div>
          <div class="task-meta">创建时间：${formatTime(task.createdAt)}</div>
          <div class="task-meta">状态说明：${task.progressText}</div>
          ${
            isFinishedTask(task)
              ? `<button class="delete-task-button" type="button" data-delete-task-id="${task.id}">删除任务</button>`
              : ""
          }
        </article>
      `;
    })
    .join("");
}

function renderSummary(task) {
  const summary = task.summary || {};
  const items = [
    ["状态", task.status],
    ["文章数", summary.total_articles ?? "-"],
    ["已加链接文章", summary.articles_with_links ?? "-"],
    ["总链接数", summary.total_links ?? "-"],
    ["产品/集合页", summary.product_collection_count ?? "-"],
    ["博客页", summary.blog_count ?? "-"],
  ];

  return `
    <section>
      <h3>摘要</h3>
      <div class="summary-grid">
        ${items
          .map(
            ([label, value]) => `
              <div class="summary-item">
                <div class="summary-label">${label}</div>
                <div class="summary-value">${value}</div>
              </div>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function escapeTextareaValue(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;");
}

function extractHtmlBlocks(value) {
  const result = String(value || "");
  const fencedBlocks = [...result.matchAll(/```(?:html|xml)?\s*([\s\S]*?)```/gi)]
    .map((match) => match[1].trim())
    .filter((block) => /<\/?[a-z][\s\S]*>/i.test(block));

  if (fencedBlocks.length) {
    return fencedBlocks;
  }

  const start = result.search(/<(?:!doctype|html|head|body|main|article|section|div|p|h[1-6]|ul|ol|table)\b/i);
  const end = result.lastIndexOf(">");
  return start >= 0 && end > start ? [result.slice(start, end + 1).trim()] : [];
}

function renderHtmlCopyActions(value) {
  const blocks = extractHtmlBlocks(value);
  if (!blocks.length) {
    return '<div class="action-note">没有识别到可单独复制的 HTML，仍可复制完整结果。</div>';
  }

  return `
    <div class="quick-copy-group">
      ${blocks
        .map(
          (_, index) => `
            <button class="quick-copy-button" type="button" data-copy-html-index="${index}">
              复制 HTML${blocks.length > 1 ? ` ${index + 1}` : ""}
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

const tdSectionDefinitions = [
  ["titles", "标题", /^(?:#{1,4}\s*)?(?:标题候选|titles?|title candidates?)\s*:?\s*$/i],
  ["descriptions", "描述", /^(?:#{1,4}\s*)?(?:描述候选|meta descriptions?|descriptions?)\s*:?\s*$/i],
  ["urls", "URL", /^(?:#{1,4}\s*)?(?:URL句柄|URL(?: slugs?| handles?)?|slugs?)\s*:?\s*$/i],
  ["keywords", "关键词", /^(?:#{1,4}\s*)?(?:关键词|keywords?)\s*:?\s*$/i],
  ["tags", "标签", /^(?:#{1,4}\s*)?(?:标签|tags?)\s*:?\s*$/i],
];

function findTdSection(line) {
  return tdSectionDefinitions.find(([, , matcher]) => matcher.test(line.trim()));
}

function extractTdSections(value) {
  const sections = {};
  let activeSection = null;

  for (const line of String(value || "").split(/\r?\n/)) {
    const heading = findTdSection(line);
    if (heading) {
      activeSection = heading[0];
      sections[activeSection] = [];
      continue;
    }

    if (/^(?:#{1,4}\s*)\S/.test(line.trim())) {
      activeSection = null;
    }

    if (activeSection) {
      sections[activeSection].push(line);
    }
  }

  return Object.fromEntries(
    Object.entries(sections)
      .map(([key, lines]) => [key, lines.join("\n").trim()])
      .filter(([, text]) => text),
  );
}

function stripListMarker(line) {
  return line.replace(/^\s*(?:[-*]\s*)?(?:\d+[\.)、]\s*)?/, "").trim();
}

function sectionLines(sectionText) {
  return String(sectionText || "")
    .split(/\r?\n/)
    .map(stripListMarker)
    .filter(Boolean);
}

function extractTdCandidateGroups(value) {
  const sections = extractTdSections(value);
  const titles = sectionLines(sections.titles);
  const descriptions = sectionLines(sections.descriptions);
  const urls = sectionLines(sections.urls);
  const keywords = sections.keywords || "";
  const tags = sections.tags || "";
  const count = Math.max(titles.length, descriptions.length, urls.length);

  return Array.from({ length: count }, (_, index) => {
    const lines = [
      `标题: ${titles[index] || ""}`,
      `描述: ${descriptions[index] || ""}`,
      `URL: ${urls[index] || ""}`,
    ];
    if (keywords) {
      lines.push(`关键词:\n${keywords}`);
    }
    if (tags) {
      lines.push(`标签:\n${tags}`);
    }
    return lines.join("\n\n").trim();
  }).filter((group) => group.replace(/标题:|描述:|URL:/g, "").trim());
}

function renderTdCopyActions(value) {
  const groups = extractTdCandidateGroups(value);
  if (!groups.length) {
    return '<div class="action-note">没有识别到完整 TD 候选组，可在下方文本框手动选择需要的内容复制。</div>';
  }

  return `
    <div class="quick-copy-group">
      ${groups
        .map(
          (_, index) => `
            <button class="quick-copy-button" type="button" data-copy-td-candidate="${index}">
              复制第 ${index + 1} 组 TD
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderTaskDetail() {
  const task = state.tasks.find((item) => item.id === state.selectedTaskId);
  if (!task) {
    els.taskDetail.dataset.taskId = "";
    els.taskDetail.innerHTML = '<div class="empty-state">请选择一个任务</div>';
    return;
  }

  els.taskDetail.dataset.taskId = task.id;
  els.taskDetail.innerHTML = `
    ${renderSummary(task)}
    ${
      task.error
        ? `<section><h3>错误</h3><div class="error-box" role="alert">${task.error}</div></section>`
        : ""
    }
    ${
      task.generationMode === "api"
        ? `
          <section class="result-workbench">
            <div class="workbench-title">
              <h3>API 结果区</h3>
              <span>直接取用生成内容</span>
            </div>
            <div class="result-grid">
              <section class="result-surface">
                <div class="panel-header">
                  <h3>文章结果</h3>
                  <div class="prompt-actions">
                    <button id="copy-api-result-button" type="button">复制完整结果</button>
                  </div>
                </div>
                ${renderHtmlCopyActions(task.apiResult)}
                <textarea class="prompt-box api-result-box selectable-text-region" aria-label="API 文章生成结果" readonly>${escapeTextareaValue(task.apiResult)}</textarea>
              </section>
              <section class="result-surface">
                <div class="panel-header">
                  <h3>TD结果</h3>
                </div>
                ${renderTdCopyActions(task.tdApiResult)}
                <textarea class="prompt-box td-api-result-box selectable-text-region" aria-label="API TD 生成结果" readonly>${escapeTextareaValue(task.tdApiResult)}</textarea>
              </section>
            </div>
          </section>
        `
        : ""
    }
    <div class="supporting-details">
      <section>
        <div class="panel-header">
          <h3>Prompt</h3>
          <div class="prompt-actions">
            <button id="copy-prompt-button" type="button">复制当前任务 Prompt</button>
          </div>
        </div>
        <textarea class="prompt-box main-prompt-box selectable-text-region" aria-label="当前任务 Prompt" readonly>${escapeTextareaValue(task.prompt)}</textarea>
      </section>
      <section>
        <div class="panel-header">
          <h3>TD生成</h3>
          <div class="prompt-actions">
            <button id="copy-td-prompt-button" type="button">复制 TD Prompt</button>
          </div>
        </div>
        <textarea class="prompt-box td-prompt-box selectable-text-region" aria-label="TD Prompt" readonly>${escapeTextareaValue(task.tdPrompt)}</textarea>
      </section>
      <section>
        <h3>完整日志</h3>
        <div class="log-box selectable-text-region" aria-label="任务完整日志" tabindex="0">${task.logs.length ? task.logs.join("") : "暂无日志"}</div>
      </section>
      <section>
        <h3>输出位置</h3>
        <div class="summary-item">${task.outputDir || "任务完成后显示"}</div>
      </section>
    </div>
  `;
}

function captureTaskDetailScroll() {
  return {
    taskId: els.taskDetail.dataset.taskId || "",
    log: document.querySelector(".log-box")?.scrollTop || 0,
    prompt: document.querySelector(".main-prompt-box")?.scrollTop || 0,
    tdPrompt: document.querySelector(".td-prompt-box")?.scrollTop || 0,
    apiResult: document.querySelector(".api-result-box")?.scrollTop || 0,
    tdApiResult: document.querySelector(".td-api-result-box")?.scrollTop || 0,
  };
}

function restoreTaskDetailScroll(scrollState) {
  if (!scrollState || scrollState.taskId !== state.selectedTaskId) {
    return;
  }

  const logBox = document.querySelector(".log-box");
  const promptBox = document.querySelector(".main-prompt-box");
  const tdPromptBox = document.querySelector(".td-prompt-box");
  const apiResultBox = document.querySelector(".api-result-box");
  const tdApiResultBox = document.querySelector(".td-api-result-box");

  if (logBox) {
    logBox.scrollTop = scrollState.log;
  }
  if (promptBox) {
    promptBox.scrollTop = scrollState.prompt;
  }
  if (tdPromptBox) {
    tdPromptBox.scrollTop = scrollState.tdPrompt;
  }
  if (apiResultBox) {
    apiResultBox.scrollTop = scrollState.apiResult;
  }
  if (tdApiResultBox) {
    tdApiResultBox.scrollTop = scrollState.tdApiResult;
  }
}

function shouldDeferTaskDetailRefresh() {
  const activeElement = document.activeElement;
  return Boolean(
    activeElement?.closest?.("#task-detail") &&
      activeElement.classList?.contains("selectable-text-region"),
  );
}

function renderFileNames() {
  els.docxFileNames.textContent = state.selectedDocxFiles.length
    ? state.selectedDocxFiles.map((file) => file.name).join(" | ")
    : "未选择文件";
  els.keywordFileName.textContent = els.keywordFile.files[0]?.name || "未选择文件";
}

function render() {
  const detailScroll = captureTaskDetailScroll();
  pickDefaultTask();
  renderTaskList();
  renderTaskDetail();
  restoreTaskDetailScroll(detailScroll);
}

async function refreshTasks() {
  const response = await fetch("/api/tasks");
  state.tasks = await response.json();
  if (shouldDeferTaskDetailRefresh()) {
    return;
  }
  render();
}

async function deleteTask(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || !isFinishedTask(task)) {
    return;
  }
  if (!window.confirm(`删除任务：${task.label}？`)) {
    return;
  }

  const response = await fetch(`/api/tasks/${taskId}`, {
    method: "DELETE",
  });
  const data = await response.json();
  if (!response.ok) {
    alert(data.error || "删除任务失败");
    return;
  }

  if (state.selectedTaskId === taskId) {
    state.selectedTaskId = null;
  }
  await refreshTasks();
}

async function createTask(event) {
  event.preventDefault();
  if (state.isSubmitting) {
    return;
  }

  state.isSubmitting = true;
  els.submitButton.disabled = true;
  els.submitButton.textContent = "正在提交...";

  try {
    savePreferences();
    const payload = await collectPayload();
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "创建任务失败");
    }

    state.selectedTaskId = data.id;
    state.selectedDocxFiles = [];
    els.docxFiles.value = "";
    els.keywordFile.value = "";
    renderFileNames();
    await refreshTasks();
  } catch (error) {
    alert(error.message);
  } finally {
    state.isSubmitting = false;
    els.submitButton.disabled = false;
    els.submitButton.textContent = "开始任务";
  }
}

function setCopyButtonText(text) {
  const button = document.querySelector("#copy-prompt-button");
  if (!button) {
    return;
  }

  button.textContent = text;
  window.setTimeout(() => {
    if (button.isConnected) {
      button.textContent = "复制当前任务 Prompt";
    }
  }, 1200);
}

function setTdCopyButtonText(text) {
  const button = document.querySelector("#copy-td-prompt-button");
  if (!button) {
    return;
  }

  button.textContent = text;
  window.setTimeout(() => {
    if (button.isConnected) {
      button.textContent = "复制 TD Prompt";
    }
  }, 1200);
}

function setResultCopyButtonText(buttonId, text, resetText) {
  const button = document.querySelector(`#${buttonId}`);
  if (!button) {
    return;
  }

  button.textContent = text;
  window.setTimeout(() => {
    if (button.isConnected) {
      button.textContent = resetText;
    }
  }, 1200);
}

function setTransientButtonText(button, text, resetText) {
  if (!button) {
    return;
  }

  button.textContent = text;
  window.setTimeout(() => {
    if (button.isConnected) {
      button.textContent = resetText;
    }
  }, 1200);
}

function setCopyStatus(message, type = "") {
  if (!els.copyStatus) {
    return;
  }

  els.copyStatus.textContent = message;
  els.copyStatus.className = `copy-status ${type}`.trim();
}

function selectPromptText() {
  const promptBox = document.querySelector(".prompt-box");
  if (promptBox) {
    promptBox.focus();
    promptBox.select();
    return true;
  }

  return false;
}

function selectTdPromptText() {
  const promptBox = document.querySelector(".td-prompt-box");
  if (promptBox) {
    promptBox.focus();
    promptBox.select();
    return true;
  }

  return false;
}

function selectApiResultText() {
  const resultBox = document.querySelector(".api-result-box");
  if (resultBox) {
    resultBox.focus();
    resultBox.select();
    return true;
  }

  return false;
}

function selectTdApiResultText() {
  const resultBox = document.querySelector(".td-api-result-box");
  if (resultBox) {
    resultBox.focus();
    resultBox.select();
    return true;
  }

  return false;
}

function copyWithSelectionFallback(selectText = selectPromptText) {
  if (!selectText()) {
    return "failed";
  }

  return document.execCommand("copy") ? "copied" : "selected";
}

async function copyTextToClipboard(text, selectText = selectPromptText) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return "copied";
    } catch {
      return copyWithSelectionFallback(selectText);
    }
  }

  return copyWithSelectionFallback(selectText);
}

async function copyPrompt() {
  const task = state.tasks.find((item) => item.id === state.selectedTaskId);
  if (!task?.prompt) {
    setCopyButtonText("暂无 Prompt");
    setCopyStatus("当前任务还没有生成 Prompt。", "warning");
    return;
  }

  try {
    const result = await copyTextToClipboard(task.prompt);
    if (result === "copied") {
      setCopyButtonText("已复制");
      setCopyStatus("已复制到剪贴板。", "success");
      return;
    }
    if (result === "selected") {
      setCopyButtonText("已选中");
      setCopyStatus("复制失败，但已选中 Prompt，请按 Ctrl+C。", "warning");
      return;
    }
    setCopyButtonText("复制失败");
    setCopyStatus("复制失败，请点击 Prompt 文本框后按 Ctrl+A 再按 Ctrl+C。", "error");
  } catch {
    setCopyButtonText("复制失败");
    selectPromptText();
    setCopyStatus("复制失败，但已选中 Prompt，请按 Ctrl+C。", "warning");
  }
}

async function copyTdPrompt() {
  const task = state.tasks.find((item) => item.id === state.selectedTaskId);
  if (!task?.tdPrompt) {
    setTdCopyButtonText("暂无 TD Prompt");
    setCopyStatus("当前任务还没有生成 TD Prompt。", "warning");
    return;
  }

  try {
    const result = await copyTextToClipboard(task.tdPrompt, selectTdPromptText);
    if (result === "copied") {
      setTdCopyButtonText("已复制");
      setCopyStatus("TD Prompt 已复制到剪贴板。", "success");
      return;
    }
    if (result === "selected") {
      setTdCopyButtonText("已选中");
      setCopyStatus("复制失败，但已选中 TD Prompt，请按 Ctrl+C。", "warning");
      return;
    }
    setTdCopyButtonText("复制失败");
    selectTdPromptText();
    setCopyStatus("复制失败，但已选中 TD Prompt，请按 Ctrl+C。", "warning");
  } catch {
    setTdCopyButtonText("复制失败");
    selectTdPromptText();
    setCopyStatus("复制失败，但已选中 TD Prompt，请按 Ctrl+C。", "warning");
  }
}

async function copyApiText({
  value,
  buttonId,
  resetText,
  emptyMessage,
  successMessage,
  selectText,
}) {
  if (!value) {
    setResultCopyButtonText(buttonId, "暂无内容", resetText);
    setCopyStatus(emptyMessage, "warning");
    return;
  }

  try {
    const result = await copyTextToClipboard(value, selectText);
    if (result === "copied") {
      setResultCopyButtonText(buttonId, "已复制", resetText);
      setCopyStatus(successMessage, "success");
      return;
    }
    selectText();
    setResultCopyButtonText(buttonId, "已选中", resetText);
    setCopyStatus("复制失败，但内容已选中，请按 Ctrl+C。", "warning");
  } catch {
    selectText();
    setResultCopyButtonText(buttonId, "复制失败", resetText);
    setCopyStatus("复制失败，但内容已选中，请按 Ctrl+C。", "warning");
  }
}

function copyApiResult() {
  const task = state.tasks.find((item) => item.id === state.selectedTaskId);
  return copyApiText({
    value: task?.apiResult,
    buttonId: "copy-api-result-button",
    resetText: "复制生成结果",
    emptyMessage: "当前任务还没有 API 生成结果。",
    successMessage: "API 生成结果已复制到剪贴板。",
    selectText: selectApiResultText,
  });
}

async function copyExtractedText({ value, button, emptyMessage, successMessage, selectText }) {
  const resetText = button?.textContent.trim() || "复制";
  if (!value) {
    setTransientButtonText(button, "暂无内容", resetText);
    setCopyStatus(emptyMessage, "warning");
    return;
  }

  const result = await copyTextToClipboard(value, selectText);
  if (result === "copied") {
    setTransientButtonText(button, "已复制", resetText);
    setCopyStatus(successMessage, "success");
    return;
  }

  selectText();
  setTransientButtonText(button, "已选中", resetText);
  setCopyStatus("复制失败，但完整结果已选中，请按 Ctrl+C。", "warning");
}

function copyApiHtmlBlock(index, button) {
  const task = state.tasks.find((item) => item.id === state.selectedTaskId);
  const html = extractHtmlBlocks(task?.apiResult)[index];
  return copyExtractedText({
    value: html,
    button,
    emptyMessage: "没有找到这段 HTML，请复制完整结果。",
    successMessage: "HTML 已复制到剪贴板。",
    selectText: selectApiResultText,
  });
}

function copyTdCandidate(index, button) {
  const task = state.tasks.find((item) => item.id === state.selectedTaskId);
  const text = extractTdCandidateGroups(task?.tdApiResult)[index];
  return copyExtractedText({
    value: text,
    button,
    emptyMessage: "没有找到这组 TD 内容，请在文本框里手动选择需要的内容复制。",
    successMessage: "这组 TD 已复制到剪贴板。",
    selectText: selectTdApiResultText,
  });
}

els.form.addEventListener("submit", createTask);
els.generationMode.addEventListener("change", renderApiConfig);
els.docxFiles.addEventListener("change", addDocxFiles);
els.clearDocxFilesButton.addEventListener("click", clearDocxFiles);
els.keywordFile.addEventListener("change", renderFileNames);
els.refreshButton.addEventListener("click", () => {
  void refreshTasks();
});

els.taskList.addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-delete-task-id]");
  if (deleteButton) {
    event.stopPropagation();
    void deleteTask(deleteButton.dataset.deleteTaskId);
    return;
  }

  const card = event.target.closest("[data-task-id]");
  if (!card) {
    return;
  }
  state.selectedTaskId = card.dataset.taskId;
  render();
});

els.taskList.addEventListener("keydown", (event) => {
  if (event.target.closest("[data-delete-task-id]")) {
    return;
  }

  const card = event.target.closest("[data-task-id]");
  const selectsTask = event.key === "Enter" || event.key === " ";
  if (!card || !selectsTask) {
    return;
  }

  event.preventDefault();
  state.selectedTaskId = card.dataset.taskId;
  render();
  document.querySelector(`[data-task-id="${card.dataset.taskId}"]`)?.focus();
});

els.taskDetail.addEventListener("click", (event) => {
  const htmlCopyButton = event.target.closest("[data-copy-html-index]");
  if (htmlCopyButton) {
    void copyApiHtmlBlock(Number(htmlCopyButton.dataset.copyHtmlIndex), htmlCopyButton);
    return;
  }

  const tdCopyButton = event.target.closest("[data-copy-td-candidate]");
  if (tdCopyButton) {
    void copyTdCandidate(Number(tdCopyButton.dataset.copyTdCandidate), tdCopyButton);
    return;
  }

  if (event.target.id === "copy-prompt-button") {
    void copyPrompt();
  }
  if (event.target.id === "copy-td-prompt-button") {
    void copyTdPrompt();
  }
  if (event.target.id === "copy-api-result-button") {
    void copyApiResult();
  }
});

loadPreferences();
renderFileNames();
void refreshTasks();
setInterval(() => {
  void refreshTasks();
}, 1500);
