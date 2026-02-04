---
name: xiaohongshu-publisher
description: Automates the publishing of a note (images + text) to Xiaohongshu creator center.
---

# Xiaohongshu Publisher Skill

## Overview
This skill automates the final step: uploading the generated images and text draft to the Xiaohongshu platform. It uses Puppeteer to control a browser instance, reusing the login session established by the `xiaohongshu-parser`.

## Workflow
1.  **Load Draft**: Reads copy from `02_draft.json`.
2.  **Load Images**: Scans the output directory for images.
3.  **Browser Action**:
    *   Opens `https://creator.xiaohongshu.com/publish/publish`.
    *   Checks for login state (reuses `user_data`).
    *   Uploads all images.
    *   Fills in input fields (Title, Content).
    *   Clicks "Publish".

## Usage
```bash
node xiaohongshu-publisher/index.js --draft "workspace/task_001/02_draft.json" --images "workspace/task_001/images/"
```
