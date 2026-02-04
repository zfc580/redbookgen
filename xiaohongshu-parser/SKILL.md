---
name: xiaohongshu-parser
description: Extracts content (title, text, image URLs) from a Xiaohongshu note URL.
---

# Xiaohongshu Parser

## Overview
This skill is responsible for fetching the raw content from a Xiaohongshu note page. It uses Puppeteer to handle dynamic rendering and potential anti-scraping measures (by simulating a real browser).

## Usage

```bash
node xiaohongshu-parser/index.js --url "<URL>" --output "<OUTPUT_PATH>"
```

## Output Format (JSON)

```json
{
  "meta": {
    "url": "https://www.xiaohongshu.com/explore/...",
    "timestamp": "2023-10-27T10:00:00Z"
  },
  "data": {
    "title": "Note Title",
    "description": "Full text of the note...",
    "tags": ["tag1", "tag2"],
    "image_urls": [
      "https://sns-webpic-qc.xhscdn.com/...",
      "..."
    ]
  }
}
```

## Implementation Details
- Uses `puppeteer` to launch a browser.
- Extracts data from DOM elements (e.g., `#detail-title`, `#detail-desc`).
- **Note**: Xiaohongshu often requires login or verification. If the scraper gets blocked, run with `headless: false` manually to solve the captcha.
