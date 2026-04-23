import httpx
import xml.etree.ElementTree as ET
from typing import List, Set
from urllib.parse import urljoin
from .url_utils import normalize_url, is_same_domain
import logging

logger = logging.getLogger(__name__)

SITEMAP_NAMESPACES = {
    "sitemap": "http://www.sitemaps.org/schemas/sitemap/0.9",
    "sm": "http://www.sitemaps.org/schemas/sitemap/0.9",
}


async def fetch_sitemap(sitemap_url: str, client: httpx.AsyncClient) -> List[str]:
    """获取并解析sitemap，提取所有URL"""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
    }
    try:
        response = await client.get(sitemap_url, headers=headers, follow_redirects=True)
        if response.status_code != 200:
            logger.warning(
                f"Failed to fetch sitemap {sitemap_url}: status {response.status_code}"
            )
            return []

        content = response.text
        return parse_sitemap_content(content, sitemap_url)
    except Exception as e:
        logger.error(f"Error parsing sitemap {sitemap_url}: {str(e)}")
        return []


def parse_sitemap_content(content: str, base_url: str) -> List[str]:
    """解析sitemap内容，提取URL"""
    urls = []

    # 尝试解析XML
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        logger.warning(f"Failed to parse sitemap XML from {base_url}")
        return []

    # 检查是否是sitemap索引
    if root.tag.endswith("sitemapindex"):
        # 递归处理每个sitemap
        for sitemap_tag in root.findall(".//{*}loc"):
            sitemap_loc = sitemap_tag.text.strip() if sitemap_tag.text else ""
            if sitemap_loc:
                urls.append(sitemap_loc)
        return urls

    # 普通sitemap处理
    for url_tag in root.findall(".//{*}url"):
        loc_tag = url_tag.find(".//{*}loc")
        if loc_tag is not None and loc_tag.text:
            url = loc_tag.text.strip()
            urls.append(url)

    # 如果没找到，尝试不带namespace
    if not urls:
        for url_tag in root.findall(".//url"):
            loc_tag = url_tag.find("./loc")
            if loc_tag is not None and loc_tag.text:
                url = loc_tag.text.strip()
                urls.append(url)

    return urls


async def get_urls_from_sitemap(site_domain: str) -> Set[str]:
    """从站点获取所有URL，自动探测sitemap位置"""
    parsed_site = site_domain if "://" in site_domain else f"https://{site_domain}"
    parsed = parsed_site if parsed_site.endswith("/") else f"{parsed_site}/"

    possible_sitemap_urls = [
        urljoin(parsed, "sitemap.xml"),
        urljoin(parsed, "sitemap_index.xml"),
        urljoin(parsed, "sitemap"),
    ]

    all_urls: Set[str] = set()

    async with httpx.AsyncClient() as client:
        for sitemap_url in possible_sitemap_urls:
            try:
                urls = await fetch_sitemap(sitemap_url, client)
                if urls:
                    # 检查是否是sitemap索引
                    for url in urls:
                        if url.lower().endswith(".xml") or "sitemap" in url.lower():
                            # 嵌套sitemap
                            nested_urls = await fetch_sitemap(url, client)
                            for nested_url in nested_urls:
                                all_urls.add(normalize_url(nested_url))
                        else:
                            all_urls.add(normalize_url(url))

                    if all_urls:
                        logger.info(
                            f"Found {len(all_urls)} URLs from sitemap: {sitemap_url}"
                        )
                        break
            except Exception as e:
                logger.debug(f"Failed trying {sitemap_url}: {e}")
                continue

    # 过滤只保留站内URL
    domain = site_domain
    all_urls = {url for url in all_urls if is_same_domain(url, domain)}

    return all_urls
