import httpx
from bs4 import BeautifulSoup, Tag
from typing import List, Tuple, Optional
from urllib.parse import urljoin
from .models import MatchedLink, MatchType
from .url_utils import normalize_url, urls_match, resolve_relative_url
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)
import logging
import re

logger = logging.getLogger(__name__)


class LinkDetector:
    """链接检测器"""

    def __init__(
        self,
        target_url: str,
        ignore_tracking_params: bool = True,
        follow_redirects: bool = False,
        context_window: int = 50,
    ):
        self.normalized_target = normalize_url(target_url, ignore_tracking_params)
        self.original_target = target_url
        self.ignore_tracking_params = ignore_tracking_params
        self.follow_redirects = follow_redirects
        self.context_window = context_window

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=1, min=1, max=5),
        retry=retry_if_exception_type((httpx.NetworkError, httpx.TimeoutException)),
        reraise=True,
    )
    async def follow_link_and_get_final_url(
        self, url: str, client: httpx.AsyncClient
    ) -> str:
        """跟随链接获取最终URL"""
        try:
            response = await client.get(url, follow_redirects=True, timeout=10)
            return str(response.url)
        except Exception:
            return url

    def extract_context(self, a_tag: Tag, window_size: int) -> Tuple[str, str, str]:
        """提取链接周围的上下文"""
        # 获取父元素文本
        parent = a_tag.parent
        if parent is None or not parent.text:
            return ("", "", a_tag.get_text(strip=True))

        full_text = parent.get_text()
        a_text = a_tag.get_text() or ""

        # 找到链接在父文本中的位置
        if not full_text or not a_text:
            return ("", "", a_text)

        # 使用简单方法查找位置
        parts = full_text.split(a_text, 1)
        before = parts[0] if len(parts) > 0 else ""
        after = parts[1] if len(parts) > 1 else ""

        # 截取上下文窗口
        if len(before) > window_size:
            before = "..." + before[-window_size:]
        if len(after) > window_size:
            after = after[:window_size] + "..."

        full_context = f"{before}{a_text}{after}"
        return (before.strip(), after.strip(), full_context.strip())

    def match_link(self, href: str, current_page_url: str) -> Optional[MatchType]:
        """检查链接是否匹配目标URL"""
        absolute_href = resolve_relative_url(current_page_url, href)
        normalized_href = normalize_url(absolute_href, self.ignore_tracking_params)

        if normalized_href == self.normalized_target:
            return MatchType.EXACT

        if urls_match(absolute_href, self.original_target, self.ignore_tracking_params):
            return MatchType.NORMALIZED

        return None

    def analyze_page(
        self, html: str, page_url: str, page_title: Optional[str] = None
    ) -> List[MatchedLink]:
        """分析页面，找出所有匹配的链接"""
        soup = BeautifulSoup(html, "html.parser")
        matches: List[MatchedLink] = []

        if page_title is None:
            title_tag = soup.find("title")
            page_title = title_tag.get_text().strip() if title_tag else None

        a_tags = soup.find_all("a", href=True)

        for a_tag in a_tags:
            href = a_tag["href"]
            match_type = self.match_link(href, page_url)

            if match_type is not None:
                anchor_text = a_tag.get_text(strip=True)
                rel = a_tag.get("rel")
                if rel:
                    rel = " ".join(rel) if isinstance(rel, list) else rel
                target_attr = a_tag.get("target")

                context_before, context_after, full_context = self.extract_context(
                    a_tag, self.context_window
                )

                absolute_href = resolve_relative_url(page_url, href)

                matched_link = MatchedLink(
                    source_page_url=page_url,
                    source_page_title=page_title,
                    matched_href=absolute_href,
                    anchor_text=anchor_text,
                    rel=rel,
                    target=target_attr,
                    occurrence_count=1,
                    context_before=context_before,
                    context_after=context_after,
                    full_context=full_context,
                    match_type=match_type,
                )
                matches.append(matched_link)

        # 合并相同href的匹配，统计出现次数
        if len(matches) > 1:
            # 这里保持每个匹配独立，方便查看每个位置的上下文
            pass

        return matches
