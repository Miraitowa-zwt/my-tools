import requests
import xml.etree.ElementTree as ET
import re
import os
import gzip
import sys
import builtins
import tempfile
import zipfile
import mammoth
import json
import csv
from urllib.parse import urlparse, urljoin
from bs4 import BeautifulSoup
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass
from collections import defaultdict
from datetime import datetime


def safe_print(*args, sep=" ", end="\n", file=None, flush=False):
    """在不支持部分字符的终端中也能安全输出提示"""
    target = file or sys.stdout
    text = sep.join(str(arg) for arg in args)
    try:
        builtins.print(text, end=end, file=target, flush=flush)
    except UnicodeEncodeError:
        encoding = getattr(target, "encoding", None) or "utf-8"
        safe_text = text.encode(encoding, errors="replace").decode(
            encoding, errors="replace"
        )
        builtins.print(safe_text, end=end, file=target, flush=flush)


print = safe_print


# ═══════════════════════════════════════════════════════════════════
# PART 0: 配置常量
# ═══════════════════════════════════════════════════════════════════

# 链接限制配置
LINK_LIMITS = {
    "max_per_article": 15,  # 每篇文章最多15个链接（不强制满足）
    "max_external": 3,  # 外链最多3个
    "min_distance": 80,  # 链接间最小字符距离
}

# 多语言URL过滤
KNOWN_FUNCTIONAL_PATHS = {
    "products",
    "collections",
    "blogs",
    "pages",
    "cart",
    "account",
    "search",
    "policies",
    "apps",
    "tools",
    "cdn",
    "checkouts",
    "discount",
    "password",
    "challenge",
    "gift_cards",
    "variants",
    "sitemap.xml",
    "about",
    "contact",
    "faq",
    "help",
    "support",
    "news",
    "category",
    "tag",
    "author",
    "archive",
    "shop",
    "store",
    "sale",
    "new",
    "best-sellers",
}

NON_LOCALE_SLUGS = {
    "uv",
    "tv",
    "pc",
    "hd",
    "4k",
    "8k",
    "ai",
    "pro",
    "max",
    "new",
    "hot",
    "top",
    "all",
}

LOCALE_PATTERN = re.compile(r"^[a-z]{2,3}(-[a-z]{2,4})?$", re.IGNORECASE)

CMS_MODES = {
    "shopify": {
        "product": ["/products/"],
        "collection": ["/collections/"],
        "blog": ["/blogs/", "/pages/"],
        "patterns": {},
        "description": "Shopify - 默认模式",
    },
    "wordpress": {
        "product": [
            "/product/",
            "/products/",
            "/all-products/",
            "/item/",
            "/catalog/product/",
        ],
        "collection": [
            "/product-category/",
            "/product-tag/",
            "/product-categories/",
            "/all-product-categories/",
            "/product_cat/",
            "/product_tag/",
            "/category/",
        ],
        "blog": [
            "/category/",
            "/tag/",
            "/blog/",
            "/page/",
            "/post/",
            "/posts/",
            "/news/",
            "/archive/",
        ],
        "patterns": {},
        "description": "WordPress + WooCommerce",
    },
    "odoo": {
        "product": [
            "/shop/product/",
            "/shop/",
        ],
        "collection": [
            "/shop/category/",
        ],
        "blog": [
            "/blog/",
            "/page/",
            "/event/",
            "/forum/",
            "/slides/",
        ],
        "patterns": {},
        "description": "Odoo - 开源企业级电商",
    },
    "custom": {
        "product": [
            "/product/",
            "/products/",
            "/item/",
            "/items/",
            "/goods/",
            "/shop/",
        ],
        "collection": [
            "/category/",
            "/categories/",
            "/collection/",
            "/collections/",
            "/series/",
            "/group/",
        ],
        "blog": [
            "/blog/",
            "/blogs/",
            "/article/",
            "/articles/",
            "/news/",
            "/post/",
            "/posts/",
            "/page/",
            "/pages/",
            "/about",
            "/help/",
            "/support/",
            "/faq",
        ],
        "patterns": {
             "product": [
                 re.compile(r"-p\d+\.html?$", re.IGNORECASE),
                 re.compile(r"-product-\d+\.html?$", re.IGNORECASE),
                 re.compile(r"_p\d+\.html?$", re.IGNORECASE),
                 re.compile(r"/p/\d+", re.IGNORECASE),
                 re.compile(r"/pid/\d+", re.IGNORECASE),
             ],
             "collection": [
                 re.compile(r"-c\d+\.html?$", re.IGNORECASE),
                 re.compile(r"-cat-\d+\.html?$", re.IGNORECASE),
                 re.compile(r"-category-\d+\.html?$", re.IGNORECASE),
                 re.compile(r"_cat\d+\.html?$", re.IGNORECASE),
                 re.compile(r"_c\d+\.html?$", re.IGNORECASE),
                 re.compile(r"/c/\d+", re.IGNORECASE),
                 re.compile(r"/cid/\d+", re.IGNORECASE),
             ],
             "blog": [
                 re.compile(r"-news-\d+\.html?$", re.IGNORECASE),
                 re.compile(r"-article-\d+\.html?$", re.IGNORECASE),
                 re.compile(r"-post-\d+\.html?$", re.IGNORECASE),
                 re.compile(r"-n\d+\.html?$", re.IGNORECASE),
                 re.compile(r"/News/n/", re.IGNORECASE),
                 re.compile(r"/Blog/n/", re.IGNORECASE),
             ],
         },
        "description": "自建站 - 通用模式（支持 -p123.html / -c123.html 等格式）",
    },
}


# ═══════════════════════════════════════════════════════════════════
# PART 1: 关键词链接模块
# ═══════════════════════════════════════════════════════════════════


@dataclass
class KeywordConfig:
    """关键词配置"""

    word: str
    link_type: str  # 'collection', 'product', 'blog', 'external'
    url: str
    priority: int = 3
    variants: Optional[List[str]] = None

    def __post_init__(self):
        if self.variants is None:
            self.variants = []

    def get_all_match_words(self) -> List[str]:
        """返回所有需要匹配的词语（包括变体）"""
        return [self.word] + (self.variants or [])


