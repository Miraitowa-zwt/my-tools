#!/usr/bin/env python3
"""
301/404 Link Checker
Scans a website for 301 redirects and 404 error links, outputs results to Excel
Supports both BFS crawling from start URL and bulk checking from multiple sitemap XML files
"""

import argparse
import sys
import queue
from urllib.parse import urlparse, urljoin
from collections import deque
import xml.etree.ElementTree as ET
import requests
from bs4 import BeautifulSoup
import pandas as pd
import os
import time
import threading
from queue import Queue
from threading import Lock

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}


def get_domain(url):
    """Extract domain from URL"""
    parsed = urlparse(url)
    return parsed.netloc


def is_same_domain(url, start_domain):
    """Check if URL belongs to same domain"""
    parsed = urlparse(url)
    return parsed.netloc == start_domain or parsed.netloc == ""


def clean_url(url):
    """Clean URL by removing fragment"""
    parsed = urlparse(url)
    return parsed._replace(fragment="").geturl()


def follow_redirects(url, session, timeout=10, max_redirects=10):
    """Follow redirects manually to get final URL and original status code"""
    current_url = url
    original_status = None
    retries = 3

    for _ in range(max_redirects):
        success = False
        status = None
        response = None

        # First try HEAD
        for retry in range(retries):
            try:
                response = session.head(
                    current_url,
                    allow_redirects=False,
                    timeout=timeout,
                    headers=DEFAULT_HEADERS,
                )
                status = response.status_code
                if original_status is None:
                    original_status = status

                # If we get 429 Too Many Requests, wait and retry
                if status == 429:
                    retry_after = int(response.headers.get("Retry-After", 10))
                    time.sleep(retry_after)
                    continue

                success = True
                break
            except requests.RequestException:
                if retry < retries - 1:
                    time.sleep(2)
                continue

        # If HEAD fails completely, try GET instead
        if not success:
            for retry in range(retries):
                try:
                    response = session.get(
                        current_url,
                        allow_redirects=False,
                        timeout=timeout,
                        headers=DEFAULT_HEADERS,
                    )
                    status = response.status_code
                    if original_status is None:
                        original_status = status

                    if status == 429:
                        retry_after = int(response.headers.get("Retry-After", 10))
                        time.sleep(retry_after)
                        continue

                    success = True
                    break
                except requests.RequestException:
                    if retry < retries - 1:
                        time.sleep(2)
                    continue

        if not success:
            # Failed all retries for this step
            return original_status, current_url, False

        if 300 <= status < 400:
            location = response.headers.get("location")
            if not location:
                break
            current_url = urljoin(current_url, location)
        else:
            break

    return original_status, current_url, True


def extract_links(html, base_url):
    """Extract all a tags with href and their anchor text from HTML"""
    soup = BeautifulSoup(html, "html.parser")
    links = []

    for a_tag in soup.find_all("a", href=True):
        href = a_tag.get("href")
        if (
            href.startswith("#")
            or href.startswith("javascript:")
            or href.startswith("mailto:")
            or href.startswith("tel:")
        ):
            continue

        # Get anchor text
        anchor_text = a_tag.get_text(strip=True)
        if not anchor_text:
            anchor_text = "(empty)"

        # Convert to absolute URL
        absolute_url = urljoin(base_url, href)
        absolute_url = clean_url(absolute_url)
        links.append((absolute_url, anchor_text))

    return links


