import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)
from typing import Optional, Set, List, Tuple
from bs4 import BeautifulSoup
import logging
from urllib.parse import urljoin, urlparse
from .url_utils import is_internal_link, normalize_url, resolve_relative_url

logger = logging.getLogger(__name__)


class Crawler:
    """递归爬虫，用于发现站内所有页面"""

    def __init__(
        self,
        base_domain: str,
        max_depth: int = 10,
        max_pages: int = 1000,
        concurrency: int = 10,
        timeout: int = 30,
        headers: Optional[dict] = None,
    ):
        self.base_domain = base_domain
        self.max_depth = max_depth
        self.max_pages = max_pages
        self.concurrency = concurrency
        self.timeout = timeout
        self.headers = headers or {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
        }
        self.visited: Set[str] = set()
        self.queue: List[Tuple[str, int]] = []

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((httpx.NetworkError, httpx.TimeoutException)),
        reraise=True,
    )
    async def fetch_page(self, url: str, client: httpx.AsyncClient) -> Optional[str]:
        """获取页面内容，带重试"""
        try:
            response = await client.get(
                url, headers=self.headers, timeout=self.timeout, follow_redirects=True
            )
            if response.status_code != 200:
                logger.warning(f"Failed to fetch {url}: status {response.status_code}")
                return None

            content_type = response.headers.get("content-type", "")
            if "text/html" not in content_type.lower():
                logger.debug(f"Skipping non-HTML content: {url} ({content_type})")
                return None

            return response.text
        except Exception as e:
            logger.error(f"Error fetching {url}: {str(e)}")
            return None

    def extract_links(self, html: str, base_url: str) -> List[str]:
        """提取页面中所有站内链接"""
        soup = BeautifulSoup(html, "html.parser")
        links = []

        for a_tag in soup.find_all("a", href=True):
            href = a_tag["href"]
            if (
                not href
                or href.startswith("#")
                or href.startswith("javascript:")
                or href.startswith("mailto:")
                or href.startswith("tel:")
            ):
                continue

            absolute_url = resolve_relative_url(base_url, href)
            normalized_url = normalize_url(absolute_url)

            if (
                is_internal_link(self.base_domain, normalized_url)
                and normalized_url not in self.visited
            ):
                links.append(normalized_url)

        return list(set(links))

    async def discover_all_pages(self, start_url: Optional[str] = None) -> Set[str]:
        """发现所有站内页面"""
        if start_url is None:
            parsed = urlparse(
                self.base_domain
                if "://" in self.base_domain
                else f"https://{self.base_domain}"
            )
            start_url = f"{parsed.scheme}://{parsed.netloc}/"

        start_url = normalize_url(start_url)
        self.queue.append((start_url, 0))
        self.visited.add(start_url)

        async with httpx.AsyncClient(
            limits=httpx.Limits(max_connections=self.concurrency)
        ) as client:
            while self.queue and len(self.visited) < self.max_pages:
                current_batch = self.queue[: self.concurrency]
                self.queue = self.queue[self.concurrency :]

                for current_url, depth in current_batch:
                    if depth >= self.max_depth:
                        continue

                    html = await self.fetch_page(current_url, client)
                    if html is None:
                        continue

                    new_links = self.extract_links(html, current_url)

                    for link in new_links:
                        if (
                            link not in self.visited
                            and len(self.visited) < self.max_pages
                        ):
                            self.visited.add(link)
                            self.queue.append((link, depth + 1))

        logger.info(f"Discovered {len(self.visited)} pages")
        return self.visited
