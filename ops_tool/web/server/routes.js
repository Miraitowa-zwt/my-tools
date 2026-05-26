import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const MAX_BODY_BYTES = 50 * 1024 * 1024;

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("请求体过大"));
        req.destroy();
        return;
      }
      raw += chunk.toString();
    });

    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error("请求体不是有效的 JSON"));
      }
    });

    req.on("error", reject);
  });
}

async function writeInputFiles(taskDir, payload) {
  const inputDir = path.join(taskDir, "input");
  await fs.mkdir(inputDir, { recursive: true });

  const docxFiles = [];
  for (const file of payload.docxFiles || []) {
    const targetPath = path.join(inputDir, file.name);
    await fs.writeFile(targetPath, Buffer.from(file.contentBase64, "base64"));
    docxFiles.push(targetPath);
  }

  let keywordFile = null;
  if (payload.keywordFile?.contentBase64) {
    keywordFile = path.join(inputDir, payload.keywordFile.name);
    await fs.writeFile(
      keywordFile,
      Buffer.from(payload.keywordFile.contentBase64, "base64"),
    );
  }

  return { docxFiles, keywordFile, inputDir };
}

function buildTask(taskId, payload, fileInfo, outputRoot) {
  const firstFile = payload.docxFiles?.[0]?.name || "未命名任务";
  const generationMode = payload.generationMode === "api" ? "api" : "prompt";
  return {
    id: taskId,
    label: `${firstFile} | ${payload.domain}`,
    domain: payload.domain,
    cmsMode: payload.cmsMode,
    createdAt: new Date().toISOString(),
    status: "waiting",
    progressText: "等待执行",
    logs: [],
    prompt: "",
    tdPrompt: "",
    generationMode,
    apiModel: generationMode === "api" ? payload.apiModel.trim() : "",
    apiResult: "",
    tdApiResult: "",
    summary: null,
    outputDir: "",
    error: null,
    docxFileNames: (payload.docxFiles || []).map((file) => file.name),
    keywordFileName: payload.keywordFile?.name || "",
    runPayload: {
      domain: payload.domain,
      cms_mode: payload.cmsMode,
      docx_files: fileInfo.docxFiles,
      keyword_file: fileInfo.keywordFile,
      output_dir: outputRoot,
    },
    apiConfig: generationMode === "api"
      ? {
          baseUrl: payload.apiBaseUrl.trim(),
          apiKey: payload.apiKey.trim(),
          model: payload.apiModel.trim(),
        }
      : null,
  };
}

function validatePayload(payload) {
  if (!payload?.domain?.trim()) {
    return "网站域名不能为空";
  }
  if (!payload?.cmsMode?.trim()) {
    return "CMS 模式不能为空";
  }
  if (!Array.isArray(payload.docxFiles) || payload.docxFiles.length === 0) {
    return "请至少选择一个 Word 文件";
  }
  if (payload.generationMode === "api") {
    if (!payload.apiBaseUrl?.trim()) {
      return "API 地址不能为空";
    }
    if (!payload.apiKey?.trim()) {
      return "API Key 不能为空";
    }
    if (!payload.apiModel?.trim()) {
      return "模型名称不能为空";
    }
  }
  return null;
}

export async function handleApiRequest(req, res, deps) {
  const {
    taskStore,
    taskQueue,
    runPythonTask,
    runOpenAiCompatTask,
    tasksRoot,
    outputRoot,
  } = deps;
  const url = new URL(req.url, "http://127.0.0.1");

  if (req.method === "GET" && url.pathname === "/api/tasks") {
    sendJson(res, 200, taskStore.list());
    return true;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/tasks/")) {
    const taskId = url.pathname.split("/").pop();
    const task = taskStore.get(taskId);
    if (!task) {
      sendJson(res, 404, { error: "任务不存在" });
      return true;
    }
    sendJson(res, 200, taskStore.serialize(task));
    return true;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/tasks/")) {
    const taskId = url.pathname.split("/").pop();
    const task = taskStore.get(taskId);
    if (!task) {
      sendJson(res, 404, { error: "任务不存在" });
      return true;
    }
    if (!["success", "failed"].includes(task.status)) {
      sendJson(res, 409, { error: "只能删除已完成或失败的任务" });
      return true;
    }
    taskStore.delete(taskId);
    sendJson(res, 200, { status: "deleted" });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/tasks") {
    try {
      const payload = await readJsonBody(req);
      const validationError = validatePayload(payload);
      if (validationError) {
        sendJson(res, 400, { error: validationError });
        return true;
      }

      const taskId = randomUUID();
      const taskDir = path.join(tasksRoot, taskId);
      const fileInfo = await writeInputFiles(taskDir, payload);
      const task = taskStore.create(buildTask(taskId, payload, fileInfo, outputRoot));

      taskQueue.enqueue(taskId, async () => {
        taskStore.markRunning(taskId);
        try {
          const result = await runPythonTask(task.runPayload, (line) => {
            taskStore.appendLog(taskId, line);
          });
          if (!task.apiConfig) {
            taskStore.markSuccess(taskId, result);
            return;
          }
          try {
            const finalResult = await runOpenAiCompatTask(task.apiConfig, result);
            taskStore.markSuccess(taskId, finalResult);
          } catch (error) {
            taskStore.markFailed(taskId, {
              ...result,
              error: `API 生成失败：${error.message || "未知错误"}`,
            });
          }
        } catch (error) {
          taskStore.markFailed(taskId, error);
        }
      });

      sendJson(res, 201, taskStore.serialize(task));
      return true;
    } catch (error) {
      sendJson(res, 400, { error: error.message || "创建任务失败" });
      return true;
    }
  }

  return false;
}