def check_website_single(start_url, max_depth, timeout=10):
    """Original single-threaded version, kept for compatibility and debugging"""
    start_domain = get_domain(start_url)
    start_url = clean_url(start_url)

    crawled_pages = (
        set()
    )  # Track which pages we've already crawled (to avoid re-crawling)
    results = []
    queue = deque()
    session = requests.Session()

    # Add starting URL to queue: (url, depth, source_url, anchor_text)
    queue.append((start_url, 0, None, "(start)"))

    print(f"Starting crawl from: {start_url}")
    print(f"Max depth: {max_depth}")
    print(f"Domain restriction: {start_domain}")
    print()

    processed_count = 0

    while queue:
        url, depth, source_url, anchor_text = queue.popleft()

        processed_count += 1
        if processed_count % 50 == 0:
            print(f"Processed {processed_count} URLs...")

        # Check this link even if URL was seen before - because it can appear on multiple pages
        # Only skip crawling the page for more links if we've already crawled it
        url_already_crawled = url in crawled_pages

        try:
            # Check URL status with redirect following
            original_status, final_url, success = follow_redirects(
                url, session, timeout
            )

            # Record 301 and 404 results - ALWAYS record even if URL seen before
            # because same problem URL can be on multiple pages with different anchors
            if original_status in (301, 404) and source_url is not None:
                result = {
                    "源页面": source_url,
                    "链接URL": url,
                    "锚文本": anchor_text,
                    "状态码": original_status,
                    "最终目标URL": final_url if original_status == 301 else "-",
                }
                results.append(result)
                print(f"Found {original_status}: {url} on {source_url} -> {final_url}")

            # Only crawl the page to extract more links if:
            # 1. We haven't crawled it before
            # 2. It's successful (not 404 etc)
            # 3. Haven't reached max depth
            # 4. It's HTML content
            if (
                not url_already_crawled
                and depth < max_depth
                and success
                and (original_status is None or 200 <= original_status < 300)
            ):
                try:
                    response = session.get(
                        url, timeout=timeout, headers=DEFAULT_HEADERS
                    )
                    content_type = response.headers.get("content-type", "")

                    if "text/html" in content_type:
                        crawled_pages.add(url)
                        links = extract_links(response.text, url)
                        for link_url, link_anchor in links:
                            if is_same_domain(link_url, start_domain):
                                queue.append((link_url, depth + 1, url, link_anchor))
                except requests.RequestException as e:
                    print(f"Error fetching {url}: {e}")

        except Exception as e:
            print(f"Error checking {url}: {e}")
            continue

        # Add small delay to be polite
        time.sleep(0.05)

    print()
    print(f"Crawl complete. Total URLs checked: {processed_count}")
    print(f"Unique pages crawled for extracting links: {len(crawled_pages)}")
    print(f"Found {len(results)} issues (301/404)")

    return results


def check_website(start_url, max_depth, timeout=10, num_threads=5):
    """Main crawling function - Multi-threaded version"""
    start_domain = get_domain(start_url)
    start_url = clean_url(start_url)

    crawled_pages = (
        set()
    )  # Track which pages we've already crawled (to avoid re-crawling)
    crawled_pages_lock = Lock()

    results = []
    results_lock = Lock()

    # Queue holds: (url, depth, source_url, anchor_text)
    task_queue = Queue()
    task_queue.put((start_url, 0, None, "(start)"))

    processed_count = 0
    processed_count_lock = Lock()

    print(f"Starting crawl from: {start_url}")
    print(f"Max depth: {max_depth}")
    print(f"Domain restriction: {start_domain}")
    print(f"Threads: {num_threads}")
    print()

    def worker():
        nonlocal processed_count
        url = None
        # Each thread has its own session - requests.Session is NOT thread-safe
        session = requests.Session()
        while True:
            try:
                task = task_queue.get(timeout=30)  # Longer timeout to avoid early exit
                if task is None:
                    break

                url, depth, source_url, anchor_text = task
                url_already_crawled = False

                with crawled_pages_lock:
                    if url in crawled_pages:
                        url_already_crawled = True

                # Check URL status with redirect following
                original_status, final_url, success = follow_redirects(
                    url, session, timeout
                )

                # Record 301 and 404 results - ALWAYS record even if URL seen before
                if original_status in (301, 404) and source_url is not None:
                    result = {
                        "源页面": source_url,
                        "链接URL": url,
                        "锚文本": anchor_text,
                        "状态码": original_status,
                        "最终目标URL": final_url if original_status == 301 else "-",
                    }
                    with results_lock:
                        results.append(result)
                    print(
                        f"Found {original_status}: {url} on {source_url} -> {final_url}"
                    )

                # Only crawl the page to extract more links if:
                # 1. We haven't crawled it before
                # 2. It's successful (not 404 etc)
                # 3. Haven't reached max depth
                # 4. It's HTML content
                if (
                    not url_already_crawled
                    and depth < max_depth
                    and success
                    and (original_status is None or 200 <= original_status < 300)
                ):
                    try:
                        response = session.get(
                            url, timeout=timeout, headers=DEFAULT_HEADERS
                        )
                        content_type = response.headers.get("content-type", "")

                        if "text/html" in content_type:
                            with crawled_pages_lock:
                                crawled_pages.add(url)
                            links = extract_links(response.text, url)
                            for link_url, link_anchor in links:
                                if is_same_domain(link_url, start_domain):
                                    task_queue.put(
                                        (link_url, depth + 1, url, link_anchor)
                                    )
                    except requests.RequestException as e:
                        print(f"Error fetching {url}: {e}")

            except queue.Empty:
                # Queue timed out, but don't exit yet - other threads might add more tasks
                # Check if queue is empty after timeout
                if task_queue.empty():
                    break
                else:
                    continue
            except Exception as e:
                if url:
                    print(f"Worker error on {url}: {e}")
            finally:
                try:
                    with processed_count_lock:
                        processed_count += 1
                        if processed_count % 50 == 0:
                            print(f"Processed {processed_count} URLs...")

                    task_queue.task_done()
                except Exception:
                    pass

    # Start worker threads
    threads = []
    for _ in range(num_threads):
        t = threading.Thread(target=worker)
        t.daemon = True
        t.start()
        threads.append(t)

    # Wait for all tasks to complete
    task_queue.join()

    # Stop workers
    for _ in range(num_threads):
        task_queue.put(None)
    for t in threads:
        t.join()

    print()
    print(f"Crawl complete. Total URLs checked: {processed_count}")
    print(f"Unique pages crawled for extracting links: {len(crawled_pages)}")
    print(f"Found {len(results)} issues (301/404)")

    return results


