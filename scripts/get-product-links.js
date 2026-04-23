# ============================================================
# 电商平台产品链接采集器
# 支持平台：Shopify / WooCommerce / Shopyy / Odoo
# 输出格式：CSV + Excel
# 使用方式：直接运行，按提示输入参数即可
# ============================================================

import requests
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import pandas as pd
import time
from urllib.parse import urljoin, urlparse


# ────────────────────────────────────────────────
# 模块 1：识别平台类型
# ────────────────────────────────────────────────
def detect_platform(url, html):
    """
    根据 URL 特征和页面内容判断平台类型
    返回值: 'shopify' / 'woocommerce' / 'shopyy' / 'odoo' / 'unknown'
    """
    html_lower = html.lower()

    if "shopify" in html_lower or "/collections/" in url:
        return "shopify"
    elif "woocommerce" in html_lower or "wp-content" in html_lower:
        return "woocommerce"
    elif "shopyy" in html_lower:
        return "shopyy"
    elif "odoo" in html_lower or "/shop" in url:
        return "odoo"
    else:
        return "unknown"


# ────────────────────────────────────────────────
# 模块 2：静态页面请求（requests）
# ────────────────────────────────────────────────
def get_html_static(url):
    """
    用 requests 获取静态页面 HTML
    headers 伪装成浏览器，避免被拒绝访问
    """
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )
    }
    try:
        res = requests.get(url, headers=headers, timeout=10)
        res.encoding = "utf-8"
        return res.text
    except Exception as e:
        print(f"[静态请求失败] {url} → {e}")
        return ""


# ────────────────────────────────────────────────
# 模块 3：动态页面请求（Selenium）
# ────────────────────────────────────────────────
def get_html_dynamic(url, scroll=True):
    """
    用 Selenium 无头浏览器获取动态渲染页面
    scroll=True 时自动滚动到底部，触发懒加载
    """
    options = Options()
    options.add_argument("--headless")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--window-size=1920,1080")

    driver = webdriver.Chrome(options=options)
    driver.get(url)
    time.sleep(2)

    if scroll:
        last_height = driver.execute_script("return document.body.scrollHeight")
        while True:
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
            time.sleep(1.5)
            new_height = driver.execute_script("return document.body.scrollHeight")
            if new_height == last_height:
                break
            last_height = new_height

    html = driver.page_source
    driver.quit()
    return html


# ────────────────────────────────────────────────
# 模块 4：各平台链接提取逻辑（已修复：限定容器范围）
# ────────────────────────────────────────────────
def extract_links(html, base_url, platform):
    """
    根据平台类型，从 HTML 中提取产品详情链接。
    核心修复：先定位产品网格容器，再在容器内提取链接，
    避免误抓导航栏、页脚、推荐模块中的无关链接。
    返回：去重后的完整 URL 列表
    """
    soup = BeautifulSoup(html, "html.parser")
    links = []

    if platform == "shopify":
        # ── 第一优先：Shopify 标准产品网格容器 id="product-grid" ──
        product_grid = soup.find(id="product-grid")

        # ── 第二优先：常见 class 名称匹配 ──
        if not product_grid:
            product_grid = soup.find(class_=lambda c: c and any(
                kw in c for kw in [
                    "product-grid", "collection-grid",
                    "products-grid", "product-list"
                ]
            ))

        # ── 兜底：降级为全页扫描，打印警告 ──
        if not product_grid:
            print("  ⚠️  未找到产品网格容器，降级为全页扫描（可能含噪音链接）")
            product_grid = soup

        for a in product_grid.find_all("a", href=True):
            href = a["href"]
            if "/products/" in href:
                links.append(urljoin(base_url, href))

    elif platform == "woocommerce":
        # WooCommerce：产品链接在 <ul class="products"> 容器内
        product_grid = soup.find("ul", class_=lambda c: c and "products" in c)

        if not product_grid:
            product_grid = soup.find(class_=lambda c: c and any(
                kw in c for kw in ["products", "product-grid", "woocommerce-loop"]
            ))

        if not product_grid:
            print("  ⚠️  未找到产品网格容器，降级为全页扫描（可能含噪音链接）")
            product_grid = soup

        for a in product_grid.find_all("a", href=True):
            href = a["href"]
            if "/product/" in href or "?product=" in href:
                links.append(urljoin(base_url, href))

    elif platform == "shopyy":
        # Shopyy：产品列表通常在 class 含 product-list / goods-list 的容器内
        product_grid = soup.find(class_=lambda c: c and any(
            kw in c for kw in ["product-list", "goods-list", "product-grid"]
        ))

        if not product_grid:
            print("  ⚠️  未找到产品网格容器，降级为全页扫描（可能含噪音链接）")
            product_grid = soup

        for a in product_grid.find_all("a", href=True):
            href = a["href"]
            if "/product/" in href or "/goods/" in href:
                links.append(urljoin(base_url, href))

    elif platform == "odoo":
        # Odoo：产品列表在 id="products" 或 class 含 o_wsale 的容器内
        product_grid = soup.find(id="products")

        if not product_grid:
            product_grid = soup.find(class_=lambda c: c and "o_wsale" in c)

        if not product_grid:
            print("  ⚠️  未找到产品网格容器，降级为全页扫描（可能含噪音链接）")
            product_grid = soup

        for a in product_grid.find_all("a", href=True):
            href = a["href"]
            if "/shop/" in href and href.rstrip("/") != "/shop":
                links.append(urljoin(base_url, href))

    else:
        # unknown 平台：通用兜底逻辑
        print("[提示] 未识别平台，使用通用规则提取链接")
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if any(kw in href for kw in ["/product", "/goods", "/item", "/detail"]):
                links.append(urljoin(base_url, href))

    # ── 去重，保持顺序，清除 URL 查询参数 ──
    seen = set()
    unique_links = []
    for link in links:
        clean_link = link.split("?")[0].rstrip("/")
        if clean_link not in seen:
            seen.add(clean_link)
            unique_links.append(clean_link)

    return unique_links


