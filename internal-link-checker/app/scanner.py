import asyncio
import time
import httpx
from typing import Set, List
from .models import ScanResult, ScanConfig, MatchedLink
from .sitemap import get_urls_from_sitemap
from .crawler import Crawler
from .link_detector import LinkDetector
from .url_utils import normalize_url
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)
import logging

logger = logging.getLogger(__name__)


class Scanner:
    """主扫描器"""

    def __init__(self, config: ScanConfig):
        self.config = config
        self.link_detector = LinkDetector(
            config.target_url,
            ignore_tracking_params=config.ignore_tracking_params,
            follow_redirects=config.follow_redirects,
            context_window=config.context_window,
        )

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((httpx.NetworkError, httpx.TimeoutException)),
        reraise=True,
    )
    async def fetch_page(self, url: str, client: httpx.AsyncClient) -> str | None:
        """获取页面内容"""
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
        }
        try:
            response = await client.get(
                url,
                headers=headers,
                timeout=self.config.timeout_seconds,
                follow_redirects=True,
            )
            if response.status_code != 200:
                logger.warning(f"Failed to fetch {url}: {response.status_code}")
                return None

            content_type = response.headers.get("content-type", "")
            if "text/html" not in content_type.lower():
                return None

            return response.text
        except Exception as e:
            logger.error(f"Error fetching {url}: {str(e)}")
            return None

    async def collect_urls(self) -> Set[str]:
        """收集需要扫描的所有URL"""
        urls: Set[str] = set()

        if self.config.use_sitemap:
            logger.info("Trying to get URLs from sitemap...")
            urls = await get_urls_from_sitemap(self.config.site_domain)

        if not urls:
            logger.info(
                "No sitemap found or sitemap is empty, starting recursive crawl..."
            )
            crawler = Crawler(
                base_domain=self.config.site_domain,
                max_depth=self.config.max_depth,
                max_pages=self.config.max_pages,
                concurrency=self.config.concurrency,
            )
            urls = await crawler.discover_all_pages()

        # 限制最大页面数
        if len(urls) > self.config.max_pages:
            logger.info(
                f"Limiting to {self.config.max_pages} pages out of {len(urls)} discovered"
            )
            urls = set(list(urls)[: self.config.max_pages])

        return urls

    async def scan(self) -> ScanResult:
        """执行扫描"""
        start_time = time.time()
        errors: List[str] = []

        # 收集所有URL
        try:
            urls = await self.collect_urls()
        except Exception as e:
            logger.error(f"Error collecting URLs: {str(e)}")
            errors.append(f"Error collecting URLs: {str(e)}")
            urls = set()

        total_pages = len(urls)
        all_matches: List[MatchedLink] = []

        logger.info(f"Starting scan of {total_pages} pages...")

        # 并发扫描
        semaphore = asyncio.Semaphore(self.config.concurrency)

        async def scan_page(url: str) -> List[MatchedLink]:
            async with semaphore:
                try:
                    async with httpx.AsyncClient() as client:
                        html = await self.fetch_page(url, client)
                        if html:
                            matches = self.link_detector.analyze_page(html, url)
                            return matches
                        return []
                except Exception as e:
                    logger.error(f"Error scanning {url}: {str(e)}")
                    errors.append(f"{url}: {str(e)}")
                    return []

        # 创建任务
        tasks = [scan_page(url) for url in urls]
        results = await asyncio.gather(*tasks)

        # 收集所有匹配
        for result in results:
            all_matches.extend(result)

        total_matches = len(all_matches)
        duration = time.time() - start_time

        logger.info(
            f"Scan completed in {duration:.2f}s. Found {total_matches} matches in {total_pages} pages."
        )

        return ScanResult(
            target_url=self.config.target_url,
            site_domain=self.config.site_domain,
            total_pages_scanned=total_pages,
            total_matches=total_matches,
            matches=all_matches,
            scan_duration_seconds=round(duration, 2),
            errors=errors,
        )