def parse_sitemap(sitemap_url, session, timeout=10, lang_filter=None):
    """Parse sitemap XML and extract all URLs"""
    urls = []
    try:
        response = session.get(sitemap_url, timeout=timeout, headers=DEFAULT_HEADERS)
        response.raise_for_status()

        # Handle sitemap index files that contain links to other sitemaps
        root = ET.fromstring(response.content)

        # Register namespace
        ns = {"ns": "http://www.sitemaps.org/schemas/sitemap/0.9"}

        # Check if it's a sitemap index
        sitemap_tags = root.findall(".//ns:sitemap", ns)
        if sitemap_tags:
            # Recursively process child sitemaps
            for sitemap in sitemap_tags:
                loc = sitemap.find("./ns:loc", ns)
                if loc is not None:
                    child_url = loc.text.strip()
                    child_urls = parse_sitemap(child_url, session, timeout, lang_filter)
                    urls.extend(child_urls)
        else:
            # It's a URL set
            url_tags = root.findall(".//ns:url", ns)
            for url in url_tags:
                loc = url.find("./ns:loc", ns)
                if loc is not None:
                    url_loc = loc.text.strip()
                    url_loc = clean_url(url_loc)

                    # Apply language filter if specified
                    if lang_filter is None or is_english_page(url_loc, lang_filter):
                        urls.append(url_loc)

        return urls

    except Exception as e:
        print(f"Error parsing sitemap {sitemap_url}: {e}")
        return []


def is_english_page(url, exclude_langs):
    """Check if URL should be kept based on language filter
    If website uses /en/ for English, exclude all OTHER languages (es, fr, zh, etc.)
    Keep English URLs (those with /en/ OR no language prefix) and exclude others
    """
    parsed = urlparse(url)
    path = parsed.path.lower()

    for lang in exclude_langs:
        if f"/{lang}/" in path or path.startswith(f"/{lang}"):
            return False

    return True


def check_sitemaps(sitemap_urls, timeout=10, lang_filter=None):
    """Check URLs from multiple sitemap files for 301/404"""
    session = requests.Session()
    all_urls = []

    print(f"Processing {len(sitemap_urls)} sitemap files...")
    print()

    for sitemap_url in sitemap_urls:
        print(f"Parsing: {sitemap_url}")
        urls = parse_sitemap(sitemap_url, session, timeout, lang_filter)
        print(f"  -> Found {len(urls)} URLs")
        all_urls.extend(urls)

    # Remove duplicates
    all_urls = list(set(all_urls))
    print()
    print(f"Total unique URLs from sitemaps: {len(all_urls)}")
    print()

    results = []
    processed_count = 0
    total_count = len(all_urls)

    for url in all_urls:
        processed_count += 1
        if processed_count % 50 == 0:
            print(f"Checked {processed_count}/{total_count} URLs...")

        try:
            original_status, final_url, success = follow_redirects(
                url, session, timeout
            )

            # Record all 301 and 404 results
            if original_status in (301, 404):
                result = {
                    "源页面": "(from sitemap)",
                    "链接URL": url,
                    "锚文本": "(from sitemap)",
                    "状态码": original_status,
                    "最终目标URL": final_url if original_status == 301 else "-",
                }
                results.append(result)
                print(f"Found {original_status}: {url} -> {final_url}")

        except Exception as e:
            print(f"Error checking {url}: {e}")
            continue

        time.sleep(0.1)

    print()
    print(f"Check complete. Total URLs checked: {total_count}")
    print(f"Found {len(results)} issues (301/404)")

    return results