class SmartKeywordLinker:
    """
    智能关键词链接器
    - 每篇文章最多15个链接（不强制满足）
    - 外链最多3个
    - 商业词优先链接到集合页/产品页
    - 自动选择最合适的链接位置
    """

    def __init__(self, configs: List[KeywordConfig]):
        self.configs = configs
        # 按词长降序排列，优先匹配长尾词
        self.configs.sort(key=lambda x: len(x.word), reverse=True)

        # 编译正则表达式
        self.patterns = {}
        for config in configs:
            for word in config.get_all_match_words():
                escaped = re.escape(word)
                self.patterns[word.lower()] = re.compile(
                    r"(?<![\w-])" + escaped + r"(?![\w-])", re.IGNORECASE
                )

    def link_article(self, html: str, article_id: str = "") -> Tuple[str, List[Dict]]:
        """
        为单篇文章添加链接
        返回: (优化后的HTML, 添加的链接列表)
        """
        added_links = []

        existing_link_count = self._count_existing_links(html)
        remaining_limit = max(0, LINK_LIMITS["max_per_article"] - existing_link_count)
        if remaining_limit <= 0:
            return html, []

        existing_anchors = self._get_existing_anchor_texts(html)

        # 第一步：找出所有候选位置
        candidates = self._find_candidates(html, existing_anchors)

        if not candidates:
            return html, []

        # 第二步：智能选择最优链接
        selected = self._select_links(candidates, html, existing_anchors, remaining_limit)

        # 第三步：应用链接（从后往前替换）
        result_html = self._apply_links(html, selected)

        # 记录添加的链接
        for sel in selected:
            added_links.append(
                {
                    "word": sel["word"],
                    "url": sel["config"].url,
                    "type": sel["config"].link_type,
                    "position": sel["start"],
                }
            )

        return result_html, added_links

    def _find_candidates(self, html: str, existing_anchors: set) -> List[Dict]:
        """找出所有可能的链接位置"""
        candidates = []

        # 跳过第一段（首段禁链）
        first_p_end = self._find_first_paragraph_end(html)
        search_start = first_p_end if first_p_end > 0 else 0

        for config in self.configs:
            for word in config.get_all_match_words():
                pattern = self.patterns.get(word.lower())
                if not pattern:
                    continue

                for match in pattern.finditer(html, search_start):
                    anchor_key = self._normalize_anchor(match.group())
                    if anchor_key in existing_anchors:
                        continue

                    # 检查是否在HTML标签内
                    if self._is_inside_tag(html, match.start()):
                        continue

                    # 检查是否在已有链接、标题或列表内
                    if self._is_inside_existing_link(html, match.start()):
                        continue
                    if self._is_inside_element(html, match.start(), ["h1", "h2", "h3", "h4", "h5", "h6", "li"]):
                        continue

                    # 检查上下文（避免在标题、列表中添加链接）
                    context_score = self._score_context(
                        html, match.start(), match.end()
                    )
                    if context_score < 0:
                        continue

                    candidates.append(
                        {
                            "word": word,
                            "original": match.group(),
                            "start": match.start(),
                            "end": match.end(),
                            "config": config,
                            "context_score": context_score,
                            "base_score": config.priority * 10,
                        }
                    )

        return candidates

    def _count_existing_links(self, html: str) -> int:
        """统计原文中已经存在的链接数量"""
        soup = BeautifulSoup(html, "html.parser")
        return len(soup.find_all("a", href=True))

    def _get_existing_anchor_texts(self, html: str) -> set:
        """获取原文已有链接文字，避免重复添加相同锚文本"""
        soup = BeautifulSoup(html, "html.parser")
        return {
            self._normalize_anchor(link.get_text(" ", strip=True))
            for link in soup.find_all("a")
            if link.get_text(" ", strip=True)
        }

    def _normalize_anchor(self, text: str) -> str:
        """统一锚文本格式，便于判断重复"""
        return re.sub(r"\s+", " ", text or "").strip().lower()

    def _find_first_paragraph_end(self, html: str) -> int:
        """找到第一个段落的结束位置"""
        match = re.search(r"</p>", html, re.IGNORECASE)
        if match:
            return match.end()
        return 0

    def _is_inside_tag(self, html: str, pos: int) -> bool:
        """检查位置是否在HTML标签内"""
        before = html[:pos]
        in_tag = False
        for char in before:
            if char == "<":
                in_tag = True
            elif char == ">":
                in_tag = False
        return in_tag

    def _is_inside_existing_link(self, html: str, pos: int) -> bool:
        """检查位置是否在已有链接内部"""
        before = html[:pos].lower()
        last_link_open = before.rfind("<a")
        last_link_close = before.rfind("</a>")
        return last_link_open > last_link_close

    def _is_inside_element(self, html: str, pos: int, tag_names: List[str]) -> bool:
        """检查位置是否在指定HTML元素内部"""
        before = html[:pos].lower()
        for tag in tag_names:
            last_open = max(
                before.rfind(f"<{tag}>"),
                before.rfind(f"<{tag} "),
            )
            last_close = before.rfind(f"</{tag}>")
            if last_open > last_close:
                return True
        return False

    def _score_context(self, html: str, start: int, end: int) -> int:
        """
        评分上下文质量
        正分：好的上下文
        负分：避免在此添加链接
        """
        context_before = html[max(0, start - 100) : start]
        context_after = html[end : min(len(html), end + 50)]

        score = 0

        # 避免在H2/H3标题内或附近
        if re.search(r"<h[23][^>]*>[^<]*$", context_before, re.I):
            return -100

        # 避免在列表项内
        if "<li>" in context_before[-20:] or "</li>" in context_after[:20]:
            score -= 20

        # 避免在已有链接附近
        if "<a " in context_before or "</a>" in context_after:
            score -= 30

        # 优先在正文段落中
        if "<p>" in context_before[-10:]:
            score += 10

        # 商业词在靠近"buy", "purchase", "shop"等词附近加分
        buy_indicators = [
            "buy",
            "purchase",
            "shop",
            "get",
            "upgrade",
            "choose",
            "select",
        ]
        if any(
            ind in (context_before + context_after).lower() for ind in buy_indicators
        ):
            score += 15

        return score

    def _select_links(
        self,
        candidates: List[Dict],
        html: str,
        existing_anchors: set,
        remaining_limit: int,
    ) -> List[Dict]:
        """
        智能选择最优链接
        """
        if not candidates:
            return []

        # 计算综合得分
        for cand in candidates:
            html_before = html[: cand["start"]]
            if cand["word"].lower() not in html_before.lower():
                cand["first_occurrence"] = True
                cand["total_score"] = cand["base_score"] + cand["context_score"] + 20
            else:
                cand["first_occurrence"] = False
                cand["total_score"] = cand["base_score"] + cand["context_score"]

            # 商业词加分
            if cand["config"].link_type in ["collection", "product"]:
                cand["total_score"] += 15

            # 外链减分（限制数量）
            if cand["config"].link_type == "external":
                cand["total_score"] -= 5

        # 按得分排序
        candidates.sort(key=lambda x: x["total_score"], reverse=True)

        selected = []
        external_count = 0
        used_info_urls = set()
        used_anchor_texts = set(existing_anchors)

        for cand in candidates:
            if len(selected) >= remaining_limit:
                break

            config = cand["config"]
            anchor_key = self._normalize_anchor(cand["original"])

            # 锚文本唯一：同一个词或短语在一篇文章内只加一次
            if anchor_key in used_anchor_texts:
                continue

            # 检查距离冲突
            if self._has_distance_conflict(cand, selected, LINK_LIMITS["min_distance"]):
                continue

            # 类型限制
            if config.link_type == "external":
                if external_count >= LINK_LIMITS["max_external"]:
                    continue
                external_count += 1

            # 信息链接URL唯一性
            if config.link_type in ["blog", "external"]:
                if config.url in used_info_urls:
                    continue
                used_info_urls.add(config.url)

            selected.append(cand)
            used_anchor_texts.add(anchor_key)

        # 按位置排序（从后往前方便替换）
        selected.sort(key=lambda x: x["start"], reverse=True)

        return selected

    def _has_distance_conflict(
        self, candidate: Dict, selected: List[Dict], min_dist: int
    ) -> bool:
        """检查是否与已选链接距离太近"""
        for sel in selected:
            distance = min(
                abs(candidate["start"] - sel["end"]),
                abs(candidate["end"] - sel["start"]),
            )
            if distance < min_dist:
                return True
        return False

    def _apply_links(self, html: str, selected: List[Dict]) -> str:
        """应用选中的链接"""
        result = html

        for item in selected:
            config = item["config"]
            original = item["original"]
            start = item["start"]
            end = item["end"]

            # 构建链接属性
            attrs = [f'href="{config.url}"']
            attrs.append(f'title="{config.word}"')

            # 外链添加nofollow和target
            if config.link_type == "external":
                attrs.append('rel="nofollow"')
                attrs.append('target="_blank"')

            link_html = f"<a {' '.join(attrs)}>{original}</a>"
            result = result[:start] + link_html + result[end:]

        return result