# ────────────────────────────────────────────────
# 模块 5：静态分页抓取（URL 参数翻页）
# ────────────────────────────────────────────────
def get_paginated_links_static(base_url, platform, max_pages=20):
    """
    处理 URL 参数翻页的集合页（如 ?page=2）
    适用于 Shopify / WooCommerce / Odoo 的标准分页
    max_pages：最大爬取页数，防止无限循环
    """
    all_links = []
    page = 1

    # 不同平台的分页参数格式
    if platform == "woocommerce":
        page_param = "paged"
    else:
        page_param = "page"  # Shopify / Odoo / Shopyy / unknown 均用 page

    while page <= max_pages:
        if "?" in base_url:
            url = f"{base_url}&{page_param}={page}"
        else:
            url = f"{base_url}?{page_param}={page}"

        print(f"[正在抓取] 第 {page} 页 → {url}")
        html = get_html_static(url)

        if not html:
            print(f"[停止] 第 {page} 页无内容，结束翻页")
            break

        links = extract_links(html, base_url, platform)

        if not links:
            print(f"[停止] 第 {page} 页未找到产品链接，结束翻页")
            break

        # 检查是否出现重复页（有些网站超出页数后返回第 1 页内容）
        new_links = [l for l in links if l not in all_links]
        if not new_links:
            print(f"[停止] 第 {page} 页链接与已有数据完全重复，判断已到最后一页")
            break

        all_links.extend(new_links)
        print(f"  ✔ 本页新增 {len(new_links)} 条，累计 {len(all_links)} 条")

        page += 1
        time.sleep(1.5)  # 礼貌间隔，避免被封

    return all_links


# ────────────────────────────────────────────────
# 模块 6：动态分页抓取（Selenium 点击下一页）
# ────────────────────────────────────────────────
def get_paginated_links_dynamic(start_url, platform, max_pages=20):
    """
    处理需要点击"下一页"按钮的动态加载集合页
    使用 Selenium 模拟点击翻页
    """
    options = Options()
    options.add_argument("--headless")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--window-size=1920,1080")

    driver = webdriver.Chrome(options=options)
    driver.get(start_url)
    time.sleep(2)

    all_links = []
    page = 1

    while page <= max_pages:
        print(f"[正在抓取] 第 {page} 页（动态模式）")

        # 滚动到底部确保内容加载完整
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(1.5)

        html = driver.page_source
        links = extract_links(html, start_url, platform)

        if not links:
            print(f"[停止] 第 {page} 页未找到产品链接")
            break

        new_links = [l for l in links if l not in all_links]
        if not new_links:
            print(f"[停止] 第 {page} 页链接与已有数据完全重复，判断已到最后一页")
            break

        all_links.extend(new_links)
        print(f"  ✔ 本页新增 {len(new_links)} 条，累计 {len(all_links)} 条")

        # 尝试找"下一页"按钮并点击
        try:
            next_btn = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR,
                    "a[rel='next'], .next, .pagination-next, "
                    "[aria-label='Next'], button.next-page, "
                    "li.next > a, .next-page-link"
                ))
            )
            driver.execute_script("arguments[0].click();", next_btn)
            time.sleep(2)
            page += 1
        except Exception:
            print("[停止] 未找到下一页按钮，已到最后一页")
            break

    driver.quit()
    return all_links


