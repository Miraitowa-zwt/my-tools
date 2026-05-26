export class TaskStore {
  constructor() {
    this.tasks = new Map();
    this.order = [];
  }

  create(task) {
    this.tasks.set(task.id, task);
    this.order.push(task.id);
    return task;
  }

  get(taskId) {
    return this.tasks.get(taskId) || null;
  }

  list() {
    return this.order
      .map((taskId) => this.tasks.get(taskId))
      .filter(Boolean)
      .map((task) => this.serialize(task));
  }

  delete(taskId) {
    const task = this.get(taskId);
    if (!task || !["success", "failed"].includes(task.status)) {
      return false;
    }

    this.tasks.delete(taskId);
    this.order = this.order.filter((id) => id !== taskId);
    return true;
  }

  serialize(task) {
    return {
      id: task.id,
      label: task.label,
      domain: task.domain,
      cmsMode: task.cmsMode,
      createdAt: task.createdAt,
      status: task.status,
      progressText: task.progressText,
      logs: [...task.logs],
      prompt: task.prompt,
      tdPrompt: task.tdPrompt || "",
      generationMode: task.generationMode || "prompt",
      apiModel: task.apiModel || "",
      apiResult: task.apiResult || "",
      tdApiResult: task.tdApiResult || "",
      summary: task.summary,
      outputDir: task.outputDir,
      error: task.error,
      docxFileNames: [...task.docxFileNames],
      keywordFileName: task.keywordFileName,
    };
  }

  update(taskId, updates) {
    const task = this.get(taskId);
    if (!task) {
      return null;
    }
    Object.assign(task, updates);
    return this.serialize(task);
  }

  appendLog(taskId, line) {
    const task = this.get(taskId);
    if (!task || !line) {
      return null;
    }
    task.logs.push(line);
    return this.serialize(task);
  }

  markRunning(taskId) {
    return this.update(taskId, {
      status: "running",
      progressText: "正在处理",
    });
  }

  markSuccess(taskId, result) {
    return this.update(taskId, {
      status: "success",
      progressText: "处理完成",
      prompt: result.prompt || "",
      tdPrompt: result.td_prompt || "",
      apiResult: result.api_result || "",
      tdApiResult: result.td_api_result || "",
      summary: result.summary || null,
      outputDir: result.output_dir || "",
      error: null,
    });
  }

  markFailed(taskId, result) {
    const task = this.get(taskId);
    return this.update(taskId, {
      status: "failed",
      progressText: "处理失败",
      error: result?.error || "未知错误",
      prompt: result?.prompt || task.prompt || "",
      tdPrompt: result?.td_prompt || task.tdPrompt || "",
      apiResult: result?.api_result || task.apiResult || "",
      tdApiResult: result?.td_api_result || task.tdApiResult || "",
      summary: result?.summary || null,
      outputDir: result?.output_dir || "",
    });
  }
}