def load_keywords_from_csv(filepath: str) -> List[KeywordConfig]:
    """从CSV文件加载关键词"""
    configs = []

    with open(filepath, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            variants = row.get("variants", "").split("|") if row.get("variants") else []
            configs.append(
                KeywordConfig(
                    word=row["word"],
                    link_type=row["type"],
                    url=row["url"],
                    priority=int(row.get("priority", 3)),
                    variants=[v.strip() for v in variants if v.strip()],
                )
            )

    return configs


def load_keywords_from_json(filepath: str) -> List[KeywordConfig]:
    """从JSON文件加载关键词"""
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    configs = []
    for item in data.get("keywords", []):
        configs.append(
            KeywordConfig(
                word=item["word"],
                link_type=item["type"],
                url=item["url"],
                priority=item.get("priority", 3),
                variants=item.get("variants", []),
            )
        )

    return configs


# 默认关键词配置（fallback）
DEFAULT_KEYWORDS = [
    KeywordConfig(
        "range hood",
        "collection",
        "https://arspura.com/collections/all-range-hoods",
        priority=5,
        variants=["rangehoods", "stove hood", "kitchen hood"],
    ),
    KeywordConfig(
        "kitchen ventilation",
        "collection",
        "https://arspura.com/collections/all-range-hoods",
        priority=4,
    ),
    KeywordConfig(
        "IQV range hood",
        "product",
        "https://arspura.com/products/arspura-36-p1-iqv-range-hood",
        priority=5,
    ),
]


# ═══════════════════════════════════════════════════════════════════
# PART 2: Sitemap 解析
# ═══════════════════════════════════════════════════════════════════


def is_multilingual_url(url: str) -> bool:
    """检查是否为多语言URL"""
    try:
        path = urlparse(url).path.lstrip("/")
    except Exception:
        return False

    if not path:
        return False

    segments = path.split("/")
    first = segments[0].lower()
    second = segments[1].lower() if len(segments) > 1 else ""

    if first in KNOWN_FUNCTIONAL_PATHS:
        return False

    if first in NON_LOCALE_SLUGS:
        return False

    if LOCALE_PATTERN.match(first):
        if second in KNOWN_FUNCTIONAL_PATHS:
            return True
        if not second:
            return True
        return False

    return False


def xml_local_name(tag: str) -> str:
    """获取XML标签本名，兼容带命名空间和不带命名空间的sitemap"""
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def sitemap_child_locs(root: ET.Element, child_name: str) -> List[str]:
    """读取 sitemap/sitemapindex 下一级 loc 内容"""
    locs = []
    for child in root:
        if xml_local_name(child.tag) != child_name:
            continue
        for item in child:
            if xml_local_name(item.tag) == "loc" and item.text and item.text.strip():
                locs.append(item.text.strip())
    return locs


def fetch_sitemap_urls(sitemap_url: str, retries: int = 5) -> list:
    """获取sitemap中的所有URL，支持重试"""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
    }
    last_error = None
    for attempt in range(retries):
        try:
            resp = requests.get(sitemap_url, headers=headers, timeout=60)
            resp.raise_for_status()
            content = resp.content
            if sitemap_url.lower().endswith(".gz") or content[:2] == b"\x1f\x8b":
                content = gzip.decompress(content)

            root = ET.fromstring(content)

            sitemaps = sitemap_child_locs(root, "sitemap")
            if sitemaps:
                all_urls = []
                for sitemap in sitemaps:
                    all_urls.extend(fetch_sitemap_urls(sitemap, retries))
                return all_urls
            else:
                return sitemap_child_locs(root, "url")
        except requests.RequestException as e:
            last_error = e
            if attempt < retries - 1:
                wait_time = (attempt + 1) * 3
                print(f"[提示] 第{attempt+1}次请求失败，{retries-attempt-1}次重试...等待{wait_time}秒...")
                import time
                time.sleep(wait_time)
            continue
        except ET.ParseError as e:
            last_error = e
            print(f"[错误] XML解析失败: {e}")
            break

    print(f"[错误] 无法获取 sitemap  after {retries} 次重试: {last_error}")
    return []


