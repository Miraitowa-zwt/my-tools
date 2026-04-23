#!/usr/bin/env python3
import asyncio
import argparse
import json
import sys
from typing import Optional
from .models import ScanConfig, ScanResult
from .scanner import Scanner
import logging


def setup_logging(verbose: bool = False):
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )


async def run_scan(args) -> ScanResult:
    config = ScanConfig(
        target_url=args.target_url,
        site_domain=args.site_domain,
        use_sitemap=not args.no_sitemap,
        follow_redirects=args.follow_redirects,
        ignore_tracking_params=not args.keep_tracking_params,
        max_depth=args.max_depth,
        max_pages=args.max_pages,
        concurrency=args.concurrency,
        timeout_seconds=args.timeout,
        context_window=args.context_window,
    )

    scanner = Scanner(config)
    result = await scanner.scan()
    return result


def main():
    parser = argparse.ArgumentParser(
        description="站内已添加链接检测工具 - 检测站点内哪些页面已经链接到目标URL"
    )
    parser.add_argument("target_url", help="要检测的目标URL")
    parser.add_argument("site_domain", help="要扫描的站点域名")

    parser.add_argument(
        "--no-sitemap", action="store_true", help="不使用sitemap，强制递归爬取"
    )
    parser.add_argument(
        "--follow-redirects", action="store_true", help="跟随跳转检查最终URL是否匹配"
    )
    parser.add_argument(
        "--keep-tracking_params", action="store_true", help="保留utm等跟踪参数"
    )
    parser.add_argument(
        "--max-depth", type=int, default=10, help="最大爬取深度 (默认: 10)"
    )
    parser.add_argument(
        "--max-pages", type=int, default=1000, help="最大扫描页面数 (默认: 1000)"
    )
    parser.add_argument("--concurrency", type=int, default=10, help="并发数 (默认: 10)")
    parser.add_argument(
        "--timeout", type=int, default=30, help="请求超时秒数 (默认: 30)"
    )
    parser.add_argument(
        "--context-window", type=int, default=50, help="上下文字符数窗口 (默认: 50)"
    )
    parser.add_argument("--output", "-o", help="输出JSON文件路径 (默认: stdout)")
    parser.add_argument("--verbose", "-v", action="store_true", help="显示详细日志")

    args = parser.parse_args()

    setup_logging(args.verbose)

    try:
        result = asyncio.run(run_scan(args))
    except KeyboardInterrupt:
        print("\nScan interrupted by user", file=sys.stderr)
        sys.exit(1)

    # 输出JSON
    output_json = json.dumps(result.model_dump(), indent=2, ensure_ascii=False)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output_json)
        print(f"Result saved to {args.output}")
    else:
        print(output_json)

    # 打印统计
    print(f"\nSummary:", file=sys.stderr)
    print(f"  Pages scanned: {result.total_pages_scanned}", file=sys.stderr)
    print(f"  Total matches: {result.total_matches}", file=sys.stderr)
    print(f"  Time elapsed: {result.scan_duration_seconds}s", file=sys.stderr)


if __name__ == "__main__":
    main()