def save_to_excel(results, output_path):
    """Save results to Excel file"""
    df = pd.DataFrame(results)
    df.to_excel(output_path, index=False, engine="openpyxl")
    print(f"Results saved to: {output_path}")


def main():
    parser = argparse.ArgumentParser(
        description="Find all 301 redirects and 404 errors on a website\n"
        "Two modes:\n"
        "1. Crawl mode: provide start_url to discover links by crawling\n"
        "2. Sitemap mode: provide --sitemaps to check all URLs listed in sitemap XML files"
    )
    parser.add_argument(
        "start_url",
        nargs="?",
        help="Starting URL of the website to scan (required for crawl mode, optional for sitemap mode)",
    )
    parser.add_argument(
        "--max-depth", type=int, default=3, help="Maximum crawl depth (default: 3)"
    )
    parser.add_argument(
        "--output",
        default="output/results.xlsx",
        help="Output Excel file path (default: output/results.xlsx)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=10,
        help="Request timeout in seconds (default: 10)",
    )
    parser.add_argument(
        "--sitemaps",
        nargs="+",
        help="List of sitemap XML URLs to check (enables sitemap mode)",
    )
    parser.add_argument(
        "--exclude-langs",
        nargs="+",
        default=["es", "fr", "de", "zh", "ja"],
        help="Language codes to exclude (keep English URLs, URLs with /en/ or no language prefix)\n"
        "Use this to keep only English pages. Default: ['es', 'fr', 'de', 'zh', 'ja']",
    )
    parser.add_argument(
        "--threads",
        type=int,
        default=5,
        help="Number of threads for parallel crawling (default: 5)\n"
        "Higher = faster, but don't set too high to avoid 429 blocking",
    )

    args = parser.parse_args()

    # Create output directory if needed
    output_dir = os.path.dirname(args.output)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir)

    # Check which mode we're running
    if args.sitemaps:
        # Sitemap mode
        print(f"Running in SITEMAP mode")
        print(f"Number of sitemaps: {len(args.sitemaps)}")
        print(
            f"Exclude languages: {args.exclude_langs} (keep URLs without these language codes)"
        )
        print()

        results = check_sitemaps(args.sitemaps, args.timeout, args.exclude_langs)
        save_to_excel(results, args.output)

        if not results:
            print("No 301 or 404 links found.")

    elif args.start_url:
        # Crawl mode (original behavior)
        print(f"Running in CRAWL mode")
        print(f"Starting URL: {args.start_url}")
        print()

        # Validate URL
        parsed = urlparse(args.start_url)
        if not parsed.scheme:
            print("Error: URL must include scheme (http:// or https://)")
            sys.exit(1)

        # Run the check - use single-thread if threads=1 for stability
        if args.threads == 1:
            results = check_website_single(args.start_url, args.max_depth, args.timeout)
        else:
            results = check_website(
                args.start_url, args.max_depth, args.timeout, args.threads
            )

        # Save results (always save even if empty)
        save_to_excel(results, args.output)

        if not results:
            print("No 301 or 404 links found.")

    else:
        print(
            "Error: Either provide start_url for crawl mode or --sitemaps for sitemap mode"
        )
        print()
        print("Examples:")
        print(
            "  Crawl mode:   python checker.py https://example.com --max-depth 3 --output results.xlsx"
        )
        print(
            "  Sitemap mode: python checker.py --sitemaps https://example.com/sitemap1.xml https://example.com/sitemap2.xml --output results.xlsx"
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