def discover_sitemap_urls(domain: str) -> List[str]:
    """发现一个网站可能存在的 sitemap 地址"""
    candidates = []
    if domain.lower().endswith((".xml", ".xml.gz")):
        candidates.append(domain)
    else:
        candidates.extend(
            [
                f"{domain}/sitemap.xml",
                f"{domain}/sitemap_index.xml",
                f"{domain}/sitemap.xml.gz",
            ]
        )

        robots_url = f"{domain}/robots.txt"
        try:
            resp = requests.get(
                robots_url,
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=20,
            )
            if resp.ok:
                for line in resp.text.splitlines():
                    key, sep, value = line.partition(":")
                    if sep and key.strip().lower() == "sitemap":
                        sitemap = value.strip()
                        if sitemap:
                            candidates.append(sitemap)
        except requests.RequestException:
            pass

    seen = set()
    unique_candidates = []
    for url in candidates:
        if url not in seen:
            unique_candidates.append(url)
            seen.add(url)
    return unique_candidates


def parse_sitemap(domain: str, cms_mode: str = "shopify") -> Tuple[str, List[str], List[str]]:
    """解析sitemap，返回域名、产品URL列表、博客URL列表"""
    domain = domain.strip().rstrip("/")
    if not domain.startswith("http"):
        domain = "https://" + domain

    sitemap_candidates = discover_sitemap_urls(domain)

    all_urls = []
    for sitemap_url in sitemap_candidates:
        print(f"\n🔍 尝试：{sitemap_url} (模式: {cms_mode})")
        all_urls = fetch_sitemap_urls(sitemap_url)
        if all_urls:
            break

    if not all_urls:
        print("\n[错误] 无法在任何已知位置找到sitemap，尝试了：")
        for url in sitemap_candidates:
            print(f"   - {url}")
        print("\n[提示] 请确认域名正确，或手动指定完整的sitemap URL")
        return domain, [], []

    filtered_urls = [u for u in all_urls if not is_multilingual_url(u)]
    removed = len(all_urls) - len(filtered_urls)

    mode_config = CMS_MODES.get(cms_mode, CMS_MODES["shopify"])
    patterns = mode_config.get("patterns", {})

    collection_urls = []
    product_urls = []
    blog_urls = []

    def match_patterns(url: str, type_key: str) -> bool:
        """检查URL是否匹配该类型的正则模式"""
        type_patterns = patterns.get(type_key, [])
        return any(p.search(url) for p in type_patterns)

    for url in filtered_urls:
        parsed = urlparse(url)
        path = parsed.path.lower()
        path_segments = [seg for seg in parsed.path.strip("/").split("/") if seg]
        first_segment = path_segments[0].lower() if path_segments else ""

        if match_patterns(url, "product") or any(pattern in path for pattern in mode_config["product"]):
            product_urls.append(url)
        elif match_patterns(url, "collection") or any(pattern in path for pattern in mode_config["collection"]):
            collection_urls.append(url)
        elif match_patterns(url, "blog") or any(pattern in path for pattern in mode_config["blog"]):
            blog_urls.append(url)
        else:
            if cms_mode in ("wordpress", "custom", "odoo"):
                excluded_prefixes = {
                    "wp-content", "wp-includes", "wp-admin",
                    "feed", "comment", "trackback", "attachment",
                    "author", "date", "web", "static", "assets",
                    "uploads", "images", "img", "css", "js",
                    "api", "admin", "login", "checkout", "cart",
                }
                file_ext = Path(parsed.path).suffix.lower()
                blocked_exts = {
                    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg",
                    ".css", ".js", ".pdf", ".zip", ".xml", ".gz",
                }
                if first_segment in excluded_prefixes or file_ext in blocked_exts:
                    continue
                if cms_mode != "custom" and len(path_segments) <= 2:
                    blog_urls.append(url)
                elif cms_mode == "custom" and len(path_segments) <= 2:
                    blog_urls.append(url)
                # custom模式下，未匹配的深层URL不再默认当成产品页

    PRODUCT_LIMIT = 6000
    if len(product_urls) > PRODUCT_LIMIT:
        print(
            f"\n⚠️  检测到产品页数量为 {len(product_urls)} 条，超过阈值 {PRODUCT_LIMIT}"
        )
        print(f"   → 产品/集合页将只保留集合页（{len(collection_urls)} 条），不输出产品页\n")
        data_b = sorted(set(collection_urls))
    else:
        data_b = sorted(set(collection_urls + product_urls))

    data_c = sorted(set(blog_urls))
    if "momcozy" in domain.lower():
        data_c = [url for url in data_c if "/baby-names/" not in url.lower()]

    print(
        f"✅ 共抓取 {len(all_urls)} 条，过滤多语言 {removed} 条，保留 {len(filtered_urls)} 条"
    )
    if len(product_urls) > PRODUCT_LIMIT:
        print(f"   - 产品页：{len(product_urls)} 条（已忽略，超过 {PRODUCT_LIMIT} 阈值）")
        print(f"   - 集合页：{len(collection_urls)} 条（仅保留集合页）")
    else:
        print(f"   - 产品页：{len(product_urls)} 条")
        print(f"   - 集合页：{len(collection_urls)} 条")
    print(f"   - 数据 B（产品/集合页）合计：{len(data_b)} 条")
    print(f"   - 博客/页面：{len(data_c)} 条\n")

    return domain, data_b, data_c


