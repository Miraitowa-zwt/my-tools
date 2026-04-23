# Shopify Blog Article Exporter

Export Shopify blog articles to CSV with SEO metrics using the Admin GraphQL API.

## Features

- Export articles from multiple blogs
- Extract SEO metrics (word count, headings, images, links, paragraphs)
- Handle pagination automatically
- Filter by blog handles
- Filter by tags
- Export to CSV format

## Installation

1. Create a virtual environment:
```bash
python -m venv venv
venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

## Configuration

Edit the `CONFIGURATION SECTION` in `main.py`:

```python
SHOPIFY_CONFIG = {
    'shop_domain': 'your-shop.myshopify.com',
    'access_token': 'your_admin_api_access_token',
    'api_version': '2024-04',
    'output_file': 'shopify_articles.csv',
}
```

### Getting Shopify Admin API Access Token

1. Go to Shopify Admin > Settings > Apps and sales channels
2. Click "Develop apps"
3. Create a new app
4. Configure Admin API scopes: `read_content`
5. Install the app and copy the access token

### Optional Filters

```python
# Export specific blogs (leave empty for all)
BLOG_HANDLES = ['news', 'blog']

# Filter by tags (leave empty for all)
FILTER_TAGS = ['featured', 'announcement']
```

## Usage

Run the exporter:
```bash
python main.py
```

## Output Fields

The CSV file includes:
- Basic article info: ID, title, handle, excerpt, tags, published/updated dates, author
- SEO fields: title, description
- Content metrics: word count, H1/H2 tags and counts, image count, link count, paragraph count

## Notes

- Rate limiting is handled automatically between pagination requests
- Content is exported in full HTML format
- Tags are concatenated with commas
- Multiple H1/H2 tags are joined with pipe (|) character
