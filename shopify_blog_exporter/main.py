import requests
from bs4 import BeautifulSoup
import pandas as pd
from typing import List, Dict, Optional
import time

# =============================================================================
# CONFIGURATION SECTION
# =============================================================================
SHOPIFY_CONFIG = {
    "shop_domain": "your-shop.myshopify.com",  # Your Shopify store domain
    "access_token": "your_admin_api_access_token",  # Your Admin API access token
    "api_version": "2024-04",  # GraphQL API version
    "output_file": "shopify_articles.csv",  # Output CSV file name
}

# Blog handles to export (leave empty to export all blogs)
BLOG_HANDLES = [
    "news",
    "blog",
    # Add more blog handles as needed
]

# Optional: Filter by tags (leave empty to export all)
FILTER_TAGS = []

# =============================================================================
# END CONFIGURATION
# =============================================================================


class ShopifyArticleExporter:
    def __init__(self, config: Dict):
        self.config = config
        self.headers = {
            "X-Shopify-Access-Token": config["access_token"],
            "Content-Type": "application/json",
        }
        self.base_url = f"https://{config['shop_domain']}/admin/api/{config['api_version']}/graphql.json"

    def execute_query(self, query: str, variables: Dict = None) -> Dict:
        response = requests.post(
            self.base_url,
            headers=self.headers,
            json={"query": query, "variables": variables},
        )
        response.raise_for_status()
        return response.json()

    def get_blogs(self) -> List[Dict]:
        query = """
        query {
            blogs(first: 100) {
                edges {
                    node {
                        id
                        handle
                        title
                    }
                }
            }
        }
        """
        data = self.execute_query(query)
        blogs = []
        for edge in data["data"]["blogs"]["edges"]:
            blogs.append(edge["node"])
        return blogs

    def get_articles_from_blog(self, blog_handle: str) -> List[Dict]:
        articles = []
        after_cursor = None
        has_next_page = True

        while has_next_page:
            query = """
            query GetArticles($handle: String!, $first: Int!, $after: String) {
                blogByHandle(handle: $handle) {
                    articles(first: $first, after: $after) {
                        edges {
                            node {
                                id
                                title
                                handle
                                content
                                excerpt
                                tags
                                publishedAt
                                updatedAt
                                author {
                                    name
                                }
                                seo {
                                    title
                                    description
                                }
                            }
                        }
                        pageInfo {
                            hasNextPage
                            endCursor
                        }
                    }
                }
            }
            """

            variables = {"handle": blog_handle, "first": 50, "after": after_cursor}

            data = self.execute_query(query, variables)
            blog_data = data["data"]["blogByHandle"]

            if not blog_data:
                break

            articles_data = blog_data["articles"]
            for edge in articles_data["edges"]:
                articles.append(edge["node"])

            page_info = articles_data["pageInfo"]
            has_next_page = page_info["hasNextPage"]
            after_cursor = page_info["endCursor"]

            if has_next_page:
                time.sleep(0.5)

        return articles

    def parse_html_content(self, content: str) -> Dict:
        soup = BeautifulSoup(content, "html.parser")

        text = soup.get_text()
        words = text.split()
        word_count = len(words)

        h1_tags = [h1.get_text(strip=True) for h1 in soup.find_all("h1")]
        h2_tags = [h2.get_text(strip=True) for h2 in soup.find_all("h2")]

        images = [
            img.get("src", img.get("data-src", "")) for img in soup.find_all("img")
        ]
        images = [img for img in images if img]

        links = [a.get("href", "") for a in soup.find_all("a")]
        links = [link for link in links if link]

        paragraphs = [
            p.get_text(strip=True) for p in soup.find_all("p") if p.get_text(strip=True)
        ]

        return {
            "word_count": word_count,
            "h1_count": len(h1_tags),
            "h1_tags": h1_tags,
            "h2_count": len(h2_tags),
            "h2_tags": h2_tags,
            "image_count": len(images),
            "images": images,
            "link_count": len(links),
            "links": links,
            "paragraph_count": len(paragraphs),
        }

    def extract_article_data(self, article: Dict) -> Dict:
        seo_metrics = self.parse_html_content(article.get("content", ""))

        return {
            "id": article.get("id", ""),
            "title": article.get("title", ""),
            "handle": article.get("handle", ""),
            "content": article.get("content", ""),
            "excerpt": article.get("excerpt", ""),
            "tags": ", ".join(article.get("tags", [])),
            "published_at": article.get("publishedAt", ""),
            "updated_at": article.get("updatedAt", ""),
            "author": article.get("author", {}).get("name", ""),
            "seo_title": article.get("seo", {}).get("title", ""),
            "seo_description": article.get("seo", {}).get("description", ""),
            "word_count": seo_metrics["word_count"],
            "h1_count": seo_metrics["h1_count"],
            "h1_tags": " | ".join(seo_metrics["h1_tags"][:3]),
            "h2_count": seo_metrics["h2_count"],
            "h2_tags": " | ".join(seo_metrics["h2_tags"][:5]),
            "image_count": seo_metrics["image_count"],
            "link_count": seo_metrics["link_count"],
            "paragraph_count": seo_metrics["paragraph_count"],
        }

    def export_to_csv(self, output_file: str, data: List[Dict]):
        df = pd.DataFrame(data)
        df.to_csv(output_file, index=False, encoding="utf-8")
        print(f"Exported {len(data)} articles to {output_file}")

    def run(self):
        print(f"Connecting to Shopify store: {self.config['shop_domain']}")

        all_articles = []

        if BLOG_HANDLES:
            blogs_to_process = BLOG_HANDLES
            print(f"Processing {len(blogs_to_process)} specified blogs")
        else:
            blogs = self.get_blogs()
            blogs_to_process = [blog["handle"] for blog in blogs]
            print(f"Found {len(blogs_to_process)} blogs in store")

        for blog_handle in blogs_to_process:
            print(f"Fetching articles from blog: {blog_handle}")
            articles = self.get_articles_from_blog(blog_handle)

            if FILTER_TAGS:
                filtered_articles = []
                for article in articles:
                    article_tags = set(article.get("tags", []))
                    if any(tag in article_tags for tag in FILTER_TAGS):
                        filtered_articles.append(article)
                articles = filtered_articles
                print(
                    f"  Filtered to {len(articles)} articles with tags: {FILTER_TAGS}"
                )

            print(f"  Found {len(articles)} articles")

            for article in articles:
                article_data = self.extract_article_data(article)
                all_articles.append(article_data)

        if all_articles:
            self.export_to_csv(self.config["output_file"], all_articles)
        else:
            print("No articles found to export")


def main():
    try:
        exporter = ShopifyArticleExporter(SHOPIFY_CONFIG)
        exporter.run()
    except requests.exceptions.RequestException as e:
        print(f"Error: Failed to connect to Shopify API - {e}")
        print(
            "Please check your shop domain and access token in the configuration section"
        )
    except Exception as e:
        print(f"Error: {e}")


if __name__ == "__main__":
    main()