# ═══════════════════════════════════════════════════════════════════
# PART 3: Word → HTML 转换
# ═══════════════════════════════════════════════════════════════════


def convert_docx_to_html(docx_path: str, domain: str, article_index: int) -> str:
    """转换Word文档为HTML"""
    image_counter = [0]

    def convert_image(image):
        image_counter[0] += 1
        n = image_counter[0]
        return {"src": f"__IMG_PLACEHOLDER_{article_index}_{n}__", "alt": ""}

    style_map = """
        p[style-name='Heading 1'] => h1:fresh
        p[style-name='Heading 2'] => h2:fresh
        p[style-name='Heading 3'] => h3:fresh
        p[style-name='标题 1'] => h1:fresh
        p[style-name='标题 2'] => h2:fresh
        p[style-name='标题 3'] => h3:fresh
    """

    # 检查文件是否存在
    docx_path_obj = Path(docx_path)
    if not docx_path_obj.exists():
        print(f"[错误] 文件不存在: {docx_path}")
        return ""
    
    if docx_path_obj.stat().st_size == 0:
        print(f"[错误] 文件是空的: {docx_path}")
        return ""
    
    # 检查后缀
    if docx_path_obj.suffix.lower() == ".doc":
        print(f"[错误] 这是旧版 .doc 格式，请转换为 .docx 后使用: {docx_path}")
        return ""
    
    if docx_path_obj.suffix.lower() != ".docx":
        print(f"[错误] 不是 .docx 格式: {docx_path}")
        return ""

    def convert_with_mammoth(source_path: str):
        with open(source_path, "rb") as f:
            result = mammoth.convert_to_html(
                f,
                style_map=style_map,
                convert_image=mammoth.images.img_element(convert_image),
            )
        return result

    try:
        result = convert_with_mammoth(docx_path)
        html = result.value
        if result.messages:
            for msg in result.messages:
                print(f"[提示] mammoth: {msg}")
    except NameError:
        print(f"[错误] mammoth 库未安装，请先安装: pip install mammoth")
        return ""
    except KeyError as e:
        temp_docx = remove_broken_docx_images(docx_path)
        if not temp_docx:
            print(f"[错误] Word转换失败: {repr(e)}")
            return ""
        try:
            image_counter[0] = 0
            result = convert_with_mammoth(temp_docx)
            html = result.value
            if result.messages:
                for msg in result.messages:
                    print(f"[提示] mammoth: {msg}")
        except Exception as retry_error:
            print(f"[错误] Word转换失败: {repr(retry_error)}")
            return ""
        finally:
            try:
                os.remove(temp_docx)
            except OSError:
                pass
    except Exception as e:
        print(f"[错误] Word转换失败: {repr(e)}")
        return ""

    # 替换图片占位符
    total_images = image_counter[0]
    for i in range(1, total_images + 1):
        html = re.sub(
            rf"<img[^>]*__IMG_PLACEHOLDER_{article_index}_{i}__[^>]*>",
            f"[image{article_index}-{i}]",
            html,
        )

    # 处理剩余图片
    remaining = [0]

    def replace_remaining_img(match):
        remaining[0] += 1
        n = total_images + remaining[0]
        return f"[image{article_index}-{n}]"

    html = re.sub(r"<img[^>]*>", replace_remaining_img, html)

    # 基础HTML处理
    html = process_html_base(html, domain)

    return html


def process_html_base(html: str, domain: str) -> str:
    """基础HTML处理"""
    soup = BeautifulSoup(html, "html.parser")

    try:
        domain_host = urlparse(domain).hostname or ""
    except Exception:
        domain_host = ""

    # 标题标签本身已经表达结构和权重，移除内部重复的加粗标签，保留正文加粗。
    for heading in soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6"]):
        for bold_tag in heading.find_all(["strong", "b"]):
            bold_tag.unwrap()

    # 处理现有链接
    for link in soup.find_all("a", href=True):
        href = link.get("href", "")
        try:
            abs_url = urljoin(domain, href)
            parsed = urlparse(abs_url)

            if domain_host and domain_host not in (parsed.hostname or ""):
                link["rel"] = "nofollow noopener noreferrer"
                link["target"] = "_blank"
        except Exception:
            pass

    # 表格添加包装
    for table in soup.find_all("table"):
        table_classes = table.get("class", []) or []
        if isinstance(table_classes, str):
            table_classes = table_classes.split()
        table["class"] = table_classes + ["content-table"]
        wrapper = soup.new_tag("div", attrs={"class": "table-wrapper"})
        table.wrap(wrapper)

    return str(soup)


