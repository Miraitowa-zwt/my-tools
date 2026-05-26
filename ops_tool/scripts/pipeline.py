from __future__ import annotations

import csv
import json
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional

from sitemap_parser import (
    build_batch_prompt,
    convert_docx_to_html,
    parse_sitemap,
    process_keywords_for_articles,
    save_results,
)

TD_PROMPT_TEMPLATE = """# 角色：SEO元生成专家

## 基本属性
- 身份：SEO博主，撰写博客元数据
- SEO要求：准确匹配内容、吸引人、关键词自然布局
- GEO要求：完整关键词、清晰结构、AI可引用
- 语气：专业、严格遵守规则

# 任务：生成SEO元数据
- 输入：文章内容
- 处理流程：
  1. 根据内容生成3个标题、3个描述、3个URL、10关键词、10标签
  2. 应用长度规则检查
  3. 应用禁止规则检查
  4. 按格式输出（英文+中文对照）

# 规则

## 标题规则
- ≤ 60字符（含空格）
- 简短明了，吸引人点击
- 不含品牌名称
- 准确反映内容和价值主张
- 英语输出，标注字符数

## 描述规则
- ≤ 160字符（含空格）
- 有说服力，吸引人点击
- 引人注目的词开头（不能用禁止词）
- 包含主副关键词
- 突出独特卖点
- **对应规则：**
  - 问题标题 → 描述直接给明确回答
  - 数字标题 → 描述直接列出要点
  - 陈述标题 → 描述扩展支持陈述

## URL规则
- ≤ 7个单词
- 连字符分隔
- 含关键词

# 禁止开头
Transform, Discover, Explore, Learn, Experience, Find, Enjoy, Elevate, Dive, Unravel, Unlock, Upgrade, Effort, Enhance, Uncover, Delve, Unleash, elevate, Discover, Dive, Intricacies, Complex, Multifaceted, Tapestry, Rich, Fabric, Delicate Dance, Interplay, Unfold, Unravel, Insightful, Vibrant, Moreover, Unlock, Bloast, Treasure, Upgrade, Browse, Transform, Revamp, Explore, Join, Get

# 输出格式（英文 + 中文对照）

### 标题候选
1. [English Title] ([XX chars])
   [中文对照]

### 描述候选
1. [English Description] ([XX chars])
   [中文对照]

### URL句柄
- [slug]

### 关键词
- [keyword 1]
- [keyword 2]
...

### 标签
[Tags Space-separated First-letter-capital]

# 启动
请根据下面文章内容生成：
- 3个SEO标题（≤60字符）
- 3个Meta描述（≤160字符）
- 3个URL句柄（≤7词）
- 10个关键词
- 10个标签（英文首字母大写）
- 全部英文配中文对照"""


def build_td_prompt(raw_articles: list[tuple[str, str]]) -> str:
    article_blocks = []
    for index, (name, html) in enumerate(raw_articles, 1):
        article_blocks.append(f"## 文章 {index}: {name}\n\n{html.strip()}")

    return f"{TD_PROMPT_TEMPLATE}\n\n# 文章内容（HTML富文本）\n\n" + "\n\n---\n\n".join(article_blocks)


def load_keyword_configs_for_save(keyword_file: Optional[str]) -> Optional[dict]:
    if not keyword_file:
        return None

    if keyword_file.endswith(".json"):
        with open(keyword_file, "r", encoding="utf-8") as file:
            return json.load(file)

    if keyword_file.endswith(".csv"):
        with open(keyword_file, "r", encoding="utf-8") as file:
            reader = csv.DictReader(file)
            return {"keywords": list(reader)}

    return None


def run_task(
    domain: str,
    cms_mode: str,
    docx_files: list[str],
    keyword_file: Optional[str],
    output_dir: str,
    sitemap_loader: Optional[Callable[[str, str], tuple[str, list[str], list[str]]]] = None,
    docx_converter: Optional[Callable[[str, str, int], str]] = None,
) -> dict:
    sitemap_loader = sitemap_loader or parse_sitemap
    docx_converter = docx_converter or convert_docx_to_html

    resolved_domain, data_b, data_c = sitemap_loader(domain, cms_mode)

    raw_articles: list[tuple[str, str]] = []
    for index, docx_path in enumerate(docx_files, 1):
        html = docx_converter(docx_path, resolved_domain, index)
        if html.strip():
            raw_articles.append((Path(docx_path).name, html))

    if not raw_articles:
        raise ValueError("没有成功转换任何文档")

    processed_articles = process_keywords_for_articles(raw_articles, keyword_file)
    full_prompt = build_batch_prompt(processed_articles, data_b, data_c)
    td_prompt = build_td_prompt(raw_articles)
    total_links = sum(len(links) for _, _, links in processed_articles)
    articles_detail = [
        {
            "name": name,
            "link_count": len(links),
            "link_types": {
                link_type: sum(1 for link in links if link["type"] == link_type)
                for link_type in {link["type"] for link in links}
            }
            if links
            else {},
        }
        for name, _, links in processed_articles
    ]

    results = {
        "prompt": full_prompt,
        "td_prompt": td_prompt,
        "articles": [
            {"name": name, "links": links} for name, _, links in processed_articles
        ],
        "statistics": {
            "timestamp": datetime.now().isoformat(),
            "domain": resolved_domain,
            "total_articles": len(processed_articles),
            "total_links": total_links,
            "articles_with_links": sum(1 for _, _, links in processed_articles if links),
            "articles_detail": articles_detail,
            "product_collection_count": len(data_b),
            "blog_count": len(data_c),
        },
        "keyword_configs": load_keyword_configs_for_save(keyword_file),
    }

    session_dir = save_results(results, output_dir=output_dir)
    return {
        "status": "success",
        "prompt": full_prompt,
        "td_prompt": td_prompt,
        "summary": {
            "domain": resolved_domain,
            "total_articles": len(processed_articles),
            "total_links": total_links,
            "articles_with_links": sum(1 for _, _, links in processed_articles if links),
            "product_collection_count": len(data_b),
            "blog_count": len(data_c),
        },
        "output_dir": str(session_dir),
        "articles": [
            {"name": name, "links": links} for name, _, links in processed_articles
        ],
        "statistics": results["statistics"],
    }
