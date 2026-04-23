import requests
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
import time

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )
}

TIMEOUT = 10
MAX_WORKERS = 10


def detect_anchor_type(tag):
    """判断锚文本类型"""
    if tag.name != "a":
        return "资源链接"
    text = tag.get_text(strip=True)
    img = tag.find("img")
    if img and not text:
        return "图片"
    if text:
        # 简单判断是否像按钮（class 含 btn/button）
        classes = " ".join(tag.get("class", [])).lower()
        if any(k in classes for k in ["btn", "button", "cta"]):
            return "按钮"
        return "纯文字"
    return "空锚文本"


def detect_element_position(tag):
    """判断链接所在 HTML 区域"""
    parents = [p.name for p in tag.parents if p.name]
    for zone in ["nav", "header", "footer", "aside", "main", "article", "section"]:
        if zone in parents:
            return zone
    return "其他"


def extract_links(page_url, html):
    """从 HTML 中提取所有需要检查的链接"""
    soup = BeautifulSoup(html, "html.parser")
    links = []

    # <a href>
    for tag in soup.find_all("a", href=True):
        href = tag["href"].strip()
        if not href or href.startswith("#") or href.startswith("javascript"):
            continue
        anchor_text = tag.get_text(strip=True) or "[无文字]"
        links.append(
            {
                "url": href,
                "source_page": page_url,
                "anchor_text": anchor_text[:200],
                "anchor_type": detect_anchor_type(tag),
                "element_position": detect_element_position(tag),
                "link_category": "超链接(a href)",
            }
        )

    # <img src>
    for tag in soup.find_all("img", src=True):
        src = tag["src"].strip()
        if not src:
            continue
        links.append(
            {
                "url": src,
                "source_page": page_url,
                "anchor_text": tag.get("alt", "[无alt]")[:200],
                "anchor_type": "图片资源",
                "element_position": detect_element_position(tag),
                "link_category": "图片(img src)",
            }
        )

    # <script src>
    for tag in soup.find_all("script", src=True):
        src = tag["src"].strip()
        if src:
            links.append(
                {
                    "url": src,
                    "source_page": page_url,
                    "anchor_text": "[JS资源]",
                    "anchor_type": "JS资源",
                    "element_position": "head/body",
                    "link_category": "JS(script src)",
                }
            )

    # <link href> (CSS)
    for tag in soup.find_all("link", href=True):
        href = tag["href"].strip()
        if href:
            links.append(
                {
                    "url": href,
                    "source_page": page_url,
                    "anchor_text": "[CSS资源]",
                    "anchor_type": "CSS资源",
                    "element_position": "head",
                    "link_category": "CSS(link href)",
                }
            )

    # <iframe src>
    for tag in soup.find_all("iframe", src=True):
        src = tag["src"].strip()
        if src:
            links.append(
                {
                    "url": src,
                    "source_page": page_url,
                    "anchor_text": tag.get("title", "[iframe]")[:200],
                    "anchor_type": "iframe",
                    "element_position": detect_element_position(tag),
                    "link_category": "iframe(src)",
                }
            )

    return links


def normalize_url(url, base_url):
    """补全相对路径"""
    if url.startswith("http://") or url.startswith("https://"):
        return url
    if url.startswith("//"):
        return "https:" + url
    if url.startswith("/"):
        from urllib.parse import urlparse

        parsed = urlparse(base_url)
        return f"{parsed.scheme}://{parsed.netloc}{url}"
    return None  # 忽略相对路径如 ../xxx（简易版）


def check_single_url(item):
    """检查单个链接状态"""
    raw_url = item["url"]
    full_url = normalize_url(raw_url, item["source_page"])
    if not full_url:
        return None

    result = item.copy()
    result["full_url"] = full_url
    result["check_time"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    try:
        resp = requests.head(
            full_url, headers=HEADERS, timeout=TIMEOUT, allow_redirects=True
        )
        # 部分服务器不支持 HEAD，降级用 GET
        if resp.status_code in (405, 403):
            resp = requests.get(
                full_url,
                headers=HEADERS,
                timeout=TIMEOUT,
                allow_redirects=True,
                stream=True,
            )

        final_url = resp.url
        status = resp.status_code

        result["status_code"] = status
        result["final_url"] = final_url
        result["is_redirect"] = final_url != full_url

        # 重定向后最终 404
        if result["is_redirect"] and status == 404:
            result["status_label"] = "重定向后404"
        elif status == 404:
            result["status_label"] = "404 Not Found"
        elif status >= 500:
            result["status_label"] = f"{status} 服务器错误"
        elif status >= 400:
            result["status_label"] = f"{status} 客户端错误"
        elif status >= 300:
            result["status_label"] = f"{status} 重定向"
        else:
            result["status_label"] = f"{status} 正常"

    except requests.exceptions.Timeout:
        result["status_code"] = -1
        result["status_label"] = "超时"
        result["final_url"] = full_url
        result["is_redirect"] = False
    except requests.exceptions.ConnectionError:
        result["status_code"] = -2
        result["status_label"] = "连接失败"
        result["final_url"] = full_url
        result["is_redirect"] = False
    except Exception as e:
        result["status_code"] = -3
        result["status_label"] = f"未知错误: {str(e)[:50]}"
        result["final_url"] = full_url
        result["is_redirect"] = False

    return result


def fetch_page(url):
    """抓取页面 HTML"""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        resp.raise_for_status()
        return resp.text
    except Exception:
        return None


def run_check(url_list, progress_callback=None):
    """
    主入口：给定 URL 列表，返回所有问题链接结果
    progress_callback(current, total, message) 用于实时进度推送
    """
    all_links = []
    total_pages = len(url_list)

    # Step 1: 抓取所有页面，提取链接
    for i, page_url in enumerate(url_list):
        if progress_callback:
            progress_callback(
                i + 1,
                total_pages,
                f"正在抓取页面 ({i + 1}/{total_pages}): {page_url}",
                "fetch",
            )
        html = fetch_page(page_url)
        if html:
            links = extract_links(page_url, html)
            all_links.extend(links)

    # 去重（同一链接在同一页面只检查一次）
    seen = set()
    unique_links = []
    for lk in all_links:
        key = (lk["url"], lk["source_page"])
        if key not in seen:
            seen.add(key)
            unique_links.append(lk)

    total_links = len(unique_links)
    if progress_callback:
        progress_callback(
            0,
            total_links,
            f"共提取 {total_links} 个唯一链接，开始检测...",
            "check_start",
        )

    # Step 2: 并发检查链接状态
    results = []
    completed = 0

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_map = {executor.submit(check_single_url, lk): lk for lk in unique_links}
        for future in as_completed(future_map):
            completed += 1
            res = future.result()
            if res:
                results.append(res)
            if progress_callback and completed % 20 == 0:
                progress_callback(
                    completed,
                    total_links,
                    f"已检测 {completed}/{total_links} 个链接",
                    "checking",
                )

    # 只返回异常链接（状态码非 2xx/3xx 正常跳转）
    problem_results = [
        r
        for r in results
        if r["status_code"] not in range(200, 400) or r["status_label"] == "重定向后404"
    ]

    if progress_callback:
        progress_callback(
            total_links,
            total_links,
            f"检测完成！发现 {len(problem_results)} 个问题链接",
            "done",
        )

    return problem_results, results