def remove_broken_docx_images(docx_path: str) -> Optional[str]:
    """创建临时docx，移除会导致转换失败的坏图片引用"""
    ns = {
        "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
        "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
        "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    }

    try:
        with zipfile.ZipFile(docx_path, "r") as source:
            names = source.namelist()
            if "word/document.xml" not in names:
                return None

            document_root = ET.fromstring(source.read("word/document.xml"))
            valid_relationship_ids = set()
            if "word/_rels/document.xml.rels" in names:
                rel_root = ET.fromstring(source.read("word/_rels/document.xml.rels"))
                valid_relationship_ids = {
                    rel.attrib.get("Id", "")
                    for rel in rel_root
                    if rel.attrib.get("Id")
                }

            parent_by_child = {
                child: parent for parent in document_root.iter() for child in parent
            }
            nodes_to_remove = []

            for blip in document_root.findall(".//a:blip", ns):
                relationship_id = blip.attrib.get(f"{{{ns['r']}}}embed") or blip.attrib.get(
                    f"{{{ns['r']}}}link"
                )
                if relationship_id and relationship_id in valid_relationship_ids:
                    continue

                node = blip
                while node in parent_by_child and xml_local_name(node.tag) not in {
                    "drawing",
                    "pict",
                }:
                    node = parent_by_child[node]
                if xml_local_name(node.tag) in {"drawing", "pict"}:
                    nodes_to_remove.append(node)

            if not nodes_to_remove:
                return None

            for node in set(nodes_to_remove):
                parent = parent_by_child.get(node)
                if parent is not None:
                    parent.remove(node)

            fd, temp_path = tempfile.mkstemp(suffix=".docx")
            os.close(fd)
            with zipfile.ZipFile(temp_path, "w", compression=zipfile.ZIP_DEFLATED) as target:
                for item in source.infolist():
                    data = source.read(item.filename)
                    if item.filename == "word/document.xml":
                        data = ET.tostring(
                            document_root,
                            encoding="utf-8",
                            xml_declaration=True,
                        )
                    target.writestr(item, data)

            print(f"[提示] 已跳过 {len(set(nodes_to_remove))} 个损坏的图片引用")
            return temp_path
    except Exception as e:
        print(f"[提示] 清理损坏图片引用失败: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════
# PART 4: 批量处理和Prompt构建
# ═══════════════════════════════════════════════════════════════════


def get_docx_files(input_path: str) -> List[str]:
    """获取Word文档列表"""
    docx_files = []

    # 清理路径：去除引号和多余空格
    def clean_path(p: str) -> str:
        return p.strip().strip('"').strip("'")

    # 先检查整体是不是一个存在的文件
    cleaned_full = clean_path(input_path)
    full_path = Path(cleaned_full)

    if full_path.is_file():
        suffix = full_path.suffix.lower()
        if suffix == ".docx":
            return [str(full_path)]
        elif suffix == ".doc":
            print(f"[提示] {full_path.name} 是旧版 .doc 格式，请转换为 .docx 后使用")
            return []

    # 如果整体不是文件，且包含逗号，才尝试多文件分割
    if "," in input_path:
        paths = [clean_path(p) for p in input_path.split(",")]
        for p in paths:
            if os.path.exists(p):
                suffix = Path(p).suffix.lower()
                if suffix == ".docx":
                    docx_files.append(p)
                elif suffix == ".doc":
                    print(
                        f"[提示] {Path(p).name} 是旧版 .doc 格式，请转换为 .docx 后使用"
                    )
        return docx_files

    path = Path(cleaned_full)

    # 文件夹
    if path.is_dir():
        # 查找所有 .docx 文件，同时报告 .doc 文件
        docx_files = sorted([str(f) for f in path.glob("*.docx")])
        doc_files = list(path.glob("*.doc"))
        if doc_files and not docx_files:
            print(
                f"[提示] 文件夹中发现 {len(doc_files)} 个 .doc 文件，但程序仅支持 .docx 格式"
            )
            print(f"[提示] 请将这些文件转换为 .docx 格式后重试")
        return docx_files

    # 文件存在但格式不对
    if path.exists() and not path.is_file():
        print(f"[提示] {input_path} 不是文件，请检查路径")

    return []


def process_keywords_for_articles(
    articles: List[Tuple[str, str]], keyword_file: Optional[str] = None
) -> List[Tuple[str, str, List[Dict]]]:
    """为所有文章处理关键词链接"""
    # 加载关键词配置
    if keyword_file:
        if keyword_file.endswith(".json"):
            configs = load_keywords_from_json(keyword_file)
        elif keyword_file.endswith(".csv"):
            configs = load_keywords_from_csv(keyword_file)
        else:
            print(f"[警告] 不支持的关键词文件格式: {keyword_file}，使用默认配置")
            configs = DEFAULT_KEYWORDS
    else:
        print("[信息] 未提供关键词文件，跳过关键词链接")
        return [(name, html, []) for name, html in articles]

    if not configs:
        print("[警告] 未加载到任何关键词配置")
        return [(name, html, []) for name, html in articles]

    print(f"\n📚 已加载 {len(configs)} 个关键词配置")

    # 显示配置摘要
    type_count = defaultdict(int)
    for c in configs:
        type_count[c.link_type] += 1
    print("   类型分布:", dict(type_count))

    # 创建链接器
    linker = SmartKeywordLinker(configs)

    # 处理每篇文章
    results = []
    for idx, (name, html) in enumerate(articles, 1):
        print(f"\n  处理文章 [{idx}/{len(articles)}]: {name}")
        optimized_html, links = linker.link_article(html, f"article_{idx}")
        results.append((name, optimized_html, links))

        if links:
            print(f"     ✓ 添加了 {len(links)} 个链接")
            # 显示分类统计
            type_count = defaultdict(int)
            for link in links:
                type_count[link["type"]] += 1
            for t, c in sorted(type_count.items()):
                type_name = {
                    "collection": "集合页",
                    "product": "产品页",
                    "blog": "博客页",
                    "external": "外链",
                }.get(t, t)
                print(f"       - {type_name}: {c}个")
        else:
            print("     - 未匹配到关键词")

    return results


def build_batch_prompt(
    articles: List[Tuple[str, str, List[Dict]]], data_b: List[str], data_c: List[str]
) -> str:
    """构建批量Prompt"""
    b_text = "\n".join(data_b)
    c_text = "\n".join(data_c)

    # 构建文章部分
    articles_section = []
    for idx, (name, content, links) in enumerate(articles, 1):
        link_info = ""
        if links:
            link_info = f"\n【已预添加 {len(links)} 个关键词链接: " + ", ".join(
                [l["word"] for l in links[:5]]
            )
            if len(links) > 5:
                link_info += f" 等{len(links)}个"
            link_info += "】"

        articles_section.append(f"""【文章 {idx}：{name}】{link_info}
- [数据 A-{idx}] 博客原始内容: (
{content}
)""")

    system_prompt = """# Role: 顶级多语言 SEO 策略专家 (Senior Multilingual SEO Specialist)
## 1. 核心任务
对博客内容进行 HTML 格式化，嵌入内外部链接，并利用加粗标签强化 SEO 权重。
**【内容修改红线】：非必要不修改原文。** 严禁擅自增加段落、小标题或改动原文已精准匹配的关键词。
## 2. 标题与结构准则 (Title & Structure)
- **非必要不增加**: 严禁主动添加原本不存在的段落、H2/H3 标题。
- **标题改写**: 仅当原 H2/H3 为单纯的 "Conclusion" 或 "Summary" 时，将其修改为 "Conclusion: [核心观点总结]" 或具有吸引力的 CTA 句式（如：Conclusion: The Future of Shared Play）。
- **物理位置禁区**: 标题 (H2/H3) 和列表冒号前的文字严禁添加链接。
## 3. 链接植入与关键词保护逻辑
- **商业意图 (Commercial)**:
  - **【最高优先级红线】目标选择**: **Collection 优先级绝对高于 Product！** 当一个词、短语或语境同时适合链接到单个产品页 (Product) 和集合页 (Collection) 时，**必须且只能优先链接到集合页**。
  - **关键词保护**: 如果原文单词已精准匹配集合页核心词，**必须保持原样链接，严禁擅自修改为长尾词**。
- **信息意图 (Informational)**:
  - **目标**: Internal Blog。
  - **意图对齐**: 仅在将商业短词链至博客页时，才允许将其扩展为描述性长尾短语，以对齐阅读预期。
## 4. 链接执行"红线"准则 (Zero Tolerance Policy)
- **首段禁链**: 文章第一段严禁添加任何链接。
- **锚文本唯一性 (No Duplicate Anchors)**: **全文严禁对相同的锚文本多次添加链接！** 同一个词或短语在整篇文章中只能被链接一次。如遇重复的关键词，仅保留首次（或语境最自然的一次）链接，其余保持纯文本。
- **信息链接唯一性 (No Duplicate Informational Links)**: **严禁重复添加相同的信息链接！** 无论是内链博客页还是外链（政府、医学机构、官方技术组织等），**同一个 URL 在整篇文章中只能出现一次**。即使锚文本不同，也不得多次链接到同一目标页面。
- **Shopify 路径修正**: 严禁保留 `/collections/.../products/...`。产品链接修正为标准路径：`{域名}/products/{产品名}`。
- **锚文本规范**: 严禁截断单词；如遇"全称 (缩写)"格式（例： CFM (Cubic Feet per Minute)）必须整体 CFM (Cubic Feet per Minute)作为锚文本；避免使用单个单词。**【长度限制红线】：考虑读者阅读体验，锚文本绝对不能过长，严禁将整句话作为锚文本！请精准提取具有代表性的核心短语（通常 2-6 个单词）进行链接。**
## 5. 链接属性与外链 (Zero 404 Policy)
- **内链**: 必须包含描述性 `title`。严禁使用 `target="_blank"`。
- **外链**: 3条以上权威来源（政府、医学机构、官方技术组织等）。必须包含 `title`、`rel="nofollow"` 和 `target="_blank"`。
- **【强制联网获取红线】**: **严禁凭记忆伪造外部链接！** 在植入任何外链前，**必须且只能**调用联网搜索工具（Web Search）查询相关事实，并提取搜索结果中**当前真实、存活的深层 URL**。绝不允许输出 404 死链。
- **事实驱动**: 锚文本必须是证明的具体事实内容**的核心短语（切忌将段末的整句话全加上链接）**。位置应在段落解释完毕后（段末）。
- **内容强关联与精准定位**: 必须保证链接内容和锚文本（或上下文）高度关联（特别是信息链，包括博客内链和外链）。可通过在 URL 后加定位符（使用 `#`）链接到目标页面的合适位置。**【定位符准确性红线】：如果添加定位符，必须完全准确。如果不确定该定位符是否真实存在及准确（特别是为了防止导致链接失效），则绝对不要添加。**
## 6. 强调标签 (Strong Tag) 使用逻辑
- **核心价值**: 第一段中概括文章核心价值的句子必须加粗。
- **关键决策**: 加粗具体数值、操作核心建议、以及 FAQ 中的肯定词（**Yes** / **No**）。
## 7. 输出结构要求
- **[第一部分: 内容变动追踪表]**
  - **修改记录表**: 列出 [原文] -> [修改后]。
  - **决策说明**: 说明哪些词保持了精准匹配，哪些进行了长尾改写，外链的搜索来源，以及 Conclusion 标题的优化逻辑。
- **[第二部分: 优化后的完整 HTML 代码]**
  - (如果有 `<img>`，补全英文 Alt，不要有空的标签冗余)。
- **[第三部分: 合规性自查报告]**
  - 必须包含"外链 100% 存活验证"与"锚文本唯一性"和"信息链接唯一性"的确认项。
# 执行指令：请按照上述准则处理数据。
【预处理说明】数据 A 中的 HTML 内容已包含部分预添加的关键词链接（<a>标签），请在此基础上继续优化，避免在同一位置重复添加链接。
"""

    return f"""{system_prompt}

{"\n\n".join(articles_section)}

- [数据 B] 站内产品/集合页 URL 库（适用于所有文章）: (
{b_text}
)

- [数据 C] 站内博客 URL 库（适用于所有文章）: (
{c_text}
)

【重要说明】
1. 请分别为每篇文章生成优化后的 HTML 代码
2. 文章原始内容中已包含部分预添加的关键词链接（<a>标签），请在此基础上继续优化，避免在同一位置重复添加链接
3. 产品链接可以重复使用，信息链接（博客页和外链）每篇文章内必须唯一，不能重复
4. 每篇文章链接总数控制在15个以内（包含已预添加的），外链不超过3个
5. 请按文章顺序输出，每篇文章之间用分隔线分隔

*(注：不要添加一些营销性质过强的内容 比如 shop now。商品内链 title 直接用对应产品类或者产品名。)*
"""


def save_results(results: Dict, output_dir: str = "output"):
    """保存处理结果"""
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # 使用时间戳创建子目录
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    session_dir = output_path / f"batch_{timestamp}"
    session_dir.mkdir(parents=True, exist_ok=True)

    # 保存Prompt
    prompt_file = session_dir / "batch_prompt.txt"
    with open(prompt_file, "w", encoding="utf-8") as f:
        f.write(results["prompt"])

    # 保存统计
    stats_file = session_dir / "link_statistics.json"
    with open(stats_file, "w", encoding="utf-8") as f:
        json.dump(results["statistics"], f, indent=2, ensure_ascii=False)

    # 保存每篇文章的详细链接报告
    for idx, article in enumerate(results["articles"], 1):
        article_file = session_dir / f"article_{idx:02d}_links.txt"
        with open(article_file, "w", encoding="utf-8") as f:
            f.write(f"文章: {article['name']}\n")
            f.write(f"添加链接数: {len(article['links'])}\n")
            if article["links"]:
                f.write("\n链接详情:\n")
                for i, link in enumerate(article["links"], 1):
                    f.write(f"\n{i}. {link['word']}\n")
                    f.write(f"   类型: {link['type']}\n")
                    f.write(f"   URL: {link['url']}\n")

    # 保存关键词配置（如果有）
    if results.get("keyword_configs"):
        config_file = session_dir / "keyword_configs.json"
        with open(config_file, "w", encoding="utf-8") as f:
            json.dump(results["keyword_configs"], f, indent=2, ensure_ascii=False)

    print(f"\n✅ 结果已保存到: {session_dir}")
    print(f"   - Prompt文件: {prompt_file.name}")
    print(f"   - 统计文件: {stats_file.name}")

    return session_dir


def copy_to_clipboard(text: str) -> bool:
    """复制文本到剪贴板"""
    try:
        import tkinter as tk

        root = tk.Tk()
        root.withdraw()
        root.clipboard_clear()
        root.clipboard_append(text)
        root.update()
        root.after(100, root.destroy)
        root.mainloop()
        return True
    except Exception as e:
        print(f"[提示] 剪贴板复制失败: {e}")
        return False


# ═══════════════════════════════════════════════════════════════════
# PART 5: 主程序
# ═══════════════════════════════════════════════════════════════════


def main():
    print("=" * 70)
    print("  SEO 博客批量优化工具 v2.1")
    print("  集成智能关键词链接 | 支持 Shopify / WordPress")
    print("  每篇≤15链接 | 外链≤3")
    print("=" * 70)

    print("\n📋 选择CMS模式:")
    mode_keys = list(CMS_MODES.keys())
    for i, mode in enumerate(mode_keys, 1):
        config = CMS_MODES[mode]
        print(f"   {i}. {mode} - {config['description']}")

    while True:
        mode_input = input(f"\n请选择模式 (1-{len(mode_keys)}，默认1): ").strip()
        if not mode_input:
            cms_mode = mode_keys[0]
            break
        try:
            idx = int(mode_input)
            if 1 <= idx <= len(mode_keys):
                cms_mode = mode_keys[idx - 1]
                break
            print(f"[错误] 请输入 1 到 {len(mode_keys)} 之间的数字")
        except ValueError:
            print(f"[错误] 请输入有效的数字 1-{len(mode_keys)}")

    domain_input = input("\n🌐 请输入网站域名（例：example.com）：").strip()
    if not domain_input:
        print("[错误] 域名不能为空")
        return

    print("\n" + "-" * 70)
    print("📄 【文档输入】")
    print("   支持：单文件 / 文件夹 / 多文件（逗号分隔）")
    print("   示例：C:\\blog\\article.docx")
    print("         C:\\blog\\articles\\")
    print("         C:\\blog\\1.docx, C:\\blog\\2.docx")
    print("-" * 70)

    while True:
        input_path = input("\n请输入Word文档路径：").strip()
        if not input_path:
            print("[错误] 路径不能为空")
            continue
        docx_files = get_docx_files(input_path)
        if docx_files:
            break
        print("[错误] 未找到有效的Word文档，请重新输入")

    print(f"\n✅ 共找到 {len(docx_files)} 个文档:")
    for idx, f in enumerate(docx_files, 1):
        print(f"   {idx}. {os.path.basename(f)}")

    print("\n" + "-" * 70)
    print("🔑 【关键词配置（可选）】")
    print("   支持：JSON文件 / CSV文件 / 直接回车跳过")
    print("   CSV格式：word,type,url,priority,variants")
    print("-" * 70)

    keyword_file = input("\n请输入关键词配置文件路径（直接回车跳过）：").strip()
    if keyword_file and (not os.path.exists(keyword_file) or not keyword_file.endswith((".json", ".csv"))):
        print(f"[警告] 无效的关键词配置文件: {keyword_file}")
        keyword_file = None

    from pipeline import run_task

    try:
        print("\n" + "=" * 70)
        print("📝 步骤 1/3: 转换、链接、构建Prompt")
        print("=" * 70)

        result = run_task(
            domain=domain_input,
            cms_mode=cms_mode,
            docx_files=docx_files,
            keyword_file=keyword_file or None,
            output_dir="output",
        )
        session_dir = Path(result["output_dir"])
        full_prompt = result["prompt"]

        print("\n" + "=" * 70)
        print("📊 关键词链接统计")
        print("=" * 70)
        print(f"   总文章数: {result['summary']['total_articles']}")
        print(f"   添加链接的文章: {result['summary']['articles_with_links']}")
        print(f"   总链接数: {result['summary']['total_links']}")

        print("\n" + "=" * 70)
        print("💾 保存结果")
        print("=" * 70)

        print("\n📋 正在复制到剪贴板...")
        if copy_to_clipboard(full_prompt):
            print("   ✓ 已复制到剪贴板！")
        else:
            prompt_path = session_dir / "batch_prompt.txt"
            print(f"   请手动复制: {prompt_path}")

        print("\n" + "=" * 70)
        print("✅ 全部完成！")
        print("=" * 70)
        print(f"\n📁 输出目录: {session_dir}")
        print("\n下一步操作:")
        print("   1. 打开 OpenCode 或其他 LLM 工具")
        print("   2. 粘贴 Prompt（已自动复制到剪贴板）")
        print("   3. 等待生成优化后的 HTML")
        print("\n提示：如果Prompt过长，可以分批处理或使用单文件模式")
        print("=" * 70)
    except Exception as e:
        print(f"\n[错误] 程序异常: {repr(e)}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n[信息] 用户中断操作")
    except Exception as e:
        print(f"\n[错误] 程序异常: {e}")
        import traceback

        traceback.print_exc()
