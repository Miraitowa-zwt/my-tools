from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from pipeline import run_task  # noqa: E402
from sitemap_parser import parse_sitemap, process_html_base  # noqa: E402


def test_run_task_returns_prompt_and_summary(tmp_path: Path):
    docx_path = tmp_path / "article.docx"
    docx_path.write_bytes(b"fake")

    result = run_task(
        domain="https://example.com",
        cms_mode="shopify",
        docx_files=[str(docx_path)],
        keyword_file=None,
        output_dir=str(tmp_path / "output"),
        sitemap_loader=lambda domain, cms_mode: (
            domain,
            ["https://example.com/products/a"],
            ["https://example.com/blogs/news/a"],
        ),
        docx_converter=lambda path, domain, index: "<p>demo html</p>",
    )

    assert result["status"] == "success"
    assert result["prompt"]
    assert "# 角色：SEO元生成专家" in result["td_prompt"]
    assert "<p>demo html</p>" in result["td_prompt"]
    assert result["summary"]["total_articles"] == 1
    assert Path(result["output_dir"]).exists()


def test_run_task_fails_when_no_docx_converted(tmp_path: Path):
    docx_path = tmp_path / "empty.docx"
    docx_path.write_bytes(b"fake")

    with pytest.raises(ValueError, match="没有成功转换任何文档"):
        run_task(
            domain="https://example.com",
            cms_mode="shopify",
            docx_files=[str(docx_path)],
            keyword_file=None,
            output_dir=str(tmp_path / "output"),
            sitemap_loader=lambda domain, cms_mode: (domain, [], []),
            docx_converter=lambda path, domain, index: "",
        )


def test_process_html_base_removes_bold_tags_inside_headings_only():
    html = (
        "<h2><strong>Camping Chair Guide</strong></h2>"
        "<h3><b>Setup Tips</b> for Buyers</h3>"
        "<p>This <strong>important</strong> detail should stay bold.</p>"
    )

    result = process_html_base(html, "https://example.com")

    assert "<h2>Camping Chair Guide</h2>" in result
    assert "<h3>Setup Tips for Buyers</h3>" in result
    assert "<h2><strong>" not in result
    assert "<h3><b>" not in result
    assert "<p>This <strong>important</strong> detail should stay bold.</p>" in result


def test_parse_sitemap_removes_baby_names_blogs_for_momcozy(monkeypatch):
    sitemap_urls = [
        "https://momcozy.com/blogs/news/breast-pump-guide",
        "https://momcozy.com/blogs/baby-names/girl-name-ideas",
        "https://momcozy.com/pages/baby-names/boy-name-ideas",
        "https://momcozy.com/products/pump",
    ]

    monkeypatch.setattr(
        "sitemap_parser.discover_sitemap_urls",
        lambda domain: [f"{domain}/sitemap.xml"],
    )
    monkeypatch.setattr("sitemap_parser.fetch_sitemap_urls", lambda sitemap_url: sitemap_urls)

    _, _, blog_urls = parse_sitemap("https://momcozy.com", "shopify")

    assert "https://momcozy.com/blogs/news/breast-pump-guide" in blog_urls
    assert "https://momcozy.com/blogs/baby-names/girl-name-ideas" not in blog_urls
    assert "https://momcozy.com/pages/baby-names/boy-name-ideas" not in blog_urls


def test_parse_sitemap_keeps_baby_names_blogs_for_other_domains(monkeypatch):
    sitemap_urls = [
        "https://example.com/blogs/news/breast-pump-guide",
        "https://example.com/blogs/baby-names/girl-name-ideas",
        "https://example.com/products/pump",
    ]

    monkeypatch.setattr(
        "sitemap_parser.discover_sitemap_urls",
        lambda domain: [f"{domain}/sitemap.xml"],
    )
    monkeypatch.setattr("sitemap_parser.fetch_sitemap_urls", lambda sitemap_url: sitemap_urls)

    _, _, blog_urls = parse_sitemap("https://example.com", "shopify")

    assert "https://example.com/blogs/baby-names/girl-name-ideas" in blog_urls


def test_cli_prints_json_result(tmp_path: Path):
    import cli
    from io import StringIO

    payload = json.dumps(
        {
            "domain": "https://example.com",
            "cms_mode": "shopify",
            "docx_files": [],
            "keyword_file": None,
            "output_dir": str(tmp_path / "output"),
        },
        ensure_ascii=False,
    )

    cli.run_task = lambda **kwargs: {"status": "success", "prompt": "demo"}
    original_argv = sys.argv[:]
    original_stdout = sys.stdout
    stdout_buffer = StringIO()
    try:
        sys.argv = ["cli.py", payload]
        sys.stdout = stdout_buffer
        assert cli.main() == 0
    finally:
        sys.argv = original_argv
        sys.stdout = original_stdout

    line = stdout_buffer.getvalue().strip().splitlines()[-1]
    data = json.loads(line.removeprefix("OPS_TOOL_RESULT_JSON: "))
    assert data["status"] == "success"
    assert data["prompt"] == "demo"
