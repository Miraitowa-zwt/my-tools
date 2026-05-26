import { spawn } from "node:child_process";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OPS_ROOT = path.resolve(__dirname, "..", "..");
const CLI_PATH = path.resolve(OPS_ROOT, "scripts", "cli.py");
const RESULT_PREFIX = "OPS_TOOL_RESULT_JSON: ";

export function buildPythonEnv(baseEnv = process.env) {
  return {
    ...baseEnv,
    PYTHONIOENCODING: "utf-8",
    PYTHONUTF8: "1",
  };
}

export function createUtf8LineBuffer(onLine) {
  const decoder = new StringDecoder("utf8");
  let remainder = "";

  return {
    push(chunk) {
      const buffer = remainder + decoder.write(chunk);
      const lines = buffer.split(/\r?\n/);
      remainder = lines.pop() ?? "";
      lines.forEach(onLine);
    },
    end() {
      const tail = remainder + decoder.end();
      remainder = "";
      if (tail) {
        onLine(tail);
      }
    },
  };
}

export function runPythonTask(payload, onLog) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.PYTHON || "python", [
      CLI_PATH,
      JSON.stringify(payload),
    ], {
      env: buildPythonEnv(),
    });

    let result = null;
    const handleLine = (line) => {
      if (!line) {
        return;
      }

      if (line.startsWith(RESULT_PREFIX)) {
        try {
          result = JSON.parse(line.slice(RESULT_PREFIX.length));
        } catch (error) {
          result = {
            status: "failed",
            error: `结果解析失败: ${error.message}`,
          };
        }
        return;
      }

      onLog(`${line}\n`);
    };

    const stdoutBuffer = createUtf8LineBuffer(handleLine);
    const stderrBuffer = createUtf8LineBuffer(handleLine);

    const wireStream = (stream, lineBuffer) => {
      stream.on("data", (chunk) => {
        lineBuffer.push(chunk);
      });
    };

    wireStream(child.stdout, stdoutBuffer);
    wireStream(child.stderr, stderrBuffer);

    child.on("close", (code) => {
      stdoutBuffer.end();
      stderrBuffer.end();

      if (!result) {
        const fallback = {
          status: "failed",
          error: code === 0 ? "未收到结果输出" : "Python 任务执行失败",
        };
        reject(fallback);
        return;
      }

      if (code === 0 && result.status === "success") {
        resolve(result);
        return;
      }

      reject(result);
    });
  });
}
