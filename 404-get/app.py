from flask import Flask, render_template, jsonify, request
import threading
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse, urljoin
import time
import csv
from io import StringIO
from concurrent.futures import ThreadPoolExecutor

# 关闭SSL验证警告
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

app = Flask(__name__)

# 全局扫描状态存储
scan_state = {
    "is_running": False,
    "current_url": "",
    "dead_links": [],  # 存储格式: [{"dead_url": "...", "source_url": "..."}]
    "visited_pages": set(),  # 记录已爬取过源码的网页
    "checked_links": set(),  # 记录已检测过状态码的链接
    "total_pages_scanned": 0,
    "total_links_checked": 0,
}

scan_lock = threading.Lock()
MAX_WORKERS = 10


def is_same_domain(base_url, target_url):
    """检查是否为同域名，只爬取同域名内容"""
    base_domain = urlparse(base_url).netloc
    target_domain = urlparse(target_url).netloc
    return base_domain == target_domain


def is_valid_url(url):
    """检查URL是否有效，过滤javascript:等无效协议"""
    parsed = urlparse(url)
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


def is_html_response(response):
    """检查响应是否为HTML内容"""
    content_type = response.headers.get("Content-Type", "")
    return "text/html" in content_type


def check_link(link_info):
    """检测单个链接是否为404死链，返回None如果不是，否则返回(dead_url, source_url)"""
    dead_url, source_url = link_info
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    # 已经检测过就跳过
    with scan_lock:
        if dead_url in scan_state["checked_links"]:
            return None
        scan_state["checked_links"].add(dead_url)
        scan_state["total_links_checked"] += 1

    try:
        # 使用HEAD请求更快，失败了再用GET重试，关闭SSL验证解决某些证书问题
        response = requests.head(
            dead_url, timeout=5, allow_redirects=True, headers=headers, verify=False
        )
        if response.status_code == 404:
            return (dead_url, source_url)
        return None
    except requests.RequestException as e:
        try:
            # HEAD失败，尝试GET，关闭SSL验证
            response = requests.get(
                dead_url, timeout=5, allow_redirects=True, headers=headers, verify=False
            )
            if response.status_code == 404:
                return (dead_url, source_url)
            return None
        except Exception as e:
            # 任何异常都静默跳过
            return None


def crawl_website(start_url):
    """后台爬虫核心逻辑"""
    global scan_state

    # 重置扫描状态
    with scan_lock:
        scan_state["is_running"] = True
        scan_state["current_url"] = start_url
        scan_state["dead_links"] = []
        scan_state["visited_pages"] = set()
        scan_state["checked_links"] = set()
        scan_state["total_pages_scanned"] = 0
        scan_state["total_links_checked"] = 0

    # 使用队列进行BFS遍历
    queue = [start_url]
    scan_state["visited_pages"].add(start_url)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        while queue and scan_state["is_running"]:
            current_url = queue.pop(0)

            with scan_lock:
                scan_state["current_url"] = current_url
                scan_state["total_pages_scanned"] += 1

            links_to_check = []

            try:
                # 添加浏览器UA，很多网站拦截无UA请求，关闭SSL验证避免证书问题
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
                # 发送请求获取页面源码，设置超时
                response = requests.get(
                    current_url, timeout=15, headers=headers, verify=False
                )
                # 只处理HTML页面，即使状态码错误也继续解析
                if not is_html_response(response):
                    time.sleep(0.2)
                    continue

                soup = BeautifulSoup(response.text, "html.parser")

                # 查找所有a标签的链接
                for a_tag in soup.find_all("a", href=True):
                    if not scan_state["is_running"]:
                        break

                    link = a_tag["href"]
                    absolute_link = urljoin(current_url, link)

                    # 过滤无效URL
                    if not is_valid_url(absolute_link):
                        continue

                    # 移除锚点部分
                    absolute_link = absolute_link.split("#")[0]
                    if not absolute_link:
                        continue

                    # 添加到待检测列表
                    if absolute_link not in scan_state["checked_links"]:
                        links_to_check.append((absolute_link, current_url))

                    # 如果是同域名且未访问过，加入爬取队列继续爬
                    # 必须整个判断+加入都在锁里面，否则导致链接无法加入队列
                    if is_same_domain(start_url, absolute_link):
                        with scan_lock:
                            if absolute_link not in scan_state["visited_pages"]:
                                scan_state["visited_pages"].add(absolute_link)
                                queue.append(absolute_link)

            except Exception as e:
                print(f"Error crawling {current_url}: {str(e)}")

            # 并行检测链接状态
            if links_to_check and scan_state["is_running"]:
                results = list(executor.map(check_link, links_to_check))
                # 收集404结果
                with scan_lock:
                    for result in results:
                        if result:
                            dead_url, source_url, redirect_url = result
                            scan_state["dead_links"].append(
                                {
                                    "dead_url": dead_url,
                                    "source_url": source_url,
                                    "redirect_url": redirect_url,
                                }
                            )

            # 请求间隔，防止被封
            time.sleep(0.3)

    # 扫描完成
    with scan_lock:
        scan_state["is_running"] = False


@app.route("/")
def index():
    """渲染首页"""
    return render_template("index.html")


@app.route("/api/start", methods=["POST"])
def start_scan():
    """开始扫描接口"""
    data = request.get_json()
    start_url = data.get("start_url", "").strip()

    if not start_url:
        return jsonify({"success": False, "error": "网站起始URL不能为空"}), 400

    # 验证URL格式
    parsed = urlparse(start_url)
    if not parsed.scheme or not parsed.netloc:
        return jsonify({"success": False, "error": f"无效URL格式: {start_url}"}), 400

    # 启动后台线程
    thread = threading.Thread(target=crawl_website, args=(start_url,))
    thread.daemon = True
    thread.start()

    return jsonify({"success": True})


@app.route("/api/status")
def get_status():
    """获取当前扫描状态"""
    with scan_lock:
        return jsonify(
            {
                "is_running": scan_state["is_running"],
                "current_url": scan_state["current_url"],
                "dead_links": scan_state["dead_links"],
                "total_pages_scanned": scan_state["total_pages_scanned"],
                "total_links_checked": scan_state["total_links_checked"],
                "count": len(scan_state["dead_links"]),
            }
        )


@app.route("/api/download")
def download_csv():
    """下载CSV结果"""
    with scan_lock:
        dead_links = scan_state["dead_links"]

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(["404死链地址", "来源页面", "重定向至"])
    for link in dead_links:
        redirect_url = link.get("redirect_url", "")
        writer.writerow([link["dead_url"], link["source_url"], redirect_url])

    output.seek(0)
    response = app.response_class(
        output.getvalue(),
        mimetype="text/csv",
        headers={
            "Content-Disposition": 'attachment; filename="all-404-broken-links.csv"'
        },
    )
    return response


@app.route("/api/stop", methods=["POST"])
def stop_scan():
    """停止扫描"""
    with scan_lock:
        scan_state["is_running"] = False
    return jsonify({"success": True})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
