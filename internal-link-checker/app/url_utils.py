from urllib.parse import urlparse, urlunparse, urljoin, parse_qs, urlencode
from typing import Optional
import re


TRACKING_PARAMS = {
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "gclid",
    "gclsrc",
    "dclid",
    "fbclid",
    "mc_cid",
    "mc_eid",
    "_ga",
    "_gl",
    "zanpid",
    "clkid",
    "msclkid",
}


def normalize_url(
    url: str, ignore_tracking_params: bool = True, normalize_trailing_slash: bool = True
) -> str:
    """标准化URL"""
    parsed = urlparse(url)

    # 统一scheme小写
    scheme = parsed.scheme.lower()
    netloc = parsed.netloc.lower()

    # 移除默认端口
    if (scheme == "http" and parsed.port == 80) or (
        scheme == "https" and parsed.port == 443
    ):
        netloc = netloc.split(":")[0]

    path = parsed.path
    if normalize_trailing_slash:
        if len(path) > 1 and path.endswith("/"):
            path = path[:-1]
        elif len(path) == 0:
            path = "/"

    # 处理查询参数
    query = parsed.query
    if ignore_tracking_params and query:
        params = parse_qs(query, keep_blank_values=True)
        filtered_params = {
            k: v for k, v in params.items() if k.lower() not in TRACKING_PARAMS
        }
        query = urlencode(filtered_params, doseq=True) if filtered_params else ""

    fragments = ""  # 移除fragment

    return urlunparse((scheme, netloc, path, "", query, fragments))


def urls_match(
    url1: str,
    url2: str,
    ignore_tracking_params: bool = True,
    normalize_trailing_slash: bool = True,
) -> bool:
    """检查两个URL是否匹配（标准化后）"""
    normalized1 = normalize_url(url1, ignore_tracking_params, normalize_trailing_slash)
    normalized2 = normalize_url(url2, ignore_tracking_params, normalize_trailing_slash)
    return normalized1 == normalized2


def is_same_domain(url: str, domain: str) -> bool:
    """检查URL是否属于指定域名"""
    parsed_url = urlparse(url)
    parsed_domain = urlparse(domain if "://" in domain else f"https://{domain}")

    url_netloc = parsed_url.netloc.lower()
    domain_netloc = parsed_domain.netloc.lower()

    # 移除www前缀比较
    def clean_netloc(netloc: str) -> str:
        return netloc.removeprefix("www.")

    return clean_netloc(url_netloc) == clean_netloc(domain_netloc)


def resolve_relative_url(base_url: str, relative_url: str) -> str:
    """将相对路径转为绝对URL"""
    return urljoin(base_url, relative_url)


def extract_domain(url: str) -> str:
    """从URL提取域名"""
    parsed = urlparse(url if "://" in url else f"https://{url}")
    return parsed.netloc.lower()


def is_internal_link(base_domain: str, url: str) -> bool:
    """判断是否为站内链接"""
    if (
        not url
        or url.startswith("#")
        or url.startswith("javascript:")
        or url.startswith("mailto:")
        or url.startswith("tel:")
    ):
        return False

    if "://" not in url:
        return True

    return is_same_domain(url, base_domain)
