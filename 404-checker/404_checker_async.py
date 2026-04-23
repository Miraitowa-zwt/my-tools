#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
404链接检查器 - 异步版本
使用asyncio和aiohttp提供更好的并发性能
"""

import argparse
import asyncio
import aiohttp
import requests
from urllib.parse import urlparse, urljoin
from bs4 import BeautifulSoup
import sys
from typing import List, Tuple, Dict, Optional
from dataclasses import dataclass
from tqdm.asyncio import tqdm_asyncio


@dataclass
class LinkCheckResult:
    url: str
    status: int
    is_valid: bool
    error_message: str = ""


class AsyncFourOhFourChecker:
    def __init__(
        self, timeout: int = 10, max_concurrent: int = 50, verbose: bool = False
    ):
        self.timeout = timeout
        self.max_concurrent = max_concurrent
        self.verbose = verbose
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }

    async def check_single_url(
        self, url: str, session: aiohttp.ClientSession
    ) -> LinkCheckResult:
        """异步检查单个URL是否有效"""
        try:
            async with session.head(
                url, allow_redirects=True, timeout=self.timeout
            ) as response:
                is_valid = 200 <= response.status < 400
                return LinkCheckResult(
                    url=url, status=response.status, is_valid=is_valid
                )
        except Exception as e:
            return LinkCheckResult(
                url=url, status=-1, is_valid=False, error_message=str(e)
            )

    def extract_links_from_page(self, base_url: str) -> List[str]:
        """从网页中提取所有链接"""
        try:
            response = requests.get(
                base_url, headers=self.headers, timeout=self.timeout
            )
            response.raise_for_status()
            soup = BeautifulSoup(response.text, "html.parser")

            links = []
            for a_tag in soup.find_all("a", href=True):
                href = a_tag["href"]
                full_url = urljoin(base_url, href)
                # 只保留HTTP/HTTPS链接
                parsed = urlparse(full_url)
                if parsed.scheme in ("http", "https"):
                    links.append(full_url)

            return list(set(links))  # 去重
        except Exception as e:
            if self.verbose:
                print(f"提取链接失败 {base_url}: {e}", file=sys.stderr)
            return []

    async def check_urls_async(self, urls: List[str]) -> List[LinkCheckResult]:
        """异步并发检查多个URL"""
        urls = list(set(urls))  # 去重
        connector = aiohttp.TCPConnector(limit=self.max_concurrent)

        async with aiohttp.ClientSession(
            headers=self.headers, connector=connector
        ) as session:
            tasks = [self.check_single_url(url, session) for url in urls]

            if self.verbose:
                results = await tqdm_asyncio.gather(*tasks, desc="检查链接")
            else:
                results = await asyncio.gather(*tasks)

        return results

    async def check_page_links(
        self, url: str
    ) -> Tuple[List[LinkCheckResult], List[LinkCheckResult]]:
        """提取并检查页面中的所有链接，返回有效和无效列表"""
        if self.verbose:
            print(f"正在从 {url} 提取链接...")
        links = self.extract_links_from_page(url)

        if self.verbose:
            print(f"找到 {len(links)} 个唯一链接，开始检查...")
        results = await self.check_urls_async(links)

        valid = [r for r in results if r.is_valid]
        invalid = [r for r in results if not r.is_valid]

        return valid, invalid


def read_urls_from_file(file_path: str) -> List[str]:
    """从文件读取URL列表，每行一个URL"""
    with open(file_path, "r", encoding="utf-8") as f:
        urls = []
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                urls.append(line)
        return urls


def print_results(
    valid: List[LinkCheckResult],
    invalid: List[LinkCheckResult],
    output_file: str = None,
):
    """打印检查结果"""
    total = len(valid) + len(invalid)
    output = []
    output.append("=" * 60)
    output.append(f"链接检查完成，共检查 {total} 个链接")
    output.append(f"[OK] 有效链接: {len(valid)}")
    output.append(f"[FAIL] 无效链接: {len(invalid)}")
    output.append("=" * 60)

    if invalid:
        output.append("\n无效链接列表:")
        output.append("-" * 60)
        output.append(f"{'状态码':<8} {'URL'}")
        output.append("-" * 60)
        for result in invalid:
            status = result.status if result.status != -1 else "ERROR"
            output.append(f"{status:<8} {result.url}")
            if result.error_message:
                output.append(f"        错误: {result.error_message}")

    full_output = "\n".join(output)
    # 处理Windows编码问题
    try:
        print(full_output)
    except UnicodeEncodeError:
        full_output = full_output.replace("[OK]", "OK").replace("[FAIL]", "FAIL")
        print(full_output)

    if output_file:
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(full_output)
        print(f"\n结果已保存到: {output_file}")


async def main_async():
    parser = argparse.ArgumentParser(
        description="404链接检查器 - 异步版本 - 批量检查网页中的坏链接"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("-u", "--url", help="要检查的网页URL")
    group.add_argument("-f", "--file", help="包含URL列表的文件（每行一个URL）")
    parser.add_argument("-o", "--output", help="结果输出文件路径")
    parser.add_argument(
        "-t", "--timeout", type=int, default=10, help="请求超时时间（秒），默认10秒"
    )
    parser.add_argument(
        "-c", "--concurrent", type=int, default=50, help="最大并发数，默认50"
    )
    parser.add_argument(
        "-v", "--verbose", action="store_true", default=True, help="显示详细进度"
    )
    args = parser.parse_args()

    checker = AsyncFourOhFourChecker(
        timeout=args.timeout, max_concurrent=args.concurrent, verbose=args.verbose
    )

    if args.url:
        # 检查单个页面中的所有链接
        valid, invalid = await checker.check_page_links(args.url)
        print_results(valid, invalid, args.output)
    elif args.file:
        # 批量检查文件中的URL列表
        urls = read_urls_from_file(args.file)
        if args.verbose:
            print(f"从文件读取到 {len(urls)} 个URL")
        results = await checker.check_urls_async(urls)
        valid = [r for r in results if r.is_valid]
        invalid = [r for r in results if not r.is_valid]
        print_results(valid, invalid, args.output)

    # 返回退出码
    if len(invalid) > 0:
        sys.exit(1)
    else:
        sys.exit(0)


def main():
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
