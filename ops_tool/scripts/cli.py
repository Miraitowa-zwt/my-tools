from __future__ import annotations

import json
import sys
import traceback

from pipeline import run_task


def main() -> int:
    if len(sys.argv) < 2:
        error = {"status": "failed", "error": "缺少任务参数"}
        print(f"OPS_TOOL_RESULT_JSON: {json.dumps(error, ensure_ascii=False)}")
        return 1

    payload = json.loads(sys.argv[1])
    try:
        result = run_task(
            domain=payload["domain"],
            cms_mode=payload["cms_mode"],
            docx_files=payload["docx_files"],
            keyword_file=payload.get("keyword_file"),
            output_dir=payload["output_dir"],
        )
        print(f"OPS_TOOL_RESULT_JSON: {json.dumps(result, ensure_ascii=False)}")
        return 0
    except Exception as exc:
        error = {
            "status": "failed",
            "error": str(exc),
            "traceback": traceback.format_exc(),
        }
        print(f"OPS_TOOL_RESULT_JSON: {json.dumps(error, ensure_ascii=False)}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