# ────────────────────────────────────────────────
# 模块 7：保存结果
# ────────────────────────────────────────────────
def save_results(links, filename="product_links"):
    """
    将链接列表保存为 CSV 和 Excel 两种格式
    """
    if not links:
        print("⚠️  未采集到任何链接，不生成文件")
        return pd.DataFrame()

    df = pd.DataFrame(links, columns=["product_url"])
    df.index += 1  # 序号从 1 开始

    csv_path = f"{filename}.csv"
    excel_path = f"{filename}.xlsx"

    df.to_csv(csv_path, index=True, index_label="序号", encoding="utf-8-sig")
    df.to_excel(excel_path, index=True, index_label="序号")

    print(f"\n✅ 保存完成！")
    print(f"   CSV   → {csv_path}")
    print(f"   Excel → {excel_path}")
    print(f"   共 {len(links)} 条产品链接")

    return df


# ────────────────────────────────────────────────
# 主程序入口（运行时输入版）
# ────────────────────────────────────────────────
def main():
    print("=" * 55)
    print("🕷️   电商产品链接采集器")
    print("     支持平台：Shopify / WooCommerce / Shopyy / Odoo")
    print("=" * 55)

    # ── Step 1：输入目标 URL ──
    TARGET_URL = input("\n请输入目标集合页 URL：").strip()
    if not TARGET_URL.startswith("http"):
        print("❌ URL 格式不正确，请确保以 http:// 或 https:// 开头")
        return

    # ── Step 2：选择分页模式 ──
    print("\n请选择分页模式：")
    print("  1 → static  （URL参数翻页，适合 Shopify / WooCommerce / Odoo）")
    print("  2 → dynamic （点击按钮翻页，适合动态加载页面）")
    mode_input = input("请输入 1 或 2（默认 1）：").strip()
    PAGINATION_MODE = "dynamic" if mode_input == "2" else "static"

    # ── Step 3：输入最大页数 ──
    pages_input = input("\n请输入最大爬取页数（默认 20）：").strip()
    MAX_PAGES = int(pages_input) if pages_input.isdigit() else 20

    # ── Step 4：输入输出文件名 ──
    filename_input = input("\n请输入保存文件名（默认 product_links，无需加后缀）：").strip()
    FILENAME = filename_input if filename_input else "product_links"

    # ── 确认参数 ──
    print("\n" + "=" * 55)
    print(f"   目标 URL   ：{TARGET_URL}")
    print(f"   分页模式   ：{PAGINATION_MODE}")
    print(f"   最大页数   ：{MAX_PAGES}")
    print(f"   输出文件名 ：{FILENAME}.csv / {FILENAME}.xlsx")
    print("=" * 55)

    confirm = input("\n确认开始采集？（按 Enter 继续 / 输入 n 取消）：").strip().lower()
    if confirm == "n":
        print("已取消。")
        return

    # ── 识别平台 ──
    print("\n[Step 1] 正在识别平台类型...")
    first_html = get_html_static(TARGET_URL)

    if not first_html:
        print("❌ 无法访问目标页面，请检查 URL 或网络连接")
        return

    platform = detect_platform(TARGET_URL, first_html)
    print(f"  → 识别结果：{platform.upper()}")

    # ── 抓取链接 ──
    print(f"\n[Step 2] 开始抓取产品链接（{PAGINATION_MODE} 模式）...")
    if PAGINATION_MODE == "static":
        all_links = get_paginated_links_static(TARGET_URL, platform, MAX_PAGES)
    else:
        all_links = get_paginated_links_dynamic(TARGET_URL, platform, MAX_PAGES)

    # ── 全局去重 ──
    all_links = list(dict.fromkeys(all_links))
    print(f"\n[Step 3] 全局去重完成，最终共 {len(all_links)} 条唯一链接")

    # ── 保存结果 ──
    print("\n[Step 4] 保存结果...")
    df = save_results(all_links, filename=FILENAME)

    # ── 预览 ──
    if not df.empty:
        print("\n📋 结果预览（前 5 条）：")
        print(df.head())


if __name__ == "__main__":
    main()
