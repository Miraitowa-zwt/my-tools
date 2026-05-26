import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runPythonTask } from "./pythonRunner.js";
import { runOpenAiCompatTask } from "./openAiCompatRunner.js";
import { handleApiRequest } from "./routes.js";
import { TaskQueue } from "./taskQueue.js";
import { TaskStore } from "./taskStore.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_ROOT = path.resolve(__dirname, "..");
const PUBLIC_ROOT = path.join(WEB_ROOT, "public");
const OPS_ROOT = path.resolve(WEB_ROOT, "..");
const TASKS_ROOT = path.join(OPS_ROOT, "data", "tasks");
const OUTPUT_ROOT = path.join(OPS_ROOT, "output");
const PORT = Number(process.env.PORT || "3210");

const taskStore = new TaskStore();
const taskQueue = new TaskQueue();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  const reqPath = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  const filePath = path.join(PUBLIC_ROOT, path.normalize(reqPath));
  if (!filePath.startsWith(PUBLIC_ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(file);
  } catch {
    res.writeHead(404, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    res.end("Not Found");
  }
}

async function start() {
  await fs.mkdir(TASKS_ROOT, { recursive: true });
  await fs.mkdir(OUTPUT_ROOT, { recursive: true });

  const server = http.createServer(async (req, res) => {
    const handled = await handleApiRequest(req, res, {
      taskStore,
      taskQueue,
      runPythonTask,
      runOpenAiCompatTask,
      tasksRoot: TASKS_ROOT,
      outputRoot: OUTPUT_ROOT,
    });
    if (handled) {
      return;
    }
    await serveStatic(req, res);
  });

  server.listen(PORT, () => {
    console.log(`Ops Tool web is running at http://127.0.0.1:${PORT}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
