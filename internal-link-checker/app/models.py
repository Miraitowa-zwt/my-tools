from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class MatchType(str, Enum):
    EXACT = "exact"
    NORMALIZED = "normalized"
    REDIRECT = "redirect"


class MatchedLink(BaseModel):
    """单个匹配链接的数据结构"""

    source_page_url: str
    source_page_title: Optional[str] = None
    matched_href: str
    anchor_text: str = ""
    rel: Optional[str] = None
    target: Optional[str] = None
    occurrence_count: int = 1
    context_before: str = ""
    context_after: str = ""
    full_context: str = ""
    match_type: MatchType


class ScanResult(BaseModel):
    """扫描结果整体结构"""

    target_url: str
    site_domain: str
    total_pages_scanned: int = 0
    total_matches: int = 0
    matches: list[MatchedLink] = []
    scan_duration_seconds: float = 0.0
    errors: list[str] = []


class ScanConfig(BaseModel):
    """扫描配置"""

    target_url: str
    site_domain: str
    use_sitemap: bool = True
    follow_redirects: bool = False
    ignore_tracking_params: bool = True
    max_depth: int = 10
    max_pages: int = 1000
    concurrency: int = 10
    timeout_seconds: int = 30
    context_window: int = 50
